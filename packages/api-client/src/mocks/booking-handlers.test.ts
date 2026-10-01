import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { components } from "../generated/schema";

import { BOOKING_MOCK_NOW } from "./fixtures/bookings";
import { findParameter, resetSettingsState } from "./fixtures/settings";
import {
  bookingState,
  mockScenario,
  resetActivityState,
  resetBookingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type ApiError = components["schemas"]["ApiError"];
type BookableClasses = components["schemas"]["BookableClasses"];
type Booking = components["schemas"]["Booking"];
type BookingLimitReachedDetails = components["schemas"]["BookingLimitReachedDetails"];
type MeHome = components["schemas"]["MeHome"];
type SeatHoldResponse = components["schemas"]["SeatHoldResponse"];
type WaitlistEntry = components["schemas"]["WaitlistEntry"];

const origin = "http://localhost";
const json = { "Content-Type": "application/json" };

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: json }),
    method,
  });
  const text = await response.text();
  return { body: (text === "" ? undefined : JSON.parse(text)) as unknown, status: response.status };
}

async function home(scenario: MockScenario = "member", query = "") {
  mockScenario(scenario);
  return (await call("GET", `/me/home${query}`)).body as MeHome;
}

async function bookable(scenario: MockScenario = "member", query = "") {
  mockScenario(scenario);
  return (await call("GET", `/me/bookable-classes${query}`)).body as BookableClasses;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(BOOKING_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  server.resetHandlers();
  resetBookingMockState();
  resetActivityState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E5-W01 step 10 · the S08 mock world answers as the api (S08 §6, CATALEG_ERRORS §3 rule 0)", () => {
  it("GET /me/home: the mockup rows in order, «amb {dog}» only with «Tots», counters from what counts (R-08-02)", async () => {
    const all = await home();
    expect(all.member.firstName).toBe("Laura");
    expect(
      all.dogs.map((dog) => `${dog.name}·${dog.levelName ?? ""}·${dog.ownerFirstName ?? ""}`),
    ).toEqual(["Duna·C·", "Rock·D·", "Toby·B·Joan Antoni"]);
    expect(
      all.reservations.map((row) => `${row.type} ${row.startsAtLocal} ${row.dogName ?? "—"}`),
    ).toEqual([
      // E5-W05 step 7: at Sunday 2 at 20:30 Rock's Monday 3 training (booked at 20:05) exists.
      "TRAINING 2026-08-03T07:00 Rock",
      "CLASS 2026-08-03T18:50 Duna",
      "TRAINING 2026-08-04T08:00 Rock",
      "CLASS_WAITLIST 2026-08-06T20:00 Duna",
      "ACTIVITY 2026-08-07T18:30 —",
      "CLASS 2026-08-10T19:00 Rock",
    ]);
    // R-08-20: the instructor shows 24 h before the class: Monday 3's since Sunday 2 at 18:50,
    // Monday 10's still hidden.
    expect(all.reservations[1]).toMatchObject({
      instructorName: "Marc",
      instructorVisibleAt: "2026-08-02T16:50:00.000Z",
    });
    expect(all.reservations[5]).toMatchObject({
      instructorName: null,
      instructorVisibleAt: "2026-08-09T17:00:00.000Z",
    });
    expect(all.limits).toMatchObject({
      currentWeek: { count: 1, max: 2 },
      nextWeek: { count: 1, max: 1 },
    });
    expect(all.notifications.unreadCount).toBe(2);
    const duna = await home("member", "?dogId=dog-duna");
    expect(duna.selectedDogId).toBe("dog-duna");
    expect(duna.reservations.every((row) => row.dogName === null)).toBe(true);
    expect(duna.limits).toMatchObject({ currentWeek: { count: 1 }, nextWeek: { count: 0 } });
    expect((await call("GET", "/me/home?dogId=dog-stranger")).status).toBe(404);
  });

  it("GET /me/home?dogId= keeps the member's activity rows under every dog, as the api's MemberHomeQuery (E5-W01 round 2, review #3)", async () => {
    const duna = await home("member", "?dogId=dog-duna");
    expect(duna.reservations.map((row) => `${row.type} ${row.startsAtLocal}`)).toEqual([
      "CLASS 2026-08-03T18:50",
      "CLASS_WAITLIST 2026-08-06T20:00",
      "ACTIVITY 2026-08-07T18:30",
    ]);
    const toby = await home("member", "?dogId=dog-toby");
    expect(toby.reservations.map((row) => `${row.type} ${row.dogName ?? "—"}`)).toEqual([
      "ACTIVITY —",
    ]);
  });

  it("GET /me/bookable-classes reproduces 04: pack, the six rows, and the Rock and Toby variants", async () => {
    const duna = await bookable();
    expect(duna.dog).toMatchObject({ name: "Duna", sex: "FEMALE" });
    expect(duna.pack).toEqual({
      available: 4,
      consumed: 6,
      expiresOn: "2026-11-12",
      planName: "Pack 10",
      sessionsTotal: 10,
      state: "ACTIVE",
    });
    expect(
      duna.classes.map(
        (row) =>
          `${row.startsAtLocal} ${row.state} ${String(row.freeSeats)}/${String(row.waiting)}`,
      ),
    ).toEqual([
      "2026-08-05T18:50 BOOKABLE 2/0",
      "2026-08-06T20:00 WAITLIST_OPEN 0/1",
      "2026-08-07T17:40 WAITLIST_FULL 0/3",
      "2026-08-08T09:00 WEEKLY_LIMIT_DONE 3/0",
      "2026-08-10T18:50 BOOKABLE 4/0",
      "2026-08-17T09:30 NOT_YET_OPEN 5/0",
    ]);
    expect(duna.classes.every((row) => row.price === null)).toBe(true);
    const rock = await bookable("member", "?dogId=dog-rock");
    expect(rock.pack?.state).toBe("EXPIRING");
    expect(rock.classes.map((row) => row.state)).toEqual(["BOOKABLE", "PACK_EMPTY"]);
    const toby = await bookable("member", "?dogId=dog-toby");
    expect(toby.bookingBlock).toEqual({ reason: "rebut de juliol pendent" });
    expect(toby.classes.map((row) => `${row.state}{${row.notBookableReason ?? ""}}`)).toEqual([
      "NOT_BOOKABLE{BLOCKED}",
      "NOT_BOOKABLE{BLOCKED}",
    ]);
  });

  it("module variants: WAITLIST off reads FULL without counts; SINGLE_CLASS prices every row and drops the pack", async () => {
    const noWaitlist = await bookable("bookingNoWaitlist");
    expect(noWaitlist.classes.filter((row) => row.state === "FULL")).toHaveLength(2);
    expect(
      noWaitlist.classes.every((row) => row.waiting === null && row.waitlistMax === null),
    ).toBe(true);
    expect(
      (await home("bookingNoWaitlist")).reservations.some((row) => row.type === "CLASS_WAITLIST"),
    ).toBe(false);
    const single = await bookable("bookingSingleClass");
    expect(single.pack).toBeNull();
    expect(single.singleClass).toEqual({
      chargeMode: "PAY_TO_BOOK",
      pricePerClass: { amountMinor: 1200, currency: "EUR" },
    });
    expect(single.classes.every((row) => row.price?.amountMinor === 1200)).toBe(true);
  });

  it("POST /seat-holds: a plain hold of 30 s from the api clock; each refused row with its code, status and details", async () => {
    mockScenario("member");
    const hold = await call("POST", "/seat-holds", {
      classSessionId: "class-2026-08-05-1850",
      dogId: "dog-duna",
    });
    expect(hold.status).toBe(201);
    const response = hold.body as SeatHoldResponse;
    expect(Date.parse(response.expiresAt) - Date.parse(response.serverNow)).toBe(30_000);
    expect(response).toMatchObject({
      holdSeconds: 30,
      limit: { count: 1, max: 2, reached: false, swappable: [] },
      payment: null,
    });
    const refusals: [string, string, number, unknown][] = [
      [
        "class-2026-08-08-0900",
        "BOOKING_LIMIT_REACHED",
        409,
        { nextBookableAt: "2026-08-09T18:00:00Z", swappable: [], unit: "DOG" },
      ],
      ["class-2026-08-17-0930", "NOT_YET_OPEN", 422, { opensAt: "2026-08-09T18:00:00Z" }],
      ["class-2026-08-06-2000-cd", "CLASS_FULL", 409, { heldOnly: false }],
    ];
    for (const [classSessionId, code, status, details] of refusals) {
      const answer = await call("POST", "/seat-holds", { classSessionId, dogId: "dog-duna" });
      expect(answer, classSessionId).toMatchObject({ body: { code, details }, status });
    }
    expect(
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-05-1900",
        dogId: "dog-rock",
      }),
    ).toMatchObject({
      body: { code: "CLASS_FULL", details: { heldOnly: true } },
      status: 409,
    });
    expect(
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-12-1900",
        dogId: "dog-rock",
      }),
    ).toMatchObject({
      body: { code: "PACK_EMPTY" },
      status: 422,
    });
    expect(
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-04-1800",
        dogId: "dog-toby",
      }),
    ).toMatchObject({
      body: { code: "BOOKING_BLOCKED", details: { reason: "rebut de juliol pendent" } },
      status: 422,
    });
    expect((await call("DELETE", `/seat-holds/${response.id}`)).status).toBe(204);
    expect((await call("DELETE", `/seat-holds/${response.id}`)).status).toBe(204);
  });

  it("POST /bookings confirms the hold (pack −1, calendar links); an expired hold is 409 SEAT_HOLD_EXPIRED", async () => {
    mockScenario("member");
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-05-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    const created = await call("POST", "/bookings", { seatHoldId: hold.id });
    expect(created).toMatchObject({
      body: { pack: { available: 3 }, state: "ACTIVE" },
      status: 201,
    });
    expect((created.body as Booking).calendarLinks.ics).toMatch(/\.ics$/u);
    expect((await bookable()).classes.map((row) => row.startsAtLocal)).not.toContain(
      "2026-08-05T18:50",
    );
    expect((await home()).limits.currentWeek.count).toBe(2);
    const late = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-10-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    vi.setSystemTime(Date.parse(late.expiresAt) + 1);
    expect(await call("POST", "/bookings", { seatHoldId: late.id })).toMatchObject({
      body: { code: "SEAT_HOLD_EXPIRED" },
      status: 409,
    });
  });

  it("bookingLimit (mockup 06): the hold proposes two swappable bookings and a done one; the swap cancels the old one", async () => {
    mockScenario("bookingLimit");
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-08-0900",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(hold.limit).toMatchObject({
      count: 2,
      max: 2,
      reached: true,
      unit: "DOG",
      week: "CURRENT",
    });
    expect(hold.limit.swappable.map((option) => option.startsAtLocal)).toEqual([
      "2026-08-03T18:50",
      "2026-08-07T20:00",
    ]);
    // The week's first class, Sunday 2 at 20:00, has begun (E5-W05 step 7).
    expect(hold.limit.notSelectable).toMatchObject([
      { reason: "DONE", startsAtLocal: "2026-08-02T20:00" },
    ]);
    expect(await call("POST", "/bookings", { seatHoldId: hold.id })).toMatchObject({
      body: { code: "SWAP_NOT_ALLOWED" },
      status: 422,
    });
    const swapped = await call("POST", "/bookings", {
      seatHoldId: hold.id,
      swapBookingId: "booking-duna-mon3",
    });
    expect(swapped).toMatchObject({
      body: { state: "ACTIVE", swapFromBookingId: "booking-duna-mon3" },
      status: 201,
    });
    expect(bookingState.bookings.find((item) => item.id === "booking-duna-mon3")?.state).toBe(
      "CANCELLED",
    );
  });

  it("bookingSingleClass: PAY_TO_BOOK answers PAYMENT_PENDING with a same-origin checkoutUrl; Rock is charged on the receipt", async () => {
    mockScenario("bookingSingleClass");
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-05-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(hold.payment).toEqual({
      mode: "PAY_TO_BOOK",
      price: { amountMinor: 1200, currency: "EUR" },
    });
    const created = (await call("POST", "/bookings", { seatHoldId: hold.id })).body as Booking;
    expect(created.state).toBe("PAYMENT_PENDING");
    expect(created.checkoutUrl).toBe(`${origin}/reserves/${created.id}`);
    const rock = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-12-1900",
        dogId: "dog-rock",
      })
    ).body as SeatHoldResponse;
    expect(rock.payment?.mode).toBe("CHARGE_ON_ATTENDANCE");
  });

  it("GET /bookings/{id} and the cancellation: late by R-08-10 (4 h, the edge in time), displayState, then 409", async () => {
    mockScenario("member");
    const detail = (await call("GET", "/bookings/booking-duna-mon3")).body as Booking & {
      lateCancelThresholdMinutes: number;
    };
    // `bookedBy` names the session's member by first name (the `member` account is «Biel Roca»).
    expect(detail).toMatchObject({
      bookedBy: { displayName: "Biel", viaClub: false },
      displayState: "CONFIRMED",
      lateCancelThresholdMinutes: 240,
    });
    // 14:50 local = exactly 4 h before 18:50: still in time.
    vi.setSystemTime(new Date("2026-08-03T14:50:00+02:00"));
    expect(await call("POST", "/bookings/booking-duna-mon3/cancellation", {})).toMatchObject({
      body: {
        cancellation: { late: false, minutesBefore: 240 },
        displayState: "CANCELLED",
        state: "CANCELLED",
      },
      status: 200,
    });
    expect(await call("POST", "/bookings/booking-duna-mon3/cancellation", {})).toMatchObject({
      body: { code: "BOOKING_NOT_CANCELLABLE" },
      status: 422,
    });
    vi.setSystemTime(new Date("2026-08-10T16:00:00+02:00"));
    expect(await call("POST", "/bookings/booking-rock-mon10/cancellation", {})).toMatchObject({
      body: { cancellation: { late: true, minutesBefore: 180 }, state: "CANCELLED_LATE" },
      status: 200,
    });
  });

  it("the waitlist: join a WAITLIST_OPEN row (it leaves 04), refusals, the detail, leaving it, and the claim of a NOTIFIED entry", async () => {
    mockScenario("member");
    const joined = await call("POST", "/waitlist-entries", {
      classSessionId: "class-2026-08-06-2000-cd",
      dogId: "dog-duna",
    });
    expect(joined).toMatchObject({
      body: { dogName: "Duna", position: null, state: "ACTIVE" },
      status: 201,
    });
    expect((await bookable()).classes.map((row) => row.startsAtLocal)).not.toContain(
      "2026-08-06T20:00",
    );
    expect(
      await call("POST", "/waitlist-entries", {
        classSessionId: "class-2026-08-07-1740",
        dogId: "dog-duna",
      }),
    ).toMatchObject({
      body: { code: "WAITLIST_LIMIT", details: { scope: "CLASS" } },
      status: 409,
    });
    expect(
      await call("POST", "/waitlist-entries", {
        classSessionId: "class-2026-08-05-1850",
        dogId: "dog-duna",
      }),
    ).toMatchObject({
      body: { code: "CLASS_NOT_FULL" },
      status: 422,
    });
    const entry = (await call("GET", "/waitlist-entries/waitlist-duna-thu6")).body as WaitlistEntry;
    expect(entry).toMatchObject({
      classSession: { description: "C i sup.", ringName: "Carretera" },
      state: "ACTIVE",
    });
    expect(
      await call("POST", "/waitlist-entries/waitlist-duna-thu6/claim", { seatHoldId: "hold-x" }),
    ).toMatchObject({
      body: { code: "WAITLIST_NOT_NOTIFIED" },
      status: 422,
    });
    expect(
      (await call("POST", "/waitlist-entries/waitlist-duna-thu6/cancellation", {})).body,
    ).toMatchObject({ cancelReason: "MEMBER", state: "CANCELLED" });
    expect(
      await call("POST", "/waitlist-entries/waitlist-duna-thu6/cancellation", {}),
    ).toMatchObject({ body: { code: "WAITLIST_ENTRY_NOT_LIVE" }, status: 422 });
    // A NOTIFIED entry (N-15): hold with its id, then the claim consolidates it.
    const notified = bookingState.entries.find((item) => item.state === "ACTIVE");
    if (notified === undefined) throw new TypeError("Missing the joined entry");
    notified.state = "NOTIFIED";
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: notified.classSessionId,
        dogId: "dog-duna",
        waitlistEntryId: notified.id,
      })
    ).body as SeatHoldResponse;
    expect(await call("POST", "/bookings", { seatHoldId: hold.id })).toMatchObject({
      body: { code: "SEAT_HOLD_EXPIRED" },
      status: 409,
    });
    expect(
      await call("POST", `/waitlist-entries/${notified.id}/claim`, { seatHoldId: hold.id }),
    ).toMatchObject({ body: { state: "ACTIVE" }, status: 201 });
    expect(bookingState.entries.find((item) => item.id === notified.id)?.state).toBe(
      "CONSOLIDATED",
    );
  });

  it("WAITLIST off: every waitlist route is 404 MODULE_DISABLED", async () => {
    mockScenario("bookingNoWaitlist");
    expect(await call("GET", "/waitlist-entries/waitlist-duna-thu6")).toMatchObject({
      body: { code: "MODULE_DISABLED" },
      status: 404,
    });
    expect(
      await call("POST", "/waitlist-entries", {
        classSessionId: "class-2026-08-06-2000-cd",
        dogId: "dog-duna",
      }),
    ).toMatchObject({ status: 404 });
  });
});

describe("E5-W05 step 7 · the booking world's clock sits after its club's week opening, and its weeks follow R-08-01 as the api computes them", () => {
  /** «{startsAtLocal} {week} {state}[ {opensAt}]» of Duna's 04 rows. */
  const rows = (view: BookableClasses) =>
    view.classes.map((row) =>
      [row.startsAtLocal, row.week, row.state, row.opensAt ?? ""].join(" ").trim(),
    );

  afterEach(() => {
    resetSettingsState();
  });

  it("E5-W05 step 7: at Sunday 2 at 20:30 (weekOpensAt SUNDAY 20:00) W0 is 2026-08-02 and W1 2026-08-09: Monday 3 counts in the current week, Monday 10 is next, Monday 17 opens with W1, and the limit refusal names the coming opening", async () => {
    expect(Date.parse(BOOKING_MOCK_NOW)).toBe(Date.parse("2026-08-02T20:30:00+02:00"));
    // «Tots»: Duna's Monday 3 in W0, Rock's Monday 10 in W1 (R-08-02).
    expect((await home()).limits).toEqual({
      currentWeek: { count: 1, max: 2, weekKey: "2026-08-02" },
      nextWeek: { count: 1, max: 1, weekKey: "2026-08-09" },
      unit: "DOG",
    });
    expect(rows(await bookable())).toEqual([
      "2026-08-05T18:50 CURRENT BOOKABLE",
      "2026-08-06T20:00 CURRENT WAITLIST_OPEN",
      "2026-08-07T17:40 CURRENT WAITLIST_FULL",
      "2026-08-08T09:00 CURRENT WEEKLY_LIMIT_DONE",
      "2026-08-10T18:50 NEXT BOOKABLE",
      // W2 opens a week before its own start: Sunday 9 at 20:00 (R-08-01).
      "2026-08-17T09:30 LATER NOT_YET_OPEN 2026-08-09T18:00:00Z",
    ]);
    // Saturday 8 is a class of W0: the refusal is CURRENT, with maxCurrentWeek, and
    // `nextBookableAt` is the start of the next booking week (api E5-T29).
    expect(
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-08-0900",
        dogId: "dog-duna",
      }),
    ).toMatchObject({
      body: {
        code: "BOOKING_LIMIT_REACHED",
        details: { limit: 2, nextBookableAt: "2026-08-09T18:00:00Z", week: "CURRENT" },
      },
      status: 409,
    });
    const next = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-10-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(next.limit).toMatchObject({ count: 0, max: 1, reached: false, week: "NEXT" });
  });

  it("E5-W05 step 7: 06's done class belongs to W0 at the clock (it began at the week's opening, Sunday 2 at 20:00): the hold lists it as DONE beside the two cancellable ones", async () => {
    mockScenario("bookingLimit");
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-08-0900",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(hold.limit).toMatchObject({ count: 2, max: 2, reached: true, week: "CURRENT" });
    expect(hold.limit.swappable.map((option) => option.startsAtLocal)).toEqual([
      "2026-08-03T18:50",
      "2026-08-07T20:00",
    ]);
    expect(hold.limit.notSelectable).toEqual([
      {
        bookingId: "booking-duna-done",
        description: "B+C",
        reason: "DONE",
        startsAtLocal: "2026-08-02T20:00",
      },
    ]);
  });

  it("E5-W05 step 7: one minute before the opening (Sunday 2 at 19:59) the weeks are one earlier: Wednesday 5 to Saturday 8 are next week's, Monday 10 opens at 20:00, and Monday 17 is not listed yet", async () => {
    vi.setSystemTime(new Date("2026-08-02T19:59:00+02:00"));
    expect((await home()).limits).toEqual({
      currentWeek: { count: 0, max: 2, weekKey: "2026-07-26" },
      nextWeek: { count: 1, max: 1, weekKey: "2026-08-02" },
      unit: "DOG",
    });
    expect(rows(await bookable())).toEqual([
      "2026-08-05T18:50 NEXT BOOKABLE",
      "2026-08-06T20:00 NEXT WAITLIST_OPEN",
      "2026-08-07T17:40 NEXT WAITLIST_FULL",
      "2026-08-08T09:00 NEXT WEEKLY_LIMIT_DONE",
      "2026-08-10T18:50 LATER NOT_YET_OPEN 2026-08-02T18:00:00Z",
    ]);
    expect(
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-08-0900",
        dogId: "dog-duna",
      }),
    ).toMatchObject({
      body: { details: { limit: 1, nextBookableAt: "2026-08-02T18:00:00Z", week: "NEXT" } },
      status: 409,
    });
    expect(
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-10-1850",
        dogId: "dog-duna",
      }),
    ).toMatchObject({
      body: { code: "NOT_YET_OPEN", details: { opensAt: "2026-08-02T18:00:00Z" } },
      status: 422,
    });
  });

  it("E5-W05 step 7: the weeks come from `bookings.weekOpensAt` (T-08-44, a club whose week opens on Monday at 00:00)", async () => {
    const parameter = findParameter("bookings.weekOpensAt");
    if (parameter === undefined) throw new TypeError("Missing bookings.weekOpensAt");
    parameter.value = { dayOfWeek: "MONDAY", time: "00:00" };
    expect((await home()).limits).toEqual({
      currentWeek: { count: 0, max: 2, weekKey: "2026-07-27" },
      nextWeek: { count: 1, max: 1, weekKey: "2026-08-03" },
      unit: "DOG",
    });
    expect(rows(await bookable())).toEqual([
      "2026-08-05T18:50 NEXT BOOKABLE",
      "2026-08-06T20:00 NEXT WAITLIST_OPEN",
      "2026-08-07T17:40 NEXT WAITLIST_FULL",
      "2026-08-08T09:00 NEXT WEEKLY_LIMIT_DONE",
      // Monday 3 at 00:00 local, summer time.
      "2026-08-10T18:50 LATER NOT_YET_OPEN 2026-08-02T22:00:00Z",
    ]);
  });
});

describe("E5-W05 round 2 · the limits come from the world's bookings and the club's parameters (R-08-02, R-08-03, R-08-09)", () => {
  afterEach(() => {
    resetSettingsState();
  });

  /** The `409 BOOKING_LIMIT_REACHED` details of Duna's «ds 8» row (the fixed «Límit setmanal»). */
  async function saturdayRefusal(): Promise<BookingLimitReachedDetails> {
    const answer = await call("POST", "/seat-holds", {
      classSessionId: "class-2026-08-08-0900",
      dogId: "dog-duna",
    });
    expect(answer.status).toBe(409);
    const body = answer.body as ApiError;
    expect(body.code).toBe("BOOKING_LIMIT_REACHED");
    return body.details as BookingLimitReachedDetails;
  }

  /** The ids of Duna's bookings that count in `weekKey` (R-08-02), as the member world holds them. */
  async function dunaWeekBookings(weekKey: string): Promise<string[]> {
    mockScenario("admin");
    const list = await call(
      "GET",
      `/bookings?filter=${encodeURIComponent("dogId:eq:dog-duna")}&filter=${encodeURIComponent(`bookingWeekKey:eq:${weekKey}`)}&size=1000&fields=id,state`,
    );
    mockScenario("member");
    return (list.body as { items: { id: string; state?: string }[] }).items
      .filter((item) => ["ACTIVE", "CANCELLED_LATE", "PAYMENT_PENDING"].includes(item.state ?? ""))
      .map((item) => item.id);
  }

  it("E5-W05 round 2 #6: at the clock the CURRENT refusal counts Duna's real bookings of the week: its `current` is /me/home's count, and no notSelectable id is a phantom", async () => {
    const duna = await home("member", "?dogId=dog-duna");
    const details = await saturdayRefusal();
    expect(details).toMatchObject({ limit: 2, swappable: [], unit: "DOG", week: "CURRENT" });
    expect(details.current).toBe(duna.limits.currentWeek.count);
    const booked = await dunaWeekBookings(duna.limits.currentWeek.weekKey);
    expect(details.notSelectable.every((item) => booked.includes(item.bookingId))).toBe(true);
  });

  it("E5-W05 round 2 #6: Monday 3 cancelled late (at 16:00, within the 4 h) still counts: the refusal lists it as DONE (R-08-09) and counts it as /me/home does", async () => {
    vi.setSystemTime(new Date("2026-08-03T16:00:00+02:00"));
    mockScenario("member");
    expect(await call("POST", "/bookings/booking-duna-mon3/cancellation", {})).toMatchObject({
      body: { state: "CANCELLED_LATE" },
      status: 200,
    });
    const duna = await home("member", "?dogId=dog-duna");
    expect(duna.limits.currentWeek.count).toBe(1);
    const details = await saturdayRefusal();
    expect(details.current).toBe(1);
    expect(details.notSelectable).toEqual([
      {
        bookingId: "booking-duna-mon3",
        description: "B+C",
        reason: "DONE",
        startsAtLocal: "2026-08-03T18:50",
      },
    ]);
    expect(await dunaWeekBookings(duna.limits.currentWeek.weekKey)).toEqual(["booking-duna-mon3"]);
  });

  it("E5-W05 round 2 #6: one minute before the opening the NEXT refusal counts next week's bookings as /me/home does, and no class of a NEXT week is DONE", async () => {
    vi.setSystemTime(new Date("2026-08-02T19:59:00+02:00"));
    const duna = await home("member", "?dogId=dog-duna");
    const details = await saturdayRefusal();
    expect(details).toMatchObject({ limit: 1, week: "NEXT" });
    expect(details.current).toBe(duna.limits.nextWeek.count);
    const booked = await dunaWeekBookings(duna.limits.nextWeek.weekKey);
    expect(details.notSelectable.every((item) => booked.includes(item.bookingId))).toBe(true);
    // A class of a week that has not begun cannot have been done.
    expect(details.notSelectable.filter((item) => item.reason === "DONE")).toEqual([]);
  });

  it("E5-W05 round 2 #11.b: a PAYMENT_PENDING booking the hold cannot swap is LATE_WINDOW (the api's), a begun class DONE", async () => {
    await home("bookingLimit");
    const monday = bookingState.bookings.find((item) => item.id === "booking-duna-mon3");
    if (monday === undefined) throw new TypeError("Missing Monday 3's booking");
    monday.state = "PAYMENT_PENDING";
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-08-0900",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(hold.limit.swappable.map((option) => option.bookingId)).toEqual(["booking-duna-fri7"]);
    expect(hold.limit.notSelectable).toEqual([
      {
        bookingId: "booking-duna-mon3",
        description: "B+C",
        reason: "LATE_WINDOW",
        startsAtLocal: "2026-08-03T18:50",
      },
      {
        bookingId: "booking-duna-done",
        description: "B+C",
        reason: "DONE",
        startsAtLocal: "2026-08-02T20:00",
      },
    ]);
  });

  it("E5-W05 round 2 #11.b: the refusal lists Duna's PAYMENT_PENDING class of the week as LATE_WINDOW and counts it (bookingSingleClass, PAY_TO_BOOK)", async () => {
    mockScenario("bookingSingleClass");
    const hold = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-05-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    const created = (await call("POST", "/bookings", { seatHoldId: hold.id })).body as Booking;
    expect(created.state).toBe("PAYMENT_PENDING");
    const duna = await home("bookingSingleClass", "?dogId=dog-duna");
    expect(duna.limits.currentWeek.count).toBe(2);
    const details = await saturdayRefusal();
    expect(details.current).toBe(2);
    expect(details.notSelectable).toEqual([
      {
        bookingId: created.id,
        description: "B+C",
        reason: "LATE_WINDOW",
        startsAtLocal: "2026-08-05T18:50",
      },
    ]);
  });

  it("E5-W05 round 2 #11.c: the limits are the club's bookings.maxCurrentWeek and bookings.maxNextWeek: /me/home, the hold and the refusal follow a saved change", async () => {
    const setLimit = (key: string, value: number) => {
      const parameter = findParameter(key);
      if (parameter === undefined) throw new TypeError(`Missing ${key}`);
      parameter.value = value;
    };
    setLimit("bookings.maxCurrentWeek", 1);
    setLimit("bookings.maxNextWeek", 2);
    expect((await home()).limits).toMatchObject({
      currentWeek: { count: 1, max: 1 },
      nextWeek: { count: 1, max: 2 },
    });
    // Monday 3 reaches this week's limit of 1: Wednesday 5 needs the swap (R-08-09).
    const wednesday = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-05-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(wednesday.limit).toMatchObject({ count: 1, max: 1, reached: true, week: "CURRENT" });
    expect(wednesday.limit.swappable.map((option) => option.bookingId)).toEqual([
      "booking-duna-mon3",
    ]);
    expect(await saturdayRefusal()).toMatchObject({ current: 1, limit: 1, week: "CURRENT" });
    const monday = (
      await call("POST", "/seat-holds", {
        classSessionId: "class-2026-08-10-1850",
        dogId: "dog-duna",
      })
    ).body as SeatHoldResponse;
    expect(monday.limit).toMatchObject({ count: 0, max: 2, reached: false, week: "NEXT" });
  });
});
