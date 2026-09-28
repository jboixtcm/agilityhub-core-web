import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import {
  ATTENDANCE_MOCK_NOW,
  mockScenario,
  resetAttendanceMockState,
  resetTrainingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/attendance-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, openapiSchemaId);

function expectValid(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });

function use(scenario: MockScenario) {
  mockScenario(scenario);
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1", getLocale: () => "ca" });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error))
      return { code: error.code, details: error.details, status: error.status };
    throw error;
  }
  throw new Error("Expected an ApiError");
}

const day = (query: { date?: string; instructorId?: string } = {}) =>
  client.GET("/instructor/day", { params: { query } });
const sheet = (id = "c1") =>
  client.GET("/class-sessions/{id}/attendance", { params: { path: { id } } });
const save = (
  body: {
    items: { bookingId: string; state: "NO_SHOW" | "NOTIFIED" | "PENDING" | "PRESENT" }[];
    version: number;
  },
  key: string = crypto.randomUUID(),
  id = "c1",
) =>
  client.PUT("/class-sessions/{id}/attendance", {
    body,
    params: { header: { "Idempotency-Key": key }, path: { id } },
  });
const card = (id = "dog-duna") =>
  client.GET("/dogs/{id}/instructor-card", { params: { path: { id } } });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(ATTENDANCE_MOCK_NOW), toFake: ["Date"] });
  resetAttendanceMockState();
  resetTrainingMockState();
  use("instructor");
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  resetAttendanceMockState();
  resetTrainingMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

describe("E6-W01 step 9 GET /instructor/day (S10 §6, R-10-01) as the api answers", () => {
  it("mockup 20: Estel's three classes, seven day chips from today, the instructors without «Tot el club», and the block made by Marc", async () => {
    const { data } = await day();
    expectValid("InstructorDay", data);
    expect(data).toMatchObject({
      date: "2026-08-03",
      selectedInstructorId: "instructor-estel",
      timeZone: "Europe/Madrid",
    });
    expect(data?.instructors.map((instructor) => instructor.shortName)).toEqual([
      "Estel",
      "Marc",
      "Núria",
    ]);
    expect(data?.days.map((chip) => `${chip.date} ${String(chip.hasClasses)}`)).toEqual([
      "2026-08-03 true",
      "2026-08-04 true",
      "2026-08-05 false",
      "2026-08-06 false",
      "2026-08-07 false",
      "2026-08-08 false",
      "2026-08-09 false",
    ]);
    expect(
      data?.classes.map((item) => [
        item.startTime,
        item.displayDescription,
        item.ring?.name,
        item.booked,
        item.capacity,
        item.waiting,
        item.individual,
        item.attendance.status,
      ]),
    ).toEqual([
      // c1: Anna's «ha avisat» released her seat (R-10-02), so 3 of 5 are live.
      ["08:30", "A+B", "Central", 3, 5, 1, false, "PENDING"],
      ["17:40", "Teràpia", "Petita", 1, 1, 1, true, "NONE"],
      ["18:50", "A+B", "Central", 5, 5, 2, false, "NONE"],
    ]);
    expect(data?.ringBlocks).toEqual([
      {
        createdByName: "Marc",
        fromLocal: "16:00",
        id: "rb1",
        kind: "BLOCK",
        note: "regar i repassar el terra",
        reason: "MAINTENANCE",
        ringName: "Carretera",
        toLocal: "17:30",
      },
    ]);
  });

  it("an ADMIN without a profile gets the first instructor by shortName; another instructor's day; an unknown one is 404; a bad date is 400", async () => {
    use("admin");
    expect((await day()).data?.selectedInstructorId).toBe("instructor-estel");
    const marc = (await day({ instructorId: "instructor-marc" })).data;
    expect(marc?.classes.map((item) => `${item.startTime} ${item.displayDescription}`)).toEqual([
      "10:00 C+D",
    ]);
    // Every block of the day is there, whoever's classes are shown (R-10-01).
    expect(marc?.ringBlocks.map((block) => block.id)).toEqual(["rb1"]);
    await expect(failure(day({ instructorId: "instructor-other-club" }))).resolves.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    await expect(failure(day({ date: "2026-02-30" }))).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ code: "INVALID", field: "date" }] },
      status: 400,
    });
  });

  it("the empty day, the cancelled class and the closed day", async () => {
    expect((await day({ date: "2026-08-05" })).data?.classes).toEqual([]);
    const tuesday = (await day({ date: "2026-08-04" })).data;
    expect(
      tuesday?.classes.map((item) => `${item.id} ${item.state} ${item.attendance.status}`),
    ).toEqual(["c4 CANCELLED NONE", "c5 ACTIVE NONE"]);
    const closed = (await day({ date: "2026-07-27" })).data;
    expect(closed?.classes.map((item) => item.attendance)).toEqual([
      { marked: 2, status: "CLOSED", total: 2 },
    ]);
  });

  it("T-09-40's other half: a block made on 24 (POST /ring-blocks) is on 20 of that day", async () => {
    const created = await client.POST("/ring-blocks", {
      body: {
        from: "2026-08-06T16:00:00Z",
        kind: "BLOCK",
        note: "Canvi de sorra",
        reason: "MAINTENANCE",
        ringId: "ring-petita",
        to: "2026-08-06T17:00:00Z",
      },
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });
    expect(created.response.status).toBe(201);
    const thursday = (await day({ date: "2026-08-06" })).data;
    expect(thursday?.ringBlocks).toContainEqual(
      expect.objectContaining({
        fromLocal: "18:00",
        kind: "BLOCK",
        note: "Canvi de sorra",
        ringName: "Petita",
        toLocal: "19:00",
      }),
    );
  });

  it("WAITLIST off: no `waiting` on the day nor on the sheet, and no waiting list", async () => {
    use("instructorNoWaitlist");
    expect((await day()).data?.classes.every((item) => !("waiting" in item))).toBe(true);
    const data = (await sheet()).data;
    expect(data?.waitlist).toBeUndefined();
    expect(data?.classSession.waiting).toBeUndefined();
  });

  it("a member gets 403 FORBIDDEN and an impersonation token 403 IMPERSONATION_DENIED on every S10 route", async () => {
    for (const [scenario, code] of [
      ["member", "FORBIDDEN"],
      ["impersonated", "IMPERSONATION_DENIED"],
    ] as const) {
      use(scenario);
      for (const request of [day(), sheet(), save({ items: [], version: 4 }), card()]) {
        await expect(failure(request)).resolves.toMatchObject({ code, status: 403 });
      }
    }
  });
});

describe("E6-W01 step 9 GET/PUT /class-sessions/{id}/attendance (S10 §6, R-10-02…R-10-06)", () => {
  it("the §6 example: rows in booking order, the notice and the no-show notice, the version and the waiting list", async () => {
    const { data } = await sheet();
    expectValid("AttendanceSheet", data);
    expect(data?.classSession).toMatchObject({
      booked: 3,
      capacity: 5,
      instructorName: "Estel",
      state: "ACTIVE",
      waiting: 1,
    });
    expect(data?.sheet).toMatchObject({
      canMarkNotice: true,
      canMarkPresence: true,
      editableUntil: "2026-08-04T21:59:59Z",
      noShowNoticeTime: "08:00",
      version: 4,
    });
    expect(
      data?.rows.map(
        (item) => `${item.memberFirstName} + ${item.dogName} ${item.state} ${String(item.final)}`,
      ),
    ).toEqual([
      "Laura + Duna PRESENT false",
      "Marc + Chun-li PENDING false",
      "Anna + Nass NOTIFIED true",
      "Eva + Fish NO_SHOW false",
    ]);
    expect(data?.rows[0]?.pendingTasksCount).toBe(2);
    expect(data?.rows[2]?.notice).toMatchObject({
      atLocal: "12:40",
      seatReleased: true,
      waitlistNotified: true,
    });
    expect(data?.rows[3]?.noShowNotice).toEqual({
      queuedAt: null,
      scheduledFor: "2026-08-04T06:00:00Z",
      sentAt: null,
    });
    expect(data?.waitlist).toEqual({
      entries: [
        {
          dogName: "Blat",
          entryId: "w1",
          handlerName: null,
          joinedAt: "2026-08-02T19:04:00Z",
          levelCode: "B",
          memberFirstName: "Pau",
          state: "ACTIVE",
        },
      ],
      mode: "ALL_AT_ONCE",
    });
  });

  it("R-10-00: a dog led by its guide carries handlerName and the owner's full name", async () => {
    const rock = (await sheet("c3")).data?.rows[0];
    expect(rock).toMatchObject({
      dogName: "Rock",
      handlerName: "Júlia Roca",
      memberFirstName: "Laura",
      memberFullName: "Laura Serra Vidal",
    });
    expect((await sheet()).data?.rows[0]).not.toHaveProperty("memberFullName");
  });

  it("R-10-04: saves only what is sent, bumps the version, answers the sheet with applied[], replays the same key and refuses it for another payload", async () => {
    const key = crypto.randomUUID();
    const body = {
      items: [
        { bookingId: "b2", state: "PRESENT" as const },
        { bookingId: "b4", state: "PENDING" as const },
        { bookingId: "b1", state: "PRESENT" as const },
      ],
      version: 4,
    };
    const saved = await save(body, key);
    expectValid("AttendanceSheet", saved.data);
    expect(saved.data?.applied).toEqual(["b2", "b4"]);
    expect(saved.data?.sheet).toMatchObject({ savedByName: "Estel", version: 5 });
    expect(saved.data?.rows.map((item) => item.state)).toEqual([
      "PRESENT",
      "PRESENT",
      "NOTIFIED",
      "PENDING",
    ]);
    expect(saved.data?.rows[3]?.noShowNotice).toBeNull();
    // Same key, same payload: the first answer again, and nothing applied twice.
    expect((await save(body, key)).data).toEqual(saved.data);
    expect((await sheet()).data?.sheet.version).toBe(5);
    await expect(failure(save({ ...body, version: 5 }, key))).resolves.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
    // Another save with the version already read: 409 with the current list.
    const stale = await failure(save(body));
    expect(stale).toMatchObject({ code: "STALE_VERSION", status: 409 });
    expect(
      (stale.details as { current: { sheet: { version: number } } }).current.sheet.version,
    ).toBe(5);
  });

  it("R-10-04: one refused item changes nothing (ATTENDANCE_NOTIFIED_FINAL on the saved «ha avisat»)", async () => {
    await expect(
      failure(
        save({
          items: [
            { bookingId: "b2", state: "PRESENT" },
            { bookingId: "b3", state: "PENDING" },
          ],
          version: 4,
        }),
      ),
    ).resolves.toEqual({ code: "ATTENDANCE_NOTIFIED_FINAL", details: {}, status: 422 });
    const data = (await sheet()).data;
    expect(data?.sheet.version).toBe(4);
    expect(data?.rows[1]?.state).toBe("PENDING");
  });

  it("an unknown booking is 422 ATTENDANCE_BOOKING_NOT_ACTIVE {bookingId}; an unknown state or a repeated booking is 400; no key is 400", async () => {
    await expect(
      failure(save({ items: [{ bookingId: "b9", state: "PRESENT" }], version: 4 })),
    ).resolves.toEqual({
      code: "ATTENDANCE_BOOKING_NOT_ACTIVE",
      details: { bookingId: "b9" },
      status: 422,
    });
    await expect(
      failure(save({ items: [{ bookingId: "b2", state: "ABSENT" as "PRESENT" }], version: 4 })),
    ).resolves.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(
      failure(
        save({
          items: [
            { bookingId: "b2", state: "PRESENT" },
            { bookingId: "b2", state: "NO_SHOW" },
          ],
          version: 4,
        }),
      ),
    ).resolves.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    const raw = await fetch("https://core.example.test/api/v1/class-sessions/c1/attendance", {
      body: JSON.stringify({ items: [], version: 4 }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    expect(raw.status).toBe(400);
  });

  it("R-10-05: «ha avisat» saved 20 min after the start is late, releases the seat and notifies nobody; the row becomes final", async () => {
    const saved = (await save({ items: [{ bookingId: "b2", state: "NOTIFIED" }], version: 4 }))
      .data;
    expect(saved?.rows[1]).toMatchObject({
      final: true,
      notice: {
        afterClassEnd: false,
        atLocal: "08:50",
        bookingState: "CANCELLED_LATE",
        late: true,
        minutesBefore: -20,
        seatReleased: true,
        waitlistNotified: false,
      },
    });
    expect(saved?.classSession.booked).toBe(2);
    await expect(
      failure(save({ items: [{ bookingId: "b2", state: "PRESENT" }], version: 5 })),
    ).resolves.toMatchObject({
      code: "ATTENDANCE_NOTIFIED_FINAL",
      status: 422,
    });
  });

  it("R-10-05: saved 80 min before the start (> 30) with someone waiting, the waiting list is notified", async () => {
    vi.setSystemTime(new Date("2026-08-03T07:10:00+02:00"));
    const saved = (await save({ items: [{ bookingId: "b2", state: "NOTIFIED" }], version: 4 }))
      .data;
    expect(saved?.rows[1]?.notice).toMatchObject({
      atLocal: "07:10",
      bookingState: "CANCELLED_LATE",
      late: true,
      minutesBefore: 80,
      waitlistNotified: true,
    });
  });

  it("R-10-04's 409: another instructor saves just before (attendanceStale); the caller's version is stale, the next save with the current one goes through", async () => {
    use("attendanceStale");
    const stale = await failure(
      save({ items: [{ bookingId: "b4", state: "PENDING" }], version: 4 }),
    );
    expect(stale).toMatchObject({ code: "STALE_VERSION", status: 409 });
    const current = (
      stale.details as {
        current: { rows: { state: string }[]; sheet: { savedByName: string; version: number } };
      }
    ).current;
    expectValid("AttendanceSheet", current);
    expect(current.sheet).toMatchObject({ savedByName: "Marc", version: 5 });
    expect(current.rows[1]?.state).toBe("PRESENT");
    expect(
      (await save({ items: [{ bookingId: "b4", state: "PENDING" }], version: 5 })).data?.sheet
        .version,
    ).toBe(6);
  });

  it("R-10-03: closed window (attendanceClosed), notice disabled, not open yet, a cancelled class and the ADMIN's override", async () => {
    use("attendanceClosed");
    expect((await sheet()).data?.sheet).toMatchObject({
      canMarkNotice: false,
      canMarkPresence: false,
    });
    await expect(
      failure(save({ items: [{ bookingId: "b2", state: "PRESENT" }], version: 4 })),
    ).resolves.toEqual({
      code: "ATTENDANCE_WINDOW_CLOSED",
      details: { editableUntil: "2026-08-04T21:59:59Z" },
      status: 422,
    });
    expect((await day()).data?.classes.map((item) => item.attendance.status)).toEqual([
      "CLOSED",
      "CLOSED",
      "CLOSED",
    ]);

    use("attendanceNoticeDisabled");
    expect((await sheet()).data?.sheet).toMatchObject({
      canMarkNotice: false,
      canMarkPresence: true,
    });
    await expect(
      failure(save({ items: [{ bookingId: "b2", state: "NOTIFIED" }], version: 4 })),
    ).resolves.toMatchObject({
      code: "INSTRUCTOR_NOTICE_DISABLED",
      status: 422,
    });

    use("instructor");
    await expect(
      failure(
        save({ items: [{ bookingId: "b21", state: "PRESENT" }], version: 0 }, undefined, "c2"),
      ),
    ).resolves.toMatchObject({
      code: "ATTENDANCE_NOT_OPEN",
      status: 422,
    });
    await expect(
      failure(
        save({ items: [{ bookingId: "b02", state: "PRESENT" }], version: 2 }, undefined, "c0"),
      ),
    ).resolves.toMatchObject({
      code: "ATTENDANCE_WINDOW_CLOSED",
      status: 422,
    });
    expect((await sheet("c4")).data?.sheet).toMatchObject({
      canMarkNotice: false,
      canMarkPresence: false,
    });
    await expect(failure(save({ items: [], version: 1 }, undefined, "c4"))).resolves.toMatchObject({
      code: "INVALID_STATE",
      status: 409,
    });
    await expect(failure(sheet("c-unknown"))).resolves.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    use("admin");
    expect((await sheet("c2")).data?.sheet.canMarkPresence).toBe(true);
    expect(
      (await save({ items: [{ bookingId: "b21", state: "PRESENT" }], version: 0 }, undefined, "c2"))
        .data?.applied,
    ).toEqual(["b21"]);
  });

  it("R-10-05's FIFO sentence reads waitlist.mode and fifoConfirmMinutes; TASKS off drops pendingTasksCount; levels off nulls the level", async () => {
    use("attendanceFifo");
    expect((await sheet()).data?.waitlist).toMatchObject({ fifoConfirmMinutes: 30, mode: "FIFO" });
    use("instructorNoTasks");
    expect((await sheet()).data?.rows.every((item) => !("pendingTasksCount" in item))).toBe(true);
    use("planningNoLevels");
    const data = (await sheet()).data;
    expect(data?.rows.map((item) => item.levelCode)).toEqual([null, null, null, null]);
    expect(data?.waitlist?.entries[0]?.levelCode).toBeNull();
  });
});

describe("E6-W01 step 9 GET /dogs/{id}/instructor-card (S10 §6, R-10-08, R-10-09)", () => {
  it("mockup 22's Duna: the metrics of R-10-08's example, the five last classes, the level and the three TASKS blocks", async () => {
    const { data } = await card();
    expectValid("InstructorCard", data);
    expect(data?.metrics).toEqual({
      attendancePct: 86,
      cancelledLate: 0,
      classesCounted: 7,
      noShow: 1,
      notified: 1,
      present: 6,
      trainingsCount: 10,
      trainingsPerWeek: 2.3,
      windowDays: 30,
    });
    expect(data?.lastClasses.map((item) => `${item.date} ${item.displayState}`)).toEqual([
      "2026-08-03 PRESENT",
      "2026-07-30 PRESENT",
      "2026-07-27 PRESENT",
      "2026-07-23 NOTIFIED",
      "2026-07-20 NO_SHOW",
    ]);
    expect(data?.level).toEqual({
      assignedAt: "2025-12-03T09:00:00Z",
      code: "C",
      name: "Nivell C",
    });
    expect(data?.tasks).toMatchObject({ doneCount: 1, pendingCount: 2 });
    expect(data?.instructorNote?.attachments.map((item) => item.name)).toEqual([
      "foto_balancí.jpg",
    ]);
    expect(data?.observations?.updatedByName).toBe("Marc");
  });

  it("another dog of the club has no classes yet (attendancePct null); an unknown dog is 404; TASKS and FREE_TRAINING off drop their parts", async () => {
    const thai = (await card("dog-thai")).data;
    expectValid("InstructorCard", thai);
    expect(thai?.metrics.attendancePct).toBeNull();
    expect(thai?.lastClasses).toEqual([]);
    await expect(failure(card("dog-unknown"))).resolves.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    use("instructorNoTasks");
    const noTasks = (await card()).data;
    expect(noTasks).not.toHaveProperty("instructorNote");
    expect(noTasks).not.toHaveProperty("tasks");
    expect(noTasks).not.toHaveProperty("observations");

    use("trainingModuleOffInstructor");
    const noTraining = (await card()).data;
    expect(noTraining?.metrics).not.toHaveProperty("trainingsCount");
    expect(noTraining?.metrics).not.toHaveProperty("trainingsPerWeek");

    use("planningNoLevels");
    expect((await card()).data).not.toHaveProperty("level");
  });
});
