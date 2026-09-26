import type { components } from "../../generated/schema";

import { clubInstant } from "./calendar";
import { catalogState } from "./catalogs";

type Booking = components["schemas"]["Booking"];
type BookableClass = components["schemas"]["BookableClass"];
type BookableClasses = components["schemas"]["BookableClasses"];
type BookingClassSession = components["schemas"]["BookingClassSession"];
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
 * The club-local instant the S08 world is drawn at: Sunday 2 August 2026, noon (Europe/Madrid).
 * The 03 row «Dilluns 3 · 18:50» still hides its instructor (R-08-20: 24 h before), and every
 * row of 03/04 is in the future. The Playwright and Vitest suites pin their clock here.
 */
export const BOOKING_MOCK_NOW = "2026-08-02T12:00:00+02:00";

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

/** A class session as the booking world knows it; `week` is the api's booking week (R-08-01). */
interface MockClass {
  description: string;
  endsAtLocal: string;
  id: string;
  instructorName: string;
  levelNames: string[];
  ringName: string;
  startsAtLocal: string;
  week: "CURRENT" | "LATER" | "NEXT";
}

function mockClass(
  date: string,
  start: string,
  end: string,
  description: string,
  levelNames: string[],
  ringName: string,
  week: MockClass["week"],
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
    week,
  };
}

const CLASSES = {
  done: mockClass("2026-08-02", "10:00", "11:00", "B+C", ["B", "C"], "Central", "CURRENT"),
  mon3: mockClass("2026-08-03", "18:50", "19:50", "B+C", ["B", "C"], "Central", "CURRENT"),
  tobyTue4: mockClass("2026-08-04", "18:00", "19:00", "A+B", ["A", "B"], "Cadells", "CURRENT"),
  wed5: mockClass("2026-08-05", "18:50", "19:50", "B+C", ["B", "C"], "Central", "CURRENT"),
  wed5Rock: mockClass(
    "2026-08-05",
    "19:00",
    "20:00",
    "D i sup.",
    ["D", "E", "F", "G"],
    "Muntanya",
    "CURRENT",
  ),
  thu6Waitlist: mockClass(
    "2026-08-06",
    "20:00",
    "21:00",
    "C i sup.",
    ["C", "D", "E", "F", "G"],
    "Carretera",
    "CURRENT",
  ),
  thu6: mockClass("2026-08-06", "20:00", "21:00", "C+D", ["C", "D"], "Muntanya", "CURRENT", "-cd"),
  tobyThu6: mockClass("2026-08-06", "18:00", "19:00", "B", ["B"], "Central", "CURRENT"),
  fri7Therapy: mockClass("2026-08-07", "17:40", "18:40", "Teràpia", ["C"], "Petita", "CURRENT"),
  fri7: mockClass("2026-08-07", "20:00", "21:00", "C", ["C"], "Carretera", "CURRENT"),
  sat8: mockClass("2026-08-08", "09:00", "10:00", "C", ["C"], "Muntanya", "CURRENT"),
  sat8Notified: mockClass("2026-08-08", "11:00", "12:00", "C", ["C"], "Central", "CURRENT"),
  mon10: mockClass("2026-08-10", "18:50", "19:50", "B+C", ["B", "C"], "Central", "NEXT"),
  mon10Rock: mockClass(
    "2026-08-10",
    "19:00",
    "20:00",
    "D i sup.",
    ["D", "E", "F", "G"],
    "Muntanya",
    "NEXT",
  ),
  wed12Rock: mockClass(
    "2026-08-12",
    "19:00",
    "20:00",
    "D i sup.",
    ["D", "E", "F", "G"],
    "Muntanya",
    "NEXT",
  ),
  mon17: mockClass("2026-08-17", "09:30", "10:30", "C", ["C"], "Muntanya", "LATER"),
} as const satisfies Record<string, MockClass>;

const ALL_CLASSES: readonly MockClass[] = Object.values(CLASSES);

/** The row a dog's 04 shows for a class (R-08-03, decided by the api). */
interface MockRow {
  classId: string;
  freeSeats: number;
  /** Another dog's live hold takes the last seat: the hold answers `CLASS_FULL{heldOnly}`. */
  heldByOther?: boolean;
  notBookableReason?: "BLOCKED";
  opensAt?: string;
  state: BookableClass["state"];
  waiting?: number;
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
    // `bookingLimit` (mockup 06): a second cancellable class this week, and this morning's class,
    // already done (`notSelectable{DONE}`, R-08-09).
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

/** R-08-02: what counts towards a week (never `CANCELLED` nor `CANCELLED_BY_CLUB`). */
function counts(item: StoredBooking): boolean {
  return (
    item.state === "ACTIVE" || item.state === "PAYMENT_PENDING" || item.state === "CANCELLED_LATE"
  );
}

function weekCount(dogIds: readonly string[], week: MockClass["week"]): number {
  return bookingState.bookings.filter(
    (item) =>
      dogIds.includes(item.dogId) && counts(item) && findClass(item.classSessionId)?.week === week,
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
      dogId: item.dogId,
      dogName: dogName(item.dogId),
      endsAtLocal: session.endsAtLocal,
      id: item.id,
      instructorName: visibleInstructor(session, options.now),
      instructorVisibleAt: instructorVisibleAt(session),
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
        dogId: entry.dogId,
        dogName: dogName(entry.dogId),
        endsAtLocal: null,
        id: entry.id,
        ringName: session.ringName,
        startsAt: localInstant(session.startsAtLocal),
        startsAtLocal: session.startsAtLocal,
        state: "WAITLISTED",
        title: `${CLASS_TITLE[options.locale] ?? "Classe"} ${session.description}`,
        type: "CLASS_WAITLIST",
      });
    }
  }
  // S09 row (FREE_TRAINING): Rock's training of Tuesday 4, as the mockup.
  if (options.modules.includes("FREE_TRAINING") && filter.includes(BOOKING_DOG_IDS.rock)) {
    rows.push({
      dogId: BOOKING_DOG_IDS.rock,
      dogName: dogName(BOOKING_DOG_IDS.rock),
      endsAtLocal: "2026-08-04T08:30",
      id: "training-rock-tue4",
      ringName: "Muntanya",
      startsAt: localInstant("2026-08-04T08:00"),
      startsAtLocal: "2026-08-04T08:00",
      state: "CONFIRMED",
      title: TRAINING_TITLE[options.locale] ?? "Entrenament",
      type: "TRAINING",
    });
  }
  // S07 rows (ACTIVITIES): the member's live registrations belong to the member, not to a dog, so
  // the api's dog filter keeps them (`MemberHomeQuery`).
  if (options.modules.includes("ACTIVITIES")) rows.push(...activityRows);
  rows.sort((left, right) =>
    (left.startsAt ?? left.startsAtLocal).localeCompare(right.startsAt ?? right.startsAtLocal),
  );
  const limitDogs = filter;
  return {
    dogs: dogs.map(homeDog),
    history: { monthsVisible: 2 },
    impersonation: null,
    limits: {
      currentWeek: { count: weekCount(limitDogs, "CURRENT"), max: 2, weekKey: "2026-08-02" },
      nextWeek: { count: weekCount(limitDogs, "NEXT"), max: 1, weekKey: "2026-08-09" },
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
    // «Properament»: opens with its booking week, Sunday 9 at 20:00 (R-08-01).
    {
      classId: CLASSES.mon17.id,
      freeSeats: 5,
      opensAt: localInstant("2026-08-09T20:00"),
      state: "NOT_YET_OPEN",
    },
  ];
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
      if (session === undefined) return [];
      const state = rowState(row, options.modules);
      return [
        {
          description: session.description,
          endsAtLocal: session.endsAtLocal,
          freeSeats: row.freeSeats,
          id: session.id,
          notBookableReason: row.notBookableReason ?? null,
          opensAt: row.opensAt ?? null,
          price: single ? SINGLE_CLASS_PRICE : null,
          ringColor: ringColor(session.ringName),
          ringName: session.ringName,
          startsAtLocal: session.startsAtLocal,
          state,
          waiting: waitlist ? (row.waiting ?? 0) : null,
          waitlistMax: waitlist ? 3 : null,
          week: session.week,
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

/** The row a dog's 04 shows for a class, or `undefined` when it is not listed there. */
export function bookableRow(
  dogId: string,
  classId: string,
  options: BookingOptions,
): (MockRow & { state: BookableClass["state"] }) | undefined {
  const row = rowsFor(dogId, options).find((item) => item.classId === classId);
  return row === undefined ? undefined : { ...row, state: rowState(row, options.modules) };
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
 * `LimitStatus` of the dog for the class's week (R-08-02, R-08-09): the bookings that count,
 * the ones still cancellable in time (`swappable`) and the rest (`notSelectable`).
 */
export function limitStatus(
  dogId: string,
  week: MockClass["week"],
  options: BookingOptions,
): LimitStatus {
  const max = week === "NEXT" ? 1 : 2;
  const counted = bookingState.bookings.filter(
    (item) => item.dogId === dogId && counts(item) && findClass(item.classSessionId)?.week === week,
  );
  const swappable: SwapOption[] = [];
  const notSelectable: NotSelectable[] = [];
  for (const item of counted) {
    const session = findClass(item.classSessionId);
    if (session === undefined) continue;
    const startsAt = Date.parse(localInstant(session.startsAtLocal));
    const reason =
      item.state === "CANCELLED_LATE" || startsAt <= options.now
        ? "DONE"
        : startsAt - options.now < options.thresholdMinutes * 60_000
          ? "LATE_WINDOW"
          : undefined;
    if (reason === undefined && item.state === "ACTIVE") swappable.push(...swapOption(item));
    else
      notSelectable.push({
        bookingId: item.id,
        description: session.description,
        reason: reason ?? "DONE",
        startsAtLocal: session.startsAtLocal,
      });
  }
  const reached = counted.length >= max;
  // The mockup 06 lists a done class beside two cancellable ones: the mock caps `count` at the
  // week's limit, which is what the api reports once the limit is reached. Below the limit there
  // is nothing to swap.
  return {
    count: Math.min(counted.length, max),
    max,
    notSelectable: reached ? notSelectable : [],
    reached,
    swappable: reached ? swappable : [],
    unit: "DOG",
    week,
  };
}

/**
 * `409 BOOKING_LIMIT_REACHED` details (S08 §6) of a `WEEKLY_LIMIT_DONE` row: no swappable
 * booking, and the start of the next booking week (`nextBookableAt`, decision B1/A19).
 */
export function limitReachedDetails(week: MockClass["week"]) {
  return {
    current: week === "NEXT" ? 1 : 2,
    limit: week === "NEXT" ? 1 : 2,
    nextBookableAt: localInstant("2026-08-09T20:00"),
    notSelectable: [
      { bookingId: "booking-duna-past-1", reason: "DONE" as const },
      { bookingId: "booking-duna-past-2", reason: "DONE" as const },
    ],
    swappable: [],
    unit: "DOG" as const,
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
  if (session === undefined || dog === undefined) return undefined;
  const limit = limitStatus(dog.id, session.week, options);
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
  const limit = session === undefined ? undefined : limitStatus(dogId, session.week, options);
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
