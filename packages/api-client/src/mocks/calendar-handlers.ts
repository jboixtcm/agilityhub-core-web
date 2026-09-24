import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { readerLocale } from "./day-grid-handlers";
import {
  cancellationPreviewFor,
  classSession,
  type ClassSession,
  clubInstant,
  clubLocalDateOf,
  clubLocalTime,
  type RingBlock,
} from "./fixtures/calendar";
import { catalogState } from "./fixtures/catalogs";
import { noRingDayGridColumn } from "./fixtures/day-grid";
import {
  addDays,
  clubLocalDate,
  mockDisplayDescription,
  mockWeek,
  mondayOf,
  type MockWeek,
} from "./fixtures/planning";
import { findParameter } from "./fixtures/settings";
import {
  apiError,
  autoCapacity,
  levelsEnabled,
  manualDescription,
  maxInstructors,
  minutes,
  nextId,
  planningLevels,
  planningState,
  validationError,
} from "./planning-handlers";
import { currentMockScenario } from "./scenarios";

type Inconsistency = components["schemas"]["Inconsistency"];
type WeekCalendar = components["schemas"]["WeekCalendar"];
type DayGrid = components["schemas"]["DayGrid"];
type DayGridCell = components["schemas"]["DayGridCell"];
type ClassSessionCreateRequest = components["schemas"]["ClassSessionCreateRequest"];
type ClassSessionPatchRequest = components["schemas"]["ClassSessionPatchRequest"];
type ClassCancellationRequest = components["schemas"]["ClassCancellationRequest"];
type RiskExemptionRequest = components["schemas"]["RiskExemptionRequest"];
type RingBlockCreateRequest = components["schemas"]["RingBlockCreateRequest"];
type RingBlockPatchRequest = components["schemas"]["RingBlockPatchRequest"];

const SLOT_MINUTES = 10;
const TRAINING_SLOT_MINUTES = 30;
const shortDays = ["dl", "dt", "dc", "dj", "dv", "ds", "dg"] as const;
const dayNames = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const blockReasons: Readonly<Record<RingBlock["kind"], readonly RingBlock["reason"][]>> = {
  BLOCK: ["MAINTENANCE", "OTHER"],
  RESERVATION: ["PRIVATE_CLASS", "THERAPY", "PREPARATION", "OTHER"],
};

function dayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function hasModule(module: string): boolean {
  return currentMockScenario().branding.modules.includes(module);
}

function ringName(ringId: string | null | undefined): string {
  return ringId === null || ringId === undefined
    ? "sense pista"
    : (catalogState.rings.find((ring) => ring.id === ringId)?.name ?? "");
}

function instructorName(instructorId: string): string {
  return (
    catalogState.instructors.find((instructor) => instructor.id === instructorId)?.shortName ?? ""
  );
}

function overlaps(
  left: { end: string; start: string },
  right: { end: string; start: string },
): boolean {
  return minutes(left.start) < minutes(right.end) && minutes(right.start) < minutes(left.end);
}

function findWeek(id: string): MockWeek | undefined {
  return planningState.weeks.find((week) => week.id === id);
}

function blocksOfWeek(week: MockWeek): RingBlock[] {
  return planningState.blocks.filter(
    (block) =>
      block.state === "ACTIVE" && block.date >= week.startDate && block.date <= week.endDate,
  );
}

/** Mock of the api `InconsistencyDetector`, week scope (R-06-05): DRAFT/ACTIVE classes + blocks. */
function weekInconsistencies(week: MockWeek): Inconsistency[] {
  const sessions = planningState.sessions.filter(
    (session) =>
      session.weekId === week.id && (session.state === "DRAFT" || session.state === "ACTIVE"),
  );
  const items: Inconsistency[] = [];
  const when = (session: ClassSession) =>
    `${shortDays[dayIndex(session.date)] ?? ""} ${session.startTime.replace(/^0/u, "")}`;
  sessions.forEach((left, index) => {
    for (const right of sessions.slice(index + 1)) {
      if (
        left.date !== right.date ||
        !overlaps(
          { end: left.endTime, start: left.startTime },
          { end: right.endTime, start: right.startTime },
        )
      ) {
        continue;
      }
      if (left.ringId !== null && left.ringId !== undefined && left.ringId === right.ringId) {
        items.push({
          date: left.date,
          id: `inc-ring-${left.id}-${right.id}`,
          itemIds: [left.id, right.id],
          message: `${when(left)} — pista ${ringName(left.ringId)} amb dues classes alhora`,
          ringId: left.ringId,
          startTime: left.startTime,
          type: "RING_DOUBLE_BOOKED",
        });
      }
      for (const instructorId of left.instructorIds.filter((id) =>
        right.instructorIds.includes(id),
      )) {
        items.push({
          date: left.date,
          id: `inc-instructor-${instructorId}-${left.id}-${right.id}`,
          instructorId,
          itemIds: [left.id, right.id],
          message: `${when(left)} — ${instructorName(instructorId)} assignat a dues pistes alhora (${ringName(left.ringId)} i ${ringName(right.ringId)})`,
          startTime: left.startTime,
          type: "INSTRUCTOR_DOUBLE_BOOKED",
        });
      }
    }
    for (const block of blocksOfWeek(week)) {
      if (
        block.ringId === left.ringId &&
        block.date === left.date &&
        overlaps(
          { end: left.endTime, start: left.startTime },
          { end: block.toLocal, start: block.fromLocal },
        )
      ) {
        items.push({
          date: left.date,
          id: `inc-blocked-${left.id}-${block.id}`,
          itemIds: [left.id, block.id],
          message: `${when(left)} — pista ${ringName(left.ringId)} bloquejada`,
          ringId: block.ringId,
          startTime: left.startTime,
          type: "RING_BLOCKED",
        });
      }
    }
  });
  return items;
}

function withInconsistencyIds(
  session: ClassSession,
  inconsistencies: readonly Inconsistency[],
): ClassSession {
  return {
    ...session,
    inconsistencyIds: inconsistencies
      .filter((inconsistency) => inconsistency.itemIds.includes(session.id))
      .map((inconsistency) => inconsistency.id),
  };
}

function sessionResponse(session: ClassSession): ClassSession {
  const week = findWeek(session.weekId);
  return week === undefined ? session : withInconsistencyIds(session, weekInconsistencies(week));
}

function draftIds(week: MockWeek): Set<string> {
  return new Set(
    planningState.sessions
      .filter((session) => session.weekId === week.id && session.state === "DRAFT")
      .map((session) => session.id),
  );
}

function relative(week: MockWeek): WeekCalendar["week"]["relative"] {
  const current = mondayOf(clubLocalDate());
  return week.startDate === current
    ? "CURRENT"
    : week.startDate === addDays(current, 7)
      ? "NEXT"
      : "OTHER";
}

function calendarOf(week: MockWeek, filter: string): WeekCalendar {
  const states: readonly ClassSession["state"][] =
    filter === "DRAFT"
      ? ["DRAFT"]
      : filter === "CANCELLED"
        ? ["CANCELLED"]
        : ["ACTIVE", "FINISHED", "CANCELLED"];
  const inconsistencies = weekInconsistencies(week);
  const drafts = draftIds(week);
  const classes = planningState.sessions
    .filter((session) => session.weekId === week.id && states.includes(session.state))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime),
    )
    .map((session) => withInconsistencyIds(session, inconsistencies));
  const ringBlocks = blocksOfWeek(week);
  const rows = [
    ...new Set([
      ...classes.map((session) => session.startTime),
      ...ringBlocks.map((block) => block.fromLocal),
    ]),
  ].sort();
  return {
    canValidate:
      drafts.size > 0 &&
      !inconsistencies.some((inconsistency) => inconsistency.itemIds.some((id) => drafts.has(id))),
    classes,
    draftCount: drafts.size,
    inconsistencies,
    ringBlocks,
    rows,
    week: {
      endDate: week.endDate,
      generatedAt: week.generatedAt ?? null,
      id: week.id,
      isoWeek: week.isoWeek,
      isoYear: week.isoYear,
      relative: relative(week),
      startDate: week.startDate,
      state: week.state,
      validatedAt: week.validatedAt ?? null,
    },
  };
}

function openingWindow(date: string): { close: number; open: number } {
  const value = findParameter("club.openingHours")?.value as
    Record<string, { close: string; open: string } | undefined> | undefined;
  const window = value?.[dayNames[dayIndex(date)] ?? "MONDAY"] ?? { close: "22:00", open: "07:00" };
  return { close: minutes(window.close), open: minutes(window.open) };
}

/** Time checks shared by classes and blocks: granularity (400), range (400), opening hours (422). */
function timeProblem(date: string, startTime: string, endTime: string, minimum = 1) {
  if (!/^\d{2}:\d{2}$/u.test(startTime) || !/^\d{2}:\d{2}$/u.test(endTime)) {
    return validationError("startTime");
  }
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    return apiError("INVALID_SLOT_GRANULARITY", "Times must be multiples of the slot", 400);
  }
  if (end - start < minimum) {
    return apiError("INVALID_TIME_RANGE", "Invalid time range", 400);
  }
  const window = openingWindow(date);
  if (start < window.open || end > window.close) {
    return apiError("OUTSIDE_OPENING_HOURS", "Outside opening hours", 422);
  }
  return undefined;
}

function blockOnRing(
  ringId: string | null,
  date: string,
  startTime: string,
  endTime: string,
): RingBlock | undefined {
  return ringId === null
    ? undefined
    : planningState.blocks.find(
        (block) =>
          block.state === "ACTIVE" &&
          block.ringId === ringId &&
          block.date === date &&
          overlaps(
            { end: endTime, start: startTime },
            { end: block.toLocal, start: block.fromLocal },
          ),
      );
}

function sessionProblem(item: {
  date: string;
  description: string | null;
  endTime: string;
  instructorIds: readonly string[];
  levelIds: readonly string[];
  ringId: string | null;
  startTime: string;
}) {
  const time = timeProblem(item.date, item.startTime, item.endTime);
  if (time !== undefined) return time;
  if (item.instructorIds.length === 0) return validationError("instructorIds", "REQUIRED");
  if (item.instructorIds.length > maxInstructors()) {
    return apiError("TOO_MANY_INSTRUCTORS", "Too many instructors", 422);
  }
  if (levelsEnabled() && item.levelIds.length === 0) {
    return apiError("LEVEL_REQUIRED", "At least one level is required", 422);
  }
  if (!levelsEnabled() && (item.description ?? "").trim() === "") {
    return apiError("DESCRIPTION_REQUIRED", "A description is required", 422);
  }
  if (blockOnRing(item.ringId, item.date, item.startTime, item.endTime) !== undefined) {
    return apiError("RING_BLOCKED", "The ring is blocked at that time", 422);
  }
  return undefined;
}

/** Live training bookings of a ring overlapping a club-local range (S09 R-09-13). */
function trainingBookingsOn(
  ringId: string | null | undefined,
  date: string,
  startTime: string,
  endTime: string,
) {
  return ringId === null || ringId === undefined
    ? []
    : planningState.trainingBookings.filter(
        (booking) =>
          booking.ringId === ringId &&
          booking.date === date &&
          overlaps(
            { end: endTime, start: startTime },
            { end: booking.toLocal, start: booking.fromLocal },
          ),
      );
}

/**
 * `RING_HAS_BOOKINGS` (R-06-05, R-06-11) unless the ADMIN sends `cancelBookings: true`; then the
 * bookings are cancelled by the club (removed from the mock). Called after every other check.
 */
function ringBookingsProblem(
  ringId: string | null | undefined,
  date: string,
  startTime: string,
  endTime: string,
  cancelBookings: boolean | null | undefined,
) {
  const bookings = trainingBookingsOn(ringId, date, startTime, endTime);
  if (bookings.length === 0) return undefined;
  if (cancelBookings !== true) {
    return apiError("RING_HAS_BOOKINGS", "The ring has training bookings", 422, {
      bookings: bookings.map((booking) => ({
        dogName: booking.dogName,
        from: booking.from,
        id: booking.id,
        memberName: booking.memberName,
        ringId: booking.ringId,
        to: booking.to,
      })),
    });
  }
  if (currentMockScenario().me.membership?.roles.includes("ADMIN") !== true) {
    return apiError("FORBIDDEN", "Only an admin can cancel training bookings", 403);
  }
  planningState.trainingBookings = planningState.trainingBookings.filter(
    (booking) => !bookings.includes(booking),
  );
  return undefined;
}

function findSession(id: string): ClassSession | undefined {
  return planningState.sessions.find((session) => session.id === id);
}

function replaceSession(next: ClassSession): ClassSession {
  planningState.sessions = planningState.sessions.map((session) =>
    session.id === next.id ? next : session,
  );
  return sessionResponse(next);
}

function accountName(): string {
  return currentMockScenario().me.account.name.split(" ")[0] ?? "";
}

function conflictsOf(
  ringId: string,
  date: string,
  fromLocal: string,
  toLocal: string,
  ignoreId?: string,
) {
  const range = { end: toLocal, start: fromLocal };
  return [
    ...planningState.sessions
      .filter(
        (session) =>
          (session.state === "DRAFT" || session.state === "ACTIVE") &&
          session.ringId === ringId &&
          session.date === date &&
          overlaps(range, { end: session.endTime, start: session.startTime }),
      )
      .map((session) => ({
        from: session.startsAt,
        id: session.id,
        label: `${shortDays[dayIndex(date)] ?? ""} ${session.startTime.replace(/^0/u, "")} · ${session.displayDescription}`,
        to: session.endsAt,
        type: "CLASS",
      })),
    ...planningState.blocks
      .filter(
        (block) =>
          block.id !== ignoreId &&
          block.state === "ACTIVE" &&
          block.ringId === ringId &&
          block.date === date &&
          overlaps(range, { end: block.toLocal, start: block.fromLocal }),
      )
      .map((block) => ({
        from: block.from,
        id: block.id,
        label: `${ringName(block.ringId)} bloquejada`,
        to: block.to,
        type: "RING_BLOCK",
      })),
  ];
}

interface BlockFields {
  from: string;
  kind: RingBlock["kind"];
  reason: RingBlock["reason"];
  ringId: string;
  to: string;
}

/** R-06-11 checks of a block (create and edit); `undefined` = valid. */
function blockProblem(fields: BlockFields, ignoreId?: string) {
  const ring = catalogState.rings.find((candidate) => candidate.id === fields.ringId);
  if (!ring?.active) return validationError("ringId");
  if (fields.kind === "RESERVATION" && !hasModule("FREE_TRAINING")) {
    return apiError("MODULE_DISABLED", "Module disabled", 404);
  }
  if (!blockReasons[fields.kind].includes(fields.reason)) return validationError("reason");
  const from = Date.parse(fields.from);
  const to = Date.parse(fields.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return validationError("from");
  if (from <= Date.now()) return validationError("from", "PAST");
  const date = clubLocalDateOf(fields.from);
  const fromLocal = clubLocalTime(fields.from);
  const toLocal = clubLocalTime(fields.to);
  if (to <= from || clubLocalDateOf(fields.to) !== date) {
    return apiError("INVALID_TIME_RANGE", "Invalid time range", 400);
  }
  const time = timeProblem(date, fromLocal, toLocal, TRAINING_SLOT_MINUTES);
  if (time !== undefined) return time;
  const conflicts = conflictsOf(fields.ringId, date, fromLocal, toLocal, ignoreId);
  return conflicts.length > 0
    ? apiError("RING_BLOCK_CONFLICT", "The block overlaps other items", 409, { conflicts })
    : undefined;
}

function dayGrid(
  date: string,
  view: "instructor" | "member",
  locale: "ca" | "en" | "es",
): DayGrid {
  const sessions = planningState.sessions.filter(
    (session) =>
      session.date === date &&
      (view === "instructor"
        ? session.state !== "DRAFT"
        : session.state === "ACTIVE" || session.state === "FINISHED"),
  );
  const blocks = planningState.blocks.filter(
    (block) => block.date === date && block.state === "ACTIVE",
  );
  const usedRings = new Set(
    [...sessions.map((session) => session.ringId), ...blocks.map((block) => block.ringId)].filter(
      (ringId): ringId is string => ringId !== null && ringId !== undefined,
    ),
  );
  const waitlist = hasModule("WAITLIST");
  const cells = new Map<string, DayGridCell[]>();
  const push = (time: string, cell: DayGridCell) => {
    cells.set(time, [...(cells.get(time) ?? []), cell]);
  };
  for (const session of sessions) {
    push(session.startTime, {
      atRisk: session.atRisk,
      classId: session.id,
      description: session.displayDescription,
      endTime: session.endTime,
      instructorName: session.instructorIds.map(instructorName).join(", "),
      kind: "CLASS",
      ringId: session.ringId ?? null,
      riskText: null,
      state: session.state,
      ...(view === "instructor"
        ? {
            occupancy: {
              booked: session.counters.booked,
              capacity: session.capacity,
              ...(waitlist ? { waiting: session.counters.waiting } : {}),
            },
          }
        : {}),
    });
  }
  for (const block of blocks) {
    if (block.activityId !== null && block.activityId !== undefined) {
      push(block.fromLocal, {
        activityId: block.activityId,
        endTime: block.toLocal,
        kind: "ACTIVITY",
        ringId: block.ringId,
        title: block.activityTitle ?? "",
      });
    } else if (view === "member") {
      push(block.fromLocal, {
        endTime: block.toLocal,
        kind: "OCCUPIED",
        reason: block.reason,
        ringId: block.ringId,
      });
    } else {
      push(block.fromLocal, {
        blockId: block.id,
        createdByName: block.createdByName,
        endTime: block.toLocal,
        kind: "BLOCK",
        note: block.note ?? null,
        reason: block.reason,
        ringId: block.ringId,
      });
    }
  }
  const ringColumns = [...catalogState.rings]
    .filter((ring) => usedRings.has(ring.id))
    .sort((left, right) => left.order - right.order)
    .map((ring) => ({
      activeSetupId: null,
      color: ring.color,
      name: ring.name,
      ringId: ring.id,
      shortName: ring.shortName,
    }));
  // As the api: the «Sense» column goes last, only when a class of the day has no ring.
  const classWithoutRing = sessions.some((session) => (session.ringId ?? null) === null);
  return {
    columns: classWithoutRing ? [...ringColumns, noRingDayGridColumn(locale)] : ringColumns,
    date,
    dayOfWeek: dayNames[dayIndex(date)] ?? "MONDAY",
    rows: [...cells.keys()].sort().map((time) => ({ cells: cells.get(time) ?? [], time })),
    timeZone: currentMockScenario().branding.timeZone,
    view: view === "instructor" ? "INSTRUCTOR" : "MEMBER",
  };
}

export const calendarHandlers = [
  http.get("*/api/v1/weeks/:id/calendar", ({ params, request }) => {
    const week = findWeek(String(params.id));
    if (week === undefined) return apiError("NOT_FOUND", "Week not found", 404);
    const filter = new URL(request.url).searchParams.get("filter") ?? "ACTIVE";
    return HttpResponse.json(calendarOf(week, filter));
  }),
  http.post("*/api/v1/weeks/:id/validation", ({ params }) => {
    const week = findWeek(String(params.id));
    if (week === undefined) return apiError("NOT_FOUND", "Week not found", 404);
    const drafts = draftIds(week);
    if (drafts.size === 0) {
      return apiError("NOTHING_TO_VALIDATE", "The week has no drafts", 422);
    }
    const blocking = weekInconsistencies(week).filter((inconsistency) =>
      inconsistency.itemIds.some((id) => drafts.has(id)),
    );
    if (blocking.length > 0) {
      return apiError("WEEK_INCONSISTENT", "The week has inconsistencies", 422, {
        inconsistencies: blocking.map((inconsistency) => inconsistency.id),
      });
    }
    planningState.sessions = planningState.sessions.map((session) =>
      drafts.has(session.id)
        ? { ...session, state: "ACTIVE" as const, version: session.version + 1 }
        : session,
    );
    Object.assign(week, {
      state: "VALIDATED",
      validatedAt: new Date().toISOString(),
      validatedByAccountId: currentMockScenario().me.account.id,
      version: week.version + 1,
    });
    return HttpResponse.json({ validatedClassIds: [...drafts] });
  }),
  http.post("*/api/v1/class-sessions", async ({ request }) => {
    const body = (await request.json()) as ClassSessionCreateRequest;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(body.date)) return validationError("date");
    const description = manualDescription(body.description);
    const ringId = body.ringId ?? null;
    const problem =
      sessionProblem({ ...body, description, ringId }) ??
      ringBookingsProblem(ringId, body.date, body.startTime, body.endTime, body.cancelBookings);
    if (problem !== undefined) return problem;
    const monday = mondayOf(body.date);
    let week = planningState.weeks.find((candidate) => candidate.startDate === monday);
    if (week === undefined) {
      week = mockWeek(monday);
      planningState.weeks.push(week);
    }
    const capacity = body.capacity ?? undefined;
    const session = classSession({
      capacity: capacity ?? autoCapacity(body.levelIds),
      capacityMode: capacity === undefined ? "AUTO" : "MANUAL",
      date: body.date,
      description,
      displayDescription: mockDisplayDescription(planningLevels(), body.levelIds, description),
      endTime: body.endTime,
      id: nextId(`cls-${body.date}`),
      instructorIds: [...body.instructorIds],
      levelIds: [...body.levelIds],
      ringId,
      startTime: body.startTime,
      state: week.state === "VALIDATED" ? "ACTIVE" : "DRAFT",
      weekId: week.id,
    });
    planningState.sessions.push(session);
    return HttpResponse.json(sessionResponse(session), { status: 201 });
  }),
  http.get("*/api/v1/class-sessions/:id", ({ params }) => {
    const session = findSession(String(params.id));
    return session === undefined
      ? apiError("NOT_FOUND", "Class not found", 404)
      : HttpResponse.json(sessionResponse(session));
  }),
  http.patch("*/api/v1/class-sessions/:id", async ({ params, request }) => {
    const current = findSession(String(params.id));
    if (current === undefined) return apiError("NOT_FOUND", "Class not found", 404);
    const body = (await request.json()) as ClassSessionPatchRequest & { date?: string };
    if (body.date !== undefined) return validationError("date");
    if (body.version !== current.version) {
      return apiError("STALE_VERSION", "Stale class version", 409);
    }
    const onlyNotes = Object.keys(body).every((key) => key === "notes" || key === "version");
    if ((current.state === "FINISHED" || current.state === "CANCELLED") && !onlyNotes) {
      return apiError("INVALID_STATE", "Only notes can change in this state", 409);
    }
    const levelIds = body.levelIds ?? current.levelIds;
    const description =
      "description" in body ? manualDescription(body.description) : (current.description ?? null);
    const next: ClassSession = {
      ...current,
      ...(body.ringId === undefined ? {} : { ringId: body.ringId }),
      ...(body.instructorIds === undefined ? {} : { instructorIds: [...body.instructorIds] }),
      ...(body.startTime === undefined ? {} : { startTime: body.startTime }),
      ...(body.endTime === undefined ? {} : { endTime: body.endTime }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      ...(body.riskExempt === undefined ? {} : { riskExempt: body.riskExempt }),
      description,
      levelIds: [...levelIds],
      version: current.version + 1,
    };
    if ("capacity" in body) {
      const manual = body.capacity ?? undefined;
      next.capacity = manual ?? autoCapacity(levelIds);
      next.capacityMode = manual === undefined ? "AUTO" : "MANUAL";
    } else if (next.capacityMode === "AUTO" && body.levelIds !== undefined) {
      next.capacity = autoCapacity(levelIds);
    }
    if (next.capacity < current.counters.booked) {
      return apiError("CAPACITY_BELOW_BOOKINGS", "Capacity below bookings", 422, {
        field: "capacity",
      });
    }
    if (!onlyNotes) {
      const problem = sessionProblem({
        ...next,
        description: next.description ?? null,
        ringId: next.ringId ?? null,
      });
      if (problem !== undefined) return problem;
    }
    if (body.ringId !== undefined || body.startTime !== undefined || body.endTime !== undefined) {
      const bookings = ringBookingsProblem(
        next.ringId,
        next.date,
        next.startTime,
        next.endTime,
        body.cancelBookings,
      );
      if (bookings !== undefined) return bookings;
    }
    if (body.levelIds !== undefined || "description" in body) {
      next.displayDescription = mockDisplayDescription(planningLevels(), levelIds, description);
    }
    next.startsAt = clubInstant(next.date, next.startTime);
    next.endsAt = clubInstant(next.date, next.endTime);
    return HttpResponse.json(replaceSession(next));
  }),
  http.get("*/api/v1/class-sessions/:id/cancellation-preview", ({ params }) => {
    const session = findSession(String(params.id));
    return session === undefined
      ? apiError("NOT_FOUND", "Class not found", 404)
      : HttpResponse.json(cancellationPreviewFor(session));
  }),
  http.post("*/api/v1/class-sessions/:id/cancellation", async ({ params, request }) => {
    const current = findSession(String(params.id));
    if (current === undefined) return apiError("NOT_FOUND", "Class not found", 404);
    const body = (await request.json()) as ClassCancellationRequest;
    if (current.state !== "DRAFT" && current.state !== "ACTIVE") {
      return apiError("INVALID_STATE", "The class cannot be cancelled", 409);
    }
    const adminText = body.adminText?.trim() ?? "";
    const affected = current.counters.booked + current.counters.waiting;
    if (affected > 0 && (adminText === "" || adminText.length > 500)) {
      return apiError("ADMIN_TEXT_REQUIRED", "The notice text is required", 422, {
        field: "adminText",
      });
    }
    return HttpResponse.json(
      replaceSession({
        ...current,
        atRisk: false,
        cancellation: {
          adminText: adminText === "" ? null : adminText,
          affectedBookings: current.counters.booked,
          affectedWaitlist: current.counters.waiting,
          at: new Date().toISOString(),
          byAccountId: currentMockScenario().me.account.id,
          reason: body.reason,
        },
        counters: { booked: 0, waiting: 0 },
        state: "CANCELLED",
        version: current.version + 1,
      }),
    );
  }),
  http.post("*/api/v1/class-sessions/:id/risk-exemption", async ({ params, request }) => {
    const current = findSession(String(params.id));
    if (current === undefined) return apiError("NOT_FOUND", "Class not found", 404);
    const body = (await request.json()) as RiskExemptionRequest;
    if (current.state !== "ACTIVE") {
      return apiError("INVALID_STATE", "Only active classes can be exempted", 409);
    }
    return HttpResponse.json(
      replaceSession({
        ...current,
        atRisk: body.exempt ? false : current.atRisk,
        riskExempt: body.exempt,
        version: current.version + 1,
      }),
    );
  }),
  http.post("*/api/v1/ring-blocks", async ({ request }) => {
    const body = (await request.json()) as RingBlockCreateRequest;
    const problem =
      blockProblem(body) ??
      ringBookingsProblem(
        body.ringId,
        clubLocalDateOf(body.from),
        clubLocalTime(body.from),
        clubLocalTime(body.to),
        body.cancelBookings,
      );
    if (problem !== undefined) return problem;
    const date = clubLocalDateOf(body.from);
    const block: RingBlock = {
      activityId: null,
      activityTitle: null,
      createdByName: accountName(),
      date,
      from: body.from,
      fromLocal: clubLocalTime(body.from),
      id: nextId(`block-${date}`),
      kind: body.kind,
      note: body.note ?? null,
      reason: body.reason,
      ringId: body.ringId,
      state: "ACTIVE",
      to: body.to,
      toLocal: clubLocalTime(body.to),
      version: 1,
    };
    planningState.blocks.push(block);
    return HttpResponse.json(block, { status: 201 });
  }),
  http.get("*/api/v1/ring-blocks/:id", ({ params }) => {
    const block = planningState.blocks.find((candidate) => candidate.id === String(params.id));
    return block === undefined
      ? apiError("NOT_FOUND", "Ring block not found", 404)
      : HttpResponse.json(block);
  }),
  http.patch("*/api/v1/ring-blocks/:id", async ({ params, request }) => {
    const current = planningState.blocks.find((block) => block.id === String(params.id));
    if (current === undefined) return apiError("NOT_FOUND", "Ring block not found", 404);
    const body = (await request.json()) as RingBlockPatchRequest;
    if (current.activityId !== null && current.activityId !== undefined) {
      return apiError("RING_BLOCK_MANAGED_BY_ACTIVITY", "Managed by an activity", 422);
    }
    if (body.version !== current.version) {
      return apiError("STALE_VERSION", "Stale ring block version", 409);
    }
    if (current.state !== "ACTIVE" || Date.parse(current.from) <= Date.now()) {
      return apiError("INVALID_STATE", "Only future active blocks can change", 409);
    }
    const fields: BlockFields = {
      from: body.from ?? current.from,
      kind: body.kind ?? current.kind,
      reason: body.reason ?? current.reason,
      ringId: body.ringId ?? current.ringId,
      to: body.to ?? current.to,
    };
    const problem =
      blockProblem(fields, current.id) ??
      ringBookingsProblem(
        fields.ringId,
        clubLocalDateOf(fields.from),
        clubLocalTime(fields.from),
        clubLocalTime(fields.to),
        body.cancelBookings,
      );
    if (problem !== undefined) return problem;
    const next: RingBlock = {
      ...current,
      ...fields,
      date: clubLocalDateOf(fields.from),
      fromLocal: clubLocalTime(fields.from),
      note: body.note === undefined ? (current.note ?? null) : body.note,
      toLocal: clubLocalTime(fields.to),
      version: current.version + 1,
    };
    planningState.blocks = planningState.blocks.map((block) =>
      block.id === next.id ? next : block,
    );
    return HttpResponse.json(next);
  }),
  http.post("*/api/v1/ring-blocks/:id/cancellation", ({ params }) => {
    const current = planningState.blocks.find((block) => block.id === String(params.id));
    if (current === undefined) return apiError("NOT_FOUND", "Ring block not found", 404);
    if (current.activityId !== null && current.activityId !== undefined) {
      return apiError("RING_BLOCK_MANAGED_BY_ACTIVITY", "Managed by an activity", 422);
    }
    if (current.state !== "ACTIVE") {
      return apiError("INVALID_STATE", "The block is already cancelled", 409);
    }
    const next: RingBlock = { ...current, state: "CANCELLED", version: current.version + 1 };
    planningState.blocks = planningState.blocks.map((block) =>
      block.id === next.id ? next : block,
    );
    return HttpResponse.json(next);
  }),
  http.get("*/api/v1/day-grid", ({ request }) => {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return validationError("date");
    const view = url.searchParams.get("view") === "instructor" ? "instructor" : "member";
    if (
      view === "instructor" &&
      currentMockScenario().me.membership?.roles.every((role) => role === "MEMBER")
    ) {
      return apiError("FORBIDDEN", "Forbidden", 403);
    }
    return HttpResponse.json(dayGrid(date, view, readerLocale(request)));
  }),
];
