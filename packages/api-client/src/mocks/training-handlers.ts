import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { clubInstant, clubLocalDateOf, clubLocalTime } from "./fixtures/calendar";
import {
  cancellableUntilOf,
  eligibleDogs,
  findRing,
  isMockupDay,
  limitReachedDetails,
  memberTrainingBookings,
  memberWindow,
  minutesOf,
  mockupBlockConflicts,
  nextTrainingId,
  openingOf,
  plusMinutes,
  resetTrainingState,
  startsAtOf,
  trainableRings,
  trainingBookingResource,
  trainingParameters,
  trainingSlots,
  trainingsOnRing,
  trainingState,
  trainingSummary,
  trainingWeekOf,
  type StoredTraining,
  type TrainingVariant,
  visibleBookings,
} from "./fixtures/training";
import { apiError, levelsEnabled, validationError } from "./planning-handlers";
import {
  currentMockScenario,
  currentMockScenarioName,
  type MockScenario,
  type MockScenarioDefinition,
} from "./scenarios";

type RingBlock = components["schemas"]["RingBlock"];
type RingBlockCreateRequest = components["schemas"]["RingBlockCreateRequest"];
type TrainingBookingRequest = components["schemas"]["TrainingBookingRequest"];
type TrainingCancellationRequest = components["schemas"]["TrainingCancellationRequest"];

/** `classes.slotMinutes` (R-09-11: blocks are aligned to the class granularity). */
const CLASS_SLOT_MINUTES = 10;

// The scenario the training world was drawn for (`trainingAtLimit` starts with Rock at 3/3).
let worldScenario: MockScenario | undefined;

function variantOf(scenario: MockScenarioDefinition): TrainingVariant {
  return scenario.training ?? "default";
}

/** Resets the S09 world (tests call it between cases, like the other mock states). */
export function resetTrainingMockState(): void {
  worldScenario = undefined;
  resetTrainingState();
}

function scenario(): MockScenarioDefinition {
  const current = currentMockScenario();
  const name = currentMockScenarioName();
  if (worldScenario !== name) {
    worldScenario = name;
    resetTrainingState(variantOf(current));
  }
  return current;
}

function moduleOff(current: MockScenarioDefinition) {
  return current.branding.modules.includes("FREE_TRAINING")
    ? undefined
    : apiError("MODULE_DISABLED", "Module disabled", 404);
}

function isImpersonation(current: MockScenarioDefinition): boolean {
  return current.me.impersonation !== undefined;
}

function isStaff(current: MockScenarioDefinition): boolean {
  return (
    !isImpersonation(current) &&
    (current.me.membership?.roles.some((role) => role === "ADMIN" || role === "INSTRUCTOR") ??
      false)
  );
}

function isMember(current: MockScenarioDefinition): boolean {
  return isImpersonation(current) || (current.me.membership?.roles.includes("MEMBER") ?? false);
}

function isPlainDate(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
}

function accessibleDogIds(current: MockScenarioDefinition): string[] {
  return eligibleDogs(current.branding.modules, levelsEnabled()).map((dog) => dog.id);
}

/** A new booking is `impersonation`-aware (R-09-16): `origin: BACKOFFICE` with the actor. */
function memberIdentity(current: MockScenarioDefinition) {
  return {
    impersonatedBy: current.me.impersonation?.actorName ?? null,
    origin: isImpersonation(current) ? ("BACKOFFICE" as const) : ("APP" as const),
  };
}

function nowMs(): number {
  return Date.now();
}

/** `POST /training-bookings` checks in the R-09-06 order; `undefined` = the booking can be made. */
function bookingProblem(
  current: MockScenarioDefinition,
  body: TrainingBookingRequest,
  now: number,
): { response: Response } | { ringId: string } {
  const fail = (response: Response) => ({ response });
  if (body.override !== null && body.override !== undefined && !isImpersonation(current)) {
    return fail(apiError("OVERRIDE_NOT_ALLOWED", "Override needs impersonation", 403));
  }
  const startsAt = Date.parse(body.startsAt);
  if (typeof body.dogId !== "string" || body.dogId === "" || Number.isNaN(startsAt)) {
    return fail(validationError(Number.isNaN(startsAt) ? "startsAt" : "dogId", "REQUIRED"));
  }
  const dog = eligibleDogs(current.branding.modules, true).find((item) => item.id === body.dogId);
  if (dog === undefined) {
    return fail(apiError("DOG_NOT_ACCESSIBLE", "Dog not accessible", 404));
  }
  if (!accessibleDogIds(current).includes(body.dogId)) {
    return fail(apiError("DOG_NOT_ALLOWED", "The dog may not train alone", 422));
  }
  const date = clubLocalDateOf(body.startsAt);
  const start = clubLocalTime(body.startsAt);
  const window = openingOf(date);
  const { slotMinutes } = trainingParameters();
  if (window === null || start < window.open || plusMinutes(start, slotMinutes) > window.close) {
    return fail(apiError("CLUB_CLOSED", "The club is closed then", 422));
  }
  if (
    (minutesOf(start) - minutesOf(window.open)) % slotMinutes !== 0 ||
    clubInstant(date, start) !== body.startsAt.replace(".000Z", "Z")
  ) {
    return fail(apiError("SLOT_NOT_ON_GRID", "The start is not on the grid", 400));
  }
  const bookingWindow = memberWindow(now);
  if (date < bookingWindow.from || date > bookingWindow.to || startsAt <= now) {
    return fail(apiError("SLOT_OUT_OF_WINDOW", "Out of the booking window", 422, bookingWindow));
  }
  const requested = body.ringId ?? null;
  if (requested !== null) {
    const ring = findRing(requested);
    if (ring?.active !== true) return fail(apiError("NOT_FOUND", "Ring not found", 404));
    if (!ring.allowsFreeTraining) {
      return fail(apiError("RING_NOT_RESERVABLE", "The ring is not open to training", 422));
    }
  }
  const end = plusMinutes(start, slotMinutes);
  const overlapping = visibleBookings(now).some(
    (booking) =>
      booking.dogId === body.dogId &&
      booking.state === "ACTIVE" &&
      booking.date === date &&
      booking.start < end &&
      booking.end > start,
  );
  if (overlapping) {
    return fail(apiError("DOG_ALREADY_BOOKED", "The dog already has a booking then", 422));
  }
  const week = trainingWeekOf(body.startsAt);
  const details = limitReachedDetails(body.dogId, week, now);
  if (details.used >= details.limit && body.override?.limit !== true) {
    return fail(apiError("TRAINING_LIMIT_REACHED", "Weekly training limit", 409, { ...details }));
  }
  const grid = trainingSlots({
    dogId: body.dogId,
    from: date,
    levelsEnabled: levelsEnabled(),
    modules: current.branding.modules,
    now,
    ringId: null,
    showSetup: false,
    staff: false,
    to: date,
  });
  const slot = grid.days[0]?.slots.find((item) => item.startsAtLocal === start);
  const order = trainableRings().map((ring) => ring.id);
  const freeRings = order.filter((id) => slot?.rings[id]?.state === "FREE");
  const target = requested ?? freeRings[0] ?? null;
  if (target !== null && freeRings.includes(target)) return { ringId: target };
  const taken = target === null ? undefined : slot?.rings[target];
  return fail(
    apiError("SLOT_TAKEN", "The slot is no longer free", 409, {
      freeRings,
      reason: taken?.reason ?? "TRAINING",
      ringId: target ?? order[0] ?? "",
      startsAt: clubInstant(date, start),
    }),
  );
}

/** A ring block on a mockup day (R-09-11); any other day falls through to the calendar world. */
function mockupBlock(current: MockScenarioDefinition, body: RingBlockCreateRequest, now: number) {
  const ring = findRing(body.ringId);
  if (ring?.active !== true) return validationError("ringId");
  if (body.kind === "RESERVATION" && !current.branding.modules.includes("FREE_TRAINING")) {
    return apiError("MODULE_DISABLED", "Module disabled", 404);
  }
  const reasons: Readonly<Record<RingBlock["kind"], readonly RingBlock["reason"][]>> = {
    BLOCK: ["MAINTENANCE", "OTHER"],
    RESERVATION: ["PRIVATE_CLASS", "THERAPY", "PREPARATION", "OTHER"],
  };
  if (!reasons[body.kind].includes(body.reason)) return validationError("reason");
  const from = Date.parse(body.from);
  const to = Date.parse(body.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return validationError("from");
  if (from <= now) return validationError("from", "PAST");
  const date = clubLocalDateOf(body.from);
  const start = clubLocalTime(body.from);
  const end = clubLocalTime(body.to);
  if (to <= from || clubLocalDateOf(body.to) !== date) {
    return apiError("INVALID_TIME_RANGE", "Invalid time range", 400);
  }
  if (minutesOf(start) % CLASS_SLOT_MINUTES !== 0 || minutesOf(end) % CLASS_SLOT_MINUTES !== 0) {
    return apiError("INVALID_SLOT_GRANULARITY", "Times must be multiples of the slot", 400);
  }
  if (minutesOf(end) - minutesOf(start) < trainingParameters().slotMinutes) {
    return apiError("INVALID_TIME_RANGE", "Invalid time range", 400);
  }
  const window = openingOf(date);
  if (window === null || start < window.open || end > window.close) {
    return apiError("OUTSIDE_OPENING_HOURS", "Outside opening hours", 422);
  }
  const range = { end, start };
  const conflicts = mockupBlockConflicts(body.ringId, date, range);
  if (conflicts.length > 0) {
    return apiError("RING_BLOCK_CONFLICT", "The block overlaps other items", 409, { conflicts });
  }
  const bookings = trainingsOnRing(body.ringId, date, range, now);
  if (bookings.length > 0) {
    if (body.cancelBookings !== true) {
      return apiError("RING_HAS_BOOKINGS", "The ring has training bookings", 422, {
        bookings: bookings.map((booking) => ({
          dogName: booking.dogName,
          from: startsAtOf(booking),
          id: booking.id,
          memberName: booking.memberName,
          ringId: booking.ringId,
          to: clubInstant(booking.date, booking.end),
        })),
      });
    }
    if (current.me.membership?.roles.includes("ADMIN") !== true) {
      return apiError("FORBIDDEN", "Only an admin can cancel training bookings", 403);
    }
    // R-09-13: cancelled by the club in the same transaction.
    for (const booking of bookings) {
      booking.state = "CANCELLED_BY_CLUB";
      booking.cancelReason = "RING_BLOCK";
      booking.cancelledBy = "ADMIN";
      booking.cancelledAt = new Date(now).toISOString();
    }
  }
  const block: RingBlock = {
    activityId: null,
    activityTitle: null,
    createdByName: current.me.account.name.split(" ")[0] ?? "",
    date,
    from: clubInstant(date, start),
    fromLocal: start,
    id: nextTrainingId(`rb-${date}`),
    kind: body.kind,
    note: body.note ?? null,
    reason: body.reason,
    ringId: body.ringId,
    state: "ACTIVE",
    to: clubInstant(date, end),
    toLocal: end,
    version: 1,
  };
  trainingState.blocks.push(block);
  return HttpResponse.json(block, { status: 201 });
}

function findBooking(id: string, now: number): StoredTraining | undefined {
  return visibleBookings(now).find((booking) => booking.id === id);
}

/**
 * S09 (E5-W02): screens 08, the training detail, 24 and the D12 card. Registered before the
 * calendar handlers: a ring block on any day but the mockup days falls through to E4-W02's world.
 * Statuses follow `CATALEG_ERRORS.md` §1 and rule 0 (`DOG_ALREADY_BOOKED` and
 * `TRAINING_CANCEL_TOO_LATE` are 422; `SLOT_NOT_ON_GRID` 400; `OVERRIDE_NOT_ALLOWED` 403).
 */
export const trainingHandlers = [
  http.get("*/api/v1/me/training-summary", ({ request }) => {
    const current = scenario();
    const off = moduleOff(current);
    if (off !== undefined) return off;
    if (!isMember(current)) return apiError("FORBIDDEN", "Forbidden", 403);
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (date !== null && !isPlainDate(date)) return validationError("date");
    const summary = trainingSummary({
      date,
      dogId: url.searchParams.get("dogId"),
      levelsEnabled: levelsEnabled(),
      modules: current.branding.modules,
      now: nowMs(),
    });
    return summary === undefined
      ? apiError("DOG_NOT_ACCESSIBLE", "Dog not accessible", 404)
      : HttpResponse.json(summary);
  }),
  http.get("*/api/v1/me/training-bookings", ({ request }) => {
    const current = scenario();
    const off = moduleOff(current);
    if (off !== undefined) return off;
    if (!isMember(current)) return apiError("FORBIDDEN", "Forbidden", 403);
    const url = new URL(request.url);
    return HttpResponse.json(
      memberTrainingBookings(accessibleDogIds(current), nowMs(), {
        from: url.searchParams.get("from"),
        state: url.searchParams.get("state"),
        to: url.searchParams.get("to"),
      }),
    );
  }),
  http.get("*/api/v1/training-slots", ({ request }) => {
    const current = scenario();
    const off = moduleOff(current);
    if (off !== undefined) return off;
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!isPlainDate(from)) return validationError("from");
    if (!isPlainDate(to) || to < from) return validationError("to");
    const staff = isStaff(current);
    if (!staff && !isMember(current)) return apiError("FORBIDDEN", "Forbidden", 403);
    // Staff: at most 31 days; a member's interval is cut to the window (R-09-04).
    if (staff && daysBetween(from, to) > 31) return validationError("to", "RANGE");
    const dogId = url.searchParams.get("dogId");
    if (
      dogId !== null &&
      !staff &&
      !eligibleDogs(current.branding.modules, true).some((dog) => dog.id === dogId)
    ) {
      return apiError("DOG_NOT_ACCESSIBLE", "Dog not accessible", 404);
    }
    const ringId = url.searchParams.get("ringId");
    if (ringId !== null && findRing(ringId) === undefined) {
      return apiError("NOT_FOUND", "Ring not found", 404);
    }
    const modules = current.branding.modules;
    return HttpResponse.json(
      trainingSlots({
        dogId,
        from,
        levelsEnabled: levelsEnabled(),
        modules,
        now: nowMs(),
        ringId,
        showSetup: modules.includes("COURSES"),
        staff,
        to,
      }),
    );
  }),
  http.post("*/api/v1/training-bookings", async ({ request }) => {
    const current = scenario();
    const off = moduleOff(current);
    if (off !== undefined) return off;
    if (!isMember(current)) return apiError("FORBIDDEN", "Forbidden", 403);
    const key = request.headers.get("Idempotency-Key") ?? "";
    const replay = trainingState.idempotency.get(key);
    if (replay !== undefined) return HttpResponse.json(replay.body, { status: replay.status });
    const body = (await request.json()) as TrainingBookingRequest;
    const now = nowMs();
    const problem = bookingProblem(current, body, now);
    if ("response" in problem) {
      const answer = problem.response.clone();
      const replayBody = (await answer.json()) as Record<string, unknown>;
      trainingState.idempotency.set(key, { body: replayBody, status: answer.status });
      return problem.response;
    }
    const date = clubLocalDateOf(body.startsAt);
    const start = clubLocalTime(body.startsAt);
    const dog = eligibleDogs(current.branding.modules, true).find((item) => item.id === body.dogId);
    const identity = memberIdentity(current);
    const stored: StoredTraining = {
      createdAt: new Date(now).toISOString(),
      date,
      dogId: body.dogId,
      dogName: dog?.name ?? body.dogId,
      end: plusMinutes(start, trainingParameters().slotMinutes),
      id: nextTrainingId(`tb-${date}-${start.replace(":", "")}`),
      impersonatedBy: identity.impersonatedBy,
      memberId: current.me.membership?.memberId ?? "",
      memberName: current.me.account.name.split(" ")[0] ?? "",
      origin: identity.origin,
      ringId: problem.ringId,
      start,
      state: "ACTIVE",
    };
    trainingState.bookings.push(stored);
    trainingState.lastDogId = body.dogId;
    const resource = trainingBookingResource(stored, now);
    trainingState.idempotency.set(key, { body: resource, status: 201 });
    return HttpResponse.json(resource, { status: 201 });
  }),
  http.get("*/api/v1/training-bookings/:id", ({ params }) => {
    const id = String(params.id);
    // `/training-bookings/export` belongs to the ring usage register (E5-W03).
    if (id === "export") return undefined;
    const current = scenario();
    const off = moduleOff(current);
    if (off !== undefined) return off;
    const now = nowMs();
    const booking = findBooking(id, now);
    const own = booking !== undefined && accessibleDogIds(current).includes(booking.dogId);
    if (booking === undefined || (!isStaff(current) && !own)) {
      return apiError("NOT_FOUND", "Training booking not found", 404);
    }
    return HttpResponse.json(trainingBookingResource(booking, now));
  }),
  http.post("*/api/v1/training-bookings/:id/cancellation", async ({ params, request }) => {
    const current = scenario();
    const off = moduleOff(current);
    if (off !== undefined) return off;
    if (!isMember(current)) return apiError("FORBIDDEN", "Forbidden", 403);
    const now = nowMs();
    const booking = findBooking(String(params.id), now);
    if (booking === undefined || !accessibleDogIds(current).includes(booking.dogId)) {
      return apiError("NOT_FOUND", "Training booking not found", 404);
    }
    if (booking.state !== "ACTIVE") {
      return apiError("INVALID_STATE", "The booking is not active", 409);
    }
    const body = (await request.json().catch(() => ({}))) as TrainingCancellationRequest;
    const reason = body.reason?.trim() ?? "";
    const late = now > Date.parse(cancellableUntilOf(booking));
    if (late && !(isImpersonation(current) && reason !== "")) {
      const minutesBefore = Math.floor((Date.parse(startsAtOf(booking)) - now) / 60_000);
      return apiError("TRAINING_CANCEL_TOO_LATE", "Too late to cancel", 422, {
        minutesBefore,
        thresholdMinutes: trainingParameters().cancelThresholdMinutes,
      });
    }
    booking.state = "CANCELLED";
    booking.cancelledAt = new Date(now).toISOString();
    booking.cancelledBy = "MEMBER";
    booking.cancelReason = late ? "ADMIN_LATE" : "MEMBER_REQUEST";
    return HttpResponse.json(trainingBookingResource(booking, now));
  }),
  http.post("*/api/v1/ring-blocks", async ({ request }) => {
    const body = (await request.clone().json()) as RingBlockCreateRequest;
    const from = Date.parse(body.from);
    if (Number.isNaN(from) || !isMockupDay(clubLocalDateOf(body.from))) return undefined;
    return mockupBlock(scenario(), body, nowMs());
  }),
];
