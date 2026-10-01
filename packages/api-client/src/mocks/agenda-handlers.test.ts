import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import { isApiError } from "../api-error";
import { createApiClient } from "../client";

import {
  AGENDA_MOCK_NOW,
  AGENDA_SELECTED_CLASS_ID,
  mockScenario,
  resetAttendanceMockState,
  resetFollowupMockState,
  resetSettingsState,
  resetTrainingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/agenda-openapi.json";
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

const week = (query: { date?: string; instructorId?: string; ringId?: string } = {}) =>
  client.GET("/instructor/week", { params: { query: { date: "2026-08-12", ...query } } });

/** «dl 10 08:00 TRAINING Muntanya — Pau + Blat» and the like, one line per cell. */
function lines(cells: readonly { date: string; kind: string; time: string }[]) {
  return cells.map((cell) => {
    const value = cell as Record<string, unknown>;
    const label =
      cell.kind === "CLASS"
        ? `${String(value.displayDescription)} ${String(value.booked)}/${String(value.capacity)} ${String(value.ringName)} · ${String(value.instructorName)}`
        : cell.kind === "TRAINING"
          ? `${String(value.ringName)} — ${String(value.who)}`
          : `${String(value.ringName)} — ${String(value.reason)}`;
    return `${cell.date} ${cell.time} ${cell.kind} ${label}`;
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(AGENDA_MOCK_NOW), toFake: ["Date"] });
  resetAttendanceMockState();
  resetTrainingMockState();
  resetFollowupMockState();
  use("instructor");
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  resetAttendanceMockState();
  resetTrainingMockState();
  resetFollowupMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

describe("E6-W03 step 9 GET /instructor/week (S10 §6, R-10-15) as the api answers", () => {
  it("mockup D12: the ISO week of the date (dl–ds), the rows, trainings, the block and every class", async () => {
    const { data } = await week();
    expectValid("InstructorWeek", data);
    expect(data?.week).toEqual({
      endDate: "2026-08-15",
      relative: "CURRENT",
      startDate: "2026-08-10",
    });
    expect(data?.rows).toEqual(["08:00", "08:30", "16:00", "18:50", "19:00"]);
    expect(lines(data?.cells ?? [])).toEqual([
      "2026-08-10 08:00 TRAINING Muntanya — Pau + Blat",
      "2026-08-10 08:30 CLASS A i B 4/5 Central · Estel",
      "2026-08-10 08:30 CLASS C i sup. 3/5 Muntanya · Marc",
      "2026-08-10 18:50 CLASS B i C 4/5 Central · Marc",
      "2026-08-10 18:50 CLASS Cadells 2/5 Cadells · Núria",
      "2026-08-10 19:00 TRAINING Carretera — Sergio + Thai",
      "2026-08-11 08:30 CLASS C i sup. 0/5 Muntanya · Marc",
      "2026-08-11 18:50 CLASS A i B 3/5 Central · Estel",
      "2026-08-12 08:30 CLASS A i B 5/5 Central · Estel",
      "2026-08-12 08:30 CLASS C i sup. 4/5 Muntanya · Marc",
      "2026-08-12 08:30 TRAINING Carretera — Júlia + Kira",
      "2026-08-12 16:00 BLOCK Carretera — MAINTENANCE",
      "2026-08-12 18:50 CLASS B i C 4/5 Central · Marc",
      "2026-08-12 18:50 CLASS Teràpia 1/1 Petita · Núria",
      "2026-08-13 18:50 CLASS Cadells 2/5 Cadells · Marc",
      "2026-08-13 18:50 CLASS Particular 1/1 Petita · Estel",
      "2026-08-14 08:30 CLASS Cadells 3/5 Cadells · Marc",
      "2026-08-14 18:50 CLASS A i B 4/5 Central · Estel",
      "2026-08-15 08:30 CLASS A 5/5 Muntanya · Estel",
      "2026-08-15 08:30 CLASS B i C 5/5 Central · Marc",
    ]);
    const selected = data?.cells.find((cell) => cell.classId === AGENDA_SELECTED_CLASS_ID);
    expect(selected).toMatchObject({ attendanceStatus: "PENDING", state: "ACTIVE", waiting: 2 });
    expect(data?.cells.find((cell) => cell.classId === "c-0810-0830-ab")).toMatchObject({
      attendanceStatus: "DONE",
    });
    expect(data?.cells.find((cell) => cell.classId === "c-0811-0830-csup")).toMatchObject({
      attendanceStatus: "NONE",
      state: "CANCELLED",
    });
    expect(data?.cells.find((cell) => cell.kind === "BLOCK")).toMatchObject({
      endTime: "18:00",
      note: "regar i repassar el terra",
      reason: "MAINTENANCE",
    });
    expect(data?.filters.instructors.map((item) => item.shortName)).toEqual([
      "Estel",
      "Marc",
      "Núria",
    ]);
    expect(data?.filters.rings.map((ring) => ring.name)).toContain("Muntanya");
  });

  it("instructorId filters the classes only (me = the caller); ringId filters everything", async () => {
    const mine = (await week({ instructorId: "me" })).data;
    expect(mine?.filters.instructorId).toBe("instructor-estel");
    expect(
      mine?.cells
        .filter((cell) => cell.kind === "CLASS")
        .every((cell) => cell.instructorName === "Estel"),
    ).toBe(true);
    expect(mine?.cells.filter((cell) => cell.kind !== "CLASS")).toHaveLength(4);
    const carretera = (await week({ ringId: "ring-carretera" })).data;
    expect(lines(carretera?.cells ?? [])).toEqual([
      "2026-08-10 19:00 TRAINING Carretera — Sergio + Thai",
      "2026-08-12 08:30 TRAINING Carretera — Júlia + Kira",
      "2026-08-12 16:00 BLOCK Carretera — MAINTENANCE",
    ]);
    expect(carretera?.rows).toEqual(["08:30", "16:00", "19:00"]);
  });

  it("FREE_TRAINING off: no TRAINING cells; WAITLIST off: no waiting; another week reads PAST or FUTURE", async () => {
    use("agendaNoTraining");
    const { data } = await week();
    expect(data?.cells.some((cell) => cell.kind === "TRAINING")).toBe(false);
    expect(data?.rows).toEqual(["08:30", "16:00", "18:50"]);
    use("instructorNoWaitlist");
    const noWaitlist = (await week()).data;
    expect(noWaitlist?.cells.some((cell) => "waiting" in cell)).toBe(false);
    expect((await week({ date: "2026-08-03" })).data?.week.relative).toBe("PAST");
    expect((await week({ date: "2026-08-19" })).data?.week).toEqual({
      endDate: "2026-08-22",
      relative: "FUTURE",
      startDate: "2026-08-17",
    });
  });

  it("R-10-16: with classes.maxInstructorsPerClass = 2 the shared class reads «Marc, Estel» and «Els meus» includes it", async () => {
    use("planningTwoInstructors");
    const { data } = await week({ instructorId: "instructor-estel" });
    expect(data?.cells.find((cell) => cell.classId === "c-0815-0830-bc")?.instructorName).toBe(
      "Marc, Estel",
    );
  });

  it("refuses a bad date (400), an unknown instructor (404), a member (403) and an impersonation (IMPERSONATION_DENIED)", async () => {
    await expect(failure(week({ date: "2026-02-30" }))).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    await expect(failure(week({ instructorId: "nobody" }))).resolves.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    use("member");
    await expect(failure(week())).resolves.toMatchObject({ code: "FORBIDDEN", status: 403 });
    use("impersonated");
    await expect(failure(week())).resolves.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
  });

  it("GET /instructor/week/export?format=pdf answers a valid PDF of the same query, synchronously", async () => {
    const { data, response } = await client.GET("/instructor/week/export", {
      params: { query: { date: "2026-08-12", format: "pdf", ringId: "ring-central" } },
      parseAs: "blob",
    });
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("canic_agenda_20260810.pdf");
    if (!(data instanceof Blob)) throw new TypeError("Expected the PDF as a Blob");
    const text = await data.text();
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // The cross-reference table points at each object.
    const xref = Number(/startxref\n(\d+)/u.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gmu)].map((match) => Number(match[1]));
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${String(index + 1)} 0 obj`)).toBe(true);
    });
    const raw = client as unknown as {
      GET: (path: string, init: unknown) => Promise<unknown>;
    };
    await expect(
      failure(raw.GET("/instructor/week/export", { params: { query: { format: "csv" } } })),
    ).resolves.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("the selected class of D12 is a sheet of the same world: five rows, two waiting, and the stale variant's other save", async () => {
    const { data } = await client.GET("/class-sessions/{id}/attendance", {
      params: { path: { id: AGENDA_SELECTED_CLASS_ID } },
    });
    expectValid("AttendanceSheet", data);
    expect(data?.rows.map((row) => `${row.memberFirstName} + ${row.dogName} ${row.state}`)).toEqual(
      [
        "Laura + Duna PRESENT",
        "Marc + Chun-li PRESENT",
        "Anna + Nass NOTIFIED",
        "Eva + Fish NO_SHOW",
        "Pau + Blat PENDING",
      ],
    );
    expect(data?.rows[0]?.pendingTasksCount).toBe(2);
    expect(data?.rows[2]).toMatchObject({
      final: true,
      notice: { seatReleased: true, waitlistNotified: false },
    });
    expect(
      data?.waitlist?.entries.map((entry) => `${entry.memberFirstName} + ${entry.dogName}`),
    ).toEqual(["Júlia + Kira", "Roser + Lluna"]);
    expect(data?.sheet).toMatchObject({ canMarkNotice: true, canMarkPresence: true, version: 3 });
    use("attendanceStale");
    const stale = await failure(
      client.PUT("/class-sessions/{id}/attendance", {
        body: { items: [{ bookingId: "b-d12-4", state: "PENDING" }], version: 3 },
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: AGENDA_SELECTED_CLASS_ID },
        },
      }),
    );
    expect(stale).toMatchObject({ code: "STALE_VERSION", status: 409 });
    const current = (stale.details as { current: unknown }).current;
    expectValid("AttendanceSheet", current);
    expect(current).toMatchObject({ sheet: { version: 4 } });
  });
});

describe("E6-W03 step 9 D14 GET /followup, unread-count, read and read-all (S10 §6, R-10-13)", () => {
  // `size` outside the contract's 20 | 50 is sent on purpose: the api answers INVALID_FILTER.
  const list = (query: { filter?: string[]; size?: number; sort?: string[] } = {}) =>
    client.GET("/followup", {
      params: { query: query as { filter?: string[]; size?: 20 | 50; sort?: string[] } },
    });
  const count = async () => (await client.GET("/followup/unread-count")).data?.count;
  const read = (id: string) =>
    client.POST("/followup/{id}/read", {
      params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id } },
    });
  const readAll = () =>
    client.POST("/followup/read-all", {
      params: { header: { "Idempotency-Key": crypto.randomUUID() } },
    });

  beforeEach(() => {
    vi.setSystemTime(new Date("2026-08-20T10:00:00+02:00"));
  });

  it("mockup D14 for an ADMIN: five rows, all unread, newest first; the counter says 5", async () => {
    use("admin");
    const { data } = await list();
    expectValid("FollowupPage", data);
    expect(
      data?.items.map(
        (item) =>
          `${String(item.memberName)} · ${String(item.dogName)} · ${String(item.kind)} · ${String(item.unread)}`,
      ),
    ).toEqual([
      "Laura Serra · Duna · MEMBER_NOTE · true",
      "Pau Riera · Blat · MEMBER_NOTE · true",
      "Laura Serra · Duna · TASK · true",
      "Anna Ballart · Nass · TASK · true",
      "Laura Serra · Duna · TASK · true",
    ]);
    expect(data?.items[4]).toMatchObject({ completedAt: "2026-08-02T09:15:00Z" });
    expect(data?.items[0]).toMatchObject({ authorGender: "FEMALE", authorName: "Laura" });
    expect(await count()).toBe(5);
    expectValid("FollowupUnreadCount", { count: await count() });
  });

  it("R-10-13 for the instructor (Estel): her own tasks are never unread and come after the unread rows", async () => {
    const { data } = await list();
    expect(data?.items.map((item) => `${item.id} ${String(item.unread)}`)).toEqual([
      "f-note-duna true",
      "f-note-blat true",
      "f-task-contactes true",
      "f-task-balanci false",
      "f-task-espera false",
    ]);
    expect(await count()).toBe(3);
  });

  it("the kind chips and unread filter by the api; an undeclared filter, sort or size is 400 INVALID_FILTER", async () => {
    use("admin");
    const tasks = (await list({ filter: ["kind:eq:TASK"] })).data;
    expect(tasks?.items.map((item) => item.kind)).toEqual(["TASK", "TASK", "TASK"]);
    expect(tasks?.appliedFilters).toEqual([{ field: "kind", op: "eq", value: "TASK" }]);
    expect((await list({ filter: ["kind:eq:MEMBER_NOTE"] })).data?.totalItems).toBe(2);
    const refused: Parameters<typeof list>[0][] = [
      { filter: ["text:eq:x"] },
      { sort: ["createdAt,desc"] },
      { size: 1000 },
    ];
    for (const query of refused) {
      await expect(failure(list(query))).resolves.toMatchObject({
        code: "INVALID_FILTER",
        status: 400,
      });
    }
  });

  it("a row read leaves its highlight and the counter; read-all puts it at 0; both need their key", async () => {
    use("admin");
    await read("f-note-blat");
    expect(await count()).toBe(4);
    const { data } = await list();
    expect(data?.items.map((item) => `${item.id} ${String(item.unread)}`)[4]).toBe(
      "f-note-blat false",
    );
    await expect(failure(read("f-unknown"))).resolves.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    await readAll();
    expect(await count()).toBe(0);
    expect((await list()).data?.items.every((item) => item.unread === false)).toBe(true);
    const raw = client as unknown as { POST: (path: string, init: unknown) => Promise<unknown> };
    await expect(
      failure(raw.POST("/followup/read-all", { headers: { "Idempotency-Key": "" } })),
    ).resolves.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("followupAllRead: nothing unread; TASKS off: 404 MODULE_DISABLED; an impersonation: IMPERSONATION_DENIED", async () => {
    use("followupAllRead");
    expect(await count()).toBe(0);
    expect((await list()).data?.items.some((item) => item.unread)).toBe(false);
    use("instructorNoTasks");
    await expect(failure(list())).resolves.toMatchObject({ code: "MODULE_DISABLED", status: 404 });
    use("impersonated");
    await expect(failure(client.GET("/followup/unread-count"))).resolves.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
  });

  const values = (query: { field: string; filter?: string[]; q?: string }) =>
    client.GET("/followup/filter-values", { params: { query } });
  const counted = (answer: { values: { count: number; label: string; value: unknown }[] }) =>
    answer.values.map((item) => `${item.label} ${String(item.count)}`).sort();

  it("E6-W04 step 0c: GET /followup/filter-values counts each value over the whole set the filters and q select (followupMany: the members, dogs and authors beyond the first page too), without the field's own filters, labelled by name", async () => {
    use("followupMany");
    const firstPage = (await list({ size: 50 })).data;
    expect(new Set(firstPage?.items.map((item) => item.memberName))).toEqual(
      new Set(["Laura Serra"]),
    );
    const members = (await values({ field: "memberId" })).data;
    expectValid("FilterValues", members);
    expect(members?.field).toBe("memberId");
    expect(counted(members ?? { values: [] })).toEqual([
      "Anna Ballart 1",
      "Laura Serra 55",
      "Pau Riera 1",
    ]);
    expect(members?.values.find((item) => item.label === "Pau Riera")?.value).toBe("member-pau");
    expect(counted((await values({ field: "dogId" })).data ?? { values: [] })).toEqual([
      "Blat 1",
      "Duna 55",
      "Nass 1",
    ]);
    const authors = (await values({ field: "authorAccountId" })).data;
    expect(counted(authors ?? { values: [] })).toEqual(["Estel 2", "Laura 53", "Marc 1", "Pau 1"]);
    expect(authors?.values.find((item) => item.label === "Marc")?.value).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    // The other filters narrow it; the field's own filters are left out.
    expect(
      counted(
        (await values({ field: "memberId", filter: ["kind:eq:TASK", "memberId:eq:member-pau"] }))
          .data ?? { values: [] },
      ),
    ).toEqual(["Anna Ballart 1", "Laura Serra 2"]);
    // `unread` is the caller's (R-10-13): the many variant's three tasks are read already.
    expect(counted((await values({ field: "unread" })).data ?? { values: [] })).toEqual([
      "false 3",
      "true 54",
    ]);
    expect(counted((await values({ field: "kind" })).data ?? { values: [] })).toEqual([
      "MEMBER_NOTE 54",
      "TASK 3",
    ]);
    // `q` narrows the set as the list's search does.
    expect(
      counted((await values({ field: "memberId", q: "contactes" })).data ?? { values: [] }),
    ).toEqual(["Anna Ballart 1"]);
  });

  it("E6-W04 step 0c: filter-values refuses an undeclared field or filter (400 INVALID_FILTER), a member (403), an impersonation (IMPERSONATION_DENIED) and TASKS off (404 MODULE_DISABLED)", async () => {
    await expect(failure(values({ field: "textExcerpt" }))).resolves.toMatchObject({
      code: "INVALID_FILTER",
      status: 400,
    });
    await expect(
      failure(values({ field: "memberId", filter: ["text:eq:x"] })),
    ).resolves.toMatchObject({ code: "INVALID_FILTER", status: 400 });
    use("member");
    await expect(failure(values({ field: "memberId" }))).resolves.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    use("impersonated");
    await expect(failure(values({ field: "memberId" }))).resolves.toMatchObject({
      code: "IMPERSONATION_DENIED",
      status: 403,
    });
    use("instructorNoTasks");
    await expect(failure(values({ field: "memberId" }))).resolves.toMatchObject({
      code: "MODULE_DISABLED",
      status: 404,
    });
  });

  it("E6-W04 step 0c: GET /followup's q searches the member's full name, the dog, the author and the whole text (not only the excerpt), in any case", async () => {
    use("admin");
    const found = async (q: string) =>
      (await client.GET("/followup", { params: { query: { q } } })).data?.items.map(
        (item) => item.id,
      );
    expect(await found("recompenses")).toEqual(["f-task-balanci"]);
    expect(await found("BALLART")).toEqual(["f-task-contactes"]);
    expect(await found("blat")).toEqual(["f-note-blat"]);
    expect(await found("marc")).toEqual(["f-task-contactes"]);
    expect(await found("línia de sortida")).toEqual(["f-task-espera"]);
    const page = (await client.GET("/followup", { params: { query: { q: "duna" } } })).data;
    expectValid("FollowupPage", page);
    expect(page?.totalItems).toBe(3);
  });
});

describe("E6-W04 step 0c · InstructorWeek.trainingSlotMinutes for D12's legend (api E6-T06)", () => {
  afterEach(() => {
    resetSettingsState();
  });

  it("E6-W04 step 0c: the club's training.slotMinutes (30, then 45 after a change), and null with FREE_TRAINING off", async () => {
    const first = (await week()).data;
    expectValid("InstructorWeek", first);
    expect(first?.trainingSlotMinutes).toBe(30);
    use("admin");
    const parameter = (
      await client.GET("/parameters/{key}", { params: { path: { key: "training.slotMinutes" } } })
    ).data;
    await client.PUT("/parameters/{key}", {
      body: { reason: "Torns de 45 minuts", value: 45, version: parameter?.version ?? 0 },
      params: { path: { key: "training.slotMinutes" } },
    });
    use("instructor");
    expect((await week()).data?.trainingSlotMinutes).toBe(45);
    use("agendaNoTraining");
    const off = (await week()).data;
    expectValid("InstructorWeek", off);
    expect(off?.trainingSlotMinutes).toBeNull();
  });
});
