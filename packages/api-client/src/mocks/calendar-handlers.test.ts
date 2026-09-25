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
