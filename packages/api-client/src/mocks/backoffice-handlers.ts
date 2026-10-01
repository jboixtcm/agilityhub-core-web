import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  bookingState,
  bookingWeekKeyOf,
  classBookingItems,
  classWaitlistEntries,
  findClass,
  findDog,
  findRegistrantEntry,
  localInstant,
  resetRegistrantsState,
} from "./fixtures/bookings";
import { catalogState } from "./fixtures/catalogs";
import { censusMembers } from "./fixtures/census";
import { dayGridClassSessions } from "./fixtures/day-grid";
import {
  JOBS_MOCK_NOW,
  jobsState,
  jobSummary,
  manualRun,
  minDogsParameter,
  resetJobsState,
  RISK_REVIEW_DEFAULTS,
  riskReviewForm,
  type StoredJob,
} from "./fixtures/jobs";
import { clubLocalDate, clubLocalDateTime } from "./fixtures/planning";
import { findParameter, replaceParameter } from "./fixtures/settings";
import {
  ACTIVITY_RING_BLOCK,
  ringBlockListItems,
  trainingBookingListItems,
  trainingState,
} from "./fixtures/training";
import { fieldsProjection } from "./list-fields";
import { apiError, levelsEnabled, planningState } from "./planning-handlers";
import {
  callerClubOwnsTheWorld,
  currentMockScenario,
  currentMockScenarioName,
  type MockScenarioDefinition,
} from "./scenarios";

type BookingListItem = components["schemas"]["BookingListItem"];
type ClassSession = components["schemas"]["ClassSession"];
type Filter = components["schemas"]["Filter"];
type JobSwitchRequest = components["schemas"]["JobSwitchRequest"];
type JobTriggerRequest = components["schemas"]["JobTriggerRequest"];
type RingBlock = components["schemas"]["RingBlock"];

export { JOBS_MOCK_NOW };

export function resetBackofficeMockState(): void {
  resetJobsState();
  resetRegistrantsState();
}

// ---------------------------------------------------------------------------------------------
// Roles, modules and tenancy (MATRIU_PERMISOS, S08/S09/S15 §6).

function isImpersonation(scenario: MockScenarioDefinition): boolean {
  return scenario.me.impersonation !== undefined;
}

function hasRole(scenario: MockScenarioDefinition, roles: readonly string[]): boolean {
  return scenario.me.membership?.roles.some((role) => roles.includes(role)) ?? false;
}

/** Staff reads: an impersonation token → `IMPERSONATION_DENIED`, any other role → `FORBIDDEN`. */
function refuse(scenario: MockScenarioDefinition, roles: readonly string[]) {
  if (isImpersonation(scenario)) {
    return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot use this route", 403);
  }
  return hasRole(scenario, roles) ? undefined : apiError("FORBIDDEN", "Forbidden", 403);
}

function moduleOff(scenario: MockScenarioDefinition, module: string) {
  return scenario.branding.modules.includes(module)
    ? undefined
    : apiError("MODULE_DISABLED", "Module disabled", 404);
}

function nowMs(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------------------------
// The universal list contract (CONVENCIONS_API §4) as the core applies it.

const OPERATORS = [
  "eq",
  "ne",
  "in",
  "nin",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "exists",
  "between",
] as const;
const PAGE_SIZES = [20, 50, 200, 1000];

interface ListSpec<Item> {
  /** `x-fields`. */
  fields: readonly string[];
  /** `x-filterable`. */
  filterable: readonly string[];
  /** Values of a field of an item, as strings (dates and instants compare as ISO strings). */
  values: (item: Item, field: string) => string[];
  /**
   * Free-text `q` over the item; absent for a list without search, where a non-blank `q` is
   * `400 INVALID_FILTER` (CONVENCIONS_API §4, ruling E75).
   */
  search?: (item: Item) => string;
  /** `x-sortable`. */
  sortable: readonly string[];
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function matches(values: readonly string[], filter: { op: string; value: string }): boolean {
  const targets = filter.value.split(",");
  switch (filter.op) {
    case "eq":
      return values.includes(filter.value);
    case "ne":
      return !values.includes(filter.value);
    case "in":
      return values.some((value) => targets.includes(value));
    case "nin":
      return values.every((value) => !targets.includes(value));
    case "contains":
      return values.some((value) => normalized(value).includes(normalized(filter.value)));
    case "startsWith":
      return values.some((value) => normalized(value).startsWith(normalized(filter.value)));
    case "exists":
      return filter.value === "true" ? values.some((value) => value !== "") : values.length === 0;
    case "lt":
      return values.some((value) => value < filter.value);
    case "lte":
      return values.some((value) => value <= filter.value);
    case "gt":
      return values.some((value) => value > filter.value);
    case "gte":
      return values.some((value) => value >= filter.value);
    case "between": {
      const [start = "", end = ""] = targets;
      return values.some((value) => value >= start && value <= end);
    }
    default:
      return false;
  }
}

type ParsedList<Item> =
  | { error: Response }
  | { error?: undefined; filters: { field: string; op: string; value: string }[]; items: Item[] };

/** `q`, `filter` and `sort` of a list or its export; anything undeclared is `400 INVALID_FILTER`. */
function selectItems<Item>(
  url: URL,
  items: readonly Item[],
  spec: ListSpec<Item>,
): ParsedList<Item> {
  const invalid = { error: apiError("INVALID_FILTER", "Invalid filter", 400) };
  const filters: { field: string; op: string; value: string }[] = [];
  for (const serialized of url.searchParams.getAll("filter")) {
    const first = serialized.indexOf(":");
    const second = serialized.indexOf(":", first + 1);
    const field = serialized.slice(0, first);
    const op = serialized.slice(first + 1, second);
    if (
      first <= 0 ||
      second <= first + 1 ||
      !(OPERATORS as readonly string[]).includes(op) ||
      !spec.filterable.includes(field)
    ) {
      return invalid;
    }
    filters.push({ field, op, value: serialized.slice(second + 1) });
  }
  const sorts: { direction: number; field: string }[] = [];
  for (const sort of url.searchParams.getAll("sort")) {
    const [field = "", direction = "asc"] = sort.split(",");
    if (!spec.sortable.includes(field) || !["asc", "desc"].includes(direction)) return invalid;
    sorts.push({ direction: direction === "desc" ? -1 : 1, field });
  }
  const q = normalized((url.searchParams.get("q") ?? "").trim());
  const search = spec.search;
  if (q !== "" && search === undefined) return invalid;
  const selected = items
    .filter((item) => q === "" || search === undefined || normalized(search(item)).includes(q))
    .filter((item) => filters.every((filter) => matches(spec.values(item, filter.field), filter)));
  selected.sort((left, right) => {
    for (const sort of sorts) {
      const a = spec.values(left, sort.field)[0] ?? "";
      const b = spec.values(right, sort.field)[0] ?? "";
      if (a !== b) return (a < b ? -1 : 1) * sort.direction;
    }
    return 0;
  });
  return { filters, items: selected };
}

/**
 * `appliedFilters` as the api echoes them: a list (`in`, `nin`) and a range (`between`) as JSON
 * arrays (CONVENCIONS_API §4: «JSON scalar or array»), the rest as the scalar it received.
 */
function echoedFilters(filters: readonly { field: string; op: string; value: string }[]): Filter[] {
  return filters.map((filter) => ({
    field: filter.field,
    op: filter.op as Filter["op"],
    value: ["between", "in", "nin"].includes(filter.op) ? filter.value.split(",") : filter.value,
  }));
}

function listResponse<Item extends object>(
  request: Request,
  items: readonly Item[],
  spec: ListSpec<Item>,
) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "0");
  const size = Number(url.searchParams.get("size") ?? "50");
  if (!Number.isInteger(page) || page < 0 || !PAGE_SIZES.includes(size)) {
    return apiError("INVALID_FILTER", "Invalid page", 400);
  }
  const projection = fieldsProjection<Item>(url, spec.fields, ["id"]);
  if (projection === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
  const selected = selectItems(url, items, spec);
  if (selected.error !== undefined) return selected.error;
  return HttpResponse.json({
    appliedFilters: echoedFilters(selected.filters),
    items: selected.items.slice(page * size, (page + 1) * size).map(projection ?? ((item) => item)),
    page,
    size,
    totalItems: selected.items.length,
    totalPages: Math.ceil(selected.items.length / size),
  });
}

/**
 * `GET /{list}/filter-values` (CONVENCIONS_API §4): the top 50 values of `field` (one of the list's
 * `x-filterable`), each counted over the whole set that the other filters and `q` select, never one
 * page; the filters on `field` itself are left out. `label` names a value as the api does.
 */
function filterValuesResponse<Item>(
  request: Request,
  items: readonly Item[],
  spec: ListSpec<Item>,
  label: (item: Item, field: string, value: string) => string,
) {
  const url = new URL(request.url);
  const field = url.searchParams.get("field") ?? "";
  if (!spec.filterable.includes(field)) {
    return apiError("INVALID_FILTER", "Invalid filter field", 400);
  }
  const others = new URL(url);
  others.searchParams.delete("field");
  others.searchParams.delete("filter");
  for (const filter of url.searchParams.getAll("filter")) {
    if (!filter.startsWith(`${field}:`)) others.searchParams.append("filter", filter);
  }
  const selected = selectItems(others, items, spec);
  if (selected.error !== undefined) return selected.error;
  const counted = new Map<string, { count: number; label: string }>();
  for (const item of selected.items) {
    for (const value of new Set(spec.values(item, field))) {
      const current = counted.get(value);
      counted.set(value, {
        count: (current?.count ?? 0) + 1,
        label: current?.label ?? label(item, field, value),
      });
    }
  }
  return HttpResponse.json({
    field,
    values: [...counted.entries()]
      .sort(([leftValue, left], [rightValue, right]) =>
        left.count === right.count ? leftValue.localeCompare(rightValue) : right.count - left.count,
      )
      .slice(0, 50)
      .map(([value, entry]) => ({ count: entry.count, label: entry.label, value })),
  });
}

/** A field's value as the filters compare it (objects, such as run counters, are not filterable). */
function text(value: unknown): string[] {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? [String(value)]
    : [];
}

// The universal-list helpers, shared with the S11 log (`messaging-handlers.ts`, E7-W01) and the
// calendar world's `GET /class-sessions` (`calendar-handlers.ts`).
export { type ListSpec, listResponse, refuse, selectItems, text as listValues };

// ---------------------------------------------------------------------------------------------
// S08 staff reads: class registrants, waiting entries and the universal `GET /bookings`.

/** A class of the caller's club: of the calendar world (D4) or of the day-grid world (screen 23). */
function findSession(scenario: MockScenarioDefinition, id: string): ClassSession | undefined {
  if (!callerClubOwnsTheWorld(scenario)) return undefined;
  return (
    planningState.sessions.find((session) => session.id === id) ??
    dayGridClassSessions().find((session) => session.id === id)
  );
}

function fifo(): boolean {
  return findParameter("waitlist.mode")?.value === "FIFO";
}

/** The census knows the member of the S08/S09 member world (`me-member.json`) as `member-laura`. */
const CENSUS_MEMBER_IDS: Readonly<Record<string, string>> = {
  "20000000-0000-4000-8000-000000000002": "member-laura",
  "20000000-0000-4000-8000-000000000031": "member-joan",
};
const censusMemberId = (id: string) => CENSUS_MEMBER_IDS[id] ?? id;

/**
 * A register row's ring as the api projects it (E5-T29): the catalog's id, name and colour; null
 * for a class without a ring.
 */
function ringFields(ring: { id?: string | null | undefined; name?: string | null | undefined }) {
  const found = catalogState.rings.find(
    (item) =>
      (ring.id != null && item.id === ring.id) || (ring.name != null && item.name === ring.name),
  );
  return found === undefined
    ? { ringColor: null, ringId: ring.id ?? null, ringName: ring.name ?? null }
    : { ringColor: found.color, ringId: found.id, ringName: found.name };
}

/**
 * `GET /bookings`: the member world's bookings (E5-W01) and the registrants of every class, all of
 * the mock club; a token of another club finds none (the tenant comes from the JWT).
 */
function bookingListItems(scenario: MockScenarioDefinition): Required<BookingListItem>[] {
  if (!callerClubOwnsTheWorld(scenario)) return [];
  const memberWorld = bookingState.bookings.flatMap((booking) => {
    const item = findClass(booking.classSessionId);
    const dog = findDog(booking.dogId);
    if (item === undefined || dog === undefined) return [];
    return [
      {
        bookedAt: booking.bookedAt,
        // R-08-01: the week the class's start falls in, the opening's hour included.
        bookingWeekKey: bookingWeekKeyOf(localInstant(item.startsAtLocal)),
        classDescription: item.description,
        classSessionId: booking.classSessionId,
        classStartsAt: localInstant(item.startsAtLocal),
        dogId: booking.dogId,
        dogName: dog.name,
        id: booking.id,
        late: booking.state === "CANCELLED_LATE" ? true : null,
        memberId: censusMemberId(booking.memberId),
        memberName: "Laura",
        origin: booking.origin,
        ...ringFields({ name: item.ringName }),
        state: booking.state,
      },
    ];
  });
  // The register's projection (x-fields): a registrant row without the class list's own fields.
  const staffWorld = planningState.sessions.flatMap((session) =>
    classBookingItems(session, levelsEnabled()).map((item) => ({
      bookedAt: item.bookedAt,
      bookingWeekKey: item.bookingWeekKey,
      classDescription: session.displayDescription,
      classSessionId: item.classSessionId,
      classStartsAt: item.classStartsAt,
      dogId: item.dogId,
      dogName: item.dogName,
      id: item.id,
      late: item.late ?? null,
      memberId: item.memberId,
      memberName: item.memberName,
      origin: item.origin,
      ...ringFields({ id: session.ringId }),
      state: item.state,
    })),
  );
  return [...memberWorld, ...staffWorld];
}

const BOOKING_SPEC: ListSpec<Required<BookingListItem>> = {
  fields: [
    "id",
    "state",
    "origin",
    "classSessionId",
    "classStartsAt",
    "bookingWeekKey",
    "dogId",
    "dogName",
    "memberId",
    "memberName",
    "bookedAt",
    "late",
    "classDescription",
    "ringId",
    "ringName",
    "ringColor",
  ],
  filterable: [
    "id",
    "state",
    "dogId",
    "memberId",
    "classSessionId",
    "bookingWeekKey",
    "origin",
    "classStartsAt",
  ],
  // No free-text search: `q` is INVALID_FILTER (E75).
  sortable: ["classStartsAt", "bookedAt"],
  values: (item, field) => text((item as Record<string, unknown>)[field]),
};

// ---------------------------------------------------------------------------------------------
// S09 ring-usage register: `GET /training-bookings` and `GET /ring-blocks`.

/** The week of Monday 3 August (the S09 world's): the days the `registerMany` rows fall on. */
const REGISTER_MANY_DAYS = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
];
const REGISTER_MANY_EARLY = 1000;
const REGISTER_MANY_LATE = 5;

/**
 * `registerMany` (E5-W05 step 5): 1005 more training bookings in the week, in the api's order of
 * storage; «Nil Fictici Soler» with Coco comes only after row 1000.
 */
function manyTrainingRows(): ReturnType<typeof trainingBookingListItems> {
  return Array.from({ length: REGISTER_MANY_EARLY + REGISTER_MANY_LATE }, (_, index) => {
    const late = index >= REGISTER_MANY_EARLY;
    const date = REGISTER_MANY_DAYS[index % REGISTER_MANY_DAYS.length] ?? "2026-08-03";
    const minutes = 9 * 60 + (index % 16) * 30;
    const time = (value: number) =>
      `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    return {
      createdAt: "2026-08-01T09:00:00Z",
      date,
      dogId: late ? "dog-coco-many" : "dog-blat-many",
      dogName: late ? "Coco" : "Blat",
      endsAt: localInstant(`${date}T${time(minutes + 30)}`),
      endsAtLocal: time(minutes + 30),
      id: `training-many-${String(index)}`,
      memberId: late ? "member-nil-many" : "member-pau-many",
      memberName: late ? "Nil Fictici Soler" : "Pau Fictici Mas",
      memberNumber: null,
      origin: "APP",
      ringId: "ring-central",
      ringName: "Central",
      startsAt: localInstant(`${date}T${time(minutes)}`),
      startsAtLocal: time(minutes),
      state: "ACTIVE",
    };
  });
}

/** The register's rows: the mock club's, so a token of another club finds none. */
const trainingRows = (scenario: MockScenarioDefinition) =>
  (callerClubOwnsTheWorld(scenario)
    ? [
        ...trainingBookingListItems(nowMs()),
        ...(currentMockScenarioName() === "registerMany" ? manyTrainingRows() : []),
      ]
    : []
  ).map((item) => {
    const memberId = censusMemberId(item.memberId);
    const member = censusMembers.find((candidate) => candidate.id === memberId);
    return {
      ...item,
      memberId,
      // The register names the member by its full name, as D10 does (the core's register).
      memberName: member?.fullName ?? item.memberName,
      // Member.memberNumber from the census (E5-T29); null for a member without one.
      memberNumber: member?.memberNumber ?? null,
    };
  });

type TrainingRow = ReturnType<typeof trainingRows>[number];

const TRAINING_SPEC: ListSpec<TrainingRow> = {
  fields: [
    "id",
    "date",
    "startsAt",
    "startsAtLocal",
    "endsAt",
    "endsAtLocal",
    "ringId",
    "ringName",
    "memberId",
    "memberName",
    "memberNumber",
    "dogId",
    "dogName",
    "state",
    "origin",
    "createdAt",
  ],
  filterable: ["id", "date", "ringId", "memberId", "dogId", "state", "origin"],
  search: (item) => `${item.memberName} ${item.dogName} ${item.ringName}`,
  sortable: ["startsAt"],
  values: (item, field) => text((item as Record<string, unknown>)[field]),
};

/** Rows of `GET /training-bookings/export` (ADMIN, S14 R-14-12), or the api's error. */
export function trainingBookingExportRows(request: Request): number | Response {
  const scenario = currentMockScenario();
  const refused = refuse(scenario, ["ADMIN"]) ?? moduleOff(scenario, "FREE_TRAINING");
  if (refused !== undefined) return refused;
  const url = new URL(request.url);
  const columns = (url.searchParams.get("columns") ?? "").split(",").filter((key) => key !== "");
  if (!columns.every((key) => TRAINING_SPEC.fields.includes(key))) {
    return apiError("INVALID_FILTER", "Invalid columns", 400);
  }
  const selected = selectItems(url, trainingRows(scenario), TRAINING_SPEC);
  return selected.error ?? selected.items.length;
}

/** The MEMBER projection leaves out `note` and `createdByName` (S06 §6, T-09-30). */
const MEMBER_BLOCK_KEYS = new Set(["note", "createdByName"]);

/** A row of `GET /ring-blocks` (`RingBlockListItem`): the block with its ring's name and colour. */
type RingBlockRow = RingBlock & { ringColor: string | null; ringName: string | null };

function ringBlockSpec(member: boolean): ListSpec<RingBlockRow> {
  return {
    fields: [
      "id",
      "ringId",
      "ringName",
      "ringColor",
      "from",
      "to",
      "date",
      "fromLocal",
      "toLocal",
      "kind",
      "reason",
      "activityId",
      "activityTitle",
      "state",
      "version",
      ...(member ? [] : ["note", "createdByName"]),
    ],
    filterable: ["id", "ringId", "kind", "reason", "state", "from", "to"],
    // The ring's name and, for ADMIN and INSTRUCTOR, the note (S09 §2, E75).
    search: (item) => `${item.ringName ?? ""} ${member ? "" : (item.note ?? "")}`,
    sortable: ["from"],
    values: (item, field) => text((item as Record<string, unknown>)[field]),
  };
}

/**
 * `registerMany` (E5-W05 step 5): 1005 more blocks in the week; the last 5, after row 1000, are the
 * only ones on «Cadells».
 */
function manyBlocks(): RingBlock[] {
  return Array.from({ length: REGISTER_MANY_EARLY + REGISTER_MANY_LATE }, (_, index) => {
    const late = index >= REGISTER_MANY_EARLY;
    const date = REGISTER_MANY_DAYS[index % REGISTER_MANY_DAYS.length] ?? "2026-08-03";
    const hour = String(6 + (index % 14)).padStart(2, "0");
    const next = String(7 + (index % 14)).padStart(2, "0");
    return {
      activityId: null,
      activityTitle: null,
      createdByName: "Marc",
      date,
      from: localInstant(`${date}T${hour}:00`),
      fromLocal: `${hour}:00`,
      id: `rb-many-${String(index)}`,
      kind: "BLOCK",
      note: late ? "Canvi de la tanca" : `Revisió ${String(index + 1)}`,
      reason: "MAINTENANCE",
      ringId: late ? "ring-cadells" : "ring-central",
      state: "ACTIVE",
      to: localInstant(`${date}T${next}:00`),
      toLocal: `${next}:00`,
      version: 1,
    };
  });
}

/**
 * The rows of `GET /ring-blocks`: each block with its ring's name and colour (E5-T29), of the mock
 * club only (a token of another club finds none).
 */
function ringBlockRows(scenario: MockScenarioDefinition, member: boolean): RingBlockRow[] {
  if (!callerClubOwnsTheWorld(scenario)) return [];
  const blocks = [
    ...ringBlockListItems(),
    ...(currentMockScenarioName() === "registerMany" ? manyBlocks() : []),
  ];
  return blocks.map((stored): RingBlockRow => {
    // The ring's name and colour, a deactivated ring's included (E5-T29).
    const { ringColor, ringName } = ringFields({ id: stored.ringId });
    const block = { ...stored, ringColor, ringName };
    return member
      ? (Object.fromEntries(
          Object.entries(block).filter(([key]) => !MEMBER_BLOCK_KEYS.has(key)),
        ) as RingBlockRow)
      : block;
  });
}

function isRegisterBlock(id: string): boolean {
  return id === ACTIVITY_RING_BLOCK.id || trainingState.blocks.some((block) => block.id === id);
}

// ---------------------------------------------------------------------------------------------
// S15 processes (R-15-01, R-15-09) and the D1 risk review (form A).

function visibleJobs(scenario: MockScenarioDefinition): StoredJob[] {
  return jobsState.jobs.filter(
    (job) => job.entry.module === null || scenario.branding.modules.includes(job.entry.module),
  );
}

/**
 * `{name}` of a process: unknown → `404 JOB_UNKNOWN` (S15 §6 and CATALEG_ERRORS rule 0 amended
 * 24-09); module off → `404 MODULE_DISABLED` (R-15-09).
 */
function jobFor(scenario: MockScenarioDefinition, name: string): StoredJob | Response {
  const job = jobsState.jobs.find((item) => item.entry.name === name);
  if (job === undefined) return apiError("JOB_UNKNOWN", "Unknown process", 404);
  if (job.entry.module !== null && !scenario.branding.modules.includes(job.entry.module)) {
    return apiError("MODULE_DISABLED", "Module disabled", 404);
  }
  return job;
}

const RUN_SPEC: ListSpec<StoredJob["runs"][number]> = {
  fields: [
    "runId",
    "scheduledFor",
    "scheduledForLocal",
    "trigger",
    "dryRun",
    "status",
    "skipReason",
    "startedAt",
    "finishedAt",
    "durationMs",
    "counters",
    "errorCount",
  ],
  filterable: ["status", "scheduledFor", "trigger", "dryRun"],
  // No free-text search: `q` is INVALID_FILTER (E75).
  sortable: ["scheduledFor", "startedAt"],
  values: (item, field) => text((item as Record<string, unknown>)[field]),
};

/** The club-local date of now (the api's default `date` of `GET /risk-review`). */
function clubToday(): string {
  return clubLocalDate(new Date(nowMs()));
}

/** A club parameter's value, or the product default when the mock club does not list it. */
function parameterValue<Value extends boolean | number | string>(
  key: string,
  fallback: Value,
): Value {
  const value = findParameter(key)?.value;
  return typeof value === typeof fallback ? (value as Value) : fallback;
}

export const backofficeHandlers = [
  // S08 §6: every booking of the class, any state (INSTRUCTOR and ADMIN).
  http.get("*/api/v1/class-sessions/:id/bookings", ({ params }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]);
    if (refused !== undefined) return refused;
    const session = findSession(scenario, String(params.id));
    if (session === undefined) return apiError("NOT_FOUND", "Class not found", 404);
    return HttpResponse.json({ items: classBookingItems(session, levelsEnabled()) });
  }),
  // S08 §6: every waiting entry of the class, any state, in position order (requires WAITLIST).
  http.get("*/api/v1/class-sessions/:id/waitlist-entries", ({ params }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]) ?? moduleOff(scenario, "WAITLIST");
    if (refused !== undefined) return refused;
    const session = findSession(scenario, String(params.id));
    if (session === undefined) return apiError("NOT_FOUND", "Class not found", 404);
    return HttpResponse.json({ items: classWaitlistEntries(session, fifo()) });
  }),
  // R-08-16 for the staff-read entries (the member world's are answered by `bookingHandlers`).
  // S08 §6: MEMBER (own entry) · ADMIN, with WAITLIST; the club's own classes only (the tenant
  // comes from the JWT). An impersonation token acts as the member: only the member's own entry.
  http.post("*/api/v1/waitlist-entries/:id/cancellation", ({ params }) => {
    const entry = findRegistrantEntry(String(params.id));
    if (entry === undefined) return undefined;
    const scenario = currentMockScenario();
    const disabled = moduleOff(scenario, "WAITLIST");
    if (disabled !== undefined) return disabled;
    // An entry of a class of the caller's club only (E5-W05 step 16).
    if (findSession(scenario, entry.classSessionId) === undefined) {
      return apiError("NOT_FOUND", "Waitlist entry not found", 404);
    }
    const memberId = scenario.me.membership?.memberId;
    const own = memberId !== undefined && censusMemberId(memberId) === entry.memberId;
    const admin = !isImpersonation(scenario) && hasRole(scenario, ["ADMIN"]);
    if (!admin && !own) {
      // A member (or an impersonation) only reaches its own entries; other staff roles are refused.
      return isImpersonation(scenario) || !hasRole(scenario, ["INSTRUCTOR", "ADMIN"])
        ? apiError("NOT_FOUND", "Waitlist entry not found", 404)
        : apiError("FORBIDDEN", "Forbidden", 403);
    }
    if (entry.state !== "ACTIVE" && entry.state !== "NOTIFIED") {
      return apiError("WAITLIST_ENTRY_NOT_LIVE", "The entry is no longer live", 422);
    }
    entry.state = "CANCELLED";
    // As the member world records it (E5-W01): the admin acting as the member is `ADMIN`.
    entry.cancelReason = admin || isImpersonation(scenario) ? "ADMIN" : "MEMBER";
    entry.cancelledAt = new Date(nowMs()).toISOString();
    const session = planningState.sessions.find((item) => item.id === entry.classSessionId);
    if (session !== undefined) {
      session.counters = {
        ...session.counters,
        waiting: Math.max(0, session.counters.waiting - 1),
      };
    }
    return HttpResponse.json(entry);
  }),
  // S08 §6 universal list for D10/D12 (MEMBER → 403, T-08-47).
  http.get("*/api/v1/bookings", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]);
    if (refused !== undefined) return refused;
    return listResponse(request, bookingListItems(scenario), BOOKING_SPEC);
  }),
  // Its universal filter (E5-T29): the dog's and the member's names, the class's start and
  // description; any other field its value.
  http.get("*/api/v1/bookings/filter-values", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]);
    if (refused !== undefined) return refused;
    const items = bookingListItems(scenario);
    return filterValuesResponse(request, items, BOOKING_SPEC, (item, field, value) =>
      field === "dogId"
        ? item.dogName
        : field === "memberId"
          ? item.memberName
          : field === "classSessionId"
            ? // The core's label (`bookings-filter-values-core.json`): «2026-10-08T17:40 · D+E», the
              // club-local start without seconds or offset, and the class's description.
              `${clubLocalDateTime(new Date(item.classStartsAt))} · ${item.classDescription}`
            : value,
    );
  }),
  // S09 §6 ring-usage register (INSTRUCTOR, ADMIN; requires FREE_TRAINING).
  http.get("*/api/v1/training-bookings", ({ request }) => {
    const scenario = currentMockScenario();
    const refused =
      refuse(scenario, ["INSTRUCTOR", "ADMIN"]) ?? moduleOff(scenario, "FREE_TRAINING");
    if (refused !== undefined) return refused;
    return listResponse(request, trainingRows(scenario), TRAINING_SPEC);
  }),
  // The register's universal filter (E5-T29): the ring's, the member's and the dog's names.
  http.get("*/api/v1/training-bookings/filter-values", ({ request }) => {
    const scenario = currentMockScenario();
    const refused =
      refuse(scenario, ["INSTRUCTOR", "ADMIN"]) ?? moduleOff(scenario, "FREE_TRAINING");
    if (refused !== undefined) return refused;
    const rows = trainingRows(scenario);
    return filterValuesResponse(request, rows, TRAINING_SPEC, (item, field, value) =>
      field === "ringId"
        ? item.ringName
        : field === "memberId"
          ? item.memberName
          : field === "dogId"
            ? item.dogName
            : value,
    );
  }),
  // S06/S09 §6: every role; the MEMBER projection is redacted and cannot ask for the hidden keys.
  http.get("*/api/v1/ring-blocks", ({ request }) => {
    const scenario = currentMockScenario();
    const member = isImpersonation(scenario) || !hasRole(scenario, ["INSTRUCTOR", "ADMIN"]);
    return listResponse(request, ringBlockRows(scenario, member), ringBlockSpec(member));
  }),
  // The register's universal filter (E5-T29, staff only): the ring's name, a deactivated one's too.
  http.get("*/api/v1/ring-blocks/filter-values", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]);
    if (refused !== undefined) return refused;
    return filterValuesResponse(
      request,
      ringBlockRows(scenario, false),
      ringBlockSpec(false),
      (item, field, value) => (field === "ringId" ? (item.ringName ?? value) : value),
    );
  }),
  // R-06-11 / R-09-13 for this world's blocks (the calendar world answers its own).
  http.post("*/api/v1/ring-blocks/:id/cancellation", ({ params }) => {
    const id = String(params.id);
    if (!isRegisterBlock(id)) return undefined;
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]);
    if (refused !== undefined) return refused;
    // The tenant comes from the JWT: another club's token finds none of this club's blocks.
    if (!callerClubOwnsTheWorld(scenario)) {
      return apiError("NOT_FOUND", "Ring block not found", 404);
    }
    if (id === ACTIVITY_RING_BLOCK.id) {
      return apiError("RING_BLOCK_MANAGED_BY_ACTIVITY", "Managed by an activity", 422);
    }
    const current = trainingState.blocks.find((block) => block.id === id);
    if (current === undefined) return apiError("NOT_FOUND", "Ring block not found", 404);
    if (current.state !== "ACTIVE") {
      return apiError("INVALID_STATE", "The block is already cancelled", 409);
    }
    const next: RingBlock = { ...current, state: "CANCELLED", version: current.version + 1 };
    trainingState.blocks = trainingState.blocks.map((block) => (block.id === id ? next : block));
    return HttpResponse.json(next);
  }),
  // S15 §6: the D11 card (ADMIN; impersonation → 403). Processes of a module that is off: absent.
  http.get("*/api/v1/jobs", () => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["ADMIN"]);
    if (refused !== undefined) return refused;
    // Each schedule, and its next run, at its parameter's local time (R-15-01), so a saved change
    // shows at once.
    return HttpResponse.json({
      items: visibleJobs(scenario).map((job) =>
        jobSummary(job, (key) => findParameter(key)?.value, nowMs()),
      ),
    });
  }),
  http.get("*/api/v1/jobs/:name/runs", ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["ADMIN"]);
    if (refused !== undefined) return refused;
    const job = jobFor(scenario, String(params.name));
    if (job instanceof Response) return job;
    const rows = job.runs.map((item) => ({
      counters: item.effects.counters,
      dryRun: item.dryRun,
      durationMs: item.durationMs ?? null,
      errorCount: item.errors.length,
      finishedAt: item.finishedAt ?? null,
      runId: item.runId,
      scheduledFor: item.scheduledFor,
      scheduledForLocal: item.scheduledForLocal,
      skipReason: item.skipReason ?? null,
      startedAt: item.startedAt,
      status: item.status,
      trigger: item.trigger,
    }));
    const url = new URL(request.url);
    const projection = fieldsProjection<(typeof rows)[number]>(url, RUN_SPEC.fields, ["runId"]);
    if (projection === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
    const size = Number(url.searchParams.get("size") ?? "50");
    const page = Number(url.searchParams.get("page") ?? "0");
    if (!PAGE_SIZES.includes(size) || !Number.isInteger(page) || page < 0) {
      return apiError("INVALID_FILTER", "Invalid page", 400);
    }
    const selected = selectItems(url, job.runs, RUN_SPEC);
    if (selected.error !== undefined) return selected.error;
    const ids = new Set(selected.items.map((item) => item.runId));
    const items = rows.filter((row) => ids.has(row.runId));
    return HttpResponse.json({
      appliedFilters: echoedFilters(selected.filters),
      items: items.slice(page * size, (page + 1) * size).map(projection ?? ((item) => item)),
      page,
      size,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / size),
    });
  }),
  http.get("*/api/v1/jobs/:name/runs/:runId", ({ params }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["ADMIN"]);
    if (refused !== undefined) return refused;
    const job = jobFor(scenario, String(params.name));
    if (job instanceof Response) return job;
    const found = job.runs.find((item) => item.runId === String(params.runId));
    return found === undefined
      ? apiError("NOT_FOUND", "Run not found", 404)
      : HttpResponse.json(found);
  }),
  // R-15-09: synchronous, also with the switch off; `class-finishing` runs every minute, so a
  // manual run meets the tick's lock (R-15-06 `409 JOB_ALREADY_RUNNING`).
  http.post("*/api/v1/jobs/:name/trigger", async ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["ADMIN"]);
    if (refused !== undefined) return refused;
    const job = jobFor(scenario, String(params.name));
    if (job instanceof Response) return job;
    const body = (await request.json()) as Partial<JobTriggerRequest>;
    if (typeof body.dryRun !== "boolean") {
      return apiError("VALIDATION_ERROR", "Validation failed", 400, {
        fieldErrors: [{ code: "REQUIRED", field: "dryRun" }],
      });
    }
    if (job.entry.name === "class-finishing") {
      return apiError("JOB_ALREADY_RUNNING", "The process is already running", 409);
    }
    const result = manualRun(job, body.dryRun, nowMs());
    if (job.entry.name === "waitlist-fifo" && !fifo()) {
      // `waitlist.mode = ALL_AT_ONCE`: nothing to expire (R-15-03 `SKIPPED{MODULE_OFF}`).
      result.status = "SKIPPED";
      result.skipReason = "MODULE_OFF";
    }
    job.runs = [result, ...job.runs];
    return HttpResponse.json(result);
  }),
  // R-15-09: the switch writes `jobs.<name>.enabled` through the parameter service.
  http.put("*/api/v1/jobs/:name/switch", async ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["ADMIN"]);
    if (refused !== undefined) return refused;
    const job = jobFor(scenario, String(params.name));
    if (job instanceof Response) return job;
    const body = (await request.json()) as Partial<JobSwitchRequest>;
    if (typeof body.enabled !== "boolean") {
      return apiError("VALIDATION_ERROR", "Validation failed", 400, {
        fieldErrors: [{ code: "REQUIRED", field: "enabled" }],
      });
    }
    job.enabled = body.enabled;
    const parameter = findParameter(job.entry.parameter);
    if (parameter !== undefined) {
      replaceParameter({ ...parameter, value: body.enabled, version: parameter.version + 1 });
    }
    return HttpResponse.json({ enabled: job.enabled, name: job.entry.name });
  }),
  // S15 §6 form A (ADMIN, INSTRUCTOR; MEMBER → 403). `date` defaults to the club's today.
  http.get("*/api/v1/risk-review", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = refuse(scenario, ["INSTRUCTOR", "ADMIN"]);
    if (refused !== undefined) return refused;
    const date = new URL(request.url).searchParams.get("date") ?? clubToday();
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400, {
        fieldErrors: [{ code: "INVALID", field: "date" }],
      });
    }
    // Computed from the caller's club's classes (E5-W05 step 15): the calendar world's.
    const classes =
      callerClubOwnsTheWorld(scenario) && currentMockScenarioName() !== "riskReviewEmpty"
        ? planningState.sessions
        : [];
    return HttpResponse.json(
      riskReviewForm(date, {
        autoCancelSameDay: parameterValue(
          "classes.riskAutoCancelSameDay",
          RISK_REVIEW_DEFAULTS.autoCancelSameDay,
        ),
        enabled: jobsState.jobs.find((job) => job.entry.name === "risk-review")?.enabled ?? true,
        lookaheadDays: parameterValue(
          "classes.riskLookaheadDays",
          RISK_REVIEW_DEFAULTS.lookaheadDays,
        ),
        // The club's minimum, as D4's risk mark reads it (`atRiskNow`).
        minDogs: minDogsParameter(),
        now: nowMs(),
        registrants: (session) => classBookingItems(session, levelsEnabled()),
        reviewTime: parameterValue("classes.riskReviewTime", RISK_REVIEW_DEFAULTS.reviewTime),
        ringName: (session) => ringFields({ id: session.ringId }).ringName,
        sessions: classes,
      }),
    );
  }),
];
