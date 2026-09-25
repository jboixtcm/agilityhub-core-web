import type { components } from "../../generated/schema";

import brandingCanic from "./branding-canic.json";
import { classSession, clubInstant, type ClassSession, type RingBlock } from "./calendar";
import { catalogState } from "./catalogs";

type ClassSessionMemberView = components["schemas"]["ClassSessionMemberView"];
type DayGrid = components["schemas"]["DayGrid"];
type DayGridCell = components["schemas"]["DayGridCell"];
type DayGridColumn = components["schemas"]["DayGridColumn"];
type Occupancy = components["schemas"]["GridOccupancy"];
type RingBlockMemberView = components["schemas"]["RingBlockMemberView"];

/** The day-grid world belongs to this tenant (club slug); any other club gets 404 / empty days. */
export const DAY_GRID_TENANT = brandingCanic.club.slug;

/**
 * The api's «Sense» column (`scheduling.noRing` in the reader's language), sent last and only when
 * a class of the day has no ring.
 */
const noRingColumn: Readonly<
  Record<"ca" | "en" | "es", Pick<DayGridColumn, "name" | "shortName">>
> = {
  ca: { name: "Sense pista", shortName: "Sense" },
  en: { name: "No ring", shortName: "None" },
  es: { name: "Sin pista", shortName: "Sin" },
};

/** The api's «Sense» column in the reader's language (also used by the D4 calendar world). */
export function noRingDayGridColumn(locale: "ca" | "en" | "es"): DayGridColumn {
  return { color: brandingCanic.theme.colors.border, ringId: null, ...noRingColumn[locale] };
}

/** Screen 23 mockup day (instructor view). */
export const DAY_GRID_INSTRUCTOR_DATE = "2026-08-03";
/** Screen 10 mockup day (member view, the 20:00 class at risk). */
export const DAY_GRID_MEMBER_DATE = "2026-08-04";
/** A day without any element (`rows: []`). */
export const DAY_GRID_EMPTY_DATE = "2026-08-05";
/** An `ACTIVITY` cell and a class without ring (column «Sense»). */
export const DAY_GRID_ACTIVITY_DATE = "2026-08-06";

/** R-06-13 balloon text as the api delivers it, already in the reader's locale. */
export const riskTextFixture: Readonly<Record<"ca" | "en" | "es", string>> = {
  ca: "Aquesta classe només té un alumne: si ningú més s'hi apunta abans de les 7:30 de dimarts, s'anul·larà.",
  en: "This class has only one student: if nobody else books before 7:30 on Tuesday, it will be cancelled.",
  es: "Esta clase solo tiene un alumno: si nadie más se apunta antes de las 7:30 del martes, se anulará.",
};

const dayNames = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/** Fictional instructors of the mockups (first names only). */
const instructorIds: Readonly<Record<string, string>> = {
  Estel: "instructor-estel",
  Marc: "instructor-marc",
  Núria: "instructor-nuria",
};

interface ClassSpec {
  kind: "CLASS";
  ring: string | null;
  start: string;
  end: string;
  description: string;
  instructor: string;
  booked: number;
  capacity: number;
  waiting?: number;
  atRisk?: boolean;
  cancelled?: boolean;
  /** R-06-12: the member view gets `instructorName: null` (more than 24 h ahead). */
  hiddenForMembers?: boolean;
}

interface TrainingSpec {
  kind: "TRAINING";
  ring: string;
  start: string;
  end: string;
  who: string;
}

interface BlockSpec {
  kind: "BLOCK";
  ring: string;
  start: string;
  end: string;
  reason: RingBlock["reason"];
  createdByName: string;
  note: string | null;
}

interface ActivitySpec {
  kind: "ACTIVITY";
  ring: string;
  start: string;
  end: string;
  title: string;
}

type ItemSpec = ActivitySpec | BlockSpec | ClassSpec | TrainingSpec;

const cls = (
  ring: string | null,
  start: string,
  end: string,
  description: string,
  instructor: string,
  booked: number,
  capacity: number,
  extra: Partial<ClassSpec> = {},
): ClassSpec => ({
  booked,
  capacity,
  description,
  end,
  instructor,
  kind: "CLASS",
  ring,
  start,
  ...extra,
});

const training = (ring: string, start: string, end: string, who: string): TrainingSpec => ({
  end,
  kind: "TRAINING",
  ring,
  start,
  who,
});

const days: Readonly<Record<string, readonly ItemSpec[]>> = {
  [DAY_GRID_INSTRUCTOR_DATE]: [
    training("ring-carretera", "08:00", "08:30", "Pau + Blat"),
    cls("ring-muntanya", "08:30", "09:30", "C i sup.", "Marc", 3, 5),
    cls("ring-central", "08:30", "09:30", "A+B", "Estel", 4, 5),
    cls("ring-cadells", "09:30", "10:30", "Cadells", "Núria", 3, 4),
    {
      createdByName: "Marc",
      end: "18:00",
      kind: "BLOCK",
      note: "Reg i anivellament de la sorra",
      reason: "MAINTENANCE",
      ring: "ring-carretera",
      start: "16:00",
    },
    cls("ring-muntanya", "17:40", "18:40", "A+B", "Estel", 0, 5, { cancelled: true }),
    cls("ring-carretera", "17:40", "18:40", "D+E", "Marc", 4, 5),
    cls("ring-petita", "17:40", "18:40", "Teràpia", "Estel", 1, 1),
    cls("ring-central", "18:50", "19:50", "B+C", "Marc", 5, 5, { waiting: 2 }),
    cls("ring-cadells", "18:50", "19:50", "Cadells", "Marc", 2, 4),
    training("ring-muntanya", "19:00", "19:30", "Júlia + Kira"),
    training("ring-carretera", "19:00", "19:30", "Sergio + Thai"),
  ],
  [DAY_GRID_MEMBER_DATE]: [
    cls("ring-muntanya", "08:30", "09:30", "C i sup.", "Marc", 3, 5),
    cls("ring-central", "08:30", "09:30", "A+B", "Estel", 4, 5),
    {
      createdByName: "Marc",
      end: "09:30",
      kind: "BLOCK",
      note: null,
      reason: "MAINTENANCE",
      ring: "ring-carretera",
      start: "08:30",
    },
    training("ring-muntanya", "09:30", "10:00", "Pau + Blat"),
    cls("ring-cadells", "09:30", "10:30", "Cadells", "Núria", 3, 4),
    cls("ring-carretera", "17:40", "18:40", "D+E", "Marc", 4, 5),
    cls("ring-petita", "17:40", "18:40", "Teràpia", "Estel", 1, 1),
    cls("ring-central", "18:50", "19:50", "A+B", "Estel", 4, 5),
    training("ring-carretera", "18:50", "19:20", "Sergio + Thai"),
    cls("ring-cadells", "18:50", "19:50", "Cadells", "Marc", 2, 4),
    cls("ring-central", "20:00", "21:00", "B+C", "Estel", 3, 5),
    cls("ring-carretera", "20:00", "21:00", "D i sup.", "Estel", 1, 5, {
      atRisk: true,
      hiddenForMembers: true,
    }),
  ],
  [DAY_GRID_EMPTY_DATE]: [],
  [DAY_GRID_ACTIVITY_DATE]: [
    {
      end: "12:00",
      kind: "ACTIVITY",
      ring: "ring-muntanya",
      start: "10:00",
      title: "Taller d'iniciació",
    },
    cls("ring-carretera", "17:40", "18:40", "D+E", "Marc", 4, 5),
    cls(null, "18:00", "19:00", "Obediència", "Estel", 3, 6),
  ],
};

const compactTime = (time: string): string => time.replace(":", "");

function classId(date: string, spec: ClassSpec): string {
  return `dg-cls-${date}-${compactTime(spec.start)}-${spec.ring ?? "none"}`;
}

function blockId(date: string, spec: BlockSpec): string {
  return `dg-block-${date}-${compactTime(spec.start)}-${spec.ring}`;
}

function initialBlocks(): RingBlock[] {
  return Object.entries(days).flatMap(([date, items]) =>
    items
      .filter((item): item is BlockSpec => item.kind === "BLOCK")
      .map((item) => ({
        activityId: null,
        activityTitle: null,
        createdByName: item.createdByName,
        date,
        from: clubInstant(date, item.start),
        fromLocal: item.start,
        id: blockId(date, item),
        kind: "BLOCK" as const,
        note: item.note,
        reason: item.reason,
        ringId: item.ring,
        state: "ACTIVE" as const,
        to: clubInstant(date, item.end),
        toLocal: item.end,
        version: 1,
      })),
  );
}

/** Mutable blocks of the day-grid world (the cancellation drawer of screen 23 changes them). */
export const dayGridState: { blocks: RingBlock[] } = { blocks: initialBlocks() };

export function resetDayGridState(): void {
  dayGridState.blocks = initialBlocks();
}

export function isDayGridFixtureDate(date: string): boolean {
  return date in days;
}

/**
 * `GET /class-sessions/{id}` for ADMIN/INSTRUCTOR: the instructor projection plus the detail-only
 * `instructorNames` and `ring` (always sent, `null` without a ring) of api E5-T15.
 */
export function dayGridStaffSession(id: string): ClassSession | undefined {
  for (const [date, items] of Object.entries(days)) {
    for (const item of items) {
      if (item.kind !== "CLASS" || classId(date, item) !== id) continue;
      const session = dayGridClassSessions().find((candidate) => candidate.id === id);
      if (session === undefined) return undefined;
      const ring = catalogState.rings.find((candidate) => candidate.id === item.ring);
      return {
        ...session,
        instructorNames: [item.instructor],
        ring: ring === undefined ? null : { color: ring.color, id: ring.id, name: ring.name },
      };
    }
  }
  return undefined;
}

/** `ClassSession` instructor projection (no `notes`) of every fixture class. */
export function dayGridClassSessions(): ClassSession[] {
  return Object.entries(days).flatMap(([date, items]) =>
    items
      .filter((item): item is ClassSpec => item.kind === "CLASS")
      .map((item) => {
        const session: ClassSession = classSession({
          booked: item.booked,
          capacity: item.capacity,
          capacityMode: "AUTO",
          date,
          description: null,
          displayDescription: item.description,
          endTime: item.end,
          id: classId(date, item),
          instructorIds: [instructorIds[item.instructor] ?? `instructor-${item.instructor}`],
          levelIds: [],
          ringId: item.ring,
          startTime: item.start,
          state: item.cancelled === true ? "CANCELLED" : "ACTIVE",
          waiting: item.waiting ?? 0,
          weekId: "week-2026-08-03",
        });
        // `notes` is ADMIN only: the instructor projection omits it.
        delete session.notes;
        return {
          ...session,
          atRisk: item.atRisk === true,
          ...(item.cancelled === true
            ? {
                cancellation: {
                  adminText: null,
                  affectedBookings: 0,
                  affectedWaitlist: 0,
                  at: "2026-08-01T09:00:00Z",
                  byAccountId: "10000000-0000-4000-8000-000000000001",
                  reason: "CLUB_MANUAL" as const,
                },
              }
            : {}),
        };
      }),
  );
}

/**
 * `GET /class-sessions/{id}` for MEMBER (impersonation included): only `ACTIVE`/`FINISHED`, the
 * instructor as R-06-12 decides, no counters, `waiting` only with `WAITLIST` (S06 §6 «Altres formes»).
 */
export function dayGridMemberSession(
  id: string,
  modules: readonly string[],
): ClassSessionMemberView | undefined {
  for (const [date, items] of Object.entries(days)) {
    for (const item of items) {
      if (item.kind !== "CLASS" || classId(date, item) !== id) continue;
      if (item.cancelled === true) return undefined;
      const ring = catalogState.rings.find((candidate) => candidate.id === item.ring);
      return {
        capacity: item.capacity,
        date,
        displayDescription: item.description,
        endTime: item.end,
        freeSeats: Math.max(item.capacity - item.booked, 0),
        id,
        instructorName: item.hiddenForMembers === true ? null : item.instructor,
        levelIds: [],
        ring: ring === undefined ? null : { color: ring.color, id: ring.id, name: ring.name },
        startTime: item.start,
        state: "ACTIVE",
        ...(modules.includes("WAITLIST") ? { waiting: item.waiting ?? 0 } : {}),
      };
    }
  }
  return undefined;
}

/** `GET /ring-blocks/{id}` for MEMBER: redacted, without `note` nor `createdByName` (S06 §6). */
export function memberBlockView(block: RingBlock): RingBlockMemberView {
  return {
    activityId: block.activityId ?? null,
    activityTitle: block.activityTitle ?? null,
    date: block.date,
    from: block.from,
    fromLocal: block.fromLocal,
    id: block.id,
    kind: block.kind,
    reason: block.reason,
    ringId: block.ringId,
    state: block.state,
    to: block.to,
    toLocal: block.toLocal,
    version: block.version,
  };
}

export interface DayGridOptions {
  locale: "ca" | "en" | "es";
  modules: readonly string[];
  timeZone: string;
}

/** Form D of a fixture day, projected per view as the api does (R-06-12, R-06-15). */
export function dayGridFixture(
  date: string,
  view: "instructor" | "member",
  options: DayGridOptions,
): DayGrid {
  const waitlist = options.modules.includes("WAITLIST");
  const cells = new Map<string, DayGridCell[]>();
  const push = (time: string, cell: DayGridCell) => {
    cells.set(time, [...(cells.get(time) ?? []), cell]);
  };
  for (const item of days[date] ?? []) {
    switch (item.kind) {
      case "CLASS": {
        if (view === "member" && item.cancelled === true) break;
        const occupancy: Occupancy = {
          booked: item.booked,
          capacity: item.capacity,
          ...(waitlist ? { waiting: item.waiting ?? 0 } : {}),
        };
        push(item.start, {
          atRisk: item.atRisk === true,
          classId: classId(date, item),
          description: item.description,
          endTime: item.end,
          instructorName:
            view === "member" && item.hiddenForMembers === true ? null : item.instructor,
          kind: "CLASS",
          ringId: item.ring,
          riskText: item.atRisk === true ? riskTextFixture[options.locale] : null,
          state: item.cancelled === true ? "CANCELLED" : "ACTIVE",
          ...(view === "instructor" ? { occupancy } : {}),
        });
        break;
      }
      case "TRAINING":
        if (!options.modules.includes("FREE_TRAINING")) break;
        push(
          item.start,
          view === "member"
            ? { endTime: item.end, kind: "OCCUPIED", reason: "TRAINING", ringId: item.ring }
            : {
                endTime: item.end,
                kind: "TRAINING",
                ringId: item.ring,
                trainingBookingIds: [`dg-tb-${date}-${compactTime(item.start)}-${item.ring}`],
                who: [item.who],
              },
        );
        break;
      case "BLOCK": {
        const block = dayGridState.blocks.find((candidate) => candidate.id === blockId(date, item));
        if (block?.state !== "ACTIVE") break;
        push(
          item.start,
          view === "member"
            ? { endTime: item.end, kind: "OCCUPIED", reason: block.reason, ringId: block.ringId }
            : {
                blockId: block.id,
                createdByName: block.createdByName,
                endTime: block.toLocal,
                kind: "BLOCK",
                note: block.note ?? null,
                reason: block.reason,
                ringId: block.ringId,
              },
        );
        break;
      }
      case "ACTIVITY":
        if (!options.modules.includes("ACTIVITIES")) break;
        push(item.start, {
          activityId: "activity-taller-iniciacio",
          endTime: item.end,
          kind: "ACTIVITY",
          ringId: item.ring,
          title: item.title,
        });
        break;
    }
  }
  const classWithoutRing = [...cells.values()].some((row) =>
    row.some((cell) => cell.kind === "CLASS" && (cell.ringId ?? null) === null),
  );
  const ringColumns: DayGridColumn[] = [...catalogState.rings]
    .filter((ring) => ring.active)
    .sort((left, right) => left.order - right.order)
    .map((ring) => ({
      ...(options.modules.includes("COURSES") ? { activeSetupId: null } : {}),
      color: ring.color,
      name: ring.name,
      ringId: ring.id,
      shortName: ring.shortName,
    }));
  return {
    columns: classWithoutRing ? [...ringColumns, noRingDayGridColumn(options.locale)] : ringColumns,
    date,
    dayOfWeek: dayNames[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] ?? "MONDAY",
    rows: [...cells.keys()].sort().map((time) => ({ cells: cells.get(time) ?? [], time })),
    timeZone: options.timeZone,
    view: view === "instructor" ? "INSTRUCTOR" : "MEMBER",
  };
}
