import type { components } from "../../generated/schema";

import { clubInstant, clubLocalDateOf } from "./calendar";
import { catalogState } from "./catalogs";
import { addDays } from "./planning";
import { findParameter } from "./settings";
import { trainingParameters, trainingReservationRows, trainingWeekOf } from "./training";

type Booking = components["schemas"]["Booking"];
type BookableClass = components["schemas"]["BookableClass"];
type BookableClasses = components["schemas"]["BookableClasses"];
type BookingClassSession = components["schemas"]["BookingClassSession"];
type BookingLimitReachedDetails = components["schemas"]["BookingLimitReachedDetails"];
type HomeDog = components["schemas"]["HomeDog"];
type LimitStatus = components["schemas"]["LimitStatus"];
type MeHome = components["schemas"]["MeHome"];
type Money = components["schemas"]["Money"];
type NotSelectable = components["schemas"]["NotSelectable"];
type PackCard = components["schemas"]["PackCard"];
type ReservationRow = components["schemas"]["ReservationRow"];
type SeatHoldResponse = components["schemas"]["SeatHoldResponse"];
type SwapOption = components["schemas"]["SwapOption"];
type WaitlistEntry = components["schemas"]["WaitlistEntry"];

/**
 * The club-local instant the S08 world is drawn at: Sunday 2 August 2026, 20:30 (Europe/Madrid),
 * half an hour after the club's week opened (`bookings.weekOpensAt` = Sunday 20:00, E5-W05 step 7).
 * So, by R-08-01, the current booking week (W0) is 2026-08-02 (Monday 3 to Saturday 8 and 06's
 * done class of Sunday 2 at 20:00), the next one (W1) 2026-08-09, and Monday 17 opens on Sunday 9.
 * Every row of 03/04 is in the future. The Playwright and Vitest suites pin their clock here.
 */
export const BOOKING_MOCK_NOW = "2026-08-02T20:30:00+02:00";

export const BOOKING_DOG_IDS = { duna: "dog-duna", rock: "dog-rock", toby: "dog-toby" } as const;

/** The mockup member (fictional): Laura, with Duna and Rock, and Toby of Joan Antoni's group. */
const MEMBER = {
  firstName: "Laura",
  gender: "FEMALE" as const,
  id: "20000000-0000-4000-8000-000000000002",
};
const JOAN_ANTONI = "20000000-0000-4000-8000-000000000031";

interface MockDog {
  id: string;
  levelId: string;
  levelName: string;
  memberId: string;
  name: string;
  own: boolean;
  ownerFirstName: string | null;
  sex: "FEMALE" | "MALE";
}

const DOGS: readonly MockDog[] = [
  {
    id: BOOKING_DOG_IDS.duna,
    levelId: "level-c",
    levelName: "C",
    memberId: MEMBER.id,
    name: "Duna",
    own: true,
    ownerFirstName: null,
    sex: "FEMALE",
  },
  {
    id: BOOKING_DOG_IDS.rock,
    levelId: "level-d",
    levelName: "D",
    memberId: MEMBER.id,
    name: "Rock",
    own: true,
    ownerFirstName: null,
    sex: "MALE",
  },
  {
    id: BOOKING_DOG_IDS.toby,
    levelId: "level-b",
    levelName: "B",
    memberId: JOAN_ANTONI,
    name: "Toby",
    own: false,
    ownerFirstName: "Joan Antoni",
    sex: "MALE",
  },
];

/**
 * A class session as the booking world knows it. Its booking week is not stored: the api derives
 * it from the clock and `bookings.weekOpensAt` on every read (R-08-01, `classWeek`).
 */
interface MockClass {
  description: string;
  endsAtLocal: string;
  id: string;
  instructorName: string;
  levelNames: string[];
  ringName: string;
  startsAtLocal: string;
}

function mockClass(
  date: string,
  start: string,
  end: string,
  description: string,
  levelNames: string[],
  ringName: string,
  suffix = "",
): MockClass {
  return {
    description,
    endsAtLocal: `${date}T${end}`,
    id: `class-${date}-${start.replace(":", "")}${suffix}`,
    instructorName: "Marc",
    levelNames,
    ringName,
    startsAtLocal: `${date}T${start}`,
  };
}

const CLASSES = {
  // Mockup 06's done class: the first class of the week that opened at 20:00, begun at the clock
  // (`notSelectable{DONE}`: `startsAt ≤ now`, R-08-09). It counts in W0 (E5-W05 step 7).
  done: mockClass("2026-08-02", "20:00", "21:00", "B+C", ["B", "C"], "Central"),
  mon3: mockClass("2026-08-03", "18:50", "19:50", "B+C", ["B", "C"], "Central"),
  tobyTue4: mockClass("2026-08-04", "18:00", "19:00", "A+B", ["A", "B"], "Cadells"),
  wed5: mockClass("2026-08-05", "18:50", "19:50", "B+C", ["B", "C"], "Central"),
  wed5Rock: mockClass("2026-08-05", "19:00", "20:00", "D i sup.", ["D", "E", "F", "G"], "Muntanya"),
  thu6Waitlist: mockClass(
    "2026-08-06",
    "20:00",
    "21:00",
    "C i sup.",
    ["C", "D", "E", "F", "G"],
    "Carretera",
  ),
  thu6: mockClass("2026-08-06", "20:00", "21:00", "C+D", ["C", "D"], "Muntanya", "-cd"),
  tobyThu6: mockClass("2026-08-06", "18:00", "19:00", "B", ["B"], "Central"),
  fri7Therapy: mockClass("2026-08-07", "17:40", "18:40", "Teràpia", ["C"], "Petita"),
  fri7: mockClass("2026-08-07", "20:00", "21:00", "C", ["C"], "Carretera"),
  sat8: mockClass("2026-08-08", "09:00", "10:00", "C", ["C"], "Muntanya"),
  sat8Notified: mockClass("2026-08-08", "11:00", "12:00", "C", ["C"], "Central"),
  mon10: mockClass("2026-08-10", "18:50", "19:50", "B+C", ["B", "C"], "Central"),
  mon10Rock: mockClass(
    "2026-08-10",
    "19:00",
    "20:00",
    "D i sup.",
    ["D", "E", "F", "G"],
    "Muntanya",
  ),
  wed12Rock: mockClass(
    "2026-08-12",
    "19:00",
    "20:00",
    "D i sup.",
    ["D", "E", "F", "G"],
    "Muntanya",
  ),
  mon17: mockClass("2026-08-17", "09:30", "10:30", "C", ["C"], "Muntanya"),
} as const satisfies Record<string, MockClass>;

const ALL_CLASSES: readonly MockClass[] = Object.values(CLASSES);

/** The booking week of a class relative to now's (R-08-01): W0, W1, or W2+ («Properament»). */
type BookingWeek = BookableClass["week"];

const WEEK_MS = 7 * 86_400_000;

/**
 * R-08-01: the booking week `[O, O + 7 days)` holding `instant`, `O` the last opening of the club's
 * `bookings.weekOpensAt` (local day and time) at or before it; `key` is `bookingWeekKey`, the local
 * date of `O`. The same weeks S09 counts trainings in (R-09-05): one shared calculation.
 */
function bookingWeekOf(instant: number): { end: string; key: string; start: string } {
  const week = trainingWeekOf(new Date(instant).toISOString());
  return { ...week, key: clubLocalDateOf(week.start) };
}

/** `bookingWeekKey` of a class that starts at `startsAt` (R-08-01, the opening's hour included). */
export function bookingWeekKeyOf(startsAt: string): string {
  return bookingWeekOf(Date.parse(startsAt)).key;
}

/** How many booking weeks after now's the class's week is (0 = W0; negative = a past week). */
function weekIndex(item: MockClass, now: number): number {
  const classKey = bookingWeekOf(Date.parse(localInstant(item.startsAtLocal))).key;
  const nowKey = bookingWeekOf(now).key;
  return Math.round((Date.parse(classKey) - Date.parse(nowKey)) / WEEK_MS);
}

/** The class's booking week at `now` (R-08-01); `undefined` for a class of a past week. */
export function classWeek(item: MockClass, now: number): BookingWeek | undefined {
  const index = weekIndex(item, now);
  if (index < 0) return undefined;
  return index === 0 ? "CURRENT" : index === 1 ? "NEXT" : "LATER";
}

/** A «Properament» class opens with the week before its own: `opensAt = start(W(class)) − 7 days`. */
function opensAtOf(item: MockClass): string {
  const classWeekKey = bookingWeekOf(Date.parse(localInstant(item.startsAtLocal))).key;
  return clubInstant(addDays(classWeekKey, -7), trainingParameters().weekOpensAt.time);
}

/**
 * The row a dog's 04 shows for a class (R-08-03, decided by the api). The week and «Properament»
 * come from the clock (`listedRow`); the fixture holds the rest of the row's state.
 */
interface MockRow {
  classId: string;
  freeSeats: number;
  /** Another dog's live hold takes the last seat: the hold answers `CLASS_FULL{heldOnly}`. */
  heldByOther?: boolean;
  notBookableReason?: "BLOCKED";
  state: BookableClass["state"];
  waiting?: number;
}

/** A row as 04 lists it at `now`: with its booking week and, in W2+, its opening. */
interface ListedRow extends MockRow {
  opensAt: string | null;
  week: BookingWeek;
}

// What the api derives on every read is not stored: the class, the dog, the calendar links,
// `displayState`, the threshold and `cancellableInTimeUntil` (api E5-T25).
type StoredBooking = Omit<
  Booking,
  | "calendarLinks"
  | "cancellableInTimeUntil"
  | "classSession"
  | "displayState"
  | "dog"
  | "lateCancelThresholdMinutes"
>;

type StoredEntry = Omit<WaitlistEntry, "classSession" | "dog" | "dogName">;

interface StoredHold {
  classSessionId: string;
  dogId: string;
  expiresAt: number;
  id: string;
  limitReached: boolean;
  swappable: string[];
  waitlistEntryId: string | null;
}

export interface BookingWorld {
  bookings: StoredBooking[];
  entries: StoredEntry[];
  holds: StoredHold[];
  /** `Member.lastDogForClass` (R-08-23): the dog 04 proposes. */
  lastDogForClass: string;
  sequence: number;
}

// Who booked the fixture bookings: the session's member (`resetBookingState` receives their name).
let viewerFirstName = MEMBER.firstName;

function booking(
  id: string,
  classId: string,
  dogId: string,
  state: StoredBooking["state"],
  bookedAt: string,
): StoredBooking {
  return {
    bookedAt,
    // The fixture bookings were made by the session's own account (api E5-T25 `BookedBy.self`).
    bookedBy: { displayName: viewerFirstName, self: true, viaClub: false },
    cancellation: null,
    charge: null,
    checkoutUrl: null,
    classSessionId: classId,
    dogId,
    id,
    memberId: DOGS.find((dog) => dog.id === dogId)?.memberId ?? MEMBER.id,
    origin: "APP",
    pack: null,
    state,
    swapFromBookingId: null,
  };
}

function initialBookings(limit: boolean): StoredBooking[] {
  return [
    booking(
      "booking-duna-mon3",
      CLASSES.mon3.id,
      BOOKING_DOG_IDS.duna,
      "ACTIVE",
      "2026-07-30T18:14:00Z",
    ),
    booking(
      "booking-rock-mon10",
      CLASSES.mon10Rock.id,
      BOOKING_DOG_IDS.rock,
      "ACTIVE",
      "2026-07-31T07:40:00Z",
    ),
    // `bookingLimit` (mockup 06): a second cancellable class this week, and tonight's first class
    // of the week (Sunday 2 at 20:00), already begun (`notSelectable{DONE}`, R-08-09).
    ...(limit
      ? [
          booking(
            "booking-duna-fri7",
            CLASSES.fri7.id,
            BOOKING_DOG_IDS.duna,
            "ACTIVE",
            "2026-07-30T18:20:00Z",
          ),
          booking(
            "booking-duna-done",
            CLASSES.done.id,
            BOOKING_DOG_IDS.duna,
            "ACTIVE",
            "2026-07-27T19:02:00Z",
          ),
        ]
      : []),
  ];
}

function initialEntries(): StoredEntry[] {
  return [
    {
      bookingId: null,
      cancelReason: null,
      cancelledAt: null,
      classSessionId: CLASSES.thu6Waitlist.id,
      confirmBy: null,
      dogId: BOOKING_DOG_IDS.duna,
      id: "waitlist-duna-thu6",
      joinedAt: "2026-07-31T20:05:00Z",
      memberId: MEMBER.id,
      notifiedAt: null,
      // The Cànic's `waitlist.mode = ALL_AT_ONCE`: no position (R-08-13).
      position: null,
      state: "ACTIVE",
    },
  ];
}

export const bookingState: BookingWorld = {
  bookings: initialBookings(false),
  entries: initialEntries(),
  holds: [],
  lastDogForClass: BOOKING_DOG_IDS.duna,
  sequence: 0,
};

/**
 * A fresh world; `viewer` is the first name of the session's account, the `bookedBy` of the
 * fixture bookings (07 reads «Reservada el …» for the viewer, «Reservada per {name}» otherwise).
 */
export function resetBookingState(limit = false, viewer = MEMBER.firstName): void {
  viewerFirstName = viewer;
  bookingState.bookings = initialBookings(limit);
  bookingState.entries = initialEntries();
  bookingState.holds = [];
  bookingState.lastDogForClass = BOOKING_DOG_IDS.duna;
  bookingState.sequence = 0;
}

export function nextBookingId(prefix: string): string {
  bookingState.sequence += 1;
  return `${prefix}-${String(bookingState.sequence)}`;
}

export interface BookingOptions {
  /** `bookingLimit` scenario: Duna has two bookings this week, both cancellable (R-08-09). */
  limit: boolean;
  locale: string;
  modules: readonly string[];
  now: number;
  /** `bookings.lateCancelThresholdMinutes` (R-08-10). */
  thresholdMinutes: number;
}

export function findDog(dogId: string): MockDog | undefined {
  return DOGS.find((dog) => dog.id === dogId);
}

export function findClass(classId: string): MockClass | undefined {
  return ALL_CLASSES.find((item) => item.id === classId);
}

function ringColor(ringName: string): string | null {
  return catalogState.rings.find((ring) => ring.name === ringName)?.color ?? null;
}

/** A club-local `YYYY-MM-DDTHH:mm` as an instant (the club's zone, DST-aware). */
export function localInstant(local: string): string {
  return clubInstant(local.slice(0, 10), local.slice(11, 16));
}

const CLASS_TITLE: Readonly<Record<string, string>> = { ca: "Classe", en: "Class", es: "Clase" };
const TRAINING_TITLE: Readonly<Record<string, string>> = {
  ca: "Entrenament",
  en: "Training",
  es: "Entrenamiento",
};

/** R-08-20: the instructor shows `bookings.showInstructorHoursBefore` (24) hours before the class. */
function instructorVisibleAt(item: MockClass): string {
  return new Date(Date.parse(localInstant(item.startsAtLocal)) - 24 * 3_600_000).toISOString();
}

function visibleInstructor(item: MockClass, now: number): string | null {
  return now >= Date.parse(instructorVisibleAt(item)) ? item.instructorName : null;
}

function bookingClassSession(item: MockClass, now: number): BookingClassSession {
  return {
    description: item.description,
    endsAtLocal: item.endsAtLocal,
    instructorName: visibleInstructor(item, now),
    instructorVisibleAt: instructorVisibleAt(item),
    // api E5-T29: the ring's colour for 07's dot (the booking's and the waiting entry's card).
    ringColor: ringColor(item.ringName),
    ringName: item.ringName,
    startsAtLocal: item.startsAtLocal,
  };
}

function dogsFor(modules: readonly string[]): MockDog[] {
  // FAMILY_GROUP off: only the member's own dogs (S08 §9).
  return DOGS.filter((dog) => dog.own || modules.includes("FAMILY_GROUP"));
}

function homeDog(dog: MockDog): HomeDog {
  return {
    id: dog.id,
    levelName: dog.levelName,
    name: dog.name,
    own: dog.own,
    ownerFirstName: dog.ownerFirstName,
  };
}

/**
 * R-08-03: the club's limit of a booking week, `bookings.maxCurrentWeek` for W0 and
 * `bookings.maxNextWeek` for W1 (the product defaults, 2 and 1, when the club does not list them).
 */
function weekLimit(week: BookingWeek): number {
  const value = findParameter(
    week === "NEXT" ? "bookings.maxNextWeek" : "bookings.maxCurrentWeek",
  )?.value;
  return typeof value === "number" ? value : week === "NEXT" ? 1 : 2;
}

/** R-08-02: what counts towards a week (never `CANCELLED` nor `CANCELLED_BY_CLUB`). */
function counts(item: StoredBooking): boolean {
  return (
    item.state === "ACTIVE" || item.state === "PAYMENT_PENDING" || item.state === "CANCELLED_LATE"
  );
}

/** Whether the class of `item` belongs to `week` at `now` (R-08-01). */
function inWeek(item: StoredBooking, week: BookingWeek, now: number): boolean {
  const session = findClass(item.classSessionId);
  return session !== undefined && classWeek(session, now) === week;
}

function weekCount(dogIds: readonly string[], week: BookingWeek, now: number): number {
  return bookingState.bookings.filter(
    (item) => dogIds.includes(item.dogId) && counts(item) && inWeek(item, week, now),
  ).length;
}

/** `GET /me/home?dogId=` (S08 §6): the 03 aggregate, future rows only, ordered by `startsAt`. */
export function meHome(
  dogId: string | null,
  options: BookingOptions,
  activityRows: readonly ReservationRow[],
): MeHome | undefined {
  const dogs = dogsFor(options.modules);
  if (dogId !== null && !dogs.some((dog) => dog.id === dogId)) return undefined;
  const filter = dogId === null ? dogs.map((dog) => dog.id) : [dogId];
  const dogName = (id: string) => (dogId === null ? (findDog(id)?.name ?? null) : null);
  const rows: ReservationRow[] = [];
  for (const item of bookingState.bookings) {
    const session = findClass(item.classSessionId);
    if (session === undefined || !filter.includes(item.dogId)) continue;
    if (item.state !== "ACTIVE" && item.state !== "PAYMENT_PENDING") continue;
    if (Date.parse(localInstant(session.endsAtLocal)) <= options.now) continue;
    rows.push({
      activityId: null,
      dogId: item.dogId,
      dogName: dogName(item.dogId),
      endsAtLocal: session.endsAtLocal,
      id: item.id,
      instructorName: visibleInstructor(session, options.now),
      instructorVisibleAt: instructorVisibleAt(session),
      // api E5-T25: the ring's colour for 03's dot.
      ringColor: ringColor(session.ringName),
      ringName: session.ringName,
      startsAt: localInstant(session.startsAtLocal),
      startsAtLocal: session.startsAtLocal,
      state: item.state === "ACTIVE" ? "CONFIRMED" : "PAYMENT_PENDING",
      title: `${CLASS_TITLE[options.locale] ?? "Classe"} ${session.description}`,
      type: "CLASS",
    });
  }
  if (options.modules.includes("WAITLIST")) {
    for (const entry of bookingState.entries) {
      const session = findClass(entry.classSessionId);
      if (session === undefined || !filter.includes(entry.dogId)) continue;
      if (entry.state !== "ACTIVE" && entry.state !== "NOTIFIED") continue;
      rows.push({
        activityId: null,
        dogId: entry.dogId,
        dogName: dogName(entry.dogId),
        endsAtLocal: null,
        id: entry.id,
        ringColor: ringColor(session.ringName),
        ringName: session.ringName,
        startsAt: localInstant(session.startsAtLocal),
        startsAtLocal: session.startsAtLocal,
        state: "WAITLISTED",
        title: `${CLASS_TITLE[options.locale] ?? "Classe"} ${session.description}`,
        type: "CLASS_WAITLIST",
      });
    }
  }
  // S09 rows (FREE_TRAINING): the live trainings of the S09 world (E5-W02), as the api lists
  // them; at the clock (Sunday 2 at 20:30) Rock's Tuesday 4, as the mockup, and his Monday 3 at
  // 7:00, booked at 20:05 once the week opened.
  if (options.modules.includes("FREE_TRAINING")) {
    rows.push(
      ...trainingReservationRows(
        filter,
        options.now,
        TRAINING_TITLE[options.locale] ?? "Entrenament",
        dogName,
      ),
    );
  }
  // S07 rows (ACTIVITIES): the member's live registrations belong to the member, not to a dog, so
  // the api's dog filter keeps them (`MemberHomeQuery`).
  if (options.modules.includes("ACTIVITIES")) rows.push(...activityRows);
  rows.sort((left, right) =>
    (left.startsAt ?? left.startsAtLocal).localeCompare(right.startsAt ?? right.startsAtLocal),
  );
  const limitDogs = filter;
  // R-08-01: W0 is the booking week of now, W1 the one that starts when W0 ends.
  const current = bookingWeekOf(options.now);
  return {
    dogs: dogs.map(homeDog),
    history: { monthsVisible: 2 },
    impersonation: null,
    limits: {
      currentWeek: {
        count: weekCount(limitDogs, "CURRENT", options.now),
        max: weekLimit("CURRENT"),
        weekKey: current.key,
      },
      nextWeek: {
        count: weekCount(limitDogs, "NEXT", options.now),
        max: weekLimit("NEXT"),
        weekKey: clubLocalDateOf(current.end),
      },
      unit: "DOG",
    },
    member: { firstName: MEMBER.firstName, gender: MEMBER.gender, id: MEMBER.id },
    notifications: { unreadCount: 2 },
    reservations: rows,
    selectedDogId: dogId,
  };
}

/** The 04 rows of each dog, as the mockup (Duna) and the variants the tests need (Rock, Toby). */
function rowsFor(dogId: string, options: BookingOptions): MockRow[] {
  if (dogId === BOOKING_DOG_IDS.rock) {
    return [
      { classId: CLASSES.wed5Rock.id, freeSeats: 1, heldByOther: true, state: "BOOKABLE" },
      // Rock's pack expires on 7-08: a later class is «Sense sessions» (R-08-17); without a pack
      // (PACKS off, or a single-class plan) it is bookable.
      {
        classId: CLASSES.wed12Rock.id,
        freeSeats: 3,
        state: packFor(BOOKING_DOG_IDS.rock, options) === null ? "BOOKABLE" : "PACK_EMPTY",
      },
    ];
  }
  if (dogId === BOOKING_DOG_IDS.toby) {
    // Joan Antoni's bookings are blocked (R-08-05): every row is inert.
    return [
      {
        classId: CLASSES.tobyTue4.id,
        freeSeats: 3,
        notBookableReason: "BLOCKED",
        state: "NOT_BOOKABLE",
      },
      {
        classId: CLASSES.tobyThu6.id,
        freeSeats: 2,
        notBookableReason: "BLOCKED",
        state: "NOT_BOOKABLE",
      },
    ];
  }
  return [
    { classId: CLASSES.wed5.id, freeSeats: 2, state: "BOOKABLE" },
    { classId: CLASSES.thu6.id, freeSeats: 0, state: "WAITLIST_OPEN", waiting: 1 },
    { classId: CLASSES.fri7Therapy.id, freeSeats: 0, state: "WAITLIST_FULL", waiting: 3 },
    // With a cancellable booking the api proposes the swap (a normal row); without one the limit is done.
    {
      classId: CLASSES.sat8.id,
      freeSeats: 3,
      state: options.limit ? "BOOKABLE" : "WEEKLY_LIMIT_DONE",
    },
    { classId: CLASSES.mon10.id, freeSeats: 4, state: "BOOKABLE" },
    // In W2 at the clock: «Properament» until Sunday 9 at 20:00 (R-08-01, `listedRow`).
    { classId: CLASSES.mon17.id, freeSeats: 5, state: "BOOKABLE" },
  ];
}

/**
 * The row as 04 lists it at `now` (R-08-04, R-08-01, R-08-03): only classes that start after now,
 * up to the end of W2; a W2 row is «Properament» (`NOT_YET_OPEN`, after `NOT_BOOKABLE` in the
 * order of R-08-03) with `opensAt`. `undefined` when 04 does not list the class.
 */
function listedRow(row: MockRow, options: BookingOptions): ListedRow | undefined {
  const session = findClass(row.classId);
  if (session === undefined) return undefined;
  if (Date.parse(localInstant(session.startsAtLocal)) <= options.now) return undefined;
  const index = weekIndex(session, options.now);
  if (index < 0 || index > 2) return undefined;
  const week = classWeek(session, options.now) ?? "CURRENT";
  const soon = week === "LATER" && row.state !== "NOT_BOOKABLE";
  return {
    ...row,
    opensAt: soon ? opensAtOf(session) : null,
    state: soon ? "NOT_YET_OPEN" : rowState(row, options.modules),
    week,
  };
}

const SINGLE_CLASS_PRICE: Money = { amountMinor: 1200, currency: "EUR" };

function chargeMode(dogId: string): "CHARGE_ON_ATTENDANCE" | "PAY_TO_BOOK" {
  // Duna's plan pays to book; Rock's is charged on the next receipt (R-08-18).
  return dogId === BOOKING_DOG_IDS.rock ? "CHARGE_ON_ATTENDANCE" : "PAY_TO_BOOK";
}

function packFor(dogId: string, options: BookingOptions): PackCard | null {
  if (!options.modules.includes("PACKS") || options.modules.includes("SINGLE_CLASS")) return null;
  if (dogId === BOOKING_DOG_IDS.rock) {
    return {
      available: 1,
      consumed: 9,
      expiresOn: "2026-08-07",
      planName: "Pack 10",
      sessionsTotal: 10,
      state: "EXPIRING",
    };
  }
  if (dogId === BOOKING_DOG_IDS.duna) {
    // A booking made here consumes a session; a cancellation in time gives it back (R-08-17).
    const consumed =
      6 +
      bookingState.bookings.filter(
        (item) =>
          item.dogId === dogId && item.pack !== null && item.pack !== undefined && counts(item),
      ).length;
    return {
      available: 10 - consumed,
      consumed,
      expiresOn: "2026-11-12",
      planName: "Pack 10",
      sessionsTotal: 10,
      state: "ACTIVE",
    };
  }
  return null;
}

/** A row's state once a module is off (S08 §9): no waitlist → «Completa», inert. */
function rowState(row: MockRow, modules: readonly string[]): BookableClass["state"] {
  if (
    !modules.includes("WAITLIST") &&
    (row.state === "WAITLIST_OPEN" || row.state === "WAITLIST_FULL")
  )
    return "FULL";
  return row.state;
}

function isLive(item: StoredBooking | StoredEntry): boolean {
  return item.state === "ACTIVE" || item.state === "PAYMENT_PENDING" || item.state === "NOTIFIED";
}

/** `GET /me/bookable-classes?dogId=` (S08 §6): the 04 aggregate, one dog, decided by the api. */
export function bookableClasses(
  dogId: string | null,
  options: BookingOptions,
): BookableClasses | undefined {
  const dogs = dogsFor(options.modules);
  const selected =
    dogs.find((dog) => dog.id === (dogId ?? bookingState.lastDogForClass)) ??
    (dogId === null ? dogs[0] : undefined);
  if (selected === undefined) return undefined;
  const waitlist = options.modules.includes("WAITLIST");
  const single = options.modules.includes("SINGLE_CLASS");
  // Classes the dog has booked or waits for are left out (R-08-04).
  const taken = new Set(
    [...bookingState.bookings, ...bookingState.entries]
      .filter((item) => item.dogId === selected.id && isLive(item))
      .map((item) => item.classSessionId),
  );
  const classes = rowsFor(selected.id, options)
    .filter((row) => !taken.has(row.classId))
    .flatMap((row): BookableClass[] => {
      const session = findClass(row.classId);
      const listed = listedRow(row, options);
      if (session === undefined || listed === undefined) return [];
      return [
        {
          description: session.description,
          endsAtLocal: session.endsAtLocal,
          freeSeats: row.freeSeats,
          id: session.id,
          notBookableReason: row.notBookableReason ?? null,
          opensAt: listed.opensAt,
          price: single ? SINGLE_CLASS_PRICE : null,
          ringColor: ringColor(session.ringName),
          ringName: session.ringName,
          startsAtLocal: session.startsAtLocal,
          state: listed.state,
          waiting: waitlist ? (row.waiting ?? 0) : null,
          waitlistMax: waitlist ? 3 : null,
          week: listed.week,
        },
      ];
    });
  return {
    activities: null,
    bookingBlock:
      selected.id === BOOKING_DOG_IDS.toby ? { reason: "rebut de juliol pendent" } : null,
    classes,
    dog: {
      id: selected.id,
      levelId: selected.levelId,
      levelName: selected.levelName,
      name: selected.name,
      own: selected.own,
      sex: selected.sex,
    },
    dogs: dogs.map(homeDog),
    pack: packFor(selected.id, options),
    singleClass: single
      ? { chargeMode: chargeMode(selected.id), pricePerClass: SINGLE_CLASS_PRICE }
      : null,
  };
}

/** The row a dog's 04 shows for a class at the clock, or `undefined` when it is not listed there. */
export function bookableRow(
  dogId: string,
  classId: string,
  options: BookingOptions,
): ListedRow | undefined {
  const row = rowsFor(dogId, options).find((item) => item.classId === classId);
  return row === undefined ? undefined : listedRow(row, options);
}

function swapOption(item: StoredBooking): SwapOption[] {
  const session = findClass(item.classSessionId);
  return session === undefined
    ? []
    : [
        {
          bookingId: item.id,
          description: session.description,
          ringName: session.ringName,
          startsAtLocal: session.startsAtLocal,
        },
      ];
}

/**
 * The dog's bookings that count in `week` at the clock (R-08-02), split as R-08-09 does:
 * `swappable`, the ACTIVE ones still cancellable in time; `notSelectable`, the rest — DONE once
 * the class has begun or the booking was cancelled late, LATE_WINDOW otherwise (inside the
 * threshold, or waiting for its payment: a PAYMENT_PENDING booking is never swapped).
 */
function weekBookings(dogId: string, week: BookingWeek, options: BookingOptions) {
  const counted = bookingState.bookings.filter(
    (item) => item.dogId === dogId && counts(item) && inWeek(item, week, options.now),
  );
  const swappable: SwapOption[] = [];
  const notSelectable: NotSelectable[] = [];
  for (const item of counted) {
    const session = findClass(item.classSessionId);
    if (session === undefined) continue;
    const startsAt = Date.parse(localInstant(session.startsAtLocal));
    const done = item.state === "CANCELLED_LATE" || startsAt <= options.now;
    const inTime = startsAt - options.now >= options.thresholdMinutes * 60_000;
    if (!done && inTime && item.state === "ACTIVE") swappable.push(...swapOption(item));
    else
      notSelectable.push({
        bookingId: item.id,
        description: session.description,
        reason: done ? "DONE" : "LATE_WINDOW",
        startsAtLocal: session.startsAtLocal,
      });
  }
  return { count: counted.length, notSelectable, swappable };
}

/**
 * `LimitStatus` of the dog for the class's week (R-08-02, R-08-09): the bookings that count,
 * the ones still cancellable in time (`swappable`) and the rest (`notSelectable`), against the
 * club's limit of that week (R-08-03).
 */
export function limitStatus(
  dogId: string,
  week: BookingWeek,
  options: BookingOptions,
): LimitStatus {
  const max = weekLimit(week);
  const { count, notSelectable, swappable } = weekBookings(dogId, week, options);
  const reached = count >= max;
  // The mockup 06 lists a done class beside two cancellable ones: the mock caps `count` at the
  // week's limit, which is what the api reports once the limit is reached. Below the limit there
  // is nothing to swap.
  return {
    count: Math.min(count, max),
    max,
    notSelectable: reached ? notSelectable : [],
    reached,
    swappable: reached ? swappable : [],
    unit: "DOG",
    week,
  };
}

/**
 * `409 BOOKING_LIMIT_REACHED` details (S08 §6) of a `WEEKLY_LIMIT_DONE` row at the clock: the
 * class's week and the club's limit of it, the dog's bookings that count there (`current`, the
 * count `/me/home` shows for that week) and those it cannot swap (`notSelectable`, R-08-09), no
 * swappable booking, and `nextBookableAt` = the start of the next booking week, the coming
 * opening, for a CURRENT class and a NEXT one alike (api E5-T29, R-08-01). The row itself is the
 * fixture's «Límit setmanal» (mockup 04 beside 03's cancellable Monday, assumption A6), so below
 * the limit `current` stays the world's count rather than a made-up one.
 */
export function limitReachedDetails(
  dogId: string,
  week: BookingWeek,
  options: BookingOptions,
): BookingLimitReachedDetails {
  const { count, notSelectable } = weekBookings(dogId, week, options);
  return {
    current: count,
    limit: weekLimit(week),
    nextBookableAt: bookingWeekOf(options.now).end,
    notSelectable,
    swappable: [],
    unit: "DOG",
    week,
  };
}

/** `SeatHoldResponse` (R-08-07): `serverNow` and `expiresAt` from the api clock, 30 s apart. */
export function seatHoldResponse(
  hold: StoredHold,
  options: BookingOptions,
): SeatHoldResponse | undefined {
  const session = findClass(hold.classSessionId);
  const dog = findDog(hold.dogId);
  const week = session === undefined ? undefined : classWeek(session, options.now);
  if (session === undefined || dog === undefined || week === undefined) return undefined;
  const limit = limitStatus(dog.id, week, options);
  const pack = packFor(dog.id, options);
  return {
    classSession: {
      description: session.description,
      endsAtLocal: session.endsAtLocal,
      levelNames: session.levelNames,
      ringColor: ringColor(session.ringName),
      ringName: session.ringName,
      startsAtLocal: session.startsAtLocal,
    },
    classSessionId: session.id,
    dog: { id: dog.id, name: dog.name, sex: dog.sex },
    dogId: dog.id,
    expiresAt: new Date(hold.expiresAt).toISOString(),
    holdSeconds: 30,
    id: hold.id,
    limit,
    pack: pack === null ? null : { available: pack.available, expiresOn: pack.expiresOn },
    payment: options.modules.includes("SINGLE_CLASS")
      ? { mode: chargeMode(dog.id), price: SINGLE_CLASS_PRICE }
      : null,
    serverNow: new Date(options.now).toISOString(),
  };
}

export function createHold(
  classSessionId: string,
  dogId: string,
  waitlistEntryId: string | null,
  options: BookingOptions,
): StoredHold {
  // Re-entering refreshes the same hold of the dog for the class (R-08-07).
  bookingState.holds = bookingState.holds.filter(
    (hold) => !(hold.classSessionId === classSessionId && hold.dogId === dogId),
  );
  const session = findClass(classSessionId);
  const week = session === undefined ? undefined : classWeek(session, options.now);
  const limit = week === undefined ? undefined : limitStatus(dogId, week, options);
  const hold: StoredHold = {
    classSessionId,
    dogId,
    expiresAt: options.now + 30_000,
    id: nextBookingId("hold"),
    limitReached: limit?.reached ?? false,
    swappable: limit?.swappable.map((option) => option.bookingId) ?? [],
    waitlistEntryId,
  };
  bookingState.holds.push(hold);
  return hold;
}

/** `displayState` of 07 (S08 §6), derived by the api. */
function displayState(item: StoredBooking, now: number): NonNullable<Booking["displayState"]> {
  if (item.state === "ACTIVE") {
    const session = findClass(item.classSessionId);
    return session !== undefined && Date.parse(localInstant(session.endsAtLocal)) <= now
      ? "DONE"
      : "CONFIRMED";
  }
  return item.state;
}

const CALENDAR_BASE = "https://calendar.example.test";

/**
 * The `Booking` as the api answers it: `GET /bookings/{id}` adds `displayState`; the dog, the
 * club's threshold and `cancellableInTimeUntil` (the class start minus the threshold) come with
 * every booking (api E5-T25).
 */
export function bookingResource(
  item: StoredBooking,
  options: BookingOptions,
  withDisplayState = true,
): Booking {
  const session = findClass(item.classSessionId);
  if (session === undefined) throw new RangeError(`Unknown class ${item.classSessionId}`);
  const dog = findDog(item.dogId);
  if (dog === undefined) throw new RangeError(`Unknown dog ${item.dogId}`);
  const startsAt = Date.parse(localInstant(session.startsAtLocal));
  return {
    ...item,
    calendarLinks: {
      google: `${CALENDAR_BASE}/google/${item.id}`,
      ics: `${CALENDAR_BASE}/ics/${item.id}.ics`,
      outlook: `${CALENDAR_BASE}/outlook/${item.id}`,
    },
    cancellableInTimeUntil: new Date(startsAt - options.thresholdMinutes * 60_000).toISOString(),
    classSession: bookingClassSession(session, options.now),
    ...(withDisplayState ? { displayState: displayState(item, options.now) } : {}),
    dog: { id: dog.id, name: dog.name, sex: dog.sex },
    lateCancelThresholdMinutes: options.thresholdMinutes,
  };
}

export function waitlistResource(entry: StoredEntry, options: BookingOptions): WaitlistEntry {
  const session = findClass(entry.classSessionId);
  if (session === undefined) throw new RangeError(`Unknown class ${entry.classSessionId}`);
  const dog = findDog(entry.dogId);
  if (dog === undefined) throw new RangeError(`Unknown dog ${entry.dogId}`);
  return {
    ...entry,
    classSession: bookingClassSession(session, options.now),
    dog: { id: dog.id, name: dog.name, sex: dog.sex },
    dogName: dog.name,
  };
}

export type { StoredBooking, StoredEntry, StoredHold, MockClass, MockDog };

type ClassSession = components["schemas"]["ClassSession"];
type ClassBookingItem = components["schemas"]["ClassBookingItem"];

/**
 * The registrants of the staff reads (fictional): the D12 mockup's five first, then more members,
 * so a class takes a slice of the pool and no dog is booked twice at the same hour.
 */
const REGISTRANT_POOL: readonly (readonly [string, string, "FEMALE" | "MALE"])[] = [
  ["Laura", "Duna", "FEMALE"],
  ["Marc", "Chun-li", "FEMALE"],
  ["Anna", "Nass", "MALE"],
  ["Eva", "Fish", "MALE"],
  ["Pau", "Blat", "MALE"],
  ["Clara", "Trevi", "FEMALE"],
  ["Jana", "Mixa", "FEMALE"],
  ["Pol", "Bruc", "MALE"],
  ["Carla", "Nala", "FEMALE"],
  ["Irene", "Kai", "MALE"],
  ["Nil", "Coco", "MALE"],
  ["Martí", "Bitxo", "MALE"],
];
/** Where each start time's classes take their slice (the 18:50 ones start with the D12 names). */
const POOL_OFFSETS: Readonly<Record<string, number>> = {
  "08:30": 6,
  "09:30": 9,
  "17:40": 3,
  "18:00": 7,
  "18:50": 0,
  "20:00": 2,
};
/** A booking cancelled late: the 18:50 classes show the api's «any state». */
const LATE_CANCELLER = ["Sergio", "Thai", "MALE"] as const;

/**
 * Each registrant dog's own level code, as the census and the S10 sheets know them (Duna C,
 * Chun-li A, Nass B, Fish B, Blat B, Trevi D, Thai E); the others take one of the club's levels.
 */
const DOG_LEVELS: Readonly<Record<string, string>> = {
  Bitxo: "D",
  Blat: "B",
  Bruc: "D",
  "Chun-li": "A",
  Coco: "C",
  Duna: "C",
  Fish: "B",
  Kai: "B",
  Mixa: "C",
  Nala: "A",
  Nass: "B",
  Thai: "E",
  Trevi: "D",
};

/** The class's slice of the pool: by its start time, and by its place among that time's classes. */
function registrantsOf(session: ClassSession, count: number) {
  const slot = Number(/-(\d+)$/u.exec(session.id)?.[1] ?? "0");
  const offset = (POOL_OFFSETS[session.startTime] ?? 8) + slot * 5;
  return Array.from(
    { length: Math.min(count, REGISTRANT_POOL.length) },
    (_, index) => REGISTRANT_POOL[(offset + index) % REGISTRANT_POOL.length] ?? LATE_CANCELLER,
  );
}
/** [member's first name, dog, sex, the guide when it is not the member (`Dog.handlerName`)]. */
const WAITING_POOL: readonly (readonly [string, string, "FEMALE" | "MALE", string | null])[] = [
  ["Júlia", "Kira", "FEMALE", null],
  ["Roser", "Lluna", "FEMALE", null],
  ["Oriol", "Llamp", "MALE", "Gina Soler"],
];

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z]+/gu, "-");

/**
 * `GET /class-sessions/{id}/bookings` (S08 §6) of a class of the calendar or day-grid world: its
 * `counters.booked` live bookings, plus one late cancellation; a cancelled class has its
 * `affectedBookings` cancelled by the club; a draft has none. `displayState` as the api derives it
 * (a live booking of a class that has ended reads DONE), and `levelCode`, the dog's own level,
 * `null` in a club with `levels.enabled = false` (the caller passes the switch).
 */
export function classBookingItems(
  session: ClassSession,
  levelsEnabled: boolean,
  now = Date.now(),
): ClassBookingItem[] {
  const item = (
    [member, dog]: readonly [string, string, string],
    index: number,
    state: ClassBookingItem["state"],
  ): ClassBookingItem => ({
    bookedAt: new Date(Date.parse(session.startsAt) - (72 + index * 5) * 3_600_000).toISOString(),
    // R-08-01: the week the class's start falls in, the opening's hour included.
    bookingWeekKey: bookingWeekKeyOf(session.startsAt),
    classSessionId: session.id,
    classStartsAt: session.startsAt,
    displayState:
      state === "ACTIVE" ? (Date.parse(session.endsAt) <= now ? "DONE" : "CONFIRMED") : state,
    dogId: `dog-${slug(dog)}`,
    dogName: dog,
    id: `cb-${session.id}-${String(index)}`,
    late: state === "CANCELLED_LATE" ? true : state === "ACTIVE" ? null : false,
    levelCode: levelsEnabled ? (DOG_LEVELS[dog] ?? null) : null,
    memberId: `member-${slug(member)}`,
    memberName: member,
    origin: index === 1 ? "BACKOFFICE" : "APP",
    state,
  });
  if (session.state === "DRAFT") return [];
  if (session.state === "CANCELLED") {
    const affected = session.cancellation?.affectedBookings ?? 0;
    return registrantsOf(session, affected).map((person, index) =>
      item(person, index, "CANCELLED_BY_CLUB"),
    );
  }
  const booked = registrantsOf(session, session.counters.booked).map((person, index) =>
    item(person, index, "ACTIVE"),
  );
  return booked.length === 0 || session.startTime !== "18:50"
    ? booked
    : [...booked, item(LATE_CANCELLER, booked.length, "CANCELLED_LATE")];
}

/** The staff-read waiting entries of each class, made on first read (removals change them). */
export const registrantsState: { entries: Map<string, WaitlistEntry[]> } = { entries: new Map() };

export function resetRegistrantsState(): void {
  registrantsState.entries = new Map();
}

/**
 * `GET /class-sessions/{id}/waitlist-entries` (S08 §6): `counters.waiting` live entries in position
 * order; `position` only with `waitlist.mode = FIFO` (R-08-14), `null` otherwise.
 */
export function classWaitlistEntries(session: ClassSession, fifo: boolean): WaitlistEntry[] {
  const stored = registrantsState.entries.get(session.id);
  if (stored !== undefined) return stored;
  const entries = WAITING_POOL.slice(0, session.counters.waiting).map(
    ([member, dog, sex, handler], index): WaitlistEntry => ({
      bookingId: null,
      cancelReason: null,
      cancelledAt: null,
      classSession: {
        description: session.displayDescription,
        endsAtLocal: `${session.date}T${session.endTime}`,
        instructorName: null,
        ringName: null,
        startsAtLocal: `${session.date}T${session.startTime}`,
      },
      classSessionId: session.id,
      confirmBy: null,
      dog: { id: `dog-${slug(dog)}`, name: dog, sex },
      dogId: `dog-${slug(dog)}`,
      dogName: dog,
      // E5-T29 (S10 R-10-00): the guide when it is not the member, and the member's first name.
      handlerName: handler,
      id: `wl-${session.id}-${String(index)}`,
      joinedAt: new Date(Date.parse(session.startsAt) - (48 - index) * 3_600_000).toISOString(),
      memberFirstName: member,
      memberId: `member-${slug(member)}`,
      notifiedAt: null,
      position: fifo ? index + 1 : null,
      state: "ACTIVE",
    }),
  );
  registrantsState.entries.set(session.id, entries);
  return entries;
}

/** The stored staff-read entry with `id`, and its class id. */
export function findRegistrantEntry(id: string): WaitlistEntry | undefined {
  for (const entries of registrantsState.entries.values()) {
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry !== undefined) return entry;
  }
  return undefined;
}
