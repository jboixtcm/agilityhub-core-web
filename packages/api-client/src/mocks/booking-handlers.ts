import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { activityState, endsAt, registrationResource } from "./fixtures/activities";
import {
  bookableClasses,
  bookableRow,
  bookingResource,
  bookingState,
  createHold,
  findClass,
  findDog,
  limitReachedDetails,
  localInstant,
  meHome,
  nextBookingId,
  resetBookingState,
  seatHoldResponse,
  waitlistResource,
  type BookingOptions,
  type StoredBooking,
} from "./fixtures/bookings";
import { findParameter } from "./fixtures/settings";
import { apiError, readerLocale } from "./planning-handlers";
import { currentMockScenario, currentMockScenarioName, type MockScenario } from "./scenarios";

type BookingRequest = components["schemas"]["BookingRequest"];
type ClaimRequest = components["schemas"]["ClaimRequest"];
type ReservationRow = components["schemas"]["ReservationRow"];
type SeatHoldRequest = components["schemas"]["SeatHoldRequest"];
type WaitlistEntryRequest = components["schemas"]["WaitlistEntryRequest"];

// The scenario the booking world was drawn for: `bookingLimit` starts with two bookings this week.
let worldScenario: MockScenario | undefined;

// In the browser the handlers live in the page: the world survives a full page load (a link, the
// Checkout return) through the tab's session storage, like the onboarding mock does.
const STORAGE_KEY = "agilityhub.mockBookings";

function tabStorage(): Storage | undefined {
  const storage: unknown = Reflect.get(globalThis, "sessionStorage");
  return typeof storage === "object" && storage !== null ? (storage as Storage) : undefined;
}

function persist(): void {
  try {
    tabStorage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ scenario: worldScenario, world: bookingState }),
    );
  } catch {
    // Node tests and privacy-restricted browsers run without persistent mock state.
  }
}

function restore(name: MockScenario): boolean {
  try {
    const serialized = tabStorage()?.getItem(STORAGE_KEY);
    if (serialized === null || serialized === undefined) return false;
    const saved = JSON.parse(serialized) as { scenario?: string; world?: typeof bookingState };
    if (saved.scenario !== name || saved.world === undefined) return false;
    Object.assign(bookingState, saved.world);
    return true;
  } catch {
    return false;
  }
}

/** Resets the booking world (tests call it between cases, like the other mock states). */
export function resetBookingMockState(): void {
  worldScenario = undefined;
  resetBookingState(false);
  try {
    tabStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

function options(request: Request): BookingOptions {
  const scenario = currentMockScenario();
  const name = currentMockScenarioName();
  if (worldScenario !== name) {
    worldScenario = name;
    if (!restore(name)) resetBookingState(scenario.bookingLimit === true, viewerFirstName());
  }
  const threshold = findParameter("bookings.lateCancelThresholdMinutes")?.value;
  return {
    limit: scenario.bookingLimit === true,
    locale: readerLocale(request),
    modules: scenario.branding.modules,
    now: Date.now(),
    thresholdMinutes: typeof threshold === "number" ? threshold : 240,
  };
}

function waitlistOff(context: BookingOptions) {
  return context.modules.includes("WAITLIST")
    ? undefined
    : apiError("MODULE_DISABLED", "Module disabled", 404);
}

function currentMemberId(): string {
  return currentMockScenario().me.membership?.memberId ?? "";
}

/** How the api names the session's member in `bookedBy` (the first name, S08 §6). */
function viewerFirstName(): string {
  return currentMockScenario().me.account.name.trim().split(/\s+/u)[0] ?? "";
}

/** S07 rows of 03 (ACTIVITIES): the member's live registrations, as `/me/activities` `mine[]`. */
function activityRows(locale: string, now: number): ReservationRow[] {
  const memberId = currentMemberId();
  return activityState.registrations.flatMap((registration): ReservationRow[] => {
    if (registration.member.id !== memberId) return [];
    if (registration.state !== "ACTIVE" && registration.state !== "WAITLISTED") return [];
    const activity = activityState.activities.find((item) => item.id === registration.activityId);
    if (activity === undefined || Date.parse(endsAt(activity)) <= now) return [];
    const summary = registrationResource(registration, activity, locale).activity;
    return [
      {
        dogId: null,
        dogName: null,
        endsAtLocal: summary.endsAtLocal,
        // S07 §4 `liveRegistrationsFor`: the row id is the registration's.
        id: registration.id,
        ringName: summary.placeLabel,
        startsAt: localInstant(summary.startsAtLocal),
        startsAtLocal: summary.startsAtLocal,
        state: registration.state === "WAITLISTED" ? "WAITLISTED" : "REGISTERED",
        title: summary.title,
        type: "ACTIVITY",
      },
    ];
  });
}

function dogNotAccessible() {
  return apiError("DOG_NOT_ACCESSIBLE", "Dog not accessible", 404);
}

/** The hold's class for a dog: the waitlist entry's class with `waitlistEntryId` (R-08-15). */
function holdFailure(body: SeatHoldRequest, context: BookingOptions) {
  if (body.waitlistEntryId !== undefined && body.waitlistEntryId !== null) {
    const entry = bookingState.entries.find((item) => item.id === body.waitlistEntryId);
    if (entry === undefined) return apiError("NOT_FOUND", "Waitlist entry not found", 404);
    if (entry.state !== "NOTIFIED")
      return apiError("WAITLIST_NOT_NOTIFIED", "Waitlist entry not notified", 422);
    return undefined;
  }
  const row = bookableRow(body.dogId, body.classSessionId, context);
  const session = findClass(body.classSessionId);
  if (row === undefined || session === undefined) {
    return apiError("CLASS_NOT_BOOKABLE", "Class not bookable", 422);
  }
  switch (row.state) {
    case "NOT_YET_OPEN":
      return apiError("NOT_YET_OPEN", "Not yet open", 422, { opensAt: row.opensAt });
    case "PACK_EMPTY":
      return apiError("PACK_EMPTY", "Pack empty", 422);
    case "NOT_BOOKABLE":
      return apiError("BOOKING_BLOCKED", "Booking blocked", 422, {
        reason: "rebut de juliol pendent",
      });
    case "WEEKLY_LIMIT_DONE":
      return apiError(
        "BOOKING_LIMIT_REACHED",
        "Booking limit reached",
        409,
        limitReachedDetails(session.week),
      );
    case "FULL":
    case "WAITLIST_FULL":
    case "WAITLIST_OPEN":
      return apiError("CLASS_FULL", "Class full", 409, { heldOnly: false });
    default:
      // Another dog's live hold takes the last seat (R-08-07).
      return row.heldByOther === true
        ? apiError("CLASS_FULL", "Class full", 409, { heldOnly: true })
        : undefined;
  }
}

/** `POST /bookings` and the claim share the confirmation (R-08-08, R-08-09, R-08-15). */
function confirm(
  body: BookingRequest | ClaimRequest,
  context: BookingOptions,
  request: Request,
  waitlistEntryId: string | null,
) {
  const hold = bookingState.holds.find((item) => item.id === body.seatHoldId);
  if (
    hold === undefined ||
    hold.expiresAt <= context.now ||
    hold.waitlistEntryId !== waitlistEntryId
  ) {
    return apiError("SEAT_HOLD_EXPIRED", "Seat hold expired", 409);
  }
  const swapId = body.swapBookingId ?? null;
  if (hold.limitReached && (swapId === null || !hold.swappable.includes(swapId))) {
    return apiError("SWAP_NOT_ALLOWED", "Swap not allowed", 422);
  }
  if (swapId !== null) {
    const swapped = bookingState.bookings.find((item) => item.id === swapId);
    if (swapped !== undefined) {
      swapped.state = "CANCELLED";
      swapped.cancellation = {
        at: new Date(context.now).toISOString(),
        byDisplayName: swapped.bookedBy.displayName,
        byRole: "MEMBER",
        late: false,
        minutesBefore: 0,
      };
    }
  }
  const payment = seatHoldResponse(hold, context)?.payment ?? null;
  const pack = seatHoldResponse(hold, context)?.pack ?? null;
  const id = nextBookingId("booking");
  const payToBook = payment?.mode === "PAY_TO_BOOK";
  const created: StoredBooking = {
    bookedAt: new Date(context.now).toISOString(),
    // An admin acting as the member books through the club: not the reader's own account (E5-T25).
    bookedBy: {
      displayName: viewerFirstName(),
      self: currentMockScenarioName() !== "impersonated",
      viaClub: currentMockScenarioName() === "impersonated",
    },
    cancellation: null,
    charge: payment === null ? null : { mode: payment.mode, paidAt: null, price: payment.price },
    // PAY_TO_BOOK: the Checkout stub is the booking's own page, so a browser never leaves the origin.
    checkoutUrl: payToBook ? new URL(`/reserves/${id}`, request.url).href : null,
    classSessionId: hold.classSessionId,
    dogId: hold.dogId,
    id,
    memberId: findDog(hold.dogId)?.memberId ?? "",
    origin: currentMockScenarioName() === "impersonated" ? "BACKOFFICE" : "APP",
    pack:
      pack === null
        ? null
        : { available: Math.max(0, pack.available - 1), expiresOn: pack.expiresOn ?? null },
    state: payToBook ? "PAYMENT_PENDING" : "ACTIVE",
    swapFromBookingId: swapId,
  };
  bookingState.bookings.push(created);
  bookingState.holds = bookingState.holds.filter((item) => item.id !== hold.id);
  bookingState.lastDogForClass = hold.dogId;
  // A live waitlist entry of the dog for the class is consolidated (R-08-08, R-08-15).
  for (const entry of bookingState.entries) {
    if (
      entry.classSessionId === hold.classSessionId &&
      entry.dogId === hold.dogId &&
      (entry.state === "ACTIVE" || entry.state === "NOTIFIED")
    ) {
      entry.state = "CONSOLIDATED";
      entry.bookingId = id;
    }
  }
  persist();
  return HttpResponse.json(bookingResource(created, context, false), { status: 201 });
}

export const bookingHandlers = [
  http.get("*/api/v1/me/home", ({ request }) => {
    const context = options(request);
    const dogId = new URL(request.url).searchParams.get("dogId");
    const home = meHome(dogId, context, activityRows(context.locale, context.now));
    if (home === undefined) return dogNotAccessible();
    const impersonated = currentMockScenarioName() === "impersonated";
    // The admin acting as the member, as `/me` names them (`me-impersonated.json`).
    const actorName = currentMockScenario().me.impersonation?.actorName;
    return HttpResponse.json({
      ...home,
      impersonation: impersonated && actorName !== undefined ? { actorName } : null,
    });
  }),
  http.get("*/api/v1/me/bookable-classes", ({ request }) => {
    const context = options(request);
    const dogId = new URL(request.url).searchParams.get("dogId");
    const view = bookableClasses(dogId, context);
    if (view === undefined) return dogNotAccessible();
    return HttpResponse.json({
      ...view,
      // S08 §6: the open activities of the dog's level (the app reads them from `/me/activities`).
      activities: context.modules.includes("ACTIVITIES") ? [] : null,
    });
  }),
  http.post("*/api/v1/seat-holds", async ({ request }) => {
    const context = options(request);
    const body = (await request.json()) as SeatHoldRequest;
    if (findDog(body.dogId) === undefined) return dogNotAccessible();
    if (body.waitlistEntryId !== undefined && body.waitlistEntryId !== null) {
      const disabled = waitlistOff(context);
      if (disabled !== undefined) return disabled;
    }
    const failure = holdFailure(body, context);
    if (failure !== undefined) return failure;
    const entry = bookingState.entries.find((item) => item.id === body.waitlistEntryId);
    const hold = createHold(
      entry?.classSessionId ?? body.classSessionId,
      body.dogId,
      entry?.id ?? null,
      context,
    );
    persist();
    const response = seatHoldResponse(hold, context);
    return response === undefined
      ? apiError("CLASS_NOT_BOOKABLE", "Class not bookable", 422)
      : HttpResponse.json(response, { status: 201 });
  }),
  http.delete("*/api/v1/seat-holds/:id", ({ params }) => {
    // 204 also when the hold is already gone (expired or consumed).
    bookingState.holds = bookingState.holds.filter((hold) => hold.id !== String(params.id));
    persist();
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/bookings", async ({ request }) => {
    const context = options(request);
    return confirm((await request.json()) as BookingRequest, context, request, null);
  }),
  http.get("*/api/v1/me/bookings", ({ request }) => {
    const context = options(request);
    return HttpResponse.json({
      items: bookingState.bookings.map((item) => bookingResource(item, context, false)),
    });
  }),
  http.get("*/api/v1/bookings/:id", ({ params, request }) => {
    const context = options(request);
    const item = bookingState.bookings.find((candidate) => candidate.id === String(params.id));
    return item === undefined
      ? apiError("NOT_FOUND", "Booking not found", 404)
      : HttpResponse.json(bookingResource(item, context));
  }),
  http.post("*/api/v1/bookings/:id/cancellation", ({ params, request }) => {
    const context = options(request);
    const item = bookingState.bookings.find((candidate) => candidate.id === String(params.id));
    if (item === undefined) return apiError("NOT_FOUND", "Booking not found", 404);
    const session = findClass(item.classSessionId);
    if (
      session === undefined ||
      item.state !== "ACTIVE" ||
      Date.parse(localInstant(session.endsAtLocal)) <= context.now
    ) {
      // 422 as the E5-W01 list of statuses in force (S08 §6 still reads 409).
      return apiError("BOOKING_NOT_CANCELLABLE", "Booking not cancellable", 422);
    }
    // R-08-10: late = now > classStartsAt − bookings.lateCancelThresholdMinutes (the edge is in time).
    const startsAt = Date.parse(localInstant(session.startsAtLocal));
    const late = context.now > startsAt - context.thresholdMinutes * 60_000;
    item.state = late ? "CANCELLED_LATE" : "CANCELLED";
    item.cancellation = {
      at: new Date(context.now).toISOString(),
      byDisplayName: currentMockScenario().me.impersonation?.actorName ?? viewerFirstName(),
      byRole: currentMockScenarioName() === "impersonated" ? "ADMIN" : "MEMBER",
      late,
      message: null,
      minutesBefore: Math.floor((startsAt - context.now) / 60_000),
    };
    persist();
    return HttpResponse.json(bookingResource(item, context));
  }),
  http.post("*/api/v1/waitlist-entries", async ({ request }) => {
    const context = options(request);
    const disabled = waitlistOff(context);
    if (disabled !== undefined) return disabled;
    const body = (await request.json()) as WaitlistEntryRequest;
    if (findDog(body.dogId) === undefined) return dogNotAccessible();
    const row = bookableRow(body.dogId, body.classSessionId, context);
    if (row === undefined) return apiError("CLASS_NOT_BOOKABLE", "Class not bookable", 422);
    if (row.state === "WAITLIST_FULL")
      return apiError("WAITLIST_LIMIT", "Waitlist limit", 409, { scope: "CLASS" });
    if (row.state !== "WAITLIST_OPEN") return apiError("CLASS_NOT_FULL", "Class not full", 422);
    const entry = {
      bookingId: null,
      cancelReason: null,
      cancelledAt: null,
      classSessionId: body.classSessionId,
      confirmBy: null,
      dogId: body.dogId,
      id: nextBookingId("waitlist"),
      joinedAt: new Date(context.now).toISOString(),
      memberId: findDog(body.dogId)?.memberId ?? "",
      notifiedAt: null,
      position: null,
      state: "ACTIVE" as const,
    };
    bookingState.entries.push(entry);
    bookingState.lastDogForClass = body.dogId;
    persist();
    return HttpResponse.json(waitlistResource(entry, context), { status: 201 });
  }),
  http.get("*/api/v1/waitlist-entries/:id", ({ params, request }) => {
    const context = options(request);
    const disabled = waitlistOff(context);
    if (disabled !== undefined) return disabled;
    const entry = bookingState.entries.find((candidate) => candidate.id === String(params.id));
    return entry === undefined
      ? apiError("NOT_FOUND", "Waitlist entry not found", 404)
      : HttpResponse.json(waitlistResource(entry, context));
  }),
  http.post("*/api/v1/waitlist-entries/:id/cancellation", ({ params, request }) => {
    const context = options(request);
    const disabled = waitlistOff(context);
    if (disabled !== undefined) return disabled;
    const entry = bookingState.entries.find((candidate) => candidate.id === String(params.id));
    if (entry === undefined) return apiError("NOT_FOUND", "Waitlist entry not found", 404);
    if (entry.state !== "ACTIVE" && entry.state !== "NOTIFIED") {
      return apiError("WAITLIST_ENTRY_NOT_LIVE", "Waitlist entry not live", 422);
    }
    entry.state = "CANCELLED";
    entry.cancelReason = currentMockScenarioName() === "impersonated" ? "ADMIN" : "MEMBER";
    entry.cancelledAt = new Date(context.now).toISOString();
    persist();
    return HttpResponse.json(waitlistResource(entry, context));
  }),
  http.post("*/api/v1/waitlist-entries/:id/claim", async ({ params, request }) => {
    const context = options(request);
    const disabled = waitlistOff(context);
    if (disabled !== undefined) return disabled;
    const entry = bookingState.entries.find((candidate) => candidate.id === String(params.id));
    if (entry === undefined) return apiError("NOT_FOUND", "Waitlist entry not found", 404);
    if (entry.state !== "NOTIFIED")
      return apiError("WAITLIST_NOT_NOTIFIED", "Waitlist entry not notified", 422);
    // Fixture hook: an entry whose id ends in «-taken» lost the seat to another claim (R-08-15).
    if (entry.id.endsWith("-taken")) return apiError("SEAT_TAKEN", "Seat taken", 409);
    return confirm((await request.json()) as ClaimRequest, context, request, entry.id);
  }),
];

export { bookingState, resetBookingState };
