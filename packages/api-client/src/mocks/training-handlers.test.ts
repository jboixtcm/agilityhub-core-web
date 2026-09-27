import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import type { components } from "../generated/schema";

import { TRAINING_MOCK_NOW, trainingState } from "./fixtures/training";
import {
  mockScenario,
  resetPlanningState,
  resetTrainingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type RingBlock = components["schemas"]["RingBlock"];
type TrainingBooking = components["schemas"]["TrainingBooking"];
type TrainingSlots = components["schemas"]["TrainingSlots"];
type TrainingSummary = components["schemas"]["TrainingSummary"];
type ApiError = components["schemas"]["ApiError"];

const origin = "http://localhost";
const schemaId = "https://agilityhub.local/openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, schemaId);

function valid(name: string, value: unknown): void {
  const validate = ajv.compile({ $ref: `${schemaId}#/components/schemas/${name}` });
  expect(validate(value), `${name}: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", ...headers },
    method,
  });
  const text = await response.text();
  return { body: (text === "" ? undefined : JSON.parse(text)) as unknown, status: response.status };
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- each call names its answer's schema.
async function as<Body>(scenario: MockScenario, method: string, path: string, body?: unknown) {
  mockScenario(scenario);
  const answer = await call(method, path, body, { "Idempotency-Key": crypto.randomUUID() });
  return { body: answer.body as Body, status: answer.status };
}

const slotsOf = (grid: TrainingSlots, date: string) =>
  grid.days.find((day) => day.date === date)?.slots ?? [];

/** «07:00 MUN:OWN_TRAINING CEN:TRAINING CAR:TRAINING» per slot, for readable assertions. */
function row(grid: TrainingSlots, date: string, time: string): string {
  const slot = slotsOf(grid, date).find((item) => item.startsAtLocal === time);
  if (slot === undefined) return "missing";
  return grid.rings
    .map((ring) => {
      const cell = slot.rings[ring.id];
      return `${ring.shortName}:${cell?.state === "FREE" ? "FREE" : (cell?.reason ?? "?")}`;
    })
    .join(" ");
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(TRAINING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
  resetTrainingMockState();
});
afterEach(() => {
  vi.useRealTimers();
  server.resetHandlers();
  resetTrainingMockState();
  resetPlanningState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E5-W02 step 9 · the S09 mock world answers as the api (S09 §6, CATALEG_ERRORS §1 and rule 0)", () => {
  it("GET /me/training-summary: two eligible dogs, Rock by default at 2/3 with one cancellable session", async () => {
    const { body, status } = await as<TrainingSummary>("member", "GET", "/me/training-summary");
    expect(status).toBe(200);
    valid("TrainingSummary", body);
    expect(body.eligibleDogs).toEqual([
      { id: "dog-rock", levelName: "D", name: "Rock", ownerName: null, rightSource: "LEVEL" },
      {
        id: "dog-toby",
        levelName: "B",
        name: "Toby",
        ownerName: "Joan Antoni",
        rightSource: "MANUAL",
      },
    ]);
    expect(body.defaultDogId).toBe("dog-rock");
    expect(body.counter).toEqual({
      limit: 3,
      remaining: 1,
      resetsAt: "2026-08-09T18:00:00Z",
      used: 2,
    });
    expect(body.weekOpensAt).toEqual({ dayOfWeek: "SUNDAY", time: "20:00" });
    expect(body.week).toEqual({
      current: true,
      end: "2026-08-09T18:00:00Z",
      start: "2026-08-02T18:00:00Z",
    });
    expect(body.cancellableBookings).toEqual([
      {
        cancellableUntil: "2026-08-04T04:00:00Z",
        id: "training-rock-tue4",
        ringName: "Muntanya",
        startsAt: "2026-08-04T06:00:00Z",
      },
    ]);
    // Toby has no session this week; the next week counts by session date (B15).
    const toby = await as<TrainingSummary>("member", "GET", "/me/training-summary?dogId=dog-toby");
    expect(toby.body.counter.used).toBe(0);
    const nextWeek = await as<TrainingSummary>(
      "member",
      "GET",
      "/me/training-summary?dogId=dog-rock&date=2026-08-10",
    );
    expect(nextWeek.body.counter.used).toBe(0);
    expect(nextWeek.body.week.current).toBe(false);
  });

  it("summary variants: no right, at the limit with and without cancellable sessions, group and levels off", async () => {
    const none = await as<TrainingSummary>("trainingNoRight", "GET", "/me/training-summary");
    expect(none.body.eligibleDogs).toEqual([]);
    expect(none.body.defaultDogId).toBeNull();
    valid("TrainingSummary", none.body);

    const limit = await as<TrainingSummary>("trainingAtLimit", "GET", "/me/training-summary");
    expect(limit.body.counter).toMatchObject({ remaining: 0, used: 3 });
    expect(limit.body.cancellableBookings.map((item) => item.id)).toEqual([
      "training-rock-tue4",
      "training-rock-thu6",
    ]);

    const limitNone = await as<TrainingSummary>(
      "trainingAtLimitNoCancellable",
      "GET",
      "/me/training-summary",
    );
    expect(limitNone.body.counter).toMatchObject({ remaining: 0, used: 3 });
    expect(limitNone.body.cancellableBookings).toEqual([]);

    // FAMILY_GROUP off: only own dogs, `ownerName` null (S09 §9).
    const own = await as<TrainingSummary>("signupNoFamily", "GET", "/me/training-summary");
    expect(own.body.eligibleDogs.map((dog) => [dog.name, dog.ownerName])).toEqual([["Rock", null]]);
    // levels.enabled = false: only the manual right, and no level name.
    const noLevels = await as<TrainingSummary>("memberNoLevels", "GET", "/me/training-summary");
    expect(noLevels.body.eligibleDogs.map((dog) => [dog.name, dog.levelName])).toEqual([
      ["Toby", null],
    ]);

    const off = await as<ApiError>("trainingModuleOff", "GET", "/me/training-summary");
    expect([off.status, off.body.code]).toEqual([404, "MODULE_DISABLED"]);
    const staff = await as<ApiError>("instructor", "GET", "/me/training-summary");
    expect([staff.status, staff.body.code]).toEqual([403, "FORBIDDEN"]);
  });

  it("GET /training-slots (member): the window of four days, the holiday, and the 08 mockup cells", async () => {
    const { body, status } = await as<TrainingSlots>(
      "member",
      "GET",
      "/training-slots?from=2026-08-03&to=2026-08-31&dogId=dog-rock",
    );
    expect(status).toBe(200);
    valid("TrainingSlots", body);
    expect(body.window).toEqual({ from: "2026-08-03", to: "2026-08-06" });
    expect(body.days.map((day) => `${day.date}${day.closed ? " closed" : ""}`)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05 closed",
      "2026-08-06",
    ]);
    expect(body.rings.map((ring) => ring.name)).toEqual(["Muntanya", "Central", "Carretera"]);
    // R-09-15 with COURSES: the course built on Muntanya.
    expect(body.rings[0]?.setup?.levelNames).toEqual(["D"]);
    // 30 half hours from 7:00 to 22:00 (R-09-03), 7:00 = 05:00Z in summer.
    const monday = slotsOf(body, "2026-08-03");
    expect(monday).toHaveLength(30);
    expect(monday[0]).toMatchObject({ startsAt: "2026-08-03T05:00:00Z", startsAtLocal: "07:00" });
    expect(row(body, "2026-08-03", "07:00")).toBe("MUN:OWN_TRAINING CEN:TRAINING CAR:TRAINING");
    expect(monday[0]?.rings["ring-muntanya"]).toEqual({
      bookingId: "training-rock-mon3",
      reason: "OWN_TRAINING",
      state: "BOOKED",
    });
    expect(row(body, "2026-08-03", "07:30")).toBe("MUN:FREE CEN:FREE CAR:FREE");
    expect(row(body, "2026-08-03", "08:30")).toBe("MUN:FREE CEN:TRAINING CAR:FREE");
    expect(row(body, "2026-08-03", "09:00")).toBe("MUN:RING_BLOCK CEN:TRAINING CAR:TRAINING");
    expect(row(body, "2026-08-03", "16:30")).toBe("MUN:TRAINING CEN:TRAINING CAR:RING_BLOCK");
    expect(row(body, "2026-08-03", "18:30")).toBe("MUN:CLASS CEN:CLASS CAR:CLASS");
    expect(row(body, "2026-08-03", "19:00")).toBe("MUN:CLASS CEN:CLASS CAR:CLASS");
    expect(row(body, "2026-08-03", "19:30")).toBe("MUN:FREE CEN:CLASS CAR:FREE");
    // The 7:00 has begun: not bookable though Muntanya's own training is the only one there.
    expect(monday.find((slot) => slot.startsAtLocal === "08:30")).toMatchObject({
      anyFree: true,
      bookable: true,
    });
    expect(monday.find((slot) => slot.startsAtLocal === "18:30")).toMatchObject({
      anyFree: false,
      bookable: false,
    });
    // The member projection never names who or why (R-09-12).
    const serialized = JSON.stringify(body);
    for (const field of ["occupants", "classSession", '"block"']) {
      expect(serialized).not.toContain(field);
    }
  });

  it("GET /training-slots (instructor): any active ring on request, with occupants, block and class", async () => {
    const petita = await as<TrainingSlots>(
      "instructor",
      "GET",
      "/training-slots?from=2026-08-06&to=2026-08-06&ringId=ring-petita",
    );
    expect(petita.status).toBe(200);
    valid("TrainingSlots", petita.body);
    expect(petita.body.rings.map((ring) => ring.name)).toEqual(["Petita"]);
    const thursday = slotsOf(petita.body, "2026-08-06");
    expect(thursday.find((slot) => slot.startsAtLocal === "19:00")?.rings["ring-petita"]).toEqual({
      block: {
        createdByName: "Núria",
        id: "rb-2026-08-06-1900-petita",
        kind: "RESERVATION",
        note: null,
        reason: "THERAPY",
      },
      classSession: null,
      occupants: [],
      reason: "RING_BLOCK",
      state: "BLOCKED",
    });
    const monday = await as<TrainingSlots>(
      "instructor",
      "GET",
      "/training-slots?from=2026-08-03&to=2026-08-03",
    );
    const slots = slotsOf(monday.body, "2026-08-03");
    expect(
      slots.find((slot) => slot.startsAtLocal === "08:30")?.rings["ring-central"]?.occupants,
    ).toEqual([{ bookingId: "tb-2026-08-03-0830-central", dogName: "Thai", memberName: "Sergio" }]);
    expect(
      slots.find((slot) => slot.startsAtLocal === "18:30")?.rings["ring-central"]?.classSession,
    ).toEqual({ description: "B+C", id: "class-2026-08-03-1850-central" });
    const tooLong = await as<ApiError>(
      "instructor",
      "GET",
      "/training-slots?from=2026-08-03&to=2026-09-10",
    );
    expect([tooLong.status, tooLong.body.code]).toEqual([400, "VALIDATION_ERROR"]);
    const off = await as<ApiError>(
      "trainingModuleOffInstructor",
      "GET",
      "/training-slots?from=2026-08-03&to=2026-08-03",
    );
    expect([off.status, off.body.code]).toEqual([404, "MODULE_DISABLED"]);
  });

  it("POST /training-bookings: 201 with the counter, the key replays, then DOG_ALREADY_BOOKED, SLOT_TAKEN and the limit", async () => {
    mockScenario("member");
    const key = crypto.randomUUID();
    const request = {
      dogId: "dog-rock",
      ringId: "ring-muntanya",
      startsAt: "2026-08-03T06:30:00Z",
    };
    const created = await call("POST", "/training-bookings", request, { "Idempotency-Key": key });
    expect(created.status).toBe(201);
    valid("TrainingBooking", created.body);
    expect(created.body).toMatchObject({
      counter: { limit: 3, remaining: 0, used: 3 },
      endsAtLocal: "09:00",
      origin: "APP",
      ringName: "Muntanya",
      slotId: "ring-muntanya_2026-08-03T06:30:00Z",
      startsAtLocal: "08:30",
      state: "ACTIVE",
    });
    // The same key replays the same answer and makes no second booking (T-09-16).
    const replay = await call("POST", "/training-bookings", request, { "Idempotency-Key": key });
    expect(replay).toEqual(created);
    expect(trainingState.bookings.filter((item) => item.start === "08:30")).toHaveLength(2);
    // The same body with a new key: the dog already trains then (R-09-06 step 3, 422 by rule 0).
    const again = await as<ApiError>("member", "POST", "/training-bookings", request);
    expect([again.status, again.body.code]).toEqual([422, "DOG_ALREADY_BOOKED"]);
    // Another dog asks for the same ring: taken, Carretera is still free (R-09-06 step 5).
    const taken = await as<ApiError>("member", "POST", "/training-bookings", {
      ...request,
      dogId: "dog-toby",
    });
    expect([taken.status, taken.body.code]).toEqual([409, "SLOT_TAKEN"]);
    expect(taken.body.details).toEqual({
      freeRings: ["ring-carretera"],
      reason: "TRAINING",
      ringId: "ring-muntanya",
      startsAt: "2026-08-03T06:30:00Z",
    });
    valid("SlotTakenDetails", taken.body.details);
    // Rock is now at 3/3: another session of the week is refused with what can be cancelled.
    const limit = await as<ApiError>("member", "POST", "/training-bookings", {
      dogId: "dog-rock",
      startsAt: "2026-08-04T07:30:00Z",
    });
    expect([limit.status, limit.body.code]).toEqual([409, "TRAINING_LIMIT_REACHED"]);
    valid("TrainingLimitReachedDetails", limit.body.details);
    expect(limit.body.details).toMatchObject({ limit: 3, used: 3 });
    // «Qualsevol» for Toby at 8:30: the first free ring by catalog order.
    const any = await as<TrainingBooking>("member", "POST", "/training-bookings", {
      dogId: "dog-toby",
      startsAt: "2026-08-03T06:30:00Z",
    });
    expect([any.status, any.body.ringName]).toEqual([201, "Carretera"]);
    // R-09-09: the last dog booked becomes the default.
    const summary = await as<TrainingSummary>("member", "GET", "/me/training-summary");
    expect(summary.body.defaultDogId).toBe("dog-toby");
  });

  it("POST /training-bookings refusals carry the api's status and details", async () => {
    const post = (body: Record<string, unknown>, scenario: MockScenario = "member") =>
      as<ApiError>(scenario, "POST", "/training-bookings", body);
    const outOfWindow = await post({ dogId: "dog-toby", startsAt: "2026-08-07T06:30:00Z" });
    expect([outOfWindow.status, outOfWindow.body.code]).toEqual([422, "SLOT_OUT_OF_WINDOW"]);
    valid("SlotOutOfWindowDetails", outOfWindow.body.details);
    expect(outOfWindow.body.details).toEqual({ from: "2026-08-03", to: "2026-08-06" });
    const begun = await post({ dogId: "dog-toby", startsAt: "2026-08-03T05:00:00Z" });
    expect(begun.body.code).toBe("SLOT_OUT_OF_WINDOW");
    const offGrid = await post({ dogId: "dog-toby", startsAt: "2026-08-03T06:20:00Z" });
    expect([offGrid.status, offGrid.body.code]).toEqual([400, "SLOT_NOT_ON_GRID"]);
    const holiday = await post({ dogId: "dog-toby", startsAt: "2026-08-05T07:00:00Z" });
    expect([holiday.status, holiday.body.code]).toEqual([422, "CLUB_CLOSED"]);
    const petita = await post({
      dogId: "dog-toby",
      ringId: "ring-petita",
      startsAt: "2026-08-03T06:30:00Z",
    });
    expect([petita.status, petita.body.code]).toEqual([422, "RING_NOT_RESERVABLE"]);
    const override = await post({
      dogId: "dog-toby",
      override: { limit: true, reason: "Prova" },
      startsAt: "2026-08-03T06:30:00Z",
    });
    expect([override.status, override.body.code]).toEqual([403, "OVERRIDE_NOT_ALLOWED"]);
    const duna = await post({ dogId: "dog-duna", startsAt: "2026-08-03T06:30:00Z" });
    expect([duna.status, duna.body.code]).toEqual([404, "DOG_NOT_ACCESSIBLE"]);
    const off = await post(
      { dogId: "dog-toby", startsAt: "2026-08-03T06:30:00Z" },
      "trainingModuleOff",
    );
    expect([off.status, off.body.code]).toEqual([404, "MODULE_DISABLED"]);
    const impersonated = await as<TrainingBooking>("impersonated", "POST", "/training-bookings", {
      dogId: "dog-toby",
      startsAt: "2026-08-03T11:00:00Z",
    });
    expect(impersonated.body).toMatchObject({
      impersonation: { actorName: "Jordi Soler" },
      origin: "BACKOFFICE",
    });
  });

  it("GET /training-bookings/{id} and the cancellation until the threshold (R-09-10)", async () => {
    const tuesday = await as<TrainingBooking>(
      "member",
      "GET",
      "/training-bookings/training-rock-tue4",
    );
    valid("TrainingBooking", tuesday.body);
    expect(tuesday.body).toMatchObject({
      cancellableUntil: "2026-08-04T04:00:00Z",
      origin: "APP",
      startsAtLocal: "08:00",
      state: "ACTIVE",
    });
    const club = await as<TrainingBooking>(
      "member",
      "GET",
      "/training-bookings/training-rock-club",
    );
    expect(club.body).toMatchObject({ cancelReason: "RING_BLOCK", state: "CANCELLED_BY_CLUB" });
    const monday = await as<TrainingBooking>(
      "member",
      "GET",
      "/training-bookings/training-rock-mon3",
    );
    expect(monday.body).toMatchObject({
      impersonation: { actorName: "Aina Serra" },
      origin: "BACKOFFICE",
    });
    const stranger = await as<ApiError>(
      "member",
      "GET",
      "/training-bookings/tb-2026-08-03-0830-central",
    );
    expect([stranger.status, stranger.body.code]).toEqual([404, "NOT_FOUND"]);

    const tooLate = await as<ApiError>(
      "member",
      "POST",
      "/training-bookings/training-rock-mon3/cancellation",
      {},
    );
    expect([tooLate.status, tooLate.body.code]).toEqual([422, "TRAINING_CANCEL_TOO_LATE"]);
    valid("TrainingCancelTooLateDetails", tooLate.body.details);
    expect(tooLate.body.details).toEqual({ minutesBefore: -10, thresholdMinutes: 120 });

    const cancelled = await as<TrainingBooking>(
      "member",
      "POST",
      "/training-bookings/training-rock-tue4/cancellation",
      {},
    );
    expect(cancelled.body).toMatchObject({
      cancelReason: "MEMBER_REQUEST",
      cancelledBy: "MEMBER",
      counter: { used: 1 },
      state: "CANCELLED",
    });
    const twice = await as<ApiError>(
      "member",
      "POST",
      "/training-bookings/training-rock-tue4/cancellation",
      {},
    );
    expect([twice.status, twice.body.code]).toEqual([409, "INVALID_STATE"]);
  });

  it("POST /ring-blocks on a mockup day: 201, the class conflict, the live bookings and the admin's cancelBookings", async () => {
    const block = {
      from: "2026-08-06T16:00:00Z",
      kind: "RESERVATION",
      note: "Particular amb l'alumna de la tarda",
      reason: "PRIVATE_CLASS",
      ringId: "ring-petita",
      to: "2026-08-06T17:00:00Z",
    };
    const created = await as<RingBlock>("instructor", "POST", "/ring-blocks", block);
    expect(created.status).toBe(201);
    valid("RingBlock", created.body);
    expect(created.body).toMatchObject({
      fromLocal: "18:00",
      ringId: "ring-petita",
      toLocal: "19:00",
    });
    const grid = await as<TrainingSlots>(
      "instructor",
      "GET",
      "/training-slots?from=2026-08-06&to=2026-08-06&ringId=ring-petita",
    );
    expect(row(grid.body, "2026-08-06", "18:30")).toBe("PET:RING_BLOCK");

    const conflict = await as<ApiError>("instructor", "POST", "/ring-blocks", {
      ...block,
      from: "2026-08-03T16:30:00Z",
      ringId: "ring-central",
      to: "2026-08-03T17:30:00Z",
    });
    expect([conflict.status, conflict.body.code]).toEqual([409, "RING_BLOCK_CONFLICT"]);
    expect(conflict.body.details).toEqual({
      conflicts: [
        {
          from: "2026-08-03T16:50:00Z",
          id: "class-2026-08-03-1850-central",
          label: "dl 18:50 · B+C",
          to: "2026-08-03T17:50:00Z",
          type: "CLASS",
        },
      ],
    });

    const bookings = await as<ApiError>("instructor", "POST", "/ring-blocks", {
      ...block,
      from: "2026-08-03T06:30:00Z",
      kind: "BLOCK",
      reason: "MAINTENANCE",
      ringId: "ring-central",
      to: "2026-08-03T07:00:00Z",
    });
    expect([bookings.status, bookings.body.code]).toEqual([422, "RING_HAS_BOOKINGS"]);
    expect(bookings.body.details).toEqual({
      bookings: [
        {
          dogName: "Thai",
          from: "2026-08-03T06:30:00Z",
          id: "tb-2026-08-03-0830-central",
          memberName: "Sergio",
          ringId: "ring-central",
          to: "2026-08-03T07:00:00Z",
        },
      ],
    });
    const forced = await as<ApiError>("instructor", "POST", "/ring-blocks", {
      ...block,
      cancelBookings: true,
      from: "2026-08-03T06:30:00Z",
      kind: "BLOCK",
      reason: "MAINTENANCE",
      ringId: "ring-central",
      to: "2026-08-03T07:00:00Z",
    });
    expect([forced.status, forced.body.code]).toEqual([403, "FORBIDDEN"]);
    const admin = await as<RingBlock>("admin", "POST", "/ring-blocks", {
      ...block,
      cancelBookings: true,
      from: "2026-08-03T06:30:00Z",
      kind: "BLOCK",
      reason: "MAINTENANCE",
      ringId: "ring-central",
      to: "2026-08-03T07:00:00Z",
    });
    expect(admin.status).toBe(201);
    expect(
      trainingState.bookings.find((item) => item.id === "tb-2026-08-03-0830-central"),
    ).toMatchObject({
      cancelReason: "RING_BLOCK",
      state: "CANCELLED_BY_CLUB",
    });

    const reservation = await as<ApiError>("trainingModuleOffInstructor", "POST", "/ring-blocks", {
      ...block,
      from: "2026-08-04T16:00:00Z",
      to: "2026-08-04T17:00:00Z",
    });
    expect([reservation.status, reservation.body.code]).toEqual([404, "MODULE_DISABLED"]);
  });

  it("any other day is the calendar world's: the block is created there and the grid shows it", async () => {
    const created = await as<RingBlock>("instructor", "POST", "/ring-blocks", {
      from: "2026-08-11T16:00:00Z",
      kind: "RESERVATION",
      note: null,
      reason: "PRIVATE_CLASS",
      ringId: "ring-petita",
      to: "2026-08-11T17:00:00Z",
    });
    expect(created.status).toBe(201);
    const grid = await as<TrainingSlots>(
      "instructor",
      "GET",
      "/training-slots?from=2026-08-11&to=2026-08-11&ringId=ring-petita",
    );
    expect(row(grid.body, "2026-08-11", "18:00")).toBe("PET:RING_BLOCK");
    // The draft Petita class of that Tuesday (the calendar's next week) blocks 20:00 and 20:30.
    expect(row(grid.body, "2026-08-11", "20:00")).toBe("PET:CLASS");
    expect(row(grid.body, "2026-08-11", "17:30")).toBe("PET:FREE");
  });
});
