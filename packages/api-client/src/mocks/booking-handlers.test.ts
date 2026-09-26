import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { components } from "../generated/schema";

import { BOOKING_MOCK_NOW } from "./fixtures/bookings";
import {
  bookingState,
  mockScenario,
  resetActivityState,
  resetBookingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type BookableClasses = components["schemas"]["BookableClasses"];
type Booking = components["schemas"]["Booking"];
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
      "CLASS 2026-08-03T18:50 Duna",
      "TRAINING 2026-08-04T08:00 Rock",
      "CLASS_WAITLIST 2026-08-06T20:00 Duna",
      "ACTIVITY 2026-08-07T18:30 —",
      "CLASS 2026-08-10T19:00 Rock",
    ]);
    // R-08-20: 24 h before the class the instructor is still hidden.
    expect(all.reservations[0]).toMatchObject({
      instructorName: null,
      instructorVisibleAt: "2026-08-02T16:50:00.000Z",
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
    expect(hold.limit.notSelectable).toMatchObject([
      { reason: "DONE", startsAtLocal: "2026-08-02T10:00" },
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
