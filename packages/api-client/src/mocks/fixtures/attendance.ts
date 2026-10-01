import type { components } from "../../generated/schema";

import {
  AGENDA_BLOCKS,
  AGENDA_SELECTED_CLASS_ID,
  AGENDA_TRAININGS,
  agendaWeekClasses,
} from "./agenda";
import { clubInstant, clubLocalDateOf, clubLocalTime } from "./calendar";
import { catalogState } from "./catalogs";
import { censusDogs } from "./census";
import { instructorNoteAttachments, observationsBlock, tasksBlock } from "./followup";
import { ringBlockListItems, trainingParameters } from "./training";

type AttendanceRow = components["schemas"]["AttendanceRow"];
type AttendanceSheet = components["schemas"]["AttendanceSheet"];
type AttendanceState = AttendanceRow["state"];
type DayRingBlock = components["schemas"]["DayRingBlock"];
type InstructorCard = components["schemas"]["InstructorCard"];
type InstructorDay = components["schemas"]["InstructorDay"];
type InstructorDayClass = components["schemas"]["InstructorDayClass"];
type RingRef = components["schemas"]["RingRef"];
type SheetWaitlistEntry = components["schemas"]["SheetWaitlistEntry"];

/**
 * The S10 world of screens 20, 21 and 22 is drawn at Monday 3 August 2026, 8:50 club-local: the
 * 8:30 class of mockup 21 is under way, Laura and Eva are marked and Anna called the day before.
 */
export const ATTENDANCE_MOCK_NOW = "2026-08-03T08:50:00+02:00";
export const ATTENDANCE_MOCK_DAY = "2026-08-03";

/** The instructors of mockup 20 (fictional first names). */
export const ATTENDANCE_INSTRUCTORS = [
  { id: "instructor-estel", shortName: "Estel" },
  { id: "instructor-marc", shortName: "Marc" },
  { id: "instructor-nuria", shortName: "Núria" },
] as const;

/** In this world the `instructor` scenario's account is Estel's profile (mockup 20: «Estel ▾»). */
export const OWN_INSTRUCTOR_ID = "instructor-estel";

/**
 * Club-wide variants of the world (one per scenario): the window already closed (read after T1,
 * R-10-03's «dc 5 a les 9:00»), `bookings.instructorLastMinuteNotice = false`, `waitlist.mode =
 * FIFO`, and another instructor saving the 8:30 sheet just before the caller (R-10-04's 409).
 */
export type AttendanceVariant = "closed" | "fifo" | "noticeDisabled" | "stale";

export interface StoredClass {
  capacity: number;
  /** Past T1 on the day it is drawn for (the closed day of 20). */
  closed: boolean;
  /** Other instructors of the class, shown with `classes.maxInstructorsPerClass > 1` (R-10-16). */
  coInstructorIds?: string[];
  date: string;
  displayDescription: string;
  endTime: string;
  id: string;
  instructorId: string;
  /** Before T0 as the §6 example draws it (`attendance.status = NONE`). */
  notOpen: boolean;
  ringId: string | null;
  rows: AttendanceRow[];
  savedAt: string | null;
  savedByName: string | null;
  startTime: string;
  state: "ACTIVE" | "CANCELLED" | "FINISHED";
  version: number;
  waitlist: SheetWaitlistEntry[];
}

const CENTRAL = "ring-central";
const PETITA = "ring-petita";
const CARRETERA = "ring-carretera";

/** A fictional dog photo (an inline SVG), served as a signed URL would be. */
const DUNA_PHOTO = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='tan'/><circle cx='60' cy='58' r='30' fill='saddlebrown'/><circle cx='50' cy='52' r='4' fill='black'/><circle cx='70' cy='52' r='4' fill='black'/><ellipse cx='60' cy='66' rx='7' ry='5' fill='black'/></svg>",
)}`;

interface RowSpec {
  bookingId: string;
  dog: [id: string, name: string];
  handlerName?: string;
  level: string;
  member: [id: string, firstName: string, fullName: string];
  photo?: string;
  state?: AttendanceState;
  tasks?: number;
}

function row(spec: RowSpec): AttendanceRow {
  return {
    bookingId: spec.bookingId,
    dogId: spec.dog[0],
    dogName: spec.dog[1],
    dogPhotoUrl: spec.photo ?? null,
    final: false,
    handlerName: spec.handlerName ?? null,
    levelCode: spec.level,
    markedAt: null,
    markedByName: null,
    memberFirstName: spec.member[1],
    ...(spec.handlerName === undefined ? {} : { memberFullName: spec.member[2] }),
    memberId: spec.member[0],
    noShowNotice: null,
    notice: null,
    pendingTasksCount: spec.tasks ?? 0,
    state: spec.state ?? "PENDING",
  };
}

const LAURA = ["member-laura", "Laura", "Laura Serra Vidal"] as [string, string, string];
const MARC = ["member-marc", "Marc", "Marc Prats García"] as [string, string, string];
const ANNA = ["member-anna", "Anna", "Anna Ballart Consul"] as [string, string, string];
const EVA = ["member-eva", "Eva", "Eva Perez Prunell"] as [string, string, string];
const SERGIO = ["member-sergio", "Sergio", "Sergio Gimenez Casado"] as [string, string, string];
const MONTSE = ["member-montse", "Montse", "Montse Tresserra Casas"] as [string, string, string];

function entry(
  entryId: string,
  memberFirstName: string,
  dogName: string,
  levelCode: string,
  joinedAt: string,
): SheetWaitlistEntry {
  return {
    dogName,
    entryId,
    handlerName: null,
    joinedAt,
    levelCode,
    memberFirstName,
    state: "ACTIVE",
  };
}

function initialClasses(): StoredClass[] {
  const base = { capacity: 5, closed: false, notOpen: false, savedAt: null, savedByName: null };
  return [
    // Mockups 20 and 21 (S10 §6 example): the 8:30 «A+B» on Central.
    {
      ...base,
      date: "2026-08-03",
      displayDescription: "A+B",
      endTime: "09:30",
      id: "c1",
      instructorId: "instructor-estel",
      ringId: CENTRAL,
      rows: [
        {
          ...row({
            bookingId: "b1",
            dog: ["dog-duna", "Duna"],
            level: "C",
            member: LAURA,
            photo: DUNA_PHOTO,
            state: "PRESENT",
            tasks: 2,
          }),
          markedAt: "2026-08-03T06:41:10Z",
          markedByName: "Estel",
        },
        row({ bookingId: "b2", dog: ["dog-chun-li", "Chun-li"], level: "A", member: MARC }),
        {
          ...row({
            bookingId: "b3",
            dog: ["dog-nass", "Nass"],
            level: "B",
            member: ANNA,
            state: "NOTIFIED",
          }),
          final: true,
          markedAt: "2026-08-02T10:40:00Z",
          markedByName: "Estel",
          notice: {
            afterClassEnd: false,
            at: "2026-08-02T10:40:00Z",
            atLocal: "12:40",
            bookingState: "CANCELLED",
            late: false,
            minutesBefore: 1190,
            seatReleased: true,
            waitlistNotified: true,
          },
        },
        {
          ...row({
            bookingId: "b4",
            dog: ["dog-fish", "Fish"],
            level: "B",
            member: EVA,
            state: "NO_SHOW",
          }),
          markedAt: "2026-08-03T06:41:10Z",
          markedByName: "Estel",
          noShowNotice: { queuedAt: null, scheduledFor: "2026-08-04T06:00:00Z", sentAt: null },
        },
      ],
      savedAt: "2026-08-03T06:41:10Z",
      savedByName: "Estel",
      startTime: "08:30",
      state: "ACTIVE",
      version: 4,
      waitlist: [entry("w1", "Pau", "Blat", "B", "2026-08-02T19:04:00Z")],
    },
    // Mockup 20: «Teràpia» on Petita, individual, one waiting, not open yet (§6: `NONE`).
    {
      ...base,
      capacity: 1,
      date: "2026-08-03",
      displayDescription: "Teràpia",
      endTime: "18:40",
      id: "c2",
      instructorId: "instructor-estel",
      notOpen: true,
      ringId: PETITA,
      rows: [row({ bookingId: "b21", dog: ["dog-thai", "Thai"], level: "E", member: SERGIO })],
      startTime: "17:40",
      state: "ACTIVE",
      version: 0,
      waitlist: [entry("w21", "Montse", "Trevi", "D", "2026-08-01T16:30:00Z")],
    },
    // Mockup 20: the 18:50 «A+B», full with two waiting; Rock comes with his guide (R-10-00).
    {
      ...base,
      date: "2026-08-03",
      displayDescription: "A+B",
      endTime: "19:50",
      id: "c3",
      instructorId: "instructor-estel",
      notOpen: true,
      ringId: CENTRAL,
      rows: [
        row({
          bookingId: "b31",
          dog: ["dog-rock", "Rock"],
          handlerName: "Júlia Roca",
          level: "D",
          member: LAURA,
        }),
        row({ bookingId: "b32", dog: ["dog-thai", "Thai"], level: "E", member: SERGIO }),
        row({ bookingId: "b33", dog: ["dog-trevi", "Trevi"], level: "D", member: MONTSE }),
        row({ bookingId: "b34", dog: ["dog-nass", "Nass"], level: "B", member: ANNA }),
        row({ bookingId: "b35", dog: ["dog-fish", "Fish"], level: "B", member: EVA }),
      ],
      startTime: "18:50",
      state: "ACTIVE",
      version: 0,
      waitlist: [
        entry("w31", "Pau", "Blat", "B", "2026-08-02T19:04:00Z"),
        entry("w32", "Clara", "Gala", "B", "2026-08-03T06:20:00Z"),
      ],
    },
    // Marc's day: switching the instructor chip shows his class.
    {
      ...base,
      date: "2026-08-03",
      displayDescription: "C+D",
      endTime: "11:00",
      id: "c6",
      instructorId: "instructor-marc",
      ringId: CARRETERA,
      rows: [row({ bookingId: "b61", dog: ["dog-trevi", "Trevi"], level: "D", member: MONTSE })],
      startTime: "10:00",
      state: "ACTIVE",
      version: 0,
      waitlist: [],
    },
    // Tuesday 4: the club cancelled the 8:30 (21's banner); Laura had called before (NOTIFIED).
    {
      ...base,
      date: "2026-08-04",
      displayDescription: "A+B",
      endTime: "09:30",
      id: "c4",
      instructorId: "instructor-estel",
      notOpen: true,
      ringId: CENTRAL,
      rows: [
        {
          ...row({
            bookingId: "b41",
            dog: ["dog-duna", "Duna"],
            level: "C",
            member: LAURA,
            photo: DUNA_PHOTO,
            state: "NOTIFIED",
          }),
          final: true,
          markedAt: "2026-08-03T06:00:00Z",
          markedByName: "Estel",
          notice: {
            afterClassEnd: false,
            at: "2026-08-03T06:00:00Z",
            atLocal: "08:00",
            bookingState: "CANCELLED",
            late: false,
            minutesBefore: 1470,
            seatReleased: true,
            waitlistNotified: false,
          },
        },
      ],
      savedAt: "2026-08-03T06:00:00Z",
      savedByName: "Estel",
      startTime: "08:30",
      state: "CANCELLED",
      version: 1,
      waitlist: [],
    },
    {
      ...base,
      date: "2026-08-04",
      displayDescription: "A+B",
      endTime: "19:50",
      id: "c5",
      instructorId: "instructor-estel",
      notOpen: true,
      ringId: CENTRAL,
      rows: [
        row({ bookingId: "b51", dog: ["dog-chun-li", "Chun-li"], level: "A", member: MARC }),
        row({ bookingId: "b52", dog: ["dog-fish", "Fish"], level: "B", member: EVA }),
      ],
      startTime: "18:50",
      state: "ACTIVE",
      version: 0,
      waitlist: [],
    },
    // Monday 27 July, past T1 (20's closed day): Eva's no-show notice already went out (R-10-06).
    {
      ...base,
      closed: true,
      date: "2026-07-27",
      displayDescription: "A+B",
      endTime: "09:30",
      id: "c0",
      instructorId: "instructor-estel",
      ringId: CENTRAL,
      rows: [
        {
          ...row({
            bookingId: "b01",
            dog: ["dog-duna", "Duna"],
            level: "C",
            member: LAURA,
            photo: DUNA_PHOTO,
            state: "PRESENT",
          }),
          markedAt: "2026-07-27T07:40:00Z",
          markedByName: "Estel",
        },
        {
          ...row({
            bookingId: "b02",
            dog: ["dog-fish", "Fish"],
            level: "B",
            member: EVA,
            state: "NO_SHOW",
          }),
          markedAt: "2026-07-27T07:40:00Z",
          markedByName: "Estel",
          noShowNotice: {
            queuedAt: "2026-07-28T06:00:00Z",
            scheduledFor: "2026-07-28T06:00:00Z",
            sentAt: "2026-07-28T06:00:04Z",
          },
        },
      ],
      savedAt: "2026-07-27T07:40:00Z",
      savedByName: "Estel",
      startTime: "08:30",
      state: "FINISHED",
      version: 2,
      waitlist: [],
    },
    // D12's week (E6-W03, `fixtures/agenda.ts`): the same sheets as 21, so both screens agree.
    ...agendaWeekClasses(),
  ];
}

interface Replay {
  body: Record<string, unknown>;
  signature: string;
  status: number;
}

export const attendanceState: {
  classes: StoredClass[];
  idempotency: Map<string, Replay>;
  /** The classes whose `stale` other save happened already. */
  otherSaved: Set<string>;
} = {
  classes: initialClasses(),
  idempotency: new Map(),
  otherSaved: new Set(),
};

export function resetAttendanceState(): void {
  attendanceState.classes = initialClasses();
  attendanceState.idempotency = new Map();
  attendanceState.otherSaved = new Set();
}

/** The world's view options: what the scenario's club and caller change in the answers. */
export interface AttendanceContext {
  /** An ADMIN marks presence at any time (R-10-03). */
  admin: boolean;
  levelsEnabled: boolean;
  modules: readonly string[];
  variant: AttendanceVariant | undefined;
}

function plusDays(date: string, days: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** T1: 23:59:59 club-local of the class date + `attendance.editDays` (1), R-10-03. */
function editableUntil(date: string): string {
  const end = Date.parse(clubInstant(plusDays(date, 1), "23:59")) + 59_000;
  return new Date(end).toISOString().replace(".000Z", "Z");
}

function ringRef(ringId: string | null): RingRef | null {
  const ring = catalogState.rings.find((item) => item.id === ringId);
  return ring === undefined ? null : { color: ring.color, id: ring.id, name: ring.name };
}

function instructorName(id: string): string {
  return ATTENDANCE_INSTRUCTORS.find((instructor) => instructor.id === id)?.shortName ?? "";
}

/** Live bookings: every row but a NOTIFIED one whose booking was cancelled (R-10-02). */
function booked(stored: StoredClass): number {
  return stored.rows.filter(
    (item) => item.state !== "NOTIFIED" || item.notice?.afterClassEnd === true,
  ).length;
}

function canMarkPresence(stored: StoredClass, context: AttendanceContext): boolean {
  if (stored.state === "CANCELLED") return false;
  if (context.admin) return true;
  return !stored.closed && !stored.notOpen && context.variant !== "closed";
}

function canMarkNotice(stored: StoredClass, context: AttendanceContext): boolean {
  return (
    stored.state !== "CANCELLED" &&
    !stored.closed &&
    context.variant !== "closed" &&
    context.variant !== "noticeDisabled"
  );
}

export function findAttendanceClass(id: string): StoredClass | undefined {
  return attendanceState.classes.find((item) => item.id === id);
}

/** `GET /class-sessions/{id}/attendance` (S10 §6), as the scenario's club and caller read it. */
export function attendanceSheetView(
  stored: StoredClass,
  context: AttendanceContext,
): AttendanceSheet {
  const waitlistOn = context.modules.includes("WAITLIST");
  const tasksOn = context.modules.includes("TASKS");
  const entries = stored.waitlist.filter((item) => item.state === "ACTIVE");
  const rows = stored.rows.map((item) => {
    const { pendingTasksCount, ...rest } = item;
    return {
      ...rest,
      ...(tasksOn ? { pendingTasksCount: pendingTasksCount ?? 0 } : {}),
      levelCode: context.levelsEnabled ? (item.levelCode ?? null) : null,
    };
  });
  return {
    classSession: {
      booked: booked(stored),
      capacity: stored.capacity,
      date: stored.date,
      displayDescription: stored.displayDescription,
      endTime: stored.endTime,
      id: stored.id,
      instructorName: instructorName(stored.instructorId),
      ring: ringRef(stored.ringId),
      startTime: stored.startTime,
      state: stored.state,
      ...(waitlistOn ? { waiting: entries.length } : {}),
    },
    rows,
    sheet: {
      canMarkNotice: canMarkNotice(stored, context),
      canMarkPresence: canMarkPresence(stored, context),
      editableUntil: editableUntil(stored.date),
      noShowNoticeTime: "08:00",
      savedAt: stored.savedAt,
      savedByName: stored.savedByName,
      version: stored.version,
    },
    ...(waitlistOn
      ? {
          waitlist: {
            entries: entries.map((item) => ({
              ...item,
              levelCode: context.levelsEnabled ? (item.levelCode ?? null) : null,
            })),
            ...(context.variant === "fifo" ? { fifoConfirmMinutes: 30 } : {}),
            mode: context.variant === "fifo" ? ("FIFO" as const) : ("ALL_AT_ONCE" as const),
          },
        }
      : {}),
  };
}

function attendanceStatus(
  stored: StoredClass,
  context: AttendanceContext,
): InstructorDayClass["attendance"]["status"] {
  if (stored.closed || context.variant === "closed") return "CLOSED";
  if (stored.notOpen || stored.state === "CANCELLED") return "NONE";
  return stored.rows.every((item) => item.state !== "PENDING") ? "DONE" : "PENDING";
}

/** The mockup-20 day shows mockup 20's block in place of the S09 world's two seeds of that day. */
const MOCKUP_20_BLOCK: DayRingBlock = {
  createdByName: "Marc",
  fromLocal: "16:00",
  id: "rb1",
  kind: "BLOCK",
  note: "regar i repassar el terra",
  reason: "MAINTENANCE",
  ringName: "Carretera",
  toLocal: "17:30",
};
const S09_SEEDS_OF_MOCKUP_DAY = ["rb-2026-08-03-0900-muntanya", "rb-2026-08-03-1600-carretera"];

/** Every live ring block of the day, whoever made it (R-10-01): 24's new blocks included. */
function dayRingBlocks(date: string): DayRingBlock[] {
  const blocks = ringBlockListItems()
    .filter((block) => block.date === date && block.state === "ACTIVE")
    .filter((block) => date !== ATTENDANCE_MOCK_DAY || !S09_SEEDS_OF_MOCKUP_DAY.includes(block.id))
    .map((block) => ({
      createdByName: block.createdByName,
      fromLocal: block.fromLocal,
      id: block.id,
      kind: block.kind,
      note: block.note ?? null,
      reason: block.reason,
      ringName: catalogState.rings.find((ring) => ring.id === block.ringId)?.name ?? "",
      toLocal: block.toLocal,
    }));
  const all = date === ATTENDANCE_MOCK_DAY ? [MOCKUP_20_BLOCK, ...blocks] : blocks;
  return all.sort((left, right) => left.fromLocal.localeCompare(right.fromLocal));
}

/** `GET /instructor/day` (S10 §6): the selected instructor's classes and every block of `date`. */
export function instructorDayView(
  date: string,
  instructorId: string,
  now: number,
  context: AttendanceContext,
): InstructorDay {
  const today = clubLocalDateOf(new Date(now).toISOString());
  const classesOf = (day: string) =>
    attendanceState.classes
      .filter((item) => item.date === day && item.instructorId === instructorId)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));
  const waitlistOn = context.modules.includes("WAITLIST");
  return {
    classes: classesOf(date).map((stored) => ({
      attendance: {
        marked: stored.rows.filter((item) => item.state !== "PENDING").length,
        status: attendanceStatus(stored, context),
        total: stored.rows.length,
      },
      booked: booked(stored),
      capacity: stored.capacity,
      displayDescription: stored.displayDescription,
      endTime: stored.endTime,
      id: stored.id,
      individual: stored.capacity === 1,
      ring: ringRef(stored.ringId),
      startTime: stored.startTime,
      state: stored.state,
      ...(waitlistOn
        ? { waiting: stored.waitlist.filter((item) => item.state === "ACTIVE").length }
        : {}),
    })),
    date,
    days: Array.from({ length: 7 }, (_, index) => {
      const day = plusDays(today, index);
      return { date: day, hasClasses: classesOf(day).length > 0 };
    }),
    instructors: ATTENDANCE_INSTRUCTORS.map((instructor) => ({ ...instructor })),
    ringBlocks: dayRingBlocks(date),
    selectedInstructorId: instructorId,
    timeZone: "Europe/Madrid",
  };
}

type InstructorWeek = components["schemas"]["InstructorWeek"];
type WeekCell = components["schemas"]["WeekCell"];

/** What the caller asks D12 for (S10 §6): the week of `date`, and the two filters. */
export interface WeekQuery {
  date: string;
  /** Classes only (`me` already resolved); trainings and blocks are always shown (R-10-15). */
  instructorId: string | null;
  /** `classes.maxInstructorsPerClass` (R-10-16): > 1 shows «Marc, Estel» and «Els meus» shares. */
  maxInstructors: number;
  now: number;
  /** Everything (classes, trainings, blocks). */
  ringId: string | null;
}

/** Monday of the ISO week of a `YYYY-MM-DD` date (the club's calendar day). */
function isoMonday(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return plusDays(date, day === 0 ? -6 : 1 - day);
}

function ringName(ringId: string): string {
  return catalogState.rings.find((ring) => ring.id === ringId)?.name ?? "";
}

/**
 * Every live ring block of the week (24's and D12's card's, D4's), besides the mockup's: one
 * already drawn by the fixture (same day, ring and hours, e.g. D4's seed of the current
 * Wednesday) is the same block, not a second one.
 */
function liveWeekBlocks(start: string, end: string) {
  const drawn = new Set(
    AGENDA_BLOCKS.map((block) => `${block.date}|${block.ringId}|${block.time}|${block.endTime}`),
  );
  return ringBlockListItems()
    .filter((block) => block.state === "ACTIVE" && block.date >= start && block.date <= end)
    .filter(
      (block) => !drawn.has(`${block.date}|${block.ringId}|${block.fromLocal}|${block.toLocal}`),
    )
    .map((block) => ({
      createdByName: block.createdByName,
      date: block.date,
      endTime: block.toLocal,
      id: block.id,
      note: block.note ?? null,
      reason: block.reason,
      ringId: block.ringId,
      time: block.fromLocal,
    }));
}

/**
 * `GET /instructor/week` (S10 §6, R-10-15): the ISO week of `date` in the club's zone, Monday to
 * Saturday (Sunday only with items); the classes of the week (never a draft; `CANCELLED` too) with
 * their `attendanceStatus`, the free-training bookings (`FREE_TRAINING`) and the ring blocks;
 * `rows` are the distinct start times. `instructorId` filters classes only, `ringId` everything.
 */
export function instructorWeekView(query: WeekQuery, context: AttendanceContext): InstructorWeek {
  const start = isoMonday(query.date);
  const sunday = plusDays(start, 6);
  const today = clubLocalDateOf(new Date(query.now).toISOString());
  const waitlistOn = context.modules.includes("WAITLIST");
  const inWeek = (date: string) => date >= start && date <= sunday;
  const onRing = (ringId: string | null) => query.ringId === null || ringId === query.ringId;
  const instructorsOf = (stored: StoredClass) => [
    stored.instructorId,
    ...(query.maxInstructors > 1 ? (stored.coInstructorIds ?? []) : []),
  ];
  const classCells = attendanceState.classes
    .filter((stored) => inWeek(stored.date) && onRing(stored.ringId))
    .filter(
      (stored) => query.instructorId === null || instructorsOf(stored).includes(query.instructorId),
    )
    .map((stored): WeekCell => {
      const ring = ringRef(stored.ringId);
      return {
        attendanceStatus: attendanceStatus(stored, context),
        booked: booked(stored),
        capacity: stored.capacity,
        classId: stored.id,
        date: stored.date,
        displayDescription: stored.displayDescription,
        endTime: stored.endTime,
        instructorName: instructorsOf(stored).map(instructorName).join(", "),
        kind: "CLASS",
        ringColor: ring?.color ?? null,
        ringName: ring?.name ?? null,
        state: stored.state,
        time: stored.startTime,
        ...(waitlistOn
          ? { waiting: stored.waitlist.filter((item) => item.state === "ACTIVE").length }
          : {}),
      };
    });
  const trainingCells: WeekCell[] = context.modules.includes("FREE_TRAINING")
    ? AGENDA_TRAININGS.filter((item) => inWeek(item.date) && onRing(item.ringId)).map((item) => ({
        date: item.date,
        endTime: item.endTime,
        kind: "TRAINING",
        ringName: ringName(item.ringId),
        time: item.time,
        trainingBookingId: item.id,
        who: item.who,
      }))
    : [];
  const blockCells = [...AGENDA_BLOCKS, ...liveWeekBlocks(start, sunday)]
    .filter((item) => inWeek(item.date) && onRing(item.ringId))
    .map((item): WeekCell => ({
      blockId: item.id,
      createdByName: item.createdByName,
      date: item.date,
      endTime: item.endTime,
      kind: "BLOCK",
      note: item.note,
      reason: item.reason,
      ringName: ringName(item.ringId),
      time: item.time,
    }));
  const cells = [...classCells, ...trainingCells, ...blockCells].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.time.localeCompare(right.time) ||
      left.kind.localeCompare(right.kind),
  );
  const relative = today < start ? "FUTURE" : today > sunday ? "PAST" : "CURRENT";
  return {
    cells,
    filters: {
      instructorId: query.instructorId,
      instructors: ATTENDANCE_INSTRUCTORS.map((instructor) => ({ ...instructor })),
      ringId: query.ringId,
      rings: catalogState.rings
        .filter((ring) => ring.active)
        .map((ring) => ({ color: ring.color, id: ring.id, name: ring.name })),
    },
    rows: [...new Set(cells.map((cell) => cell.time))].sort(),
    // E6-W04 step 0c (api E6-T06): `training.slotMinutes` for D12's legend; null with FREE_TRAINING off.
    trainingSlotMinutes: context.modules.includes("FREE_TRAINING")
      ? trainingParameters().slotMinutes
      : null,
    week: {
      endDate: cells.some((cell) => cell.date === sunday) ? sunday : plusDays(start, 5),
      relative,
      startDate: start,
    },
  };
}

interface SaveFailure {
  code: string;
  details?: Record<string, unknown>;
  status: number;
}

/**
 * R-10-04's other instructor: with the `stale` variant, just before the caller's first save, Marc
 * saves Chun-li present on 21's 8:30 sheet (version 4 → 5), and Núria saves Pau present on D12's
 * selected class (version 3 → 4).
 */
const OTHER_SAVES: Readonly<Record<string, { bookingId: string; by: string }>> = {
  c1: { bookingId: "b2", by: "Marc" },
  [AGENDA_SELECTED_CLASS_ID]: { bookingId: "b-d12-5", by: "Núria" },
};

export function applyOtherSave(stored: StoredClass, now: number): void {
  const other = OTHER_SAVES[stored.id];
  if (other === undefined || attendanceState.otherSaved.has(stored.id)) return;
  attendanceState.otherSaved.add(stored.id);
  const at = new Date(now - 60_000).toISOString();
  stored.rows = stored.rows.map((item) =>
    item.bookingId === other.bookingId
      ? { ...item, markedAt: at, markedByName: other.by, state: "PRESENT" }
      : item,
  );
  stored.version += 1;
  stored.savedAt = at;
  stored.savedByName = other.by;
}

/**
 * `PUT /class-sessions/{id}/attendance` (R-10-04, R-10-05): one transaction — any refused item
 * changes nothing; an item equal to the current state is a no-op. Returns the applied booking ids
 * or the api's error.
 */
export function saveAttendanceItems(
  stored: StoredClass,
  items: readonly { bookingId: string; state: AttendanceState }[],
  context: AttendanceContext & { callerName: string; now: number },
): { applied: string[] } | SaveFailure {
  const presence = canMarkPresence(stored, context);
  const notice = canMarkNotice(stored, context);
  const closedFailure: SaveFailure = {
    code: "ATTENDANCE_WINDOW_CLOSED",
    details: { editableUntil: editableUntil(stored.date) },
    status: 422,
  };
  const changes: { index: number; state: AttendanceState }[] = [];
  for (const item of items) {
    const index = stored.rows.findIndex((candidate) => candidate.bookingId === item.bookingId);
    const current = stored.rows[index];
    if (current === undefined) {
      return {
        code: "ATTENDANCE_BOOKING_NOT_ACTIVE",
        details: { bookingId: item.bookingId },
        status: 422,
      };
    }
    if (current.state === item.state) continue;
    if (current.final || current.state === "NOTIFIED") {
      return { code: "ATTENDANCE_NOTIFIED_FINAL", status: 422 };
    }
    if (item.state === "NOTIFIED" && !notice) {
      return stored.closed || context.variant === "closed"
        ? closedFailure
        : { code: "INSTRUCTOR_NOTICE_DISABLED", status: 422 };
    }
    if (item.state !== "NOTIFIED" && !presence) {
      return stored.notOpen && context.variant !== "closed"
        ? { code: "ATTENDANCE_NOT_OPEN", status: 422 }
        : closedFailure;
    }
    changes.push({ index, state: item.state });
  }
  const at = new Date(context.now).toISOString().replace(".000Z", "Z");
  const start = Date.parse(clubInstant(stored.date, stored.startTime));
  const end = Date.parse(clubInstant(stored.date, stored.endTime));
  const liveWaitlist = stored.waitlist.some((item) => item.state === "ACTIVE");
  for (const change of changes) {
    const current = stored.rows[change.index];
    if (current === undefined) continue;
    const marked = {
      ...current,
      markedAt: at,
      markedByName: context.callerName,
      state: change.state,
    };
    if (change.state === "NOTIFIED") {
      // S08's cancellation inside the save (R-10-05): the moment that counts is the save.
      const afterClassEnd = context.now >= end;
      const minutesBefore = Math.floor((start - context.now) / 60_000);
      const late = !afterClassEnd && minutesBefore < 240;
      stored.rows[change.index] = {
        ...marked,
        final: true,
        noShowNotice: null,
        notice: {
          afterClassEnd,
          at,
          atLocal: clubLocalTime(at),
          bookingState: afterClassEnd ? "ACTIVE" : late ? "CANCELLED_LATE" : "CANCELLED",
          late,
          minutesBefore: afterClassEnd ? null : minutesBefore,
          seatReleased: !afterClassEnd,
          waitlistNotified:
            !afterClassEnd &&
            context.modules.includes("WAITLIST") &&
            minutesBefore > 30 &&
            liveWaitlist,
        },
      };
    } else if (change.state === "NO_SHOW") {
      stored.rows[change.index] = {
        ...marked,
        noShowNotice: {
          queuedAt: null,
          scheduledFor: clubInstant(plusDays(stored.date, 1), "08:00"),
          sentAt: null,
        },
        notice: null,
      };
    } else {
      stored.rows[change.index] = { ...marked, noShowNotice: null, notice: null };
    }
  }
  if (changes.length > 0) {
    stored.version += 1;
    stored.savedAt = at;
    stored.savedByName = context.callerName;
  }
  return { applied: changes.map((change) => stored.rows[change.index]?.bookingId ?? "") };
}

/** Mockup 22's Duna; the metrics follow R-10-08's worked example (6 present of 7 → 86 %). */
function dunaCard(): InstructorCard {
  return {
    dog: {
      ageYears: 4,
      breed: "Border collie",
      handlerName: null,
      id: "dog-duna",
      name: "Duna",
      photoUrl: DUNA_PHOTO,
      sex: "FEMALE",
      status: "ACTIVE",
    },
    instructorNote: {
      // Its attachments (foto_balancí.jpg) are the follow-up world's.
      attachments: [],
      text: "A veure si treballem una mica el doble a classe. El gos s'atura molt aviat al balancí",
      updatedAt: "2026-08-01T17:02:00Z",
    },
    lastClasses: [
      {
        bookingId: "b1",
        date: "2026-08-03",
        displayDescription: "A+B",
        displayState: "PRESENT",
        instructorName: "Estel",
        ringName: "Central",
      },
      {
        bookingId: "b-0730",
        date: "2026-07-30",
        displayDescription: "B+C",
        displayState: "PRESENT",
        instructorName: "Marc",
        ringName: "Central",
      },
      {
        bookingId: "b01",
        date: "2026-07-27",
        displayDescription: "A+B",
        displayState: "PRESENT",
        instructorName: "Estel",
        ringName: "Central",
      },
      {
        bookingId: "b-0723",
        date: "2026-07-23",
        displayDescription: "B+C",
        displayState: "NOTIFIED",
        instructorName: "Marc",
        ringName: "Central",
      },
      {
        bookingId: "b-0720",
        date: "2026-07-20",
        displayDescription: "B+C",
        displayState: "NO_SHOW",
        instructorName: "Estel",
        ringName: "Central",
      },
    ],
    level: { assignedAt: "2025-12-03T09:00:00Z", code: "C", name: "Nivell C" },
    member: {
      displayStatus: { kind: "ACTIVE" },
      firstName: "Laura",
      fullName: "Laura Serra Vidal",
      gender: "FEMALE",
      id: "member-laura",
    },
    metrics: {
      attendancePct: 86,
      cancelledLate: 0,
      classesCounted: 7,
      noShow: 1,
      notified: 1,
      present: 6,
      trainingsCount: 10,
      trainingsPerWeek: 2.3,
      windowDays: 30,
    },
    // The observations and the tasks come from the follow-up world (`fixtures/followup.ts`).
  };
}

/** Any other dog of the club: its census data, no classes in the window yet (`attendancePct: null`). */
function censusCard(dogId: string): InstructorCard | undefined {
  const dog = censusDogs.find((item) => item.id === dogId);
  if (dog === undefined) return undefined;
  const { fullName } = dog.owner;
  return {
    dog: {
      ageYears: Math.floor(dog.age),
      breed: dog.breed,
      handlerName: dog.handlerName ?? null,
      id: dog.id,
      name: dog.name,
      photoUrl: null,
      sex: dog.sex,
      status: "ACTIVE",
    },
    instructorNote: { attachments: [], text: null, updatedAt: null },
    lastClasses: [],
    level:
      dog.level === undefined
        ? null
        : {
            // The census fixture keeps the day; the card sends an instant (date-time).
            assignedAt:
              dog.levelAssignedAt === undefined
                ? null
                : `${dog.levelAssignedAt.slice(0, 10)}T09:00:00Z`,
            code: dog.level.code,
            name: dog.level.name,
          },
    member: {
      displayStatus: { kind: "ACTIVE" },
      // The census list carries the owner's full name only; the first word stands for its first name.
      firstName: fullName.split(" ")[0] ?? fullName,
      fullName,
      gender: null,
      id: dog.owner.id,
    },
    metrics: {
      attendancePct: null,
      cancelledLate: 0,
      classesCounted: 0,
      noShow: 0,
      notified: 0,
      present: 0,
      trainingsCount: 0,
      trainingsPerWeek: 0,
      windowDays: 30,
    },
  };
}

/**
 * `GET /dogs/{id}/instructor-card` (S10 §6), with the blocks the club's modules allow. The tasks,
 * the observations and the attachments are the follow-up world's (E6-W02), so a write on 26 or in
 * D13's drawer shows on the next read of 22 and D13.
 */
export function instructorCardView(
  dogId: string,
  context: AttendanceContext,
): InstructorCard | undefined {
  const card = dogId === "dog-duna" ? dunaCard() : censusCard(dogId);
  if (card === undefined) return undefined;
  const { level } = card;
  const rest = { dog: card.dog, lastClasses: card.lastClasses, member: card.member };
  const instructorNote = {
    ...(card.instructorNote ?? { text: null, updatedAt: null }),
    attachments: instructorNoteAttachments(dogId),
  };
  const observations = observationsBlock(dogId);
  const tasks = tasksBlock(dogId);
  const { trainingsCount, trainingsPerWeek, ...metrics } = card.metrics;
  return {
    ...rest,
    // Absent with `levels.enabled = false` or a dog without a level.
    ...(context.levelsEnabled && level != null ? { level } : {}),
    metrics: context.modules.includes("FREE_TRAINING")
      ? { ...metrics, trainingsCount: trainingsCount ?? 0, trainingsPerWeek: trainingsPerWeek ?? 0 }
      : metrics,
    ...(context.modules.includes("TASKS") ? { instructorNote, observations, tasks } : {}),
  };
}
