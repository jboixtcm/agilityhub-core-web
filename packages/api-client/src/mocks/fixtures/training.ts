import type { components } from "../../generated/schema";
import { planningState } from "../planning-handlers";

import { clubInstant, clubLocalDateOf, clubLocalTime } from "./calendar";
import { catalogState, type Ring } from "./catalogs";
import { addDays } from "./planning";
import { findParameter } from "./settings";

type CancellableTraining = components["schemas"]["CancellableTraining"];
type EligibleDog = components["schemas"]["EligibleDog"];
type MemberTrainingBookings = components["schemas"]["MemberTrainingBookings"];
type ReservationRow = components["schemas"]["ReservationRow"];
type RingBlock = components["schemas"]["RingBlock"];
type SlotCell = components["schemas"]["SlotCell"];
type TrainingBooking = components["schemas"]["TrainingBooking"];
type TrainingCounter = components["schemas"]["TrainingCounter"];
type TrainingDay = components["schemas"]["TrainingDay"];
type TrainingLimitReachedDetails = components["schemas"]["TrainingLimitReachedDetails"];
type TrainingRing = components["schemas"]["TrainingRing"];
type TrainingSlot = components["schemas"]["TrainingSlot"];
type TrainingSlots = components["schemas"]["TrainingSlots"];
type TrainingSummary = components["schemas"]["TrainingSummary"];
type WeekOpensAt = components["schemas"]["WeekOpensAt"];

/**
 * The S09 mock world (E5-W02), drawn after mockups 08 and 24: Monday 3 August 2026 at 7:10
 * (Europe/Madrid), «Avui dl 3» with its 7:00 already started. The Vitest and Playwright suites of
 * screens 08, 24 and the D12 card pin their clock here.
 */
export const TRAINING_MOCK_NOW = "2026-08-03T07:10:00+02:00";

/**
 * The days drawn after the mockups (the member window dl 3 – dj 6 from `TRAINING_MOCK_NOW`). Any
 * other day is computed from the calendar world of E4-W02 (`planningState`: classes, blocks and
 * its training bookings), so a block created on D4, 24 or D12 shows on every grid.
 */
export const TRAINING_MOCKUP_DAYS = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"];

/** A holiday among the mockup days (`closed: true`): the day-grid world's day without elements. */
export const TRAINING_HOLIDAY = "2026-08-05";

/** The mockup member (fictional): Laura's Rock, and Toby of Joan Antoni's family group. */
export const TRAINING_DOG_IDS = { rock: "dog-rock", toby: "dog-toby" } as const;
const MEMBER_ID = "20000000-0000-4000-8000-000000000002";
const JOAN_ANTONI_ID = "20000000-0000-4000-8000-000000000031";

interface TrainingDog {
  id: string;
  levelName: string;
  memberId: string;
  name: string;
  ownerName: string | null;
  /** R-09-01: by the level (`grantsFreeTraining`) or by the dog's manual override. */
  rightSource: "LEVEL" | "MANUAL";
}

const DOGS: readonly TrainingDog[] = [
  {
    id: TRAINING_DOG_IDS.rock,
    levelName: "D",
    memberId: MEMBER_ID,
    name: "Rock",
    ownerName: null,
    rightSource: "LEVEL",
  },
  {
    id: TRAINING_DOG_IDS.toby,
    levelName: "B",
    memberId: JOAN_ANTONI_ID,
    name: "Toby",
    ownerName: "Joan Antoni",
    rightSource: "MANUAL",
  },
];

export type TrainingVariant = "atLimit" | "atLimitNone" | "default" | "noRight";

export interface StoredTraining {
  cancelReason?: TrainingBooking["cancelReason"];
  cancelledAt?: string | null;
  cancelledBy?: TrainingBooking["cancelledBy"];
  /** A booking does not exist before it was made: every read skips `createdAt > now`. */
  createdAt: string;
  date: string;
  dogId: string;
  dogName: string;
  end: string;
  id: string;
  /** Who acted for the member (`origin: BACKOFFICE`, R-09-16). */
  impersonatedBy?: string | null;
  memberId: string;
  memberName: string;
  origin: "APP" | "BACKOFFICE";
  ringId: string;
  start: string;
  state: TrainingBooking["state"];
}

interface StoredClass {
  date: string;
  description: string;
  end: string;
  id: string;
  ringId: string;
  start: string;
}

const MUN = "ring-muntanya";
const CEN = "ring-central";
const CAR = "ring-carretera";
const CAD = "ring-cadells";
const PET = "ring-petita";
const [MON3 = "", TUE4 = "", , THU6 = ""] = TRAINING_MOCKUP_DAYS;

function other(
  date: string,
  ringId: string,
  start: string,
  memberName: string,
  dogName: string,
): StoredTraining {
  return {
    createdAt: "2026-08-01T10:00:00Z",
    date,
    dogId: `dog-${dogName.toLowerCase()}`,
    dogName,
    end: plusMinutes(start, 30),
    id: `tb-${date}-${start.replace(":", "")}-${ringId.replace("ring-", "")}`,
    memberId: `member-${memberName.toLowerCase()}`,
    memberName,
    origin: "APP",
    ringId,
    start,
    state: "ACTIVE",
  };
}

function rock(
  id: string,
  date: string,
  ringId: string,
  start: string,
  createdAt: string,
  extra: Partial<StoredTraining> = {},
): StoredTraining {
  return {
    createdAt,
    date,
    dogId: TRAINING_DOG_IDS.rock,
    dogName: "Rock",
    end: plusMinutes(start, 30),
    id,
    memberId: MEMBER_ID,
    memberName: "Laura",
    origin: "APP",
    ringId,
    start,
    state: "ACTIVE",
    ...extra,
  };
}

/**
 * Rock's bookings. `createdAt` keeps the S08 world of Sunday 2 at noon (E5-W01) as it was: only the
 * Tuesday 8:00 existed then (screen 03); the Monday 7:00 was made after the week opened at 20:00.
 */
function rockBookings(variant: TrainingVariant): StoredTraining[] {
  const monday = rock("training-rock-mon3", MON3, MUN, "07:00", "2026-08-02T18:05:00Z", {
    impersonatedBy: "Aina Serra",
    origin: "BACKOFFICE",
  });
  const tuesday = rock("training-rock-tue4", TUE4, MUN, "08:00", "2026-08-01T08:12:00Z");
  // Cancelled by the club when Carretera was closed for maintenance (R-09-13).
  const club = rock("training-rock-club", MON3, CAR, "16:30", "2026-08-01T09:30:00Z", {
    cancelReason: "RING_BLOCK",
    cancelledAt: "2026-08-02T16:00:00Z",
    cancelledBy: "ADMIN",
    state: "CANCELLED_BY_CLUB",
  });
  if (variant === "atLimit") {
    return [
      monday,
      tuesday,
      club,
      rock("training-rock-thu6", THU6, CAR, "07:30", "2026-08-03T05:00:00Z"),
    ];
  }
  if (variant === "atLimitNone") {
    // Three sessions of this week already begun or inside the threshold: nothing to cancel.
    return [
      rock("training-rock-sun2-2030", "2026-08-02", MUN, "20:30", "2026-08-02T18:02:00Z"),
      rock("training-rock-sun2-2100", "2026-08-02", MUN, "21:00", "2026-08-02T18:03:00Z"),
      monday,
      club,
    ];
  }
  return [monday, tuesday, club];
}

function initialBookings(variant: TrainingVariant): StoredTraining[] {
  return [
    ...rockBookings(variant),
    other(MON3, CEN, "07:00", "Pau", "Blat"),
    other(MON3, CAR, "07:00", "Júlia", "Kira"),
    other(MON3, CEN, "08:30", "Sergio", "Thai"),
    other(MON3, CEN, "09:00", "Pau", "Blat"),
    other(MON3, CAR, "09:00", "Anna", "Nass"),
    other(MON3, MUN, "16:30", "Clara", "Trevi"),
    other(MON3, CEN, "16:30", "Marc", "Chun-li"),
    other(TUE4, CAR, "19:00", "Sergio", "Thai"),
    other(THU6, MUN, "18:00", "Clara", "Trevi"),
  ];
}

function mockupClass(
  date: string,
  ringId: string,
  start: string,
  end: string,
  description: string,
): StoredClass {
  return {
    date,
    description,
    end,
    id: `class-${date}-${start.replace(":", "")}-${ringId.replace("ring-", "")}`,
    ringId,
    start,
  };
}

/** The mockup days' classes (the S08 world's Central 18:50 of Monday 3 and those of Thursday 6). */
const MOCKUP_CLASSES: readonly StoredClass[] = [
  mockupClass(MON3, PET, "17:40", "18:40", "Teràpia"),
  mockupClass(MON3, MUN, "18:50", "19:30", "C i sup."),
  mockupClass(MON3, CEN, "18:50", "19:50", "B+C"),
  mockupClass(MON3, CAR, "18:50", "19:30", "D+E"),
  mockupClass(MON3, CAD, "18:50", "19:50", "Cadells"),
  mockupClass(TUE4, CAR, "17:40", "18:40", "D+E"),
  mockupClass(TUE4, CAD, "18:00", "19:00", "A+B"),
  mockupClass(TUE4, CEN, "18:50", "19:50", "A+B"),
  mockupClass(THU6, CEN, "18:00", "19:00", "B"),
  mockupClass(THU6, MUN, "20:00", "21:00", "C+D"),
  mockupClass(THU6, CAR, "20:00", "21:00", "C i sup."),
];

function mockupBlock(
  date: string,
  ringId: string,
  start: string,
  end: string,
  kind: RingBlock["kind"],
  reason: RingBlock["reason"],
  createdByName: string,
  note: string | null,
): RingBlock {
  return {
    activityId: null,
    activityTitle: null,
    createdByName,
    date,
    from: clubInstant(date, start),
    fromLocal: start,
    id: `rb-${date}-${start.replace(":", "")}-${ringId.replace("ring-", "")}`,
    kind,
    note,
    reason,
    ringId,
    state: "ACTIVE",
    to: clubInstant(date, end),
    toLocal: end,
    version: 1,
  };
}

function initialBlocks(): RingBlock[] {
  return [
    mockupBlock(
      MON3,
      MUN,
      "09:00",
      "09:30",
      "RESERVATION",
      "PREPARATION",
      "Marc",
      "Muntatge del recorregut",
    ),
    mockupBlock(MON3, CAR, "16:00", "17:00", "BLOCK", "MAINTENANCE", "Marc", "Reg de la sorra"),
    mockupBlock(THU6, PET, "19:00", "19:30", "RESERVATION", "THERAPY", "Núria", null),
  ];
}

export const trainingState: {
  blocks: RingBlock[];
  bookings: StoredTraining[];
  /** `Idempotency-Key` → the first answer (CONVENCIONS_API §7): a replay returns it again. */
  idempotency: Map<string, { body: Record<string, unknown>; status: number }>;
  /** `Member.lastDogForTraining` (R-09-09). */
  lastDogId: string | null;
  sequence: number;
  variant: TrainingVariant;
} = {
  blocks: initialBlocks(),
  bookings: initialBookings("default"),
  idempotency: new Map(),
  lastDogId: null,
  sequence: 0,
  variant: "default",
};

export function resetTrainingState(variant: TrainingVariant = "default"): void {
  trainingState.blocks = initialBlocks();
  trainingState.bookings = initialBookings(variant);
  trainingState.idempotency = new Map();
  trainingState.lastDogId = null;
  trainingState.sequence = 0;
  trainingState.variant = variant;
}

export function nextTrainingId(prefix: string): string {
  trainingState.sequence += 1;
  return `${prefix}-${String(trainingState.sequence)}`;
}

function numberParameter(key: string, fallback: number): number {
  const value = findParameter(key)?.value;
  return typeof value === "number" ? value : fallback;
}

export function trainingParameters() {
  const weekOpensAt = findParameter("bookings.weekOpensAt")?.value as WeekOpensAt | undefined;
  return {
    cancelThresholdMinutes: numberParameter("training.cancelThresholdMinutes", 120),
    limit: numberParameter("training.maxPerWeek", 3),
    slotMinutes: numberParameter("training.slotMinutes", 30),
    weekOpensAt: weekOpensAt ?? { dayOfWeek: "SUNDAY", time: "20:00" },
    windowDays: numberParameter("training.bookingWindowDays", 3),
  };
}

export function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeOf(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function plusMinutes(time: string, minutes: number): string {
  return timeOf(minutesOf(time) + minutes);
}

const weekdayKeys = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** The day's opening window (`club.openingHours`), `null` on a holiday or a closed weekday. */
export function openingOf(date: string): { close: string; open: string } | null {
  const holidays = findParameter("club.holidays")?.value;
  if (date === TRAINING_HOLIDAY) return null;
  if (Array.isArray(holidays) && holidays.some((item) => item === date)) return null;
  const hours = findParameter("club.openingHours")?.value as
    Partial<Record<string, { close: string; open: string }>> | undefined;
  return hours?.[weekdayKeys[weekdayOf(date)] ?? "MONDAY"] ?? null;
}

/** R-09-03 step 2: the 30-min starts from the opening hour while a whole slot fits. */
export function slotStarts(date: string): string[] {
  const window = openingOf(date);
  if (window === null) return [];
  const { slotMinutes } = trainingParameters();
  const starts: string[] = [];
  for (
    let start = minutesOf(window.open);
    start + slotMinutes <= minutesOf(window.close);
    start += slotMinutes
  ) {
    starts.push(timeOf(start));
  }
  return starts;
}

function overlaps(
  left: { end: string; start: string },
  right: { end: string; start: string },
): boolean {
  return left.start < right.end && left.end > right.start;
}

export function isMockupDay(date: string): boolean {
  return TRAINING_MOCKUP_DAYS.includes(date);
}

interface Occupant {
  bookingId: string;
  dogId: string;
  dogName: string;
  end: string;
  memberName: string;
  ringId: string;
  start: string;
}

interface DayOccupancy {
  blocks: RingBlock[];
  classes: StoredClass[];
  trainings: Occupant[];
}

export function visibleBookings(now: number): StoredTraining[] {
  return trainingState.bookings.filter((booking) => Date.parse(booking.createdAt) <= now);
}

/**
 * R-09-03 step 3: what occupies each ring on `date`. The mockup days come from this world; any
 * other day from the calendar world (`DRAFT`/`ACTIVE` classes with a ring, `ACTIVE` blocks and its
 * training bookings), plus the bookings made here.
 */
function occupancyOf(date: string, now: number): DayOccupancy {
  const trainings: Occupant[] = visibleBookings(now)
    .filter((booking) => booking.date === date && booking.state === "ACTIVE")
    .map((booking) => ({
      bookingId: booking.id,
      dogId: booking.dogId,
      dogName: booking.dogName,
      end: booking.end,
      memberName: booking.memberName,
      ringId: booking.ringId,
      start: booking.start,
    }));
  const ownBlocks = trainingState.blocks.filter(
    (block) => block.date === date && block.state === "ACTIVE",
  );
  if (isMockupDay(date)) {
    return {
      blocks: ownBlocks,
      classes: MOCKUP_CLASSES.filter((item) => item.date === date),
      trainings,
    };
  }
  return {
    blocks: [
      ...ownBlocks,
      ...planningState.blocks.filter((block) => block.date === date && block.state === "ACTIVE"),
    ],
    classes: planningState.sessions
      .filter(
        (session) =>
          session.date === date &&
          (session.state === "DRAFT" || session.state === "ACTIVE") &&
          session.ringId !== null &&
          session.ringId !== undefined,
      )
      .map((session) => ({
        date,
        description: session.displayDescription,
        end: session.endTime,
        id: session.id,
        ringId: session.ringId ?? "",
        start: session.startTime,
      })),
    trainings: [
      ...trainings,
      ...planningState.trainingBookings
        .filter((booking) => booking.date === date)
        .map((booking) => {
          const [memberName = booking.memberName] = booking.memberName.split(" ");
          return {
            bookingId: booking.id,
            dogId: `dog-${booking.dogName.toLowerCase()}`,
            dogName: booking.dogName,
            end: booking.toLocal,
            memberName,
            ringId: booking.ringId,
            start: booking.fromLocal,
          };
        }),
    ],
  };
}

export function trainableRings(): Ring[] {
  return catalogState.rings
    .filter((ring) => ring.active && ring.allowsFreeTraining)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export function findRing(ringId: string): Ring | undefined {
  return catalogState.rings.find((ring) => ring.id === ringId);
}

function trainingRing(ring: Ring, withSetup: boolean): TrainingRing {
  return {
    capacity: ring.effectiveTrainingCapacity,
    color: ring.color,
    id: ring.id,
    name: ring.name,
    order: ring.order,
    shortName: ring.shortName,
    // R-09-15: the course built on Muntanya (S16), only with COURSES.
    ...(withSetup
      ? {
          setup:
            ring.id === MUN
              ? {
                  builtAt: "2026-08-02T16:10:00Z",
                  expectedUntil: "2026-08-09",
                  id: "setup-muntanya-1",
                  kind: "AGILITY",
                  levelNames: ["D"],
                }
              : null,
        }
      : {}),
  };
}

interface CellOptions {
  dogId: string | null;
  staff: boolean;
}

/** R-09-03 step 4: CLASS > RING_BLOCK > TRAINING (OWN_TRAINING for the queried dog) > FREE. */
function cellOf(
  ring: Ring,
  slot: { end: string; start: string },
  occupancy: DayOccupancy,
  options: CellOptions,
): SlotCell {
  const staff = (cell: SlotCell): SlotCell =>
    options.staff ? { block: null, classSession: null, occupants: [], ...cell } : cell;
  const lesson = occupancy.classes.find((item) => item.ringId === ring.id && overlaps(slot, item));
  if (lesson !== undefined) {
    return staff({
      reason: "CLASS",
      state: "BLOCKED",
      ...(options.staff
        ? { classSession: { description: lesson.description, id: lesson.id } }
        : {}),
    });
  }
  const block = occupancy.blocks.find(
    (item) =>
      item.ringId === ring.id && overlaps(slot, { end: item.toLocal, start: item.fromLocal }),
  );
  if (block !== undefined) {
    return staff({
      reason: "RING_BLOCK",
      state: "BLOCKED",
      ...(options.staff
        ? {
            block: {
              createdByName: block.createdByName,
              id: block.id,
              kind: block.kind,
              note: block.note ?? null,
              reason: block.reason,
            },
          }
        : {}),
    });
  }
  const trainings = occupancy.trainings.filter(
    (item) => item.ringId === ring.id && overlaps(slot, item),
  );
  if (trainings.length >= ring.effectiveTrainingCapacity) {
    const own = trainings.find((item) => item.dogId === options.dogId);
    return staff({
      reason: own === undefined ? "TRAINING" : "OWN_TRAINING",
      state: "BOOKED",
      ...(own === undefined ? {} : { bookingId: own.bookingId }),
      ...(options.staff
        ? {
            occupants: trainings.map((item) => ({
              bookingId: item.bookingId,
              dogName: item.dogName,
              memberName: item.memberName,
            })),
          }
        : {}),
    });
  }
  return staff({ state: "FREE" });
}

export interface SlotsOptions {
  dogId: string | null;
  from: string;
  levelsEnabled: boolean;
  modules: readonly string[];
  now: number;
  ringId: string | null;
  showSetup: boolean;
  staff: boolean;
  to: string;
}

export function clubToday(now: number): string {
  return clubLocalDateOf(new Date(now).toISOString());
}

/** The member's window (R-09-04): the club-local today and `training.bookingWindowDays` more. */
export function memberWindow(now: number): { from: string; to: string } {
  const today = clubToday(now);
  return { from: today, to: addDays(today, trainingParameters().windowDays) };
}

/** `GET /training-slots` (S09 §6): the computed grid of `[from, to]`, projected per role. */
export function trainingSlots(options: SlotsOptions): TrainingSlots {
  const window = options.staff ? { from: options.from, to: options.to } : memberWindow(options.now);
  const from = options.from > window.from ? options.from : window.from;
  const to = options.to < window.to ? options.to : window.to;
  const requested = options.ringId === null ? undefined : findRing(options.ringId);
  // The staff projection also draws a ring closed to training when it is asked for (screen 24:
  // every active ring, R-09-02); a member only ever gets the rings open to training.
  const rings =
    requested === undefined
      ? trainableRings()
      : trainableRings().some((ring) => ring.id === requested.id) ||
          (options.staff && requested.active)
        ? [requested]
        : [];
  const { slotMinutes } = trainingParameters();
  const days: TrainingDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const starts = slotStarts(date);
    if (starts.length === 0) {
      days.push({ closed: true, date, slots: [] });
      continue;
    }
    const occupancy = occupancyOf(date, options.now);
    const slots: TrainingSlot[] = starts.map((start) => {
      const range = { end: plusMinutes(start, slotMinutes), start };
      const cells = Object.fromEntries(
        rings.map((ring) => [ring.id, cellOf(ring, range, occupancy, options)]),
      );
      const startsAt = clubInstant(date, start);
      const anyFree = Object.values(cells).some((cell) => cell.state === "FREE");
      return {
        anyFree,
        bookable: anyFree && Date.parse(startsAt) > options.now,
        endsAtLocal: range.end,
        rings: cells,
        startsAt,
        startsAtLocal: start,
      };
    });
    days.push({ closed: false, date, slots });
  }
  return {
    days,
    dogEligible:
      options.dogId === null ||
      eligibleDogs(options.modules, options.levelsEnabled).some((dog) => dog.id === options.dogId),
    rings: rings.map((ring) => trainingRing(ring, options.showSetup)),
    slotMinutes,
    timeZone: "Europe/Madrid",
    window: { from, to },
  };
}

/** R-09-01: own dogs, then the family group's (FAMILY_GROUP); without levels only overrides. */
export function eligibleDogs(modules: readonly string[], levelsEnabled: boolean): EligibleDog[] {
  if (trainingState.variant === "noRight") return [];
  return DOGS.filter((dog) => dog.memberId === MEMBER_ID || modules.includes("FAMILY_GROUP"))
    .filter((dog) => levelsEnabled || dog.rightSource === "MANUAL")
    .map((dog) => ({
      id: dog.id,
      levelName: levelsEnabled ? dog.levelName : null,
      name: dog.name,
      ownerName: modules.includes("FAMILY_GROUP") ? dog.ownerName : null,
      rightSource: dog.rightSource,
    }));
}

/** R-09-05: the training week `[W, W + 1 week)` holding `instant`, W = the last opening ≤ it. */
export function trainingWeekOf(instant: string): { end: string; start: string } {
  const { weekOpensAt } = trainingParameters();
  const opensOn = weekdayKeys.indexOf(weekOpensAt.dayOfWeek);
  const date = clubLocalDateOf(instant);
  let day = addDays(date, -((weekdayOf(date) - opensOn + 7) % 7));
  if (Date.parse(clubInstant(day, weekOpensAt.time)) > Date.parse(instant)) day = addDays(day, -7);
  return {
    end: clubInstant(addDays(day, 7), weekOpensAt.time),
    start: clubInstant(day, weekOpensAt.time),
  };
}

export function startsAtOf(booking: StoredTraining): string {
  return clubInstant(booking.date, booking.start);
}

export function cancellableUntilOf(booking: StoredTraining): string {
  const until =
    Date.parse(startsAtOf(booking)) - trainingParameters().cancelThresholdMinutes * 60_000;
  return new Date(until).toISOString().replace(".000Z", "Z");
}

/** R-09-05: the dog's `ACTIVE` sessions of the week (also the ones already done). */
function weekBookings(dogId: string, week: { end: string; start: string }, now: number) {
  return visibleBookings(now)
    .filter((booking) => booking.dogId === dogId && booking.state === "ACTIVE")
    .filter((booking) => {
      const startsAt = Date.parse(startsAtOf(booking));
      return startsAt >= Date.parse(week.start) && startsAt < Date.parse(week.end);
    })
    .sort((left, right) => startsAtOf(left).localeCompare(startsAtOf(right)));
}

export function counterOf(dogId: string, week: { end: string; start: string }, now: number) {
  const { limit } = trainingParameters();
  const used = weekBookings(dogId, week, now).length;
  return {
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: week.end,
    used,
  } satisfies TrainingCounter;
}

/** R-09-10: future `ACTIVE` sessions of the week still before their threshold. */
export function cancellableOf(
  dogId: string,
  week: { end: string; start: string },
  now: number,
): CancellableTraining[] {
  return weekBookings(dogId, week, now)
    .filter((booking) => Date.parse(cancellableUntilOf(booking)) >= now)
    .map((booking) => ({
      cancellableUntil: cancellableUntilOf(booking),
      id: booking.id,
      ringName: findRing(booking.ringId)?.name ?? booking.ringId,
      startsAt: startsAtOf(booking),
    }));
}

export function limitReachedDetails(
  dogId: string,
  week: { end: string; start: string },
  now: number,
): TrainingLimitReachedDetails {
  const counter = counterOf(dogId, week, now);
  return {
    cancellableBookings: cancellableOf(dogId, week, now),
    limit: counter.limit,
    used: counter.used,
    weekEnd: week.end,
    weekStart: week.start,
  };
}

export interface SummaryOptions {
  date: string | null;
  dogId: string | null;
  levelsEnabled: boolean;
  modules: readonly string[];
  now: number;
}

/** `GET /me/training-summary` (S09 §6); `undefined` = the dog is not accessible (404). */
export function trainingSummary(options: SummaryOptions): TrainingSummary | undefined {
  const dogs = eligibleDogs(options.modules, options.levelsEnabled);
  if (options.dogId !== null && !dogs.some((dog) => dog.id === options.dogId)) return undefined;
  // R-09-09: the last dog booked while it keeps its right, else the first eligible one.
  const remembered = dogs.find(
    (dog) => dog.id === (trainingState.lastDogId ?? TRAINING_DOG_IDS.rock),
  );
  const defaultDogId = remembered?.id ?? dogs[0]?.id ?? null;
  const dogId = options.dogId ?? defaultDogId;
  const date = options.date ?? clubToday(options.now);
  const week = trainingWeekOf(clubInstant(date, "00:00"));
  return {
    bookingBlock: null,
    cancellableBookings: dogId === null ? [] : cancellableOf(dogId, week, options.now),
    counter:
      dogId === null
        ? { limit: trainingParameters().limit, remaining: 0, resetsAt: week.end, used: 0 }
        : counterOf(dogId, week, options.now),
    defaultDogId,
    eligibleDogs: dogs,
    inactivity: null,
    limitUnit: "DOG",
    week: {
      current: Date.parse(week.start) <= options.now && options.now < Date.parse(week.end),
      end: week.end,
      start: week.start,
    },
    weekOpensAt: trainingParameters().weekOpensAt,
  };
}

/** The `TrainingBooking` resource of a stored booking (S09 §6), with its week's counter. */
export function trainingBookingResource(booking: StoredTraining, now: number): TrainingBooking {
  const startsAt = startsAtOf(booking);
  return {
    cancelReason: booking.cancelReason ?? null,
    cancellableUntil: cancellableUntilOf(booking),
    cancelledAt: booking.cancelledAt ?? null,
    cancelledBy: booking.cancelledBy ?? null,
    counter: counterOf(booking.dogId, trainingWeekOf(startsAt), now),
    createdAt: booking.createdAt,
    date: booking.date,
    dogId: booking.dogId,
    dogName: booking.dogName,
    endsAt: clubInstant(booking.date, booking.end),
    endsAtLocal: booking.end,
    id: booking.id,
    impersonation:
      booking.impersonatedBy === null || booking.impersonatedBy === undefined
        ? null
        : { actorName: booking.impersonatedBy },
    memberId: booking.memberId,
    origin: booking.origin,
    ringId: booking.ringId,
    ringName: findRing(booking.ringId)?.name ?? booking.ringId,
    slotId: `${booking.ringId}_${startsAt}`,
    startsAt,
    startsAtLocal: booking.start,
    state: booking.state,
  };
}

/** The member's (and the group's) bookings: `GET /me/training-bookings`. */
export function memberTrainingBookings(
  dogIds: readonly string[],
  now: number,
  filter: { from: string | null; state: string | null; to: string | null },
): MemberTrainingBookings {
  return {
    items: visibleBookings(now)
      .filter((booking) => dogIds.includes(booking.dogId))
      .filter((booking) => filter.state === null || booking.state === filter.state)
      .filter((booking) => filter.from === null || booking.date >= filter.from)
      .filter((booking) => filter.to === null || booking.date <= filter.to)
      .sort((left, right) => startsAtOf(left).localeCompare(startsAtOf(right)))
      .map((booking) => trainingBookingResource(booking, now)),
  };
}

/** The live trainings of 03 «Les meves reserves» (S09 §2 row 08): future `ACTIVE` sessions. */
export function trainingReservationRows(
  dogIds: readonly string[],
  now: number,
  title: string,
  dogName: (dogId: string) => string | null,
): ReservationRow[] {
  return visibleBookings(now)
    .filter(
      (booking) =>
        dogIds.includes(booking.dogId) &&
        booking.state === "ACTIVE" &&
        Date.parse(clubInstant(booking.date, booking.end)) > now,
    )
    .map((booking) => ({
      activityId: null,
      dogId: booking.dogId,
      dogName: dogName(booking.dogId),
      endsAtLocal: `${booking.date}T${booking.end}`,
      id: booking.id,
      // api E5-T25: the ring's colour for 03's dot.
      ringColor: findRing(booking.ringId)?.color ?? null,
      ringName: findRing(booking.ringId)?.name ?? null,
      startsAt: startsAtOf(booking),
      startsAtLocal: `${booking.date}T${booking.start}`,
      state: "CONFIRMED" as const,
      title,
      type: "TRAINING" as const,
    }));
}

/** A club-local `HH:mm` and date of an instant (the api reads it in `club.timeZone`). */
export function localParts(instant: string): { date: string; time: string } {
  return { date: clubLocalDateOf(instant), time: clubLocalTime(instant) };
}

const SHORT_DAYS = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"] as const;

/**
 * Conflicts of a ring block on a mockup day (R-09-11): classes and other live blocks, labelled as
 * the calendar world labels them («dl 18:50 · B+C», «Petita bloquejada»).
 */
export function mockupBlockConflicts(
  ringId: string,
  date: string,
  range: { end: string; start: string },
): { from: string; id: string; label: string; to: string; type: string }[] {
  const ring = findRing(ringId)?.name ?? ringId;
  const day = SHORT_DAYS[weekdayOf(date)] ?? "";
  return [
    ...MOCKUP_CLASSES.filter(
      (item) => item.date === date && item.ringId === ringId && overlaps(range, item),
    ).map((item) => ({
      from: clubInstant(date, item.start),
      id: item.id,
      label: `${day} ${item.start.replace(/^0/u, "")} · ${item.description}`,
      to: clubInstant(date, item.end),
      type: "CLASS",
    })),
    ...trainingState.blocks
      .filter(
        (block) =>
          block.date === date &&
          block.state === "ACTIVE" &&
          block.ringId === ringId &&
          overlaps(range, { end: block.toLocal, start: block.fromLocal }),
      )
      .map((block) => ({
        from: block.from,
        id: block.id,
        label: `${ring} bloquejada`,
        to: block.to,
        type: "RING_BLOCK",
      })),
  ];
}

/** Live trainings of a ring overlapping a range (R-09-13 `RING_HAS_BOOKINGS`). */
export function trainingsOnRing(
  ringId: string,
  date: string,
  range: { end: string; start: string },
  now: number,
): StoredTraining[] {
  return visibleBookings(now).filter(
    (booking) =>
      booking.state === "ACTIVE" &&
      booking.ringId === ringId &&
      booking.date === date &&
      overlaps(range, { end: booking.end, start: booking.start }),
  );
}

type TrainingBookingListItem = components["schemas"]["TrainingBookingListItem"];

/**
 * `GET /training-bookings` (S09 §6, the ring-usage register of the back office): this world's
 * bookings on the mockup days and the calendar world's on any other day, whole items (the handler
 * applies `fields`). Only what exists already (`createdAt ≤ now`).
 */
export function trainingBookingListItems(now: number): Required<TrainingBookingListItem>[] {
  const ringName = (ringId: string) => findRing(ringId)?.name ?? ringId;
  const mockup = visibleBookings(now).map((booking) => ({
    createdAt: booking.createdAt,
    date: booking.date,
    dogId: booking.dogId,
    dogName: booking.dogName,
    endsAt: clubInstant(booking.date, booking.end),
    endsAtLocal: booking.end,
    id: booking.id,
    memberId: booking.memberId,
    memberName: booking.memberName,
    // The register reads it from the census (the handler, which knows the census ids).
    memberNumber: null,
    origin: booking.origin,
    ringId: booking.ringId,
    ringName: ringName(booking.ringId),
    startsAt: clubInstant(booking.date, booking.start),
    startsAtLocal: booking.start,
    state: booking.state,
  }));
  const calendar = planningState.trainingBookings
    .filter((booking) => !isMockupDay(booking.date))
    .map((booking) => ({
      createdAt: "2026-08-01T09:00:00Z",
      date: booking.date,
      dogId: `dog-${booking.dogName.toLowerCase()}`,
      dogName: booking.dogName,
      endsAt: booking.to,
      endsAtLocal: booking.toLocal,
      id: booking.id,
      memberId: `member-${(booking.memberName.split(" ")[0] ?? "").toLowerCase()}`,
      memberName: booking.memberName,
      memberNumber: null,
      origin: "APP" as const,
      ringId: booking.ringId,
      ringName: ringName(booking.ringId),
      startsAt: booking.from,
      startsAtLocal: booking.fromLocal,
      state: "ACTIVE" as const,
    }));
  return [...mockup, ...calendar];
}

/**
 * The block of the «Taller d'iniciació» of Thursday 6 (S07 R-07-11, the activity of the day-grid
 * world): its activity manages it, so the register offers no cancellation.
 */
export const ACTIVITY_RING_BLOCK: RingBlock = {
  activityId: "activity-taller-iniciacio",
  activityTitle: "Taller d'iniciació",
  createdByName: "Aina Serra",
  date: "2026-08-06",
  from: clubInstant("2026-08-06", "10:00"),
  fromLocal: "10:00",
  id: "rb-2026-08-06-1000-muntanya-activity",
  kind: "BLOCK",
  note: null,
  reason: "ACTIVITY",
  ringId: MUN,
  state: "ACTIVE",
  to: clubInstant("2026-08-06", "12:00"),
  toLocal: "12:00",
  version: 1,
};

/**
 * `GET /ring-blocks` (S06/S09 §6): every block of the club, this world's on the mockup days (and
 * the activity's), the calendar world's on any other day.
 */
export function ringBlockListItems(): RingBlock[] {
  return [
    ...trainingState.blocks,
    ACTIVITY_RING_BLOCK,
    ...planningState.blocks.filter((block) => !isMockupDay(block.date)),
  ];
}
