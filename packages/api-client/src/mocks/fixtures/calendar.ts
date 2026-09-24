import type { components } from "../../generated/schema";

import { addDays } from "./planning";

export type ClassSession = components["schemas"]["ClassSession"];
export type RingBlock = components["schemas"]["RingBlock"];
export type CancellationPreview = components["schemas"]["CancellationPreview"];
export type CancellationBooking = components["schemas"]["CancellationBooking"];

export const clubTimeZone = "Europe/Madrid";

function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const local = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return Math.round((local - instant) / 60_000);
}

/**
 * UTC instant of a club-local date + time (R-06-14), without milliseconds, with the api's
 * `ZonedDateTime.of` rules: first occurrence of an ambiguous time, a time in the gap moves forward.
 */
export function clubInstant(date: string, time: string, timeZone = clubTimeZone): string {
  const local = Date.parse(`${date}T${time}:00Z`);
  // Every offset the zone uses from wall − 26 h to wall + 26 h (hourly samples).
  const samples = Array.from({ length: 53 }, (_, hour) => {
    const instant = local + (hour - 26) * 3_600_000;
    return { instant, offset: zoneOffsetMinutes(instant, timeZone) };
  });
  const offsets = [...new Set(samples.map((sample) => sample.offset))];
  const valid = offsets
    .map((offset) => local - offset * 60_000)
    .filter((instant) => local - zoneOffsetMinutes(instant, timeZone) * 60_000 === instant);
  if (valid.length > 0) {
    return new Date(Math.min(...valid)).toISOString().replace(".000Z", "Z");
  }
  // Gap: the offset in force before the transition moves the wall time forward.
  const before =
    samples.filter((sample) => sample.instant + sample.offset * 60_000 < local).at(-1) ??
    samples[0];
  return new Date(local - (before?.offset ?? 0) * 60_000).toISOString().replace(".000Z", "Z");
}

/** Club-local `HH:mm` of an instant. */
export function clubLocalTime(instant: string, timeZone = clubTimeZone): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

/** Club-local `YYYY-MM-DD` of an instant. */
export function clubLocalDateOf(instant: string, timeZone = clubTimeZone): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date(instant));
}

// Catalog fixture ids (`catalogs.ts`).
const P = "level-p";
const A = "level-a";
const B = "level-b";
const C = "level-c";
const D = "level-d";
const E = "level-e";
const F = "level-f";
const G = "level-g";
const T = "level-t";

const MUN = "ring-muntanya";
const CEN = "ring-central";
const CAR = "ring-carretera";
const CAD = "ring-cadells";
const PET = "ring-petita";

const LAURA = "instructor-laura";
const MARC = "instructor-marc";
const ANNA = "instructor-anna";

interface SessionSpec {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  start: string;
  end: string;
  ring: string | null;
  levels: readonly string[];
  instructor: string;
  display: string;
  capacity: number;
  booked?: number;
  waiting?: number;
  description?: string;
  state?: ClassSession["state"];
  cancellation?: ClassSession["cancellation"];
}

const band = {
  "08:30": "09:30",
  "09:30": "10:30",
  "17:40": "18:40",
  "18:50": "19:50",
  "20:00": "21:00",
} as const;

type Start = keyof typeof band;

function spec(
  day: number,
  start: Start,
  ring: string | null,
  levels: readonly string[],
  instructor: string,
  display: string,
  capacity: number,
  extra: Partial<SessionSpec> = {},
): SessionSpec {
  return { capacity, day, display, end: band[start], instructor, levels, ring, start, ...extra };
}

export interface SessionInput {
  capacity: number;
  capacityMode: ClassSession["capacityMode"];
  date: string;
  description: string | null;
  displayDescription: string;
  endTime: string;
  id: string;
  instructorIds: string[];
  levelIds: string[];
  origin?: ClassSession["origin"];
  ringId: string | null;
  startTime: string;
  state: ClassSession["state"];
  weekId: string;
  booked?: number;
  cancellation?: ClassSession["cancellation"];
  waiting?: number;
}

/** A `ClassSession` with its derived instants (R-06-14); `inconsistencyIds` are filled on read. */
export function classSession(input: SessionInput): ClassSession {
  return {
    atRisk: false,
    cancellation: input.cancellation ?? null,
    capacity: input.capacity,
    capacityMode: input.capacityMode,
    counters: { booked: input.booked ?? 0, waiting: input.waiting ?? 0 },
    date: input.date,
    description: input.description,
    displayDescription: input.displayDescription,
    endTime: input.endTime,
    endsAt: clubInstant(input.date, input.endTime),
    id: input.id,
    inconsistencyIds: [],
    instructorIds: input.instructorIds,
    levelIds: input.levelIds,
    notes: null,
    origin: input.origin ?? null,
    ringId: input.ringId,
    riskExempt: false,
    startTime: input.startTime,
    startsAt: clubInstant(input.date, input.startTime),
    state: input.state,
    version: 1,
    weekId: input.weekId,
  };
}

function sessionsOf(
  monday: string,
  specs: readonly SessionSpec[],
  defaultState: ClassSession["state"],
): ClassSession[] {
  const used = new Map<string, number>();
  return specs.map((item) => {
    const date = addDays(monday, item.day);
    const slot = `cls-${date}-${item.start.replace(":", "")}`;
    const index = used.get(slot) ?? 0;
    used.set(slot, index + 1);
    return classSession({
      booked: item.booked ?? 0,
      capacity: item.capacity,
      capacityMode: item.description === undefined ? "AUTO" : "MANUAL",
      date,
      description: item.description ?? null,
      displayDescription: item.display,
      endTime: item.end,
      id: `${slot}-${String(index)}`,
      instructorIds: [item.instructor],
      levelIds: [...item.levels],
      ringId: item.ring,
      startTime: item.start,
      state: item.state ?? defaultState,
      waiting: item.waiting ?? 0,
      weekId: `week-${monday}`,
      ...(item.cancellation === undefined ? {} : { cancellation: item.cancellation }),
    });
  });
}

const ABOVE_C = [C, D, E, F, G] as const;

/**
 * D4 mockup week (validated, current): Monday classes already finished, the Wednesday 9:30
 * «Cadells» cancelled by the 7:30 review, the Wednesday 18:50 «B+C» with 4 booked + 2 waiting and
 * the Thursday 18:50 instructor double booking (Marc on Cadells and Petita).
 */
function activeSpecs(monday: string): SessionSpec[] {
  const finished = { state: "FINISHED" as const };
  return [
    spec(0, "08:30", CEN, [A, B], LAURA, "A+B", 5, { ...finished, booked: 4 }),
    spec(0, "08:30", MUN, ABOVE_C, MARC, "C i sup.", 5, { ...finished, booked: 3 }),
    spec(0, "17:40", PET, [T], LAURA, "Teràpia", 1, {
      ...finished,
      booked: 1,
      description: "Teràpia",
    }),
    spec(0, "18:50", CEN, [B, C], MARC, "B+C", 5, { ...finished, booked: 5, waiting: 2 }),
    spec(0, "18:50", CAD, [P], ANNA, "Cadells", 5, { ...finished, booked: 2 }),
    spec(1, "17:40", CAR, [D, E], MARC, "D+E", 5, { booked: 4 }),
    spec(1, "18:50", CEN, [A, B], LAURA, "A+B", 5, { booked: 3 }),
    spec(2, "08:30", CEN, [A, B], LAURA, "A+B", 5, { booked: 5, waiting: 1 }),
    spec(2, "08:30", MUN, ABOVE_C, MARC, "C i sup.", 5, { booked: 4 }),
    spec(2, "09:30", CAD, [P], ANNA, "Cadells", 5, {
      cancellation: {
        adminText: null,
        affectedBookings: 1,
        affectedWaitlist: 0,
        at: `${addDays(monday, 2)}T05:30:00Z`,
        byAccountId: "system",
        reason: "RISK_REVIEW",
      },
      state: "CANCELLED",
    }),
    spec(2, "18:50", CEN, [B, C], MARC, "B+C", 5, { booked: 4, waiting: 2 }),
    spec(2, "18:50", PET, [T], ANNA, "Teràpia", 1, { booked: 1, description: "Teràpia" }),
    spec(3, "17:40", CAR, [D, E], MARC, "D+E", 5, { booked: 2 }),
    spec(3, "18:50", CAD, [P], MARC, "Cadells", 5, { booked: 2 }),
    spec(3, "18:50", PET, [C], MARC, "Particular", 1, { booked: 1, description: "Particular" }),
    spec(4, "08:30", CAD, [P], MARC, "Cadells", 5, { booked: 3 }),
    spec(4, "17:40", PET, [C], LAURA, "Particular", 1, { booked: 1, description: "Particular" }),
    spec(4, "18:50", CEN, [A, B], LAURA, "A+B", 5, { booked: 4 }),
    spec(5, "08:30", MUN, [A], LAURA, "A", 5, { booked: 3 }),
    spec(5, "08:30", CEN, [B, C], MARC, "B+C", 5, { booked: 4 }),
    spec(5, "09:30", CEN, [B, C], LAURA, "B+C", 5, { booked: 2 }),
    spec(5, "09:30", CAD, [P], MARC, "Cadells", 5, { booked: 3 }),
  ];
}

/** D4b mockup week (generated, next): the 21 drawn drafts + 7 at 20:00 = the 28 of the card. */
function draftSpecs(): SessionSpec[] {
  return [
    spec(0, "08:30", CEN, [A, B], LAURA, "A+B", 5),
    spec(0, "08:30", MUN, ABOVE_C, MARC, "C i sup.", 5),
    spec(0, "17:40", PET, [T], LAURA, "Teràpia", 1, { description: "Teràpia" }),
    spec(0, "18:50", CEN, [B, C], MARC, "B+C", 5),
    spec(0, "18:50", CAD, [P], ANNA, "Cadells", 5),
    spec(0, "20:00", MUN, [B, C], MARC, "B+C", 5),
    spec(0, "20:00", CEN, [F, G], ANNA, "F i sup.", 4),
    spec(1, "08:30", CEN, [F, G], LAURA, "F i sup.", 4),
    spec(1, "17:40", CAR, [D, E], MARC, "D+E", 5),
    spec(1, "18:50", CEN, [A, B], LAURA, "A+B", 5),
    spec(1, "20:00", PET, [A, B], LAURA, "A+B", 5),
    spec(1, "20:00", MUN, [B, C], MARC, "B+C", 5),
    spec(2, "08:30", CEN, [A, B], LAURA, "A+B", 5),
    spec(2, "08:30", MUN, ABOVE_C, MARC, "C i sup.", 5),
    spec(2, "09:30", CAD, [P], ANNA, "Cadells", 5),
    spec(2, "18:50", CEN, [B, C], MARC, "B+C", 5),
    spec(2, "18:50", PET, [T], ANNA, "Teràpia", 1, { description: "Teràpia" }),
    spec(2, "20:00", CEN, [B, C], MARC, "B+C", 5),
    spec(2, "20:00", CAR, [F, G], ANNA, "F i sup.", 4),
    spec(3, "17:40", CAR, [D, E], MARC, "D+E", 5),
    spec(3, "18:50", CAD, [P], MARC, "Cadells", 5),
    spec(3, "20:00", MUN, [D, E], LAURA, "D+E", 5),
    spec(4, "08:30", CAD, [P], MARC, "Cadells", 5),
    spec(4, "18:50", CEN, [A, B], LAURA, "A+B", 5),
    spec(5, "08:30", MUN, [A], LAURA, "A", 5),
    spec(5, "08:30", CEN, [B, C], MARC, "B+C", 5),
    spec(5, "09:30", CEN, [B, C], LAURA, "B+C", 5),
    spec(5, "09:30", CAD, [P], MARC, "Cadells", 5),
  ];
}

/** Third week (generated): two drafts on Central on Monday 18:50 → `canValidate: false`. */
function inconsistentSpecs(): SessionSpec[] {
  return [
    spec(0, "18:50", CEN, [B, C], MARC, "B+C", 5),
    spec(0, "18:50", CEN, [A, B], LAURA, "A+B", 5),
    spec(1, "08:30", CEN, [A, B], LAURA, "A+B", 5),
    spec(2, "18:50", CAD, [P], ANNA, "Cadells", 5),
    spec(3, "17:40", CAR, [D, E], MARC, "D+E", 5),
    spec(4, "18:50", CEN, [A, B], LAURA, "A+B", 5),
  ];
}

/** Class sessions of the three calendar weeks, relative to the club-local current Monday. */
export function initialClassSessions(currentMonday: string): ClassSession[] {
  return [
    ...sessionsOf(currentMonday, activeSpecs(currentMonday), "ACTIVE"),
    ...sessionsOf(addDays(currentMonday, 7), draftSpecs(), "DRAFT"),
    ...sessionsOf(addDays(currentMonday, 14), inconsistentSpecs(), "DRAFT"),
  ];
}

/** The D4 «Carretera bloquejada · manteniment 16:00–18:00» of the current Wednesday. */
export function initialRingBlocks(currentMonday: string): RingBlock[] {
  const date = addDays(currentMonday, 2);
  return [
    {
      activityId: null,
      activityTitle: null,
      createdByName: "Marc",
      date,
      from: clubInstant(date, "16:00"),
      fromLocal: "16:00",
      id: `block-${date}-carretera`,
      kind: "BLOCK",
      note: null,
      reason: "MAINTENANCE",
      ringId: CAR,
      state: "ACTIVE",
      to: clubInstant(date, "18:00"),
      toLocal: "18:00",
      version: 1,
    },
  ];
}

/**
 * A live training booking (S09) the calendar does not draw: moving a class or a block onto it
 * answers `RING_HAS_BOOKINGS` until the admin sends `cancelBookings: true` (R-06-05, R-06-11).
 */
export interface MockTrainingBooking {
  date: string;
  dogName: string;
  from: string;
  fromLocal: string;
  id: string;
  memberName: string;
  ringId: string;
  to: string;
  toLocal: string;
}

/** «Clara Font + Trevi» trains on Muntanya on the current Wednesday, 19:00–20:00. */
export function initialTrainingBookings(currentMonday: string): MockTrainingBooking[] {
  const date = addDays(currentMonday, 2);
  return [
    {
      date,
      dogName: "Trevi",
      from: clubInstant(date, "19:00"),
      fromLocal: "19:00",
      id: `training-${date}-muntanya`,
      memberName: "Clara Font",
      ringId: MUN,
      to: clubInstant(date, "20:00"),
      toLocal: "20:00",
    },
  ];
}

const allChannels = ["APP", "EMAIL", "SMS"];

/** Fictional census people (`census.ts`). */
const previewPeople: readonly (readonly [member: string, dog: string, level: string])[] = [
  ["Laura Serra", "Duna", "C"],
  ["Marc Prats", "Chun-li", "B"],
  ["Aina Roca", "Nass", "B"],
  ["Biel Puig", "Thai", "C"],
  ["Clara Font", "Trevi", "A"],
  ["Dídac Vila", "Bruc", "D"],
];

/** D4c preview: the registrants of the class (one row per booked dog) and the waitlist count. */
export function cancellationPreviewFor(session: ClassSession): CancellationPreview {
  return {
    bookings: Array.from({ length: session.counters.booked }, (_, index) => {
      const [memberName, dogName, levelName] = previewPeople[index % previewPeople.length] ??
        previewPeople[0] ?? ["", "", ""];
      return {
        bookingId: `booking-${session.id}-${String(index)}`,
        channels: allChannels,
        dogName,
        levelName,
        memberName,
        phoneCount: index === 0 ? 2 : 1,
      };
    }),
    waitlistCount: session.counters.waiting,
  };
}
