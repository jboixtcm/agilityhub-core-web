import type { components } from "../../generated/schema";

export type WeekTemplate = components["schemas"]["WeekTemplate"];
export type TemplateClass = components["schemas"]["TemplateClass"];
export type TimeBand = components["schemas"]["TimeBand"];
export type Inconsistency = components["schemas"]["Inconsistency"];
export type Coverage = components["schemas"]["Coverage"];
export type Week = components["schemas"]["Week"];
export type WeekListItem = components["schemas"]["WeekListItem"];
export type DayOfWeek = TemplateClass["dayOfWeek"];

/** Internal week record: the `Week` resource plus the list projection fields. */
export type MockWeek = Week &
  Pick<WeekListItem, "classCounts" | "saturdayTemplateName" | "weekdayTemplateName">;

export interface PlanningLevel {
  active: boolean;
  capacity: number;
  id: string;
  name: string;
  order: number;
}

export interface PlanningRing {
  id: string;
  name: string;
}

export interface PlanningInstructor {
  id: string;
  shortName: string;
}

export const weekdays: readonly DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
];

const catalanDayNames: Readonly<Record<DayOfWeek, string>> = {
  FRIDAY: "divendres",
  MONDAY: "dilluns",
  SATURDAY: "dissabte",
  SUNDAY: "diumenge",
  THURSDAY: "dijous",
  TUESDAY: "dimarts",
  WEDNESDAY: "dimecres",
};

/** Mock of the api `DescriptionResolver` (R-06-03), Catalan reader. */
export function mockDisplayDescription(
  levels: readonly PlanningLevel[],
  levelIds: readonly string[],
  description: string | null | undefined,
): string {
  if (description !== null && description !== undefined && description.trim() !== "") {
    return description.trim();
  }
  const active = [...levels]
    .filter((level) => level.active)
    .sort((left, right) => left.order - right.order);
  const selected = active.filter((level) => levelIds.includes(level.id));
  const head = selected[0];
  if (head === undefined) {
    return "";
  }
  if (selected.length === 1) {
    return head.name;
  }
  const first = active.indexOf(head);
  const contiguous = selected.every((level, index) => active[first + index] === level);
  const reachesLast = selected.at(-1) === active.at(-1);
  return contiguous && reachesLast
    ? `${head.name} i sup.`
    : selected.map((level) => level.name).join("+");
}

function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

/** Mock of the api `InconsistencyDetector` for template scope (R-06-05, ring and instructor overlaps). */
export function withInconsistencies(
  template: WeekTemplate,
  rings: readonly PlanningRing[],
  instructors: readonly PlanningInstructor[],
): WeekTemplate {
  const inconsistencies: Inconsistency[] = [];
  const bandsById = new Map(template.bands.map((band) => [band.id, band]));
  const overlaps = (left: TemplateClass, right: TemplateClass) => {
    const leftBand = bandsById.get(left.bandId);
    const rightBand = bandsById.get(right.bandId);
    return (
      left.dayOfWeek === right.dayOfWeek &&
      leftBand !== undefined &&
      rightBand !== undefined &&
      minutes(leftBand.startTime) < minutes(rightBand.endTime) &&
      minutes(rightBand.startTime) < minutes(leftBand.endTime)
    );
  };
  template.classes.forEach((left, leftIndex) => {
    template.classes.slice(leftIndex + 1).forEach((right) => {
      if (!overlaps(left, right)) return;
      const band = bandsById.get(left.bandId);
      const when = `${catalanDayNames[left.dayOfWeek]} ${band?.startTime ?? ""}`;
      if (left.ringId !== null && left.ringId !== undefined && left.ringId === right.ringId) {
        const ring = rings.find((candidate) => candidate.id === left.ringId);
        inconsistencies.push({
          bandId: left.bandId,
          dayOfWeek: left.dayOfWeek,
          id: `inc-ring-${left.id}-${right.id}`,
          itemIds: [left.id, right.id],
          message: `${when} — pista ${ring?.name ?? ""} amb dues classes alhora`,
          ringId: left.ringId,
          type: "RING_DOUBLE_BOOKED",
        });
      }
      left.instructorIds
        .filter((instructorId) => right.instructorIds.includes(instructorId))
        .forEach((instructorId) => {
          const instructor = instructors.find((candidate) => candidate.id === instructorId);
          inconsistencies.push({
            bandId: left.bandId,
            dayOfWeek: left.dayOfWeek,
            id: `inc-instructor-${instructorId}-${left.id}-${right.id}`,
            instructorId,
            itemIds: [left.id, right.id],
            message: `${when} — ${instructor?.shortName ?? ""} assignat a dues classes alhora`,
            type: "INSTRUCTOR_DOUBLE_BOOKED",
          });
        });
    });
  });
  return {
    ...template,
    canGenerate: inconsistencies.length === 0,
    classes: template.classes.map((item) => ({
      ...item,
      inconsistencyIds: inconsistencies
        .filter((inconsistency) => inconsistency.itemIds.includes(item.id))
        .map((inconsistency) => inconsistency.id),
    })),
    inconsistencies,
  };
}

// Level ids of the catalog fixture (`catalogs.ts`), Cadells · A…G · Teràpia.
const P = "level-p";
const A = "level-a";
const B = "level-b";
const C = "level-c";
const D = "level-d";
const E = "level-e";
const F = "level-f";
const G = "level-g";

const MUN = "ring-muntanya";
const CEN = "ring-central";
const CAR = "ring-carretera";
const CAD = "ring-cadells";
const PET = "ring-petita";

// Fictional instructors of the catalog fixture.
const LAURA = "instructor-laura";
const MARC = "instructor-marc";
const ANNA = "instructor-anna";
const SERGIO = "instructor-sergio";

type ClassSpec = readonly [
  day: DayOfWeek,
  ring: string | null,
  levelIds: readonly string[],
  instructorId: string,
  displayDescription: string,
  capacity: number,
  description?: string,
];

function band(prefix: string, startTime: string, endTime: string): TimeBand {
  return { endTime, id: `${prefix}-b${startTime.replace(":", "")}`, startTime };
}

function classesFor(
  prefix: string,
  bands: readonly TimeBand[],
  specsByBand: Readonly<Record<string, readonly ClassSpec[]>>,
): TemplateClass[] {
  return bands.flatMap((timeBand) =>
    (specsByBand[timeBand.startTime] ?? []).map(
      (
        [day, ringId, levelIds, instructorId, displayDescription, capacity, description],
        index,
      ) => ({
        bandId: timeBand.id,
        capacity,
        capacityMode: "AUTO" as const,
        dayOfWeek: day,
        description: description ?? null,
        displayDescription,
        id: `${prefix}-c${timeBand.startTime.replace(":", "")}-${day.slice(0, 3).toLowerCase()}-${String(index)}`,
        inconsistencyIds: [],
        instructorIds: [instructorId],
        levelIds: [...levelIds],
        ringId,
      }),
    ),
  );
}

function weekdayGrid(wednesdayEightPmRing: string): Readonly<Record<string, readonly ClassSpec[]>> {
  return {
    "08:30": [
      ["MONDAY", PET, [A], LAURA, "A", 5],
      ["MONDAY", MUN, [B, C], MARC, "B+C", 5],
      ["MONDAY", CEN, [F, G], ANNA, "F+G", 4],
      ["TUESDAY", CEN, [F, G], LAURA, "F+G", 4],
      ["WEDNESDAY", MUN, [B, C], MARC, "B+C", 5],
      ["THURSDAY", CAR, [C, D, E], LAURA, "C+D+E", 4],
      ["FRIDAY", CAR, [E, F, G], LAURA, "E i sup.", 4],
    ],
    "09:30": [
      ["MONDAY", PET, [A, B], LAURA, "A+B", 5],
      ["MONDAY", CEN, [D, E, F, G], ANNA, "D i sup.", 4],
      ["TUESDAY", CEN, [B, C, D], LAURA, "B+C+D", 5],
      ["WEDNESDAY", CAR, [C, D, E], MARC, "C+D+E", 4],
      ["THURSDAY", CEN, [B, C], LAURA, "B+C", 5],
      ["FRIDAY", PET, [A, B], LAURA, "A+B", 5],
    ],
    "16:30": [
      ["MONDAY", PET, [A, B], LAURA, "A+B", 5],
      ["WEDNESDAY", CEN, [B, C], LAURA, "B+C", 5],
      ["THURSDAY", MUN, [C, D, E, F, G], LAURA, "C i sup.", 4],
    ],
    "17:40": [
      ["MONDAY", CAR, [C, D, E], LAURA, "C+D+E", 4],
      ["TUESDAY", CEN, [F, G], ANNA, "F+G", 4],
      ["WEDNESDAY", PET, [A], LAURA, "A", 5],
      ["THURSDAY", MUN, [B, C], LAURA, "B+C", 5],
      ["THURSDAY", CEN, [F, G], ANNA, "F+G", 4],
    ],
    "18:50": [
      ["MONDAY", MUN, [B, C], MARC, "B+C", 5],
      ["MONDAY", CEN, [F, G], ANNA, "F+G", 4],
      ["MONDAY", CAD, [P], LAURA, "Cadells", 5],
      ["TUESDAY", PET, [A], LAURA, "A", 5],
      ["WEDNESDAY", MUN, [B, C], MARC, "B+C", 5],
      ["WEDNESDAY", CAR, [F, G], SERGIO, "F+G", 4],
      ["WEDNESDAY", CAD, [P], LAURA, "Cadells", 5],
      ["THURSDAY", CAR, [C, D, E], LAURA, "C+D+E", 4],
      ["THURSDAY", PET, [A], ANNA, "A", 5],
    ],
    "20:00": [
      ["MONDAY", MUN, [B, C], MARC, "B+C", 5],
      ["MONDAY", CEN, [F, G], SERGIO, "F+G", 4],
      ["MONDAY", null, [B, C], LAURA, "Obed. urbana", 5, "Obed. urbana"],
      ["TUESDAY", PET, [A, B], LAURA, "A+B", 5],
      ["TUESDAY", MUN, [B, C], MARC, "B+C", 5],
      ["TUESDAY", CEN, [F, G], ANNA, "F+G", 4],
      ["WEDNESDAY", CEN, [B, C], MARC, "B+C", 5],
      ["WEDNESDAY", CAR, [F, G], SERGIO, "F+G", 4],
      ["WEDNESDAY", wednesdayEightPmRing, [C, D, E], ANNA, "C+D+E", 4],
      ["THURSDAY", MUN, [D, E, F, G], LAURA, "D i sup.", 4],
    ],
  };
}

function weekdayBands(prefix: string): TimeBand[] {
  return [
    band(prefix, "08:30", "09:30"),
    band(prefix, "09:30", "10:30"),
    band(prefix, "16:30", "17:30"),
    band(prefix, "17:40", "18:40"),
    band(prefix, "18:50", "19:50"),
    band(prefix, "20:00", "21:00"),
  ];
}

const setmanaABands = weekdayBands("tpl-a");
const setmanaBBands = weekdayBands("tpl-b");
const saturdayBands = [
  band("tpl-s", "09:30", "10:30"),
  band("tpl-s", "10:40", "11:40"),
  band("tpl-s", "11:50", "12:50"),
];

const templateBase: Pick<
  WeekTemplate,
  "active" | "canGenerate" | "inconsistencies" | "notes" | "version"
> = {
  active: true,
  canGenerate: true,
  inconsistencies: [],
  notes: null,
  version: 1,
};

/** Setmana A: clean (the D3 grid with the Wednesday 20:00 «C+D+E» on Petita). */
const setmanaA: WeekTemplate = {
  ...templateBase,
  bands: setmanaABands,
  classes: classesFor("tpl-a", setmanaABands, weekdayGrid(PET)),
  days: [...weekdays],
  id: "template-setmana-a",
  kind: "WEEKDAYS",
  name: "Setmana A",
};

/** Setmana B: the D3 inconsistency (Wednesday 20:00, two classes on Central). */
const setmanaB: WeekTemplate = {
  ...templateBase,
  bands: setmanaBBands,
  classes: classesFor("tpl-b", setmanaBBands, weekdayGrid(CEN)),
  days: [...weekdays],
  id: "template-setmana-b",
  kind: "WEEKDAYS",
  name: "Setmana B",
};

const dissabtes: WeekTemplate = {
  ...templateBase,
  bands: saturdayBands,
  classes: classesFor("tpl-s", saturdayBands, {
    "09:30": [
      ["SATURDAY", PET, [A, B], LAURA, "A+B", 5],
      ["SATURDAY", CEN, [C, D, E], MARC, "C+D+E", 4],
    ],
    "10:40": [
      ["SATURDAY", CEN, [F, G], ANNA, "F+G", 4],
      ["SATURDAY", CAD, [P], LAURA, "Cadells", 5],
    ],
    "11:50": [
      ["SATURDAY", MUN, [B, C], MARC, "B+C", 5],
      ["SATURDAY", CAR, [D, E, F, G], ANNA, "D i sup.", 4],
    ],
  }),
  days: ["SATURDAY"],
  id: "template-dissabtes",
  kind: "SATURDAY",
  name: "Dissabtes",
};

const fixtureRings: PlanningRing[] = [
  { id: MUN, name: "Muntanya" },
  { id: CEN, name: "Central" },
  { id: CAR, name: "Carretera" },
  { id: CAD, name: "Cadells" },
  { id: PET, name: "Petita" },
];

const fixtureInstructors: PlanningInstructor[] = [
  { id: LAURA, shortName: "Laura" },
  { id: MARC, shortName: "Marc" },
  { id: ANNA, shortName: "Anna" },
  { id: SERGIO, shortName: "Sergio" },
];

export const initialWeekTemplates: readonly WeekTemplate[] = [setmanaA, setmanaB, dissabtes].map(
  (template) => withInconsistencies(template, fixtureRings, fixtureInstructors),
);

const coverageRow = (
  levelId: string,
  name: string,
  maxSeats: number,
  propSeats: number,
  dogsTotal: number,
  dogsActive: number,
  maxRatioPct: number,
  propRatioPct: number,
  status: Coverage["levels"][number]["status"],
): Coverage["levels"][number] => ({
  booked: null,
  dogsActive,
  dogsTotal,
  levelId,
  maxRatioPct,
  maxSeats,
  name,
  propRatioPct,
  propSeats,
  status,
});

/** The eight D3 mockup rows (template scope). */
export const coverageFixture: Coverage = {
  activeDogWeeks: 2,
  levels: [
    coverageRow(P, "Cadells", 50, 50, 24, 19, 208, 263, "OK"),
    coverageRow(A, "A", 100, 70.5, 43, 31, 233, 227, "TIGHT"),
    coverageRow(B, "B", 120, 75, 39, 28, 308, 268, "OK"),
    coverageRow(C, "C", 105, 60.5, 42, 35, 250, 173, "SHORT"),
    coverageRow(D, "D", 95, 55, 35, 27, 271, 204, "TIGHT"),
    coverageRow(E, "E", 80, 45.5, 31, 22, 258, 207, "TIGHT"),
    coverageRow(F, "F", 28, 14, 16, 10, 175, 140, "EXPAND"),
    coverageRow(G, "G", 26, 12.5, 12, 7, 217, 179, "SHORT"),
  ],
  scope: "TEMPLATE",
  thresholds: { ok: 240, short: 150, tight: 190 },
};

const clubTimeZone = "Europe/Madrid";

/** Club-local calendar date (`YYYY-MM-DD`) of an instant. */
export function clubLocalDate(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: clubTimeZone,
    year: "numeric",
  }).format(instant);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function isoWeekOf(monday: string): { isoWeek: number; isoYear: number } {
  const isoYear = Number(addDays(monday, 3).slice(0, 4));
  const firstMonday = mondayOf(`${String(isoYear)}-01-04`);
  const days =
    (Date.parse(`${monday}T12:00:00Z`) - Date.parse(`${firstMonday}T12:00:00Z`)) / 86_400_000;
  return { isoWeek: Math.round(days / 7) + 1, isoYear };
}

export function mockWeek(monday: string, overrides: Partial<MockWeek> = {}): MockWeek {
  return {
    classCounts: { active: 0, cancelled: 0, draft: 0 },
    endDate: addDays(monday, 6),
    generatedAt: null,
    generatedByAccountId: null,
    id: `week-${monday}`,
    ...isoWeekOf(monday),
    saturdayTemplateId: null,
    saturdayTemplateName: null,
    startDate: monday,
    state: "PENDING",
    validatedAt: null,
    validatedByAccountId: null,
    version: 1,
    weekdayTemplateId: null,
    weekdayTemplateName: null,
    ...overrides,
  };
}

/**
 * Weeks relative to the club-local current week (the D3 mockup: W34 generated + validated,
 * W35 pending) so the SETMANES table and the candidates stay meaningful on any date.
 */
export function initialWeeks(today: string = clubLocalDate()): MockWeek[] {
  const current = mondayOf(today);
  return [
    mockWeek(current, {
      classCounts: { active: 51, cancelled: 1, draft: 0 },
      generatedAt: `${current}T07:12:00Z`,
      generatedByAccountId: "account-admin",
      saturdayTemplateId: dissabtes.id,
      saturdayTemplateName: dissabtes.name,
      state: "VALIDATED",
      validatedAt: `${addDays(current, 1)}T08:02:00Z`,
      validatedByAccountId: "account-admin",
      version: 3,
      weekdayTemplateId: setmanaA.id,
      weekdayTemplateName: setmanaA.name,
    }),
    mockWeek(addDays(current, 7)),
  ];
}
