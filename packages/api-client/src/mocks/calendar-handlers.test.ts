import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import pendingDocument from "../../openapi/pending.json";
import { createApiClient } from "../client";

import { mockScenario, resetPlanningState, resetSettingsState } from "./handlers";
import { server } from "./server";

const openapiSchemaId = "https://agilityhub.local/calendar-openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(
  {
    ...openapiDocument,
    components: {
      ...openapiDocument.components,
      schemas: { ...openapiDocument.components.schemas, ...pendingDocument.components.schemas },
    },
  },
  openapiSchemaId,
);
const schema = (name: string) =>
  ajv.compile({ $ref: `${openapiSchemaId}#/components/schemas/${name}` });

let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
// The D4 mockup is drawn on Wednesday 12 August 2026 (club-local week 2026-08-10…16).
const mockupNow = new Date("2026-08-12T08:00:00Z");

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, toFake: ["Date"] });
  resetPlanningState();
  resetSettingsState();
  // Created after `server.listen()` so the client uses the intercepted `fetch`.
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  resetPlanningState();
  resetSettingsState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

async function calendar(weekId: string, filter: "ACTIVE" | "CANCELLED" | "DRAFT") {
  const result = await client.GET("/weeks/{id}/calendar", {
    params: { path: { id: weekId }, query: { filter } },
  });
  if (result.data === undefined) throw new TypeError("Missing calendar");
  return result.data;
}

describe("E4-W02 calendar MSW handlers follow the S06 contract (forms B and D)", () => {
  it("serves the D4 week (form B) with the Thursday warning and the Carretera block", async () => {
    const data = await calendar("week-2026-08-10", "ACTIVE");
    const validate = schema("WeekCalendar");
    expect(validate(data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(data.week).toMatchObject({ relative: "CURRENT", state: "VALIDATED" });
    expect(data.rows).toEqual(["08:30", "09:30", "16:00", "17:40", "18:50"]);
    expect(data.inconsistencies.map((item) => item.message)).toEqual([
      "dj 18:50 — Marc assignat a dues pistes alhora (Cadells i Petita)",
    ]);
    expect(data.ringBlocks).toHaveLength(1);
    expect(data.classes.filter((item) => item.state === "CANCELLED")).toHaveLength(1);
    expect(data.canValidate).toBe(false);
  });

  it("R-06-08 validates the draft week and refuses the inconsistent one", async () => {
    const drafts = await calendar("week-2026-08-17", "DRAFT");
    expect(drafts).toMatchObject({ canValidate: true, draftCount: 28, week: { relative: "NEXT" } });
    const validation = await client.POST("/weeks/{id}/validation", {
      body: {},
      params: { path: { id: "week-2026-08-17" } },
    });
    expect(validation.data?.validatedClassIds).toHaveLength(28);
    expect((await calendar("week-2026-08-17", "ACTIVE")).classes.map((item) => item.state)).toEqual(
      Array.from({ length: 28 }, () => "ACTIVE"),
    );

    expect((await calendar("week-2026-08-24", "DRAFT")).canValidate).toBe(false);
    await expect(
      client.POST("/weeks/{id}/validation", {
        body: {},
        params: { path: { id: "week-2026-08-24" } },
      }),
    ).rejects.toMatchObject({ code: "WEEK_INCONSISTENT", status: 422 });
    await expect(
      client.POST("/weeks/{id}/validation", {
        body: {},
        params: { path: { id: "week-2026-08-17" } },
      }),
    ).rejects.toMatchObject({ code: "NOTHING_TO_VALIDATE", status: 422 });
  });

  it("E5-T15 GET /class-sessions/{id} adds instructorNames and the ring; PATCH does not", async () => {
    const id = "cls-2026-08-12-1850-0";
    const detail = await client.GET("/class-sessions/{id}", { params: { path: { id } } });
    const validate = schema("ClassSession");
    expect(validate(detail.data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(detail.data).toMatchObject({
      instructorNames: ["Marc"],
      ring: { id: "ring-central", name: "Central" },
    });
    const patched = await client.PATCH("/class-sessions/{id}", {
      body: { notes: "Porteu aigua", version: 1 },
      params: { path: { id } },
    });
    expect(patched.data).not.toHaveProperty("instructorNames");
    expect(patched.data).not.toHaveProperty("ring");
  });

  it("R-06-10 cancels with the notice text and R-06-09 checks the version", async () => {
    const id = "cls-2026-08-12-1850-0";
    await expect(
      client.POST("/class-sessions/{id}/cancellation", {
        body: { reason: "CLUB_MANUAL" },
        params: { header: { "Idempotency-Key": "key-1" }, path: { id } },
      }),
    ).rejects.toMatchObject({ code: "ADMIN_TEXT_REQUIRED", status: 422 });
    await expect(
      client.PATCH("/class-sessions/{id}", {
        body: { capacity: 3, version: 1 },
        params: { path: { id } },
      }),
    ).rejects.toMatchObject({ code: "CAPACITY_BELOW_BOOKINGS", status: 422 });
    const patched = await client.PATCH("/class-sessions/{id}", {
      body: { capacity: 6, version: 1 },
      params: { path: { id } },
    });
    expect(patched.data).toMatchObject({ capacity: 6, capacityMode: "MANUAL", version: 2 });
    await expect(
      client.PATCH("/class-sessions/{id}", {
        body: { capacity: 5, version: 1 },
        params: { path: { id } },
      }),
    ).rejects.toMatchObject({ code: "STALE_VERSION", status: 409 });

    const cancelled = await client.POST("/class-sessions/{id}/cancellation", {
      body: { adminText: "Plou massa.", reason: "CLUB_MANUAL" },
      params: { header: { "Idempotency-Key": "key-2" }, path: { id } },
    });
    const validate = schema("ClassSession");
    expect(validate(cancelled.data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(cancelled.data).toMatchObject({
      cancellation: { affectedBookings: 4, affectedWaitlist: 2, reason: "CLUB_MANUAL" },
      counters: { booked: 0, waiting: 0 },
      state: "CANCELLED",
    });
  });

  it("R-06-11 refuses a block over a class with the conflict list", async () => {
    await expect(
      client.POST("/ring-blocks", {
        body: {
          from: "2026-08-13T16:50:00Z",
          kind: "BLOCK",
          reason: "MAINTENANCE",
          ringId: "ring-cadells",
          to: "2026-08-13T17:50:00Z",
        },
        params: { header: { "Idempotency-Key": "key-3" } },
      }),
    ).rejects.toMatchObject({
      code: "RING_BLOCK_CONFLICT",
      details: { conflicts: [{ label: "dj 18:50 · Cadells", type: "CLASS" }] },
      status: 409,
    });
    const created = await client.POST("/ring-blocks", {
      body: {
        from: "2026-08-14T14:00:00Z",
        kind: "BLOCK",
        note: "Reg de la gespa",
        reason: "OTHER",
        ringId: "ring-muntanya",
        to: "2026-08-14T15:00:00Z",
      },
      params: { header: { "Idempotency-Key": "key-4" } },
    });
    const validate = schema("RingBlock");
    expect(validate(created.data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(created.data).toMatchObject({
      date: "2026-08-14",
      fromLocal: "16:00",
      toLocal: "17:00",
    });
  });

  it("R-06-05 answers RING_HAS_BOOKINGS when a class or a block moves onto a training booking", async () => {
    const id = "cls-2026-08-12-1850-0";
    const bookings = [
      {
        dogName: "Trevi",
        from: "2026-08-12T17:00:00Z",
        id: "training-2026-08-12-muntanya",
        memberName: "Clara Font",
        ringId: "ring-muntanya",
        to: "2026-08-12T18:00:00Z",
      },
    ];
    await expect(
      client.PATCH("/class-sessions/{id}", {
        body: { ringId: "ring-muntanya", version: 1 },
        params: { path: { id } },
      }),
    ).rejects.toMatchObject({ code: "RING_HAS_BOOKINGS", details: { bookings }, status: 422 });
    await expect(
      client.POST("/ring-blocks", {
        body: {
          from: "2026-08-12T17:30:00Z",
          kind: "BLOCK",
          reason: "MAINTENANCE",
          ringId: "ring-muntanya",
          to: "2026-08-12T18:30:00Z",
        },
        params: { header: { "Idempotency-Key": "key-5" } },
      }),
    ).rejects.toMatchObject({ code: "RING_HAS_BOOKINGS", details: { bookings }, status: 422 });

    const moved = await client.PATCH("/class-sessions/{id}", {
      body: { cancelBookings: true, ringId: "ring-muntanya", version: 1 },
      params: { path: { id } },
    });
    expect(moved.data).toMatchObject({ ringId: "ring-muntanya", version: 2 });
    // The booking is cancelled by the club: the same move no longer conflicts.
    const back = await client.PATCH("/class-sessions/{id}", {
      body: { ringId: "ring-central", version: 2 },
      params: { path: { id } },
    });
    expect(back.data).toMatchObject({ ringId: "ring-central", version: 3 });
    const again = await client.PATCH("/class-sessions/{id}", {
      body: { ringId: "ring-muntanya", version: 3 },
      params: { path: { id } },
    });
    expect(again.data).toMatchObject({ ringId: "ring-muntanya", version: 4 });
  });

  it("serves the instructor day grid (form D) of the Wednesday", async () => {
    const result = await client.GET("/day-grid", {
      params: { query: { date: "2026-08-12", view: "instructor" } },
    });
    const validate = schema("DayGrid");
    expect(validate(result.data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(result.data?.columns.map((column) => column.name)).toEqual([
      "Muntanya",
      "Central",
      "Carretera",
      "Cadells",
      "Petita",
    ]);
    expect(result.data?.rows.map((row) => row.time)).toEqual(["08:30", "09:30", "16:00", "18:50"]);
  });
});

interface OpeningWindow {
  close: string;
  open: string;
}

/** `club.openingHours` through the api (R-02-09: a weekday that is absent is closed). */
async function putOpeningHours(
  change: (value: Record<string, OpeningWindow>) => Record<string, OpeningWindow>,
) {
  const current = await client.GET("/club/opening-hours");
  const value = (current.data?.value ?? {}) as Record<string, OpeningWindow>;
  await client.PUT("/club/opening-hours", {
    body: { value: change(value), version: current.data?.version ?? 1 },
  });
}

const sundayClass = {
  date: "2026-08-16",
  endTime: "11:00",
  instructorIds: ["instructor-marc"],
  levelIds: ["level-b"],
  ringId: "ring-central",
  startTime: "10:00",
};

describe("E4-W09 opening hours in the calendar MSW handlers (S02 R-02-09, S06 §3)", () => {
  it("R-02-09 a weekday absent from club.openingHours is closed: classes and ring blocks there get OUTSIDE_OPENING_HOURS", async () => {
    await putOpeningHours((value) =>
      Object.fromEntries(Object.entries(value).filter(([day]) => day !== "SUNDAY")),
    );
    await expect(client.POST("/class-sessions", { body: sundayClass })).rejects.toMatchObject({
      code: "OUTSIDE_OPENING_HOURS",
      status: 422,
    });
    // 10:00–11:00 club-local (CEST).
    await expect(
      client.POST("/ring-blocks", {
        body: {
          from: "2026-08-16T08:00:00Z",
          kind: "BLOCK",
          reason: "MAINTENANCE",
          ringId: "ring-central",
          to: "2026-08-16T09:00:00Z",
        },
        params: { header: { "Idempotency-Key": "closed-sunday" } },
      }),
    ).rejects.toMatchObject({ code: "OUTSIDE_OPENING_HOURS", status: 422 });
    // Only Sunday is closed: the same class on Monday is created.
    const monday = await client.POST("/class-sessions", {
      body: { ...sundayClass, date: "2026-08-17" },
    });
    expect(monday.response.status).toBe(201);
  });

  it("S06 §3 with an opening at 07:05 and 10-minute slots: 07:10 is the first valid start", async () => {
    await putOpeningHours((value) =>
      Object.fromEntries(Object.keys(value).map((day) => [day, { close: "21:55", open: "07:05" }])),
    );
    const at = (startTime: string, endTime: string) =>
      client.POST("/class-sessions", {
        body: { ...sundayClass, date: "2026-08-13", endTime, startTime },
      });
    await expect(at("07:05", "08:05")).rejects.toMatchObject({
      code: "INVALID_SLOT_GRANULARITY",
      status: 400,
    });
    await expect(at("07:00", "08:00")).rejects.toMatchObject({
      code: "OUTSIDE_OPENING_HOURS",
      status: 422,
    });
    await expect(at("20:50", "22:00")).rejects.toMatchObject({
      code: "OUTSIDE_OPENING_HOURS",
      status: 422,
    });
    expect((await at("07:10", "08:10")).response.status).toBe(201);
  });
});

describe("E4-W10 the template MSW handlers refuse a band on a closed day of the kind (S06 R-06-01, WeekTemplateRules)", () => {
  it("R-06-01 R-02-09 Monday closed: WEEKDAYS bands (new or moved) get OUTSIDE_OPENING_HOURS; the Saturday template still takes them", async () => {
    await putOpeningHours((value) =>
      Object.fromEntries(Object.entries(value).filter(([day]) => day !== "MONDAY")),
    );
    await expect(
      client.POST("/week-templates/{id}/bands", {
        body: { endTime: "11:00", startTime: "10:00" },
        params: { path: { id: "template-setmana-a" } },
      }),
    ).rejects.toMatchObject({ code: "OUTSIDE_OPENING_HOURS", status: 422 });
    const weekdays = await client.GET("/week-templates/{id}", {
      params: { path: { id: "template-setmana-a" } },
    });
    const band = weekdays.data?.bands[0];
    if (band === undefined || weekdays.data === undefined) throw new TypeError("Missing a band");
    await expect(
      client.PATCH("/week-templates/{id}/bands/{bandId}", {
        body: { endTime: band.endTime, startTime: band.startTime, version: weekdays.data.version },
        params: { path: { bandId: band.id, id: "template-setmana-a" } },
      }),
    ).rejects.toMatchObject({ code: "OUTSIDE_OPENING_HOURS", status: 422 });

    const saturday = await client.POST("/week-templates/{id}/bands", {
      body: { endTime: "14:00", startTime: "13:00" },
      params: { path: { id: "template-dissabtes" } },
    });
    expect(saturday.response.status).toBe(201);
  });
});

describe("E5-W05 round 2 · the calendar world's reads are the caller's club's, and refuse `q` as the snapshot does (CONVENCIONS_API §4, E75)", () => {
  /** A raw read (the generated types forbid `q`), as `scenario`. */
  async function read(
    scenario: "admin" | "adminOtherClub" | "instructor" | "member",
    path: string,
  ) {
    mockScenario(scenario);
    const response = await fetch(`https://core.example.test/api/v1${path}`);
    return {
      body: (await response.json()) as { code?: string; items?: unknown[]; totalItems?: number },
      status: response.status,
    };
  }

  it("E5-W05 round 2 #11.e: an ADMIN of another club lists no week and no class, and this world's week, calendar and class are 404 NOT_FOUND for it", async () => {
    for (const path of ["/weeks", "/class-sessions"]) {
      const own = await read("admin", path);
      expect(own.status, path).toBe(200);
      expect(own.body.totalItems, path).toBeGreaterThan(0);
      const other = await read("adminOtherClub", path);
      expect([other.status, other.body.items, other.body.totalItems], path).toEqual([200, [], 0]);
      const validate = schema(
        path === "/weeks" ? "ListPageWeekListItem" : "ListPageClassSessionListItem",
      );
      expect(validate(own.body), JSON.stringify(validate.errors, null, 2)).toBe(true);
      expect(validate(other.body), JSON.stringify(validate.errors, null, 2)).toBe(true);
    }
    for (const path of [
      "/weeks/week-2026-08-10",
      "/weeks/week-2026-08-10/calendar?filter=ACTIVE",
      "/class-sessions/cls-2026-08-12-1850-0",
    ]) {
      expect((await read("admin", path)).status, path).toBe(200);
      const other = await read("adminOtherClub", path);
      expect([other.status, other.body.code], path).toEqual([404, "NOT_FOUND"]);
    }
  });

  it("E5-W05 round 3 #3: an ADMIN of another club cannot write this club's weeks, classes or ring blocks either: validation, generation, PATCH, the cancellation preview, the cancellation, the risk exemption and the block's read, PATCH and cancellation are 404 NOT_FOUND, and nothing changes", async () => {
    const block = "/ring-blocks/block-2026-08-12-carretera";
    const before = {
      block: await read("admin", block),
      monday: await read("admin", "/class-sessions/cls-2026-08-12-1850-0"),
      week: await read("admin", "/weeks/week-2026-08-17"),
    };
    expect([before.block.status, before.monday.status, before.week.status]).toEqual([
      200, 200, 200,
    ]);
    const writes: [method: string, path: string, body?: unknown][] = [
      ["POST", "/weeks/week-2026-08-17/validation"],
      ["POST", "/weeks/week-2026-08-24/generation", { weekdayTemplateId: "tpl-weekdays" }],
      ["PATCH", "/class-sessions/cls-2026-08-12-1850-0", { notes: "Una altra nota", version: 1 }],
      ["GET", "/class-sessions/cls-2026-08-12-1850-0/cancellation-preview"],
      [
        "POST",
        "/class-sessions/cls-2026-08-12-1850-0/cancellation",
        { adminText: "Anul·lada per un altre club", reason: "CLUB_MANUAL" },
      ],
      ["POST", "/class-sessions/cls-2026-08-12-1850-0/risk-exemption", { exempt: true }],
      ["GET", block],
      ["PATCH", block, { note: "Una altra nota", version: 1 }],
      ["POST", `${block}/cancellation`],
    ];
    mockScenario("adminOtherClub");
    const answers: string[] = [];
    for (const [method, path, body] of writes) {
      const response = await fetch(`https://core.example.test/api/v1${path}`, {
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
        method,
      });
      const answer = (await response.json()) as { code?: string };
      answers.push(`${method} ${path} ${String(response.status)} ${answer.code ?? ""}`);
    }
    expect(answers).toEqual(writes.map(([method, path]) => `${method} ${path} 404 NOT_FOUND`));
    expect((await read("admin", "/class-sessions/cls-2026-08-12-1850-0")).body).toEqual(
      before.monday.body,
    );
    expect((await read("admin", "/weeks/week-2026-08-17")).body).toEqual(before.week.body);
    expect((await read("admin", block)).body).toEqual(before.block.body);
  });

  it("E7-W07 step 8 (E5-W05 round 3 review #7, R3-A2): POST /weeks by an ADMIN of another club is answered from its own club, never from this club's week: 201 with a new PENDING week of its own where this club's 2026-08-10 is VALIDATED, 200 with that same week on a repeat, and this club's weeks do not change", async () => {
    const weeks = async () => (await read("admin", "/weeks?size=50")).body;
    const before = await weeks();
    expect(before.totalItems).toBeGreaterThan(0);
    const create = async (startDate: string) => {
      mockScenario("adminOtherClub");
      const response = await fetch("https://core.example.test/api/v1/weeks", {
        body: JSON.stringify({ startDate }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return {
        body: (await response.json()) as { id: string; startDate: string; state: string },
        status: response.status,
      };
    };
    const first = await create("2026-08-10");
    expect([first.status, first.body.startDate, first.body.state]).toEqual([
      201,
      "2026-08-10",
      "PENDING",
    ]);
    expect(first.body.id).not.toBe("week-2026-08-10");
    const week = schema("Week");
    expect(week(first.body), JSON.stringify(week.errors, null, 2)).toBe(true);
    const again = await create("2026-08-10");
    expect([again.status, again.body.id]).toEqual([200, first.body.id]);
    // A week this club has not created yet stays out of this club's world too.
    expect((await create("2026-09-07")).status).toBe(201);
    expect(await weeks()).toEqual(before);
  });

  it("E5-W05 round 2 #11.e: GET /class-sessions is the staff's (a MEMBER is 403) and filters by the snapshot's x-filterable fields", async () => {
    const wednesday = await read(
      "instructor",
      `/class-sessions?filter=${encodeURIComponent("date:eq:2026-08-12")}&sort=startsAt,asc&fields=id,date,startTime`,
    );
    expect(wednesday.status).toBe(200);
    const items = wednesday.body.items as { date?: string; id: string; startTime?: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.date === "2026-08-12")).toBe(true);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(["date", "id", "startTime"]);
    const member = await read("member", "/class-sessions");
    expect([member.status, member.body.code]).toEqual([403, "FORBIDDEN"]);
    const undeclared = await read(
      "admin",
      `/class-sessions?filter=${encodeURIComponent("capacity:eq:5")}`,
    );
    expect([undeclared.status, undeclared.body.code]).toEqual([400, "INVALID_FILTER"]);
  });

  it("E5-W05 round 2 #11.e: a non-blank `q` on GET /weeks and GET /class-sessions is 400 INVALID_FILTER (neither declares it); a blank one reads as absent", async () => {
    for (const path of ["/weeks", "/class-sessions"]) {
      const searched = await read("admin", `${path}?q=setmana`);
      expect([searched.status, searched.body.code], path).toEqual([400, "INVALID_FILTER"]);
      expect((await read("admin", `${path}?q=%20`)).status, path).toBe(200);
    }
  });
});
