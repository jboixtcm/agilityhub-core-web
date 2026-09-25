import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  classSession,
  type ClassSession,
  initialClassSessions,
  initialRingBlocks,
  initialTrainingBookings,
  type MockTrainingBooking,
  type RingBlock,
} from "./fixtures/calendar";
import { catalogState } from "./fixtures/catalogs";
import { resetDayGridState } from "./fixtures/day-grid";
import {
  addDays,
  clubLocalDate,
  coverageFixture,
  initialWeekTemplates,
  initialWeeks,
  mockDisplayDescription,
  mockWeek,
  mondayOf,
  withInconsistencies,
  type MockWeek,
  type TemplateClass,
  type TimeBand,
  type WeekTemplate,
} from "./fixtures/planning";
import { findParameter } from "./fixtures/settings";
import { currentMockScenario } from "./scenarios";

type ApiErrorResponse = components["schemas"]["ApiError"];
type WeekTemplateCreateRequest = components["schemas"]["WeekTemplateCreateRequest"];
type WeekTemplatePatchRequest = components["schemas"]["WeekTemplatePatchRequest"];
type TimeBandCreateRequest = components["schemas"]["TimeBandCreateRequest"];
type TimeBandPatchRequest = components["schemas"]["TimeBandPatchRequest"];
type TemplateClassCreateRequest = components["schemas"]["TemplateClassCreateRequest"];
type TemplateClassPatchRequest = components["schemas"]["TemplateClassPatchRequest"];
type WeekCreateRequest = components["schemas"]["WeekCreateRequest"];
type GenerationRequest = components["schemas"]["GenerationRequest"];
type GenerationCandidate = components["schemas"]["GenerationCandidate"];
type WeekListItem = components["schemas"]["WeekListItem"];
type SkippedClasses = components["schemas"]["SkippedClasses"];

const SLOT_MINUTES = 10;
const DEFAULT_CAPACITY = 5;
const CANDIDATE_WEEKS = 13;

export const planningState: {
  blocks: RingBlock[];
  sequence: number;
  sessions: ClassSession[];
  templates: WeekTemplate[];
  trainingBookings: MockTrainingBooking[];
  weeks: MockWeek[];
} = {
  blocks: initialRingBlocks(mondayOf(clubLocalDate())),
  sequence: 1,
  sessions: initialClassSessions(mondayOf(clubLocalDate())),
  templates: structuredClone([...initialWeekTemplates]),
  trainingBookings: initialTrainingBookings(mondayOf(clubLocalDate())),
  weeks: initialWeeks(),
};

/** Rebuilds the planning state relative to the club-local date of now (tests may fake `Date`). */
export function resetPlanningState(): void {
  const monday = mondayOf(clubLocalDate());
  planningState.blocks = initialRingBlocks(monday);
  planningState.sequence = 1;
  planningState.sessions = initialClassSessions(monday);
  planningState.templates = structuredClone([...initialWeekTemplates]);
  planningState.trainingBookings = initialTrainingBookings(monday);
  planningState.weeks = initialWeeks();
  resetDayGridState();
}

export function nextId(prefix: string): string {
  planningState.sequence += 1;
  return `${prefix}-${String(planningState.sequence)}`;
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return HttpResponse.json<ApiErrorResponse>(
    { code, details, message, traceId: "mock-trace-id" },
    { status },
  );
}

export function validationError(field: string, code = "INVALID") {
  return apiError("VALIDATION_ERROR", "Validation failed", 400, { fieldErrors: [{ code, field }] });
}

export function levelsEnabled(): boolean {
  return currentMockScenario().levelsEnabled ?? true;
}

export function maxInstructors(): number {
  return currentMockScenario().maxInstructorsPerClass ?? 1;
}

export function planningLevels() {
  return catalogState.levels.map((level) => ({
    active: level.active,
    capacity: level.capacity,
    id: level.id,
    name: level.name,
    nameI18n: level.nameI18n,
    order: level.order,
    progression: level.progression,
  }));
}

/** Reader language of a request (`Accept-Language`, sent by the client), as the api resolves it. */
export function readerLocale(request: Request): string {
  const language = request.headers.get("Accept-Language")?.split(/[-,;]/u)[0]?.trim() ?? "";
  return ["ca", "es", "en"].includes(language) ? language : "ca";
}

/** The stored template with `displayDescription` resolved in the reader's language (R-06-03). */
function forReader(template: WeekTemplate, request: Request): WeekTemplate {
  const locale = readerLocale(request);
  if (locale === "ca") return template;
  const levels = planningLevels();
  return {
    ...template,
    classes: template.classes.map((item) => ({
      ...item,
      displayDescription: mockDisplayDescription(levels, item.levelIds, item.description, locale),
    })),
  };
}

function refreshed(template: WeekTemplate): WeekTemplate {
  const levels = planningLevels();
  const withDescriptions = {
    ...template,
    classes: template.classes.map((item) => ({
      ...item,
      displayDescription: mockDisplayDescription(levels, item.levelIds, item.description),
    })),
  };
  return withInconsistencies(
    withDescriptions,
    catalogState.rings.map((ring) => ({ id: ring.id, name: ring.name })),
    catalogState.instructors.map((instructor) => ({
      id: instructor.id,
      shortName: instructor.shortName,
    })),
  );
}

function store(template: WeekTemplate): WeekTemplate {
  const next = refreshed({ ...template, version: template.version + 1 });
  const index = planningState.templates.findIndex((candidate) => candidate.id === template.id);
  if (index >= 0) {
    planningState.templates[index] = next;
  } else {
    planningState.templates.push(next);
  }
  return next;
}

function findTemplate(id: string): WeekTemplate | undefined {
  return planningState.templates.find((template) => template.id === id);
}

export function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

/**
 * The window every day of the template shares (`WeekTemplateRules`, R-06-01): `undefined` when a
 * day of its kind is absent from `club.openingHours` (closed, R-02-09), so no band fits. The
 * product default (dl–dg 07:00–22:00) applies only to a club without the parameter.
 */
function openingWindow(template: WeekTemplate): { close: number; open: number } | undefined {
  const parameter = findParameter("club.openingHours");
  const value = parameter?.value as
    Record<string, { close: string; open: string } | undefined> | undefined;
  const windows: { close: string; open: string }[] = [];
  for (const day of template.days) {
    const window = parameter === undefined ? { close: "22:00", open: "07:00" } : value?.[day];
    if (window === undefined) return undefined;
    windows.push(window);
  }
  return {
    close: Math.min(...windows.map((window) => minutes(window.close))),
    open: Math.max(...windows.map((window) => minutes(window.open))),
  };
}

function bandProblem(
  template: WeekTemplate,
  startTime: string,
  endTime: string,
  ignoreId?: string,
) {
  if (!/^\d{2}:\d{2}$/u.test(startTime) || !/^\d{2}:\d{2}$/u.test(endTime)) {
    return validationError("startTime");
  }
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    return apiError("INVALID_SLOT_GRANULARITY", "Band limits must be multiples of the slot", 400);
  }
  if (start >= end) {
    return apiError("INVALID_TIME_RANGE", "Band start must precede its end", 400);
  }
  const window = openingWindow(template);
  if (window === undefined || start < window.open || end > window.close) {
    return apiError("OUTSIDE_OPENING_HOURS", "Band outside opening hours", 422);
  }
  const overlapping = template.bands.some(
    (band) =>
      band.id !== ignoreId && start < minutes(band.endTime) && minutes(band.startTime) < end,
  );
  return overlapping ? apiError("BAND_OVERLAP", "Band overlaps another band", 409) : undefined;
}

function sortedBands(bands: readonly TimeBand[]): TimeBand[] {
  return [...bands].sort((left, right) => minutes(left.startTime) - minutes(right.startTime));
}

export function autoCapacity(levelIds: readonly string[]): number {
  const capacities = catalogState.levels
    .filter((level) => levelIds.includes(level.id))
    .map((level) => level.capacity);
  return capacities.length === 0 ? DEFAULT_CAPACITY : Math.min(...capacities);
}

function classProblem(
  template: WeekTemplate,
  item: Pick<TemplateClass, "bandId" | "dayOfWeek" | "description" | "instructorIds" | "levelIds">,
) {
  if (!template.bands.some((band) => band.id === item.bandId)) {
    return validationError("bandId");
  }
  if (!template.days.includes(item.dayOfWeek)) {
    return validationError("dayOfWeek");
  }
  if (item.instructorIds.length === 0) {
    return validationError("instructorIds", "REQUIRED");
  }
  if (item.instructorIds.length > maxInstructors()) {
    return apiError("TOO_MANY_INSTRUCTORS", "Too many instructors", 422);
  }
  if (levelsEnabled() && item.levelIds.length === 0) {
    return apiError("LEVEL_REQUIRED", "At least one level is required", 422);
  }
  if (!levelsEnabled() && (item.description ?? "").trim() === "") {
    return apiError("DESCRIPTION_REQUIRED", "A description is required", 422);
  }
  return undefined;
}

export function manualDescription(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value.trim();
}

/** `classCounts` from the class sessions of the week once it has any (the D4 calendar state). */
function classCounts(week: MockWeek): WeekListItem["classCounts"] {
  const sessions = planningState.sessions.filter((session) => session.weekId === week.id);
  if (sessions.length === 0) return week.classCounts;
  const count = (states: readonly ClassSession["state"][]) =>
    sessions.filter((session) => states.includes(session.state)).length;
  return {
    active: count(["ACTIVE", "FINISHED"]),
    cancelled: count(["CANCELLED"]),
    draft: count(["DRAFT"]),
  };
}

export function weekListItem(week: MockWeek): WeekListItem {
  return {
    classCounts: classCounts(week),
    endDate: week.endDate,
    generatedAt: week.generatedAt ?? null,
    id: week.id,
    isoWeek: week.isoWeek,
    isoYear: week.isoYear,
    saturdayTemplateName: week.saturdayTemplateName ?? null,
    startDate: week.startDate,
    state: week.state,
    validatedAt: week.validatedAt ?? null,
    weekdayTemplateName: week.weekdayTemplateName ?? null,
  };
}

export function weekResource(week: MockWeek): components["schemas"]["Week"] {
  return {
    endDate: week.endDate,
    generatedAt: week.generatedAt ?? null,
    generatedByAccountId: week.generatedByAccountId ?? null,
    id: week.id,
    isoWeek: week.isoWeek,
    isoYear: week.isoYear,
    saturdayTemplateId: week.saturdayTemplateId ?? null,
    startDate: week.startDate,
    state: week.state,
    validatedAt: week.validatedAt ?? null,
    validatedByAccountId: week.validatedByAccountId ?? null,
    version: week.version,
    weekdayTemplateId: week.weekdayTemplateId ?? null,
  };
}

function candidates(): GenerationCandidate[] {
  const current = mondayOf(clubLocalDate());
  const generated = planningState.weeks.filter(
    (week) => week.generatedAt !== null && week.generatedAt !== undefined,
  );
  const lastGenerated = generated
    .map((week) => week.startDate)
    .sort()
    .at(-1);
  const items = Array.from({ length: CANDIDATE_WEEKS }, (_, index) => addDays(current, index * 7))
    .map(
      (monday) => planningState.weeks.find((week) => week.startDate === monday) ?? mockWeek(monday),
    )
    .filter(
      (week) =>
        week.state !== "VALIDATED" && (week.generatedAt === null || week.generatedAt === undefined),
    );
  const proposed =
    lastGenerated === undefined
      ? items[0]?.startDate
      : items.find((week) => week.startDate > lastGenerated)?.startDate;
  return items.map((week) => {
    const known = planningState.weeks.some((candidate) => candidate.id === week.id);
    return {
      endDate: week.endDate,
      isoWeek: week.isoWeek,
      isoYear: week.isoYear,
      proposed: week.startDate === proposed,
      startDate: week.startDate,
      state: week.state,
      ...(known ? { weekId: week.id } : {}),
    };
  });
}

export function holidayDates(): string[] {
  const value = findParameter("club.holidays")?.value;
  return Array.isArray(value)
    ? value.flatMap((entry: unknown) =>
        typeof entry === "string"
          ? [entry]
          : typeof entry === "object" &&
              entry !== null &&
              "date" in entry &&
              typeof entry.date === "string"
            ? [entry.date]
            : [],
      )
    : [];
}

const dayOffset: Readonly<Record<TemplateClass["dayOfWeek"], number>> = {
  FRIDAY: 4,
  MONDAY: 0,
  SATURDAY: 5,
  SUNDAY: 6,
  THURSDAY: 3,
  TUESDAY: 1,
  WEDNESDAY: 2,
};

export const planningHandlers = [
  http.get("*/api/v1/week-templates", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const active = url.searchParams.get("active");
    const items = planningState.templates
      .filter((template) => kind === null || template.kind === kind)
      .filter((template) => active === null || String(template.active) === active)
      .map((template) => ({
        active: template.active,
        classCount: template.classes.length,
        id: template.id,
        inconsistencyCount: template.inconsistencies.length,
        kind: template.kind,
        name: template.name,
        updatedAt: "2026-08-14T10:00:00Z",
      }));
    return HttpResponse.json({ items });
  }),
  http.post("*/api/v1/week-templates", async ({ request }) => {
    const body = (await request.json()) as WeekTemplateCreateRequest;
    const name = body.name.trim();
    if (name === "" || name.length > 40) {
      return validationError("name");
    }
    const duplicate = planningState.templates.some(
      (template) =>
        template.kind === body.kind &&
        template.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) {
      return apiError("DUPLICATE_NAME", "Duplicate template name", 409, { field: "name" });
    }
    const source = body.copyFromId === undefined ? undefined : findTemplate(body.copyFromId);
    if (body.copyFromId !== undefined && source === undefined) {
      return apiError("NOT_FOUND", "Template not found", 404);
    }
    if (source !== undefined && source.kind !== body.kind) {
      return apiError("TEMPLATE_KIND_MISMATCH", "The copy must keep the template kind", 422);
    }
    const id = nextId("template");
    const bandIds = new Map((source?.bands ?? []).map((band) => [band.id, nextId(`${id}-band`)]));
    const template: WeekTemplate = {
      active: true,
      bands: (source?.bands ?? []).map((band) => ({
        ...band,
        id: bandIds.get(band.id) ?? band.id,
      })),
      canGenerate: true,
      classes: (source?.classes ?? []).map((item) => ({
        ...item,
        bandId: bandIds.get(item.bandId) ?? item.bandId,
        id: nextId(`${id}-class`),
      })),
      days:
        body.kind === "SATURDAY"
          ? ["SATURDAY"]
          : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      id,
      inconsistencies: [],
      kind: body.kind,
      name,
      notes: null,
      version: 0,
    };
    return HttpResponse.json(forReader(store(template), request), { status: 201 });
  }),
  http.get("*/api/v1/week-templates/:id", ({ params, request }) => {
    const template = findTemplate(String(params.id));
    return template === undefined
      ? apiError("NOT_FOUND", "Template not found", 404)
      : HttpResponse.json(forReader(template, request));
  }),
  http.patch("*/api/v1/week-templates/:id", async ({ params, request }) => {
    const template = findTemplate(String(params.id));
    if (template === undefined) {
      return apiError("NOT_FOUND", "Template not found", 404);
    }
    const body = (await request.json()) as WeekTemplatePatchRequest;
    if (body.version !== template.version) {
      return apiError("STALE_VERSION", "Stale template version", 409);
    }
    return HttpResponse.json(
      forReader(
        store({
          ...template,
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.notes === undefined ? {} : { notes: body.notes }),
          ...(body.active === undefined ? {} : { active: body.active }),
        }),
        request,
      ),
    );
  }),
  http.post("*/api/v1/week-templates/:id/bands", async ({ params, request }) => {
    const template = findTemplate(String(params.id));
    if (template === undefined) {
      return apiError("NOT_FOUND", "Template not found", 404);
    }
    const body = (await request.json()) as TimeBandCreateRequest;
    const problem = bandProblem(template, body.startTime, body.endTime);
    if (problem !== undefined) {
      return problem;
    }
    const band: TimeBand = {
      endTime: body.endTime,
      id: nextId(`${template.id}-band`),
      startTime: body.startTime,
    };
    return HttpResponse.json(
      forReader(store({ ...template, bands: sortedBands([...template.bands, band]) }), request),
      { status: 201 },
    );
  }),
  http.patch("*/api/v1/week-templates/:id/bands/:bandId", async ({ params, request }) => {
    const template = findTemplate(String(params.id));
    const band = template?.bands.find((candidate) => candidate.id === String(params.bandId));
    if (template === undefined || band === undefined) {
      return apiError("NOT_FOUND", "Band not found", 404);
    }
    const body = (await request.json()) as TimeBandPatchRequest;
    if (body.version !== template.version) {
      return apiError("STALE_VERSION", "Stale template version", 409);
    }
    const startTime = body.startTime ?? band.startTime;
    const endTime = body.endTime ?? band.endTime;
    const problem = bandProblem(template, startTime, endTime, band.id);
    if (problem !== undefined) {
      return problem;
    }
    return HttpResponse.json(
      forReader(
        store({
          ...template,
          bands: sortedBands(
            template.bands.map((candidate) =>
              candidate.id === band.id ? { ...band, endTime, startTime } : candidate,
            ),
          ),
        }),
        request,
      ),
    );
  }),
  http.delete("*/api/v1/week-templates/:id/bands/:bandId", ({ params }) => {
    const template = findTemplate(String(params.id));
    const bandId = String(params.bandId);
    if (!template?.bands.some((band) => band.id === bandId)) {
      return apiError("NOT_FOUND", "Band not found", 404);
    }
    if (template.classes.some((item) => item.bandId === bandId)) {
      return apiError("BAND_NOT_EMPTY", "Band has classes", 409);
    }
    store({ ...template, bands: template.bands.filter((band) => band.id !== bandId) });
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/week-templates/:id/classes", async ({ params, request }) => {
    const template = findTemplate(String(params.id));
    if (template === undefined) {
      return apiError("NOT_FOUND", "Template not found", 404);
    }
    const body = (await request.json()) as TemplateClassCreateRequest;
    const description = manualDescription(body.description);
    const problem = classProblem(template, { ...body, description });
    if (problem !== undefined) {
      return problem;
    }
    const manualCapacity = body.capacity ?? undefined;
    const item: TemplateClass = {
      bandId: body.bandId,
      capacity: manualCapacity ?? autoCapacity(body.levelIds),
      capacityMode: manualCapacity === undefined ? "AUTO" : "MANUAL",
      dayOfWeek: body.dayOfWeek,
      description,
      displayDescription: "",
      id: nextId(`${template.id}-class`),
      inconsistencyIds: [],
      instructorIds: [...body.instructorIds],
      levelIds: [...body.levelIds],
      ringId: body.ringId ?? null,
    };
    return HttpResponse.json(
      forReader(store({ ...template, classes: [...template.classes, item] }), request),
      { status: 201 },
    );
  }),
  http.patch("*/api/v1/week-templates/:id/classes/:classId", async ({ params, request }) => {
    const template = findTemplate(String(params.id));
    const current = template?.classes.find((candidate) => candidate.id === String(params.classId));
    if (template === undefined || current === undefined) {
      return apiError("NOT_FOUND", "Class not found", 404);
    }
    const body = (await request.json()) as TemplateClassPatchRequest;
    if (body.version !== template.version) {
      return apiError("STALE_VERSION", "Stale template version", 409);
    }
    const levelIds = body.levelIds ?? current.levelIds;
    const next: TemplateClass = {
      ...current,
      ...(body.bandId === undefined ? {} : { bandId: body.bandId }),
      ...(body.dayOfWeek === undefined ? {} : { dayOfWeek: body.dayOfWeek }),
      ...(body.instructorIds === undefined ? {} : { instructorIds: [...body.instructorIds] }),
      ...(body.ringId === undefined ? {} : { ringId: body.ringId }),
      ...("description" in body ? { description: manualDescription(body.description) } : {}),
      levelIds: [...levelIds],
    };
    if ("capacity" in body) {
      const manualCapacity = body.capacity ?? undefined;
      next.capacity = manualCapacity ?? autoCapacity(levelIds);
      next.capacityMode = manualCapacity === undefined ? "AUTO" : "MANUAL";
    } else if (next.capacityMode === "AUTO") {
      next.capacity = autoCapacity(levelIds);
    }
    const problem = classProblem(template, next);
    if (problem !== undefined) {
      return problem;
    }
    return HttpResponse.json(
      forReader(
        store({
          ...template,
          classes: template.classes.map((candidate) =>
            candidate.id === current.id ? next : candidate,
          ),
        }),
        request,
      ),
    );
  }),
  http.delete("*/api/v1/week-templates/:id/classes/:classId", ({ params }) => {
    const template = findTemplate(String(params.id));
    const classId = String(params.classId);
    if (!template?.classes.some((item) => item.id === classId)) {
      return apiError("NOT_FOUND", "Class not found", 404);
    }
    store({ ...template, classes: template.classes.filter((item) => item.id !== classId) });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/coverage", ({ request }) => {
    if (!levelsEnabled()) {
      return apiError("LEVELS_DISABLED", "Levels are disabled for this club", 422);
    }
    const url = new URL(request.url);
    const templateId = url.searchParams.get("templateId");
    const weekId = url.searchParams.get("weekId");
    if (templateId === null && weekId === null) {
      return validationError("templateId", "REQUIRED");
    }
    return HttpResponse.json(
      weekId === null
        ? coverageFixture
        : {
            ...coverageFixture,
            levels: coverageFixture.levels.map((level) => ({ ...level, booked: level.dogsActive })),
            scope: "WEEK" as const,
          },
    );
  }),
  http.get("*/api/v1/weeks/generation-candidates", () =>
    HttpResponse.json({ items: candidates() }),
  ),
  http.get("*/api/v1/weeks", ({ request }) => {
    const url = new URL(request.url);
    let items = [...planningState.weeks];
    for (const filter of url.searchParams.getAll("filter")) {
      const [field, op, value] = filter.split(":");
      if (field === "startDate" && value !== undefined) {
        items = items.filter((week) =>
          op === "gte"
            ? week.startDate >= value
            : op === "lte"
              ? week.startDate <= value
              : op === "eq"
                ? week.startDate === value
                : true,
        );
      } else if (field === "state" && op === "eq" && value !== undefined) {
        items = items.filter((week) => week.state === value);
      } else {
        return apiError("INVALID_FILTER", "Unsupported filter", 400);
      }
    }
    const descending = url.searchParams.get("sort") === "startDate,desc";
    items.sort(
      (left, right) => (descending ? -1 : 1) * left.startDate.localeCompare(right.startDate),
    );
    const size = Number(url.searchParams.get("size") ?? 50);
    return HttpResponse.json({
      appliedFilters: [],
      items: items.slice(0, size).map(weekListItem),
      page: 0,
      size,
      totalItems: items.length,
      totalPages: items.length === 0 ? 0 : Math.ceil(items.length / size),
    });
  }),
  http.post("*/api/v1/weeks", async ({ request }) => {
    const body = (await request.json()) as WeekCreateRequest;
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(body.startDate) ||
      mondayOf(body.startDate) !== body.startDate
    ) {
      return validationError("startDate");
    }
    const existing = planningState.weeks.find((week) => week.startDate === body.startDate);
    if (existing !== undefined) {
      return HttpResponse.json(weekResource(existing), { status: 200 });
    }
    const week = mockWeek(body.startDate);
    planningState.weeks.push(week);
    return HttpResponse.json(weekResource(week), { status: 201 });
  }),
  http.get("*/api/v1/weeks/:id", ({ params }) => {
    const week = planningState.weeks.find((candidate) => candidate.id === String(params.id));
    return week === undefined
      ? apiError("NOT_FOUND", "Week not found", 404)
      : HttpResponse.json(weekResource(week));
  }),
  http.post("*/api/v1/weeks/:id/generation", async ({ params, request }) => {
    const week = planningState.weeks.find((candidate) => candidate.id === String(params.id));
    if (week === undefined) {
      return apiError("NOT_FOUND", "Week not found", 404);
    }
    const body = (await request.json()) as GenerationRequest;
    if (
      (week.generatedAt !== null && week.generatedAt !== undefined) ||
      week.state === "VALIDATED"
    ) {
      return apiError("WEEK_ALREADY_GENERATED", "Week already generated", 409);
    }
    const weekdayTemplate = findTemplate(body.weekdayTemplateId);
    const saturdayTemplate =
      body.saturdayTemplateId === null || body.saturdayTemplateId === undefined
        ? undefined
        : findTemplate(body.saturdayTemplateId);
    if (
      weekdayTemplate?.kind !== "WEEKDAYS" ||
      (body.saturdayTemplateId !== null &&
        body.saturdayTemplateId !== undefined &&
        saturdayTemplate?.kind !== "SATURDAY")
    ) {
      return apiError("TEMPLATE_KIND_MISMATCH", "Template kind mismatch", 422);
    }
    const templates = [
      weekdayTemplate,
      ...(saturdayTemplate === undefined ? [] : [saturdayTemplate]),
    ];
    const inconsistent = templates.flatMap((template) => template.inconsistencies);
    if (inconsistent.length > 0) {
      return apiError("TEMPLATE_INCONSISTENT", "Template has inconsistencies", 422, {
        inconsistencies: inconsistent.map((item) => item.id),
      });
    }
    const today = clubLocalDate();
    if (week.endDate < today) {
      return apiError("WEEK_IN_PAST", "Week already finished", 422);
    }
    const holidays = new Set(holidayDates());
    const skippedByDate = new Map<string, SkippedClasses>();
    let classCount = 0;
    const levels = planningLevels();
    for (const template of templates) {
      for (const item of template.classes) {
        const date = addDays(week.startDate, dayOffset[item.dayOfWeek]);
        const reason = holidays.has(date) ? "HOLIDAY" : date < today ? "PAST" : undefined;
        const timeBand = template.bands.find((candidate) => candidate.id === item.bandId);
        if (reason === undefined && timeBand !== undefined) {
          classCount += 1;
          planningState.sessions.push(
            classSession({
              capacity: item.capacity,
              capacityMode: item.capacityMode,
              date,
              description: item.description ?? null,
              displayDescription: mockDisplayDescription(levels, item.levelIds, item.description),
              endTime: timeBand.endTime,
              id: nextId(`cls-${date}`),
              instructorIds: [...item.instructorIds],
              levelIds: [...item.levelIds],
              origin: { templateClassId: item.id, templateId: template.id },
              ringId: item.ringId ?? null,
              startTime: timeBand.startTime,
              state: "DRAFT",
              weekId: week.id,
            }),
          );
        } else if (reason !== undefined) {
          const skipped = skippedByDate.get(date) ?? { count: 0, date, reason };
          skipped.count += 1;
          skippedByDate.set(date, skipped);
        }
      }
    }
    Object.assign(week, {
      classCounts: { ...week.classCounts, draft: week.classCounts.draft + classCount },
      generatedAt: new Date().toISOString(),
      generatedByAccountId: "account-admin",
      saturdayTemplateId: saturdayTemplate?.id ?? null,
      saturdayTemplateName: saturdayTemplate?.name ?? null,
      state: "GENERATED",
      version: week.version + 1,
      weekdayTemplateId: weekdayTemplate.id,
      weekdayTemplateName: weekdayTemplate.name,
    });
    return HttpResponse.json({
      classCount,
      skipped: [...skippedByDate.values()],
      weekId: week.id,
    });
  }),
];
