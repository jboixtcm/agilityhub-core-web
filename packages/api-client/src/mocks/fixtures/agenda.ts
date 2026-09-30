import type { components } from "../../generated/schema";

import type { StoredClass } from "./attendance";
import { censusDogs } from "./census";

type AttendanceRow = components["schemas"]["AttendanceRow"];
type AttendanceState = AttendanceRow["state"];
type SheetWaitlistEntry = components["schemas"]["SheetWaitlistEntry"];
type RingBlockReason = NonNullable<components["schemas"]["WeekCell"]["reason"]>;

/**
 * The S10 world of D12 (E6-W03): the week of Monday 10 August 2026 drawn in mockup D12, read on
 * Monday 10 at 19:30 club-local — the 18:50 «B i C» of Marc is under way and selected, the morning
 * classes are passed or pending, the rest of the week is still ahead. Fictional people only.
 */
export const AGENDA_MOCK_NOW = "2026-08-10T19:30:00+02:00";
export const AGENDA_WEEK_START = "2026-08-10";
/** Mockup D12's selected class (dl 10 · 18:50 · B i C · Central · Marc). */
export const AGENDA_SELECTED_CLASS_ID = "c-0810-1850-bc";

const CENTRAL = "ring-central";
const MUNTANYA = "ring-muntanya";
const CARRETERA = "ring-carretera";
const CADELLS = "ring-cadells";
const PETITA = "ring-petita";

const ESTEL = "instructor-estel";
const MARC = "instructor-marc";
const NURIA = "instructor-nuria";

/** A free-training booking of the week (S09), as `TrainingOccupancyService` gives it to D12. */
export interface AgendaTraining {
  date: string;
  endTime: string;
  id: string;
  ringId: string;
  time: string;
  /** «{guia} + {gos}», formatted by the api. */
  who: string;
}

/** Mockup D12's trainings: half a row each (`training.slotMinutes` = 30). */
export const AGENDA_TRAININGS: readonly AgendaTraining[] = [
  {
    date: "2026-08-10",
    endTime: "08:30",
    id: "tb-0810-0800",
    ringId: MUNTANYA,
    time: "08:00",
    who: "Pau + Blat",
  },
  {
    date: "2026-08-10",
    endTime: "19:30",
    id: "tb-0810-1900",
    ringId: CARRETERA,
    time: "19:00",
    who: "Sergio + Thai",
  },
  {
    date: "2026-08-12",
    endTime: "09:00",
    id: "tb-0812-0830",
    ringId: CARRETERA,
    time: "08:30",
    who: "Júlia + Kira",
  },
];

/** A ring block of the week, as D12 shows it (S09 R-09-12). */
export interface AgendaBlock {
  createdByName: string;
  date: string;
  endTime: string;
  id: string;
  note: string | null;
  reason: RingBlockReason;
  ringId: string;
  time: string;
}

/** Mockup D12's block: «16:00–18:00 Bloqueig · Carretera — manteniment» on Wednesday 12. */
export const AGENDA_BLOCKS: readonly AgendaBlock[] = [
  {
    createdByName: "Marc",
    date: "2026-08-12",
    endTime: "18:00",
    id: "rb-0812-1600-carretera",
    note: "regar i repassar el terra",
    reason: "MAINTENANCE",
    ringId: CARRETERA,
    time: "16:00",
  },
];

function row(
  bookingId: string,
  dog: [id: string, name: string],
  member: [id: string, firstName: string],
  level: string,
  state: AttendanceState = "PENDING",
): AttendanceRow {
  return {
    bookingId,
    dogId: dog[0],
    dogName: dog[1],
    dogPhotoUrl: null,
    final: false,
    handlerName: null,
    levelCode: level,
    markedAt: state === "PENDING" ? null : "2026-08-10T07:05:00Z",
    markedByName: state === "PENDING" ? null : "Estel",
    memberFirstName: member[1],
    memberId: member[0],
    noShowNotice: null,
    notice: null,
    pendingTasksCount: 0,
    state,
  };
}

function waiting(entryId: string, member: string, dog: string, level: string): SheetWaitlistEntry {
  return {
    dogName: dog,
    entryId,
    handlerName: null,
    joinedAt: "2026-08-09T18:00:00Z",
    levelCode: level,
    memberFirstName: member,
    state: "ACTIVE",
  };
}

/** Other dogs of the club (the census's), to fill the classes the mockup only counts. */
const POOL = censusDogs
  .filter((dog) => dog.id.startsWith("dog-generated-"))
  .slice(0, 80)
  .map((dog) => ({
    dog: [dog.id, dog.name] as [string, string],
    level: dog.level?.code ?? "B",
    member: [dog.owner.id, dog.owner.fullName.split(" ")[0] ?? ""] as [string, string],
  }));

interface ClassSpec {
  capacity: number;
  /** How many of the rows are marked: all present (a done sheet), the first one, or none. */
  marked: "all" | "first" | "none";
  booked: number;
  date: string;
  description: string;
  endTime: string;
  id: string;
  instructorId: string;
  /** A second instructor, shown only with `classes.maxInstructorsPerClass > 1` (R-10-16). */
  coInstructorId?: string;
  ringId: string;
  startTime: string;
  state?: "ACTIVE" | "CANCELLED";
  waiting: number;
}

/** Mockup D12's other classes, plus a cancelled one (dt 11 8:30). */
const SPECS: readonly ClassSpec[] = [
  {
    booked: 4,
    capacity: 5,
    date: "2026-08-10",
    description: "A i B",
    endTime: "09:30",
    id: "c-0810-0830-ab",
    instructorId: ESTEL,
    marked: "all",
    ringId: CENTRAL,
    startTime: "08:30",
    waiting: 0,
  },
  {
    booked: 3,
    capacity: 5,
    date: "2026-08-10",
    description: "C i sup.",
    endTime: "09:30",
    id: "c-0810-0830-csup",
    instructorId: MARC,
    marked: "first",
    ringId: MUNTANYA,
    startTime: "08:30",
    waiting: 0,
  },
  {
    booked: 2,
    capacity: 5,
    date: "2026-08-10",
    description: "Cadells",
    endTime: "19:50",
    id: "c-0810-1850-cadells",
    instructorId: NURIA,
    marked: "all",
    ringId: CADELLS,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 0,
    capacity: 5,
    date: "2026-08-11",
    description: "C i sup.",
    endTime: "09:30",
    id: "c-0811-0830-csup",
    instructorId: MARC,
    marked: "none",
    ringId: MUNTANYA,
    startTime: "08:30",
    state: "CANCELLED",
    waiting: 0,
  },
  {
    booked: 3,
    capacity: 5,
    date: "2026-08-11",
    description: "A i B",
    endTime: "19:50",
    id: "c-0811-1850-ab",
    instructorId: ESTEL,
    marked: "none",
    ringId: CENTRAL,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 5,
    capacity: 5,
    date: "2026-08-12",
    description: "A i B",
    endTime: "09:30",
    id: "c-0812-0830-ab",
    instructorId: ESTEL,
    marked: "none",
    ringId: CENTRAL,
    startTime: "08:30",
    waiting: 1,
  },
  {
    booked: 4,
    capacity: 5,
    date: "2026-08-12",
    description: "C i sup.",
    endTime: "09:30",
    id: "c-0812-0830-csup",
    instructorId: MARC,
    marked: "none",
    ringId: MUNTANYA,
    startTime: "08:30",
    waiting: 0,
  },
  {
    booked: 4,
    capacity: 5,
    date: "2026-08-12",
    description: "B i C",
    endTime: "19:50",
    id: "c-0812-1850-bc",
    instructorId: MARC,
    marked: "none",
    ringId: CENTRAL,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 1,
    capacity: 1,
    date: "2026-08-12",
    description: "Teràpia",
    endTime: "19:50",
    id: "c-0812-1850-terapia",
    instructorId: NURIA,
    marked: "none",
    ringId: PETITA,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 2,
    capacity: 5,
    date: "2026-08-13",
    description: "Cadells",
    endTime: "19:50",
    id: "c-0813-1850-cadells",
    instructorId: MARC,
    marked: "none",
    ringId: CADELLS,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 1,
    capacity: 1,
    date: "2026-08-13",
    description: "Particular",
    endTime: "19:50",
    id: "c-0813-1850-particular",
    instructorId: ESTEL,
    marked: "none",
    ringId: PETITA,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 3,
    capacity: 5,
    date: "2026-08-14",
    description: "Cadells",
    endTime: "09:30",
    id: "c-0814-0830-cadells",
    instructorId: MARC,
    marked: "none",
    ringId: CADELLS,
    startTime: "08:30",
    waiting: 0,
  },
  {
    booked: 4,
    capacity: 5,
    date: "2026-08-14",
    description: "A i B",
    endTime: "19:50",
    id: "c-0814-1850-ab",
    instructorId: ESTEL,
    marked: "none",
    ringId: CENTRAL,
    startTime: "18:50",
    waiting: 0,
  },
  {
    booked: 5,
    capacity: 5,
    date: "2026-08-15",
    description: "A",
    endTime: "09:30",
    id: "c-0815-0830-a",
    instructorId: ESTEL,
    marked: "none",
    ringId: MUNTANYA,
    startTime: "08:30",
    waiting: 0,
  },
  {
    booked: 5,
    capacity: 5,
    coInstructorId: ESTEL,
    date: "2026-08-15",
    description: "B i C",
    endTime: "09:30",
    id: "c-0815-0830-bc",
    instructorId: MARC,
    marked: "none",
    ringId: CENTRAL,
    startTime: "08:30",
    waiting: 3,
  },
];

/** Mockup D12's selected class: its five rows and two waiting entries, in the mockup's order. */
function selectedClass(): StoredClass {
  const laura = {
    ...row("b-d12-1", ["dog-duna", "Duna"], ["member-laura", "Laura"], "C", "PRESENT"),
    pendingTasksCount: 2,
  };
  const marc = row("b-d12-2", ["dog-chun-li", "Chun-li"], ["member-marc", "Marc"], "B", "PRESENT");
  // Anna called 25 minutes before: late (R-10-05's 240-minute threshold) and too close to the class
  // to notify the waiting list (30 minutes), so the line reads «ha avisat — plaça alliberada».
  const anna: AttendanceRow = {
    ...row("b-d12-3", ["dog-nass", "Nass"], ["member-anna", "Anna"], "B", "NOTIFIED"),
    final: true,
    markedAt: "2026-08-10T16:25:00Z",
    markedByName: "Marc",
    notice: {
      afterClassEnd: false,
      at: "2026-08-10T16:25:00Z",
      atLocal: "18:25",
      bookingState: "CANCELLED_LATE",
      late: true,
      minutesBefore: 25,
      seatReleased: true,
      waitlistNotified: false,
    },
  };
  const eva: AttendanceRow = {
    ...row("b-d12-4", ["dog-fish", "Fish"], ["member-eva", "Eva"], "B", "NO_SHOW"),
    noShowNotice: { queuedAt: null, scheduledFor: "2026-08-11T06:00:00Z", sentAt: null },
  };
  const pau = row("b-d12-5", ["dog-blat", "Blat"], ["member-pau", "Pau"], "C");
  return {
    capacity: 5,
    closed: false,
    date: "2026-08-10",
    displayDescription: "B i C",
    endTime: "19:50",
    id: AGENDA_SELECTED_CLASS_ID,
    instructorId: MARC,
    notOpen: false,
    ringId: CENTRAL,
    rows: [laura, marc, anna, eva, pau],
    savedAt: "2026-08-10T17:05:00Z",
    savedByName: "Marc",
    startTime: "18:50",
    state: "ACTIVE",
    version: 3,
    waitlist: [waiting("w-d12-1", "Júlia", "Kira", "C"), waiting("w-d12-2", "Roser", "Lluna", "B")],
  };
}

/** The classes of D12's week, fresh (the attendance world appends them to its own). */
export function agendaWeekClasses(): StoredClass[] {
  let next = 0;
  const take = () => {
    const entry = POOL[next % POOL.length];
    next += 1;
    if (entry === undefined) throw new RangeError("The agenda pool is empty");
    return entry;
  };
  const built = SPECS.map((spec): StoredClass => {
    const rows = Array.from({ length: spec.booked }, (_, index) => {
      const entry = take();
      const state: AttendanceState =
        spec.marked === "all" || (spec.marked === "first" && index === 0) ? "PRESENT" : "PENDING";
      return row(`b-${spec.id}-${String(index + 1)}`, entry.dog, entry.member, entry.level, state);
    });
    const waitlist = Array.from({ length: spec.waiting }, (_, index) => {
      const entry = take();
      return waiting(
        `w-${spec.id}-${String(index + 1)}`,
        entry.member[1],
        entry.dog[1],
        entry.level,
      );
    });
    return {
      capacity: spec.capacity,
      closed: false,
      ...(spec.coInstructorId === undefined ? {} : { coInstructorIds: [spec.coInstructorId] }),
      date: spec.date,
      displayDescription: spec.description,
      endTime: spec.endTime,
      id: spec.id,
      instructorId: spec.instructorId,
      // Before T0 (00:00 of the class date) as the world reads it on Monday 10 (R-10-03).
      notOpen: spec.date > AGENDA_WEEK_START,
      ringId: spec.ringId,
      rows,
      savedAt: spec.marked === "none" ? null : "2026-08-10T07:05:00Z",
      savedByName: spec.marked === "none" ? null : "Estel",
      startTime: spec.startTime,
      state: spec.state ?? "ACTIVE",
      version: spec.marked === "none" ? 0 : 1,
      waitlist,
    };
  });
  return [selectedClass(), ...built];
}
