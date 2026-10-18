/**
 * S16 (E9-W03): the course library, placements, ring geometry and inventory, setups and course
 * uploads, as the api answers them (statuses per CATALEG_ERRORS §1, the `ApiError` envelope with
 * the published `details`, `Idempotency-Key` replay per CONVENCIONS_API §7). The tenant is the
 * caller's club (R-16-16): the world is one club's (`callerClubOwnsTheWorld`), and another club's
 * token finds none of its records (`coursesOtherClub`).
 */
import { courseDataSchema } from "@agilityhub/course-core";
import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { refuse, selectItems, type ListSpec, listValues } from "./backoffice-handlers";
import { activityState } from "./fixtures/activities";
import { clubInstant } from "./fixtures/calendar";
import { catalogState } from "./fixtures/catalogs";
import {
  activeSetupOf,
  COURSE_FILES_ORIGIN,
  courseModels,
  courseNameIn,
  courseShownBy,
  courseState,
  courseStats,
  instructorsPublishSetups,
  readsAsMember,
  setupsShownToMembers,
  type BuildSession,
  type Course,
  type ObstacleInventory,
  type Placement,
  type RingGeometry,
  type RingSetup,
} from "./fixtures/courses";
import { addDays, clubLocalDate } from "./fixtures/planning";
import { findParameter } from "./fixtures/settings";
import { fieldsProjection } from "./list-fields";
import { levelsEnabled, planningState, readerLocale } from "./planning-handlers";
import {
  callerClubOwnsTheWorld,
  currentMockScenario,
  type MockScenarioDefinition,
} from "./scenarios";

type Schemas = components["schemas"];
type CourseListItem = Schemas["CourseListItem"];

/** `files.maxSizeMb` of the parameter world (`GET /parameters/files.maxSizeMb`, 25). */
const MAX_SIZE_MB = 25;
/** R-16-02: a Smarter source is at most 512 KB. */
const SMARTER_MAX_MB = 0.5;
/**
 * The storage the course upload URLs point at (its own host: `handlers.ts` answers every other
 * `uploads.example.test` PUT without keeping the bytes, and course thumbnails are served back).
 */
const COURSE_UPLOADS_ORIGIN = "https://course-uploads.example.test";

/**
 * The api's error answer: the code's canonical status and `details` `{}` when the code has none
 * (what the real core sends, e.g. the E5-W05 real-core run's `REFRESH_REUSED`).
 */
function apiError(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {},
): Response {
  return HttpResponse.json<Schemas["ApiError"]>(
    { code, details, message, traceId: "mock-trace-id" },
    { status },
  );
}

// ---------------------------------------------------------------------------------------------
// Guards: module, roles, tenancy.

function scenario(): MockScenarioDefinition {
  return currentMockScenario();
}

function meId(): string {
  return scenario().me.account.id;
}

function isAdmin(): boolean {
  return scenario().me.membership?.roles.includes("ADMIN") ?? false;
}

/** The tenant of the JWT: the club's records and uploads are this club's only. */
function callerClubId(): string {
  return scenario().me.membership?.clubId ?? "";
}

/** COURSES off → `404 MODULE_DISABLED`; then the staff roles (`refuse`). */
function guard(roles: readonly string[] = ["INSTRUCTOR", "ADMIN"]): Response | undefined {
  const current = scenario();
  if (!current.branding.modules.includes("COURSES")) {
    return apiError("MODULE_DISABLED", "Module disabled", 404);
  }
  return refuse(current, roles);
}

/**
 * The two reads a MEMBER makes too (R-16-16: `GET /courses/{id}`, `GET /ring-setups/{id}`):
 * COURSES, then INSTRUCTOR/ADMIN read as staff; a MEMBER (an impersonation included) reads only
 * while `courses.showSetupToMembers`, else `404 NOT_FOUND`; any other role → `403 FORBIDDEN`.
 */
function readerGuard(what: string): Response | "MEMBER" | "STAFF" {
  const current = scenario();
  if (!current.branding.modules.includes("COURSES")) {
    return apiError("MODULE_DISABLED", "Module disabled", 404);
  }
  const roles = current.me.membership?.roles ?? [];
  const impersonation = current.me.impersonation !== undefined;
  if (!impersonation && roles.some((role) => role === "INSTRUCTOR" || role === "ADMIN")) {
    return "STAFF";
  }
  if (!impersonation && !roles.includes("MEMBER")) return apiError("FORBIDDEN", "Forbidden", 403);
  return setupsShownToMembers() ? "MEMBER" : apiError("NOT_FOUND", `${what} not found`, 404);
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function nextId(prefix: string): string {
  courseState.sequence += 1;
  return `${prefix}-${String(courseState.sequence)}`;
}

function fieldError(field: string, code: string): Response {
  return apiError("VALIDATION_ERROR", "Validation failed", 400, {
    fieldErrors: [{ code, field }],
  });
}

// ---------------------------------------------------------------------------------------------
// CONVENCIONS_API §7: a keyed write replays its stored answer; the same key with another body
// is `409 IDEMPOTENCY_KEY_REUSED {reason: DIFFERENT_REQUEST}`. A 5xx is never stored.
// E62 / R-16-16: the fingerprint is the caller's too (club, account, roles, impersonation), so
// another caller — another club's token included — reusing the key with the same body gets that
// 409, never the stored answer (which may hold this club's records) nor a second execution.

const keyedAnswers = new Map<string, { body: unknown; fingerprint: string; status: number }>();

/** Who sent a keyed write: the tenant and the authorization the route accepted. */
function callerFingerprint(): string {
  const { me } = scenario();
  return JSON.stringify({
    accountId: me.account.id,
    clubId: callerClubId(),
    impersonation: me.impersonation ?? null,
    roles: [...(me.membership?.roles ?? [])].sort(),
  });
}

async function keyed(
  request: Request,
  bodyText: string,
  run: () => Response | Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("Idempotency-Key");
  if (key === null) return run();
  const id = `${request.method} ${new URL(request.url).pathname} ${key}`;
  const fingerprint = `${callerFingerprint()}\n${bodyText}`;
  const saved = keyedAnswers.get(id);
  if (saved !== undefined) {
    return saved.fingerprint === fingerprint
      ? HttpResponse.json(saved.body as Record<string, unknown>, { status: saved.status })
      : apiError("IDEMPOTENCY_KEY_REUSED", "Idempotency key reused", 409, {
          reason: "DIFFERENT_REQUEST",
        });
  }
  const response = await run();
  if (response.status < 500) {
    keyedAnswers.set(id, {
      body: await response.clone().json(),
      fingerprint,
      status: response.status,
    });
  }
  return response;
}

export function resetCourseKeys(): void {
  keyedAnswers.clear();
}

// ---------------------------------------------------------------------------------------------
// Courses: R-16-03 visibility, list items, the reader's projection.

/** Who may read a course: the club's (a PRIVATE one only its author), PUBLIC, the caller's own. */
function readable(course: Course): boolean {
  if (course.ownerType === "AGILITYHUB") return course.visibility === "PUBLIC";
  if (course.ownerType === "ACCOUNT") return course.ownerAccountId === meId();
  if (course.clubId !== callerClubId()) return false;
  return course.visibility !== "PRIVATE" || course.createdByAccountId === meId();
}

/** Who may edit it: never the AgilityHub library from a club (R-16-14). */
function editable(course: Course): boolean {
  return course.ownerType === "CLUB" ? readable(course) : course.ownerAccountId === meId();
}

function findCourse(id: string): Course | undefined {
  return courseState.courses.find((course) => course.id === id);
}

/** `404 NOT_FOUND` for another club's or a deleted course. */
function foundCourse(id: string): Course | Response {
  const course = findCourse(id);
  return course === undefined || (course.ownerType === "CLUB" && course.clubId !== callerClubId())
    ? apiError("NOT_FOUND", "Course not found", 404)
    : course;
}

/** `404 NOT_FOUND` for another club's or a deleted course; `COURSE_NOT_VISIBLE` for the rest. */
function visibleCourse(id: string): Course | Response {
  const course = foundCourse(id);
  if (course instanceof Response) return course;
  return readable(course) ? course : apiError("COURSE_NOT_VISIBLE", "Course not visible", 404);
}

/**
 * R-16-16: what a MEMBER reads — a PUBLIC course, or one an ACTIVE setup of the club shows
 * (directly or through its placement); any other is `COURSE_NOT_VISIBLE`.
 */
function memberVisibleCourse(id: string): Course | Response {
  const course = foundCourse(id);
  if (course instanceof Response) return course;
  return course.visibility === "PUBLIC" || activeOnRings(course.id).length > 0
    ? course
    : apiError("COURSE_NOT_VISIBLE", "Course not visible", 404);
}

const localizedName = courseNameIn;

/**
 * R-16-17: `name` in the reader's language; `nameI18n` only to a caller who can edit it (never a
 * MEMBER).
 */
function forReader(course: Course, request: Request, canEdit = editable(course)): Course {
  const { nameI18n, ...rest } = course;
  return {
    ...rest,
    name: localizedName(course, readerLocale(request)),
    ...(canEdit ? { nameI18n: nameI18n ?? null } : {}),
  };
}

/** The caller's club's rings whose ACTIVE setup shows the course (directly or by its placement). */
function activeOnRings(courseId: string): Schemas["ActiveRing"][] {
  if (!callerClubOwnsTheWorld()) return [];
  return courseState.setups
    .filter((setup) => setup.status === "ACTIVE")
    .filter(
      (setup) =>
        setup.courseId === courseId ||
        courseState.placements.some(
          (placement) => placement.id === setup.placementId && placement.courseId === courseId,
        ),
    )
    .flatMap((setup) => {
      const ring = catalogState.rings.find((candidate) => candidate.id === setup.ringId);
      return ring === undefined ? [] : [{ id: ring.id, name: ring.name }];
    });
}

/** `level`: the club levels' codes joined by an en dash, else the AgilityHub level. */
function levelLabel(levelIds: readonly string[], agilityhubLevel: Course["agilityhubLevel"]) {
  const codes = levelIds.flatMap((id) => {
    const level = catalogState.levels.find((candidate) => candidate.id === id);
    return level === undefined ? [] : [level.code];
  });
  return codes.length > 0 ? codes.join("–") : (agilityhubLevel ?? null);
}

function listItem(course: Course, locale: string): CourseListItem {
  return {
    activeOnRings: activeOnRings(course.id),
    designerName: course.designerName ?? null,
    discipline: course.discipline,
    id: course.id,
    level: levelLabel(course.levelIds, course.agilityhubLevel ?? null),
    name: localizedName(course, locale),
    ownerType: course.ownerType,
    source: course.source,
    stats: course.stats,
    thumbnailUrl: course.thumbnailUrl ?? null,
  };
}

/** `GET /courses` (S16 §6): the snapshot's `x-fields`, `x-filterable` and `x-sortable`. */
const COURSE_LIST_SPEC: ListSpec<Course> = {
  fields: [
    "id",
    "name",
    "discipline",
    "level",
    "designerName",
    "source",
    "thumbnailUrl",
    "stats",
    "ownerType",
    "activeOnRings",
  ],
  filterable: [
    "owner",
    "discipline",
    "agilityhubLevel",
    "levelId",
    "source",
    "tag",
    "designerName",
    "obstacleCount",
    "updatedAt",
  ],
  search: (course) =>
    [...Object.values(course.nameI18n ?? {}), course.designerName ?? "", ...course.tags].join(" "),
  sortable: ["name", "updatedAt"],
  values: (course, field) => {
    switch (field) {
      case "owner":
        return [course.ownerType === "ACCOUNT" ? "MINE" : course.ownerType];
      case "levelId":
        return [...course.levelIds];
      case "tag":
        return [...course.tags];
      case "obstacleCount":
        return [String(course.stats.obstacleCount)];
      case "name":
        return [localizedName(course, "ca")];
      default:
        return listValues((course as Record<string, unknown>)[field]);
    }
  },
};

function courseFileUrl(fileKey: string): string {
  return `${COURSE_FILES_ORIGIN}/files/${encodeURIComponent(fileKey)}`;
}

/** An upload of this club with the purpose the field needs (else `404 NOT_FOUND`). */
function uploaded(fileKey: string | null | undefined, purpose: string): Response | undefined {
  if (fileKey === null || fileKey === undefined) return undefined;
  const file = courseState.files.get(fileKey);
  return file?.purpose === purpose && file.clubId === callerClubId()
    ? undefined
    : apiError("NOT_FOUND", "File not found", 404);
}

/** `fileKey = {clubId}/courses/{uuid}` (the snapshot's `courseUploadUrl`); deterministic here. */
function uploadFileKey(): string {
  courseState.sequence += 1;
  const uuid = `00000000-0000-4000-8000-${String(courseState.sequence).padStart(12, "0")}`;
  return `${callerClubId()}/courses/${uuid}`;
}

/** R-16-01: the model is validated against course-data.v1 (schemaVersion 1). */
function modelProblem(
  model: unknown,
  schemaVersion: number | null | undefined,
): Response | undefined {
  if ((schemaVersion ?? 1) !== 1) {
    return apiError("SCHEMA_VERSION_UNSUPPORTED", "Schema version unsupported", 400);
  }
  const parsed = courseDataSchema.safeParse(model);
  return parsed.success
    ? undefined
    : apiError("COURSE_MODEL_INVALID", "Course model invalid", 400, {
        schemaErrors: parsed.error.issues.slice(0, 20).map((issue) => ({
          keyword: issue.code,
          message: issue.message,
          path: `/${issue.path.join("/")}`,
        })),
      });
}

function levelsProblem(levelIds: readonly string[]): Response | undefined {
  if (levelIds.length === 0) return undefined;
  if (!levelsEnabled()) return apiError("LEVELS_DISABLED", "Levels are disabled", 422);
  return levelIds.every((id) => catalogState.levels.some((level) => level.id === id))
    ? undefined
    : apiError("NOT_FOUND", "Level not found", 404);
}

// ---------------------------------------------------------------------------------------------
// Placements and ring geometry.

function ringOfClub(ringId: string) {
  return callerClubOwnsTheWorld()
    ? catalogState.rings.find((ring) => ring.id === ringId)
    : undefined;
}

/** An activity of the caller's club (S07's world is this club's; another club finds none). */
function activityOfClub(activityId: string): boolean {
  return (
    callerClubOwnsTheWorld() && activityState.activities.some((item) => item.id === activityId)
  );
}

/** A placement of the caller's club (another club's is `404 NOT_FOUND`). */
function clubPlacement(id: string): Placement | undefined {
  return callerClubOwnsTheWorld()
    ? courseState.placements.find((item) => item.id === id)
    : undefined;
}

function withClasses(placement: Placement): Placement {
  return {
    ...placement,
    classSessionIds: planningState.sessions
      .filter((session) => session.placementId === placement.id)
      .map((session) => session.id),
  };
}

type PlacementBody = Schemas["PlacementRequest"] & { version?: number };

function placementProblem(body: PlacementBody, admin: boolean): Response | undefined {
  const course = visibleCourse(body.courseId);
  if (course instanceof Response) return course;
  if (course.normalizedJson === null || course.normalizedJson === undefined) {
    return fieldError("courseId", "COURSE_MODEL_INVALID");
  }
  if (body.courseVersion !== course.version) {
    return apiError("STALE_VERSION", "Stale course version", 409);
  }
  if (ringOfClub(body.ringId) === undefined) return apiError("NOT_FOUND", "Ring not found", 404);
  if (courseState.geometries[body.ringId] === undefined) {
    return apiError("RING_WITHOUT_GEOMETRY", "Ring without geometry", 422);
  }
  if (body.activityId !== null && body.activityId !== undefined) {
    if (!scenario().branding.modules.includes("ACTIVITIES")) {
      return fieldError("activityId", "MODULE_DISABLED");
    }
    // «activityId an activity of the club»: another club's or an unknown one → NOT_FOUND.
    if (!activityOfClub(body.activityId)) return apiError("NOT_FOUND", "Activity not found", 404);
  }
  const critical = body.warnings.filter((warning) => warning.severity === "critical");
  if (critical.length > 0) {
    if (body.force === true && !admin) return apiError("FORBIDDEN", "Forbidden", 403);
    if (body.force !== true) {
      return apiError("PLACEMENT_BLOCKED", "Placement blocked", 422, { warnings: critical });
    }
  }
  return undefined;
}

/**
 * POST and PUT store the request as sent: a PUT replaces the placement (an absent field takes
 * its default — DRAFT, TRAINING, `courses.defaultWarningThresholdM`, `null` — never the stored
 * value); only what the request does not carry (the build sheet, the creation) is kept.
 */
function storedPlacement(
  id: string,
  body: PlacementBody,
  current: Placement | undefined,
): Placement {
  const at = nowIso();
  return {
    activityId: body.activityId ?? null,
    buildSheetFileKey: current?.buildSheetFileKey ?? null,
    classSessionIds: [],
    courseId: body.courseId,
    courseVersion: body.courseVersion,
    createdAt: current?.createdAt ?? at,
    createdByAccountId: current?.createdByAccountId ?? meId(),
    displayName: body.displayName ?? null,
    grades: body.grades ?? [],
    id,
    mode: body.mode ?? "TRAINING",
    name: body.name ?? null,
    placementMode: body.placementMode,
    resolvedObstacles: body.resolvedObstacles,
    ringId: body.ringId,
    scheduledAt: body.scheduledAt ?? null,
    sizes: body.sizes ?? [],
    stale: false,
    status: body.status ?? "DRAFT",
    transform: body.transform,
    updatedAt: at,
    version: current === undefined ? 1 : current.version + 1,
    warningThresholdM:
      body.warningThresholdM ??
      Number(findParameter("courses.defaultWarningThresholdM")?.value ?? 1.5),
    warnings: body.warnings,
  };
}

type Violation = Schemas["GeometryViolation"];

/** R-16-04 as the api checks it (`422 GEOMETRY_INVALID {violations[]}`). */
function geometryViolations(body: Schemas["RingGeometryRequest"]): Violation[] {
  const violations: Violation[] = [];
  const range = (value: number) => value >= 10 && value <= 60;
  if (!range(body.lengthM)) violations.push({ path: "lengthM", rule: "OUT_OF_RANGE" });
  if (!range(body.widthM)) violations.push({ path: "widthM", rule: "OUT_OF_RANGE" });
  if (body.borderClearanceM < 0) violations.push({ path: "borderClearanceM", rule: "NEGATIVE" });
  body.doors.forEach((door, index) => {
    const side = door.side === "NORTH" || door.side === "SOUTH" ? body.lengthM : body.widthM;
    if (!(door.startM >= 0 && door.startM < door.endM && door.endM <= side)) {
      violations.push({ path: `doors[${String(index)}]`, rule: "OUTSIDE_PERIMETER" });
    }
    if (door.clearanceM < 0) {
      violations.push({ path: `doors[${String(index)}].clearanceM`, rule: "NEGATIVE" });
    }
  });
  body.noGoZones.forEach((zone, index) => {
    if (zone.polygonPointsM.length < 3) {
      violations.push({ path: `noGoZones[${String(index)}]`, rule: "TOO_FEW_POINTS" });
    } else if (
      zone.polygonPointsM.some(
        (point) => point.x < 0 || point.y < 0 || point.x > body.lengthM || point.y > body.widthM,
      )
    ) {
      violations.push({ path: `noGoZones[${String(index)}]`, rule: "OUTSIDE_RING" });
    }
  });
  const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
  if (!unique(body.markers.map((item) => item.label))) {
    violations.push({ path: "markers", rule: "DUPLICATE_LABEL" });
  }
  if (!unique(body.markers.map((item) => item.markerUid))) {
    violations.push({ path: "markers", rule: "DUPLICATE_MARKER_UID" });
  }
  const tags = body.markers.flatMap((item) => (item.aprilTagId == null ? [] : [item.aprilTagId]));
  if (!unique(tags)) violations.push({ path: "markers", rule: "DUPLICATE_APRIL_TAG" });
  body.markers.forEach((item, index) => {
    if (item.physicalWidthM <= 0 || item.physicalHeightM <= 0) {
      violations.push({ path: `markers[${String(index)}]`, rule: "NOT_POSITIVE" });
    }
  });
  const active = body.markers.filter((item) => item.isActive);
  if (active.length < 3) {
    violations.push({ path: "markers", rule: "TOO_FEW_MARKERS" });
  } else {
    const [a, ...rest] = active;
    const collinear =
      a !== undefined &&
      rest.every((b) =>
        rest.every(
          (c) => Math.abs((b.xM - a.xM) * (c.yM - a.yM) - (b.yM - a.yM) * (c.xM - a.xM)) < 1e-6,
        ),
      );
    if (collinear) violations.push({ path: "markers", rule: "COLLINEAR_MARKERS" });
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// Setups (R-16-07, R-16-08).

function startOfClubDay(date: string): string {
  return clubInstant(date, "00:00");
}

function setupExpiry(expectedUntil: string | null | undefined): string {
  const days = Number(findParameter("courses.setupAutoExpireDays")?.value ?? 7);
  const auto = startOfClubDay(addDays(clubLocalDate(), days));
  if (expectedUntil === null || expectedUntil === undefined) return auto;
  const expected = startOfClubDay(addDays(expectedUntil, 1));
  return expected < auto ? expected : auto;
}

/**
 * R-16-09/R-16-16: the STAFF view as stored; E9-T07's MEMBER projection without builder or notes,
 * with the placement's course, resolved geometry and ring size.
 */
function setupForReader(
  setup: RingSetup,
  view: "MEMBER" | "STAFF" = "STAFF",
): RingSetup | Schemas["MemberRingSetup"] {
  if (view === "STAFF") return setup;
  const placement = setup.placementId == null ? undefined : clubPlacement(setup.placementId);
  const geometry = placement === undefined ? undefined : courseState.geometries[placement.ringId];
  return {
    agilityhubLevel: setup.agilityhubLevel ?? null,
    builtAt: setup.builtAt,
    courseId: setup.courseId ?? placement?.courseId ?? null,
    createdAt: setup.createdAt,
    dismantledAt: setup.dismantledAt ?? null,
    expectedUntil: setup.expectedUntil ?? null,
    expiresAt: setup.expiresAt,
    id: setup.id,
    imageFileKey: setup.imageFileKey ?? null,
    imageUrl: setup.imageUrl ?? null,
    kind: setup.kind,
    levelIds: setup.levelIds,
    placement:
      placement === undefined
        ? null
        : {
            resolvedObstacles: placement.resolvedObstacles,
            ringLengthM: geometry?.lengthM ?? null,
            ringWidthM: geometry?.widthM ?? null,
            transform: placement.transform,
          },
    placementId: setup.placementId ?? null,
    ringId: setup.ringId,
    status: setup.status,
    view: "MEMBER",
  };
}

/** A setup of the caller's club (another club's is `404 NOT_FOUND`). */
function clubSetup(id: string): RingSetup | undefined {
  return callerClubOwnsTheWorld() ? courseState.setups.find((item) => item.id === id) : undefined;
}

/**
 * R-16-07: registers an ACTIVE setup as `POST /ring-setups` stores it (what the request did not
 * send is `null`); the ring's ACTIVE one, if any, becomes DISMANTLED in the same step.
 */
function registerSetup(source: Schemas["RingSetupRequest"]): Schemas["RingSetupCreated"] {
  const at = nowIso();
  const active = activeSetupOf(source.ringId);
  const setup: RingSetup = {
    agilityhubLevel: source.agilityhubLevel ?? null,
    builtAt: at,
    builtByAccountId: meId(),
    builtByName: scenario().me.account.name,
    courseId: source.courseId ?? null,
    createdAt: at,
    dismantledAt: null,
    dismantledByAccountId: null,
    expectedUntil: source.expectedUntil ?? null,
    expiresAt: setupExpiry(source.expectedUntil),
    id: nextId("setup"),
    imageFileKey: source.imageFileKey ?? null,
    imageUrl: source.imageFileKey == null ? null : courseFileUrl(source.imageFileKey),
    kind: source.kind,
    levelIds: [...source.levelIds],
    notes: source.notes ?? null,
    placementId: source.placementId ?? null,
    ringId: source.ringId,
    status: "ACTIVE",
    view: "STAFF",
  };
  courseState.setups = [
    setup,
    ...courseState.setups.map((item) =>
      item.id === active?.id
        ? {
            ...item,
            dismantledAt: at,
            dismantledByAccountId: meId(),
            status: "DISMANTLED" as const,
          }
        : item,
    ),
  ];
  return { replacedSetupId: active?.id ?? null, setup };
}

/**
 * R-16-09 `MeRingSetupSummary` of the ring's ACTIVE setup (`null` without one): no builder, notes
 * nor inventory; the photo as the thumbnail, else the shown course's; a viewer when there is a
 * placement or a course with a model to draw.
 */
function meSetupSummary(ringId: string): Schemas["MeRingSetupSummary"] | null {
  const active = activeSetupOf(ringId);
  if (active === undefined) return null;
  const course = courseShownBy(active);
  const placement = active.placementId == null ? undefined : clubPlacement(active.placementId);
  return {
    builtAt: active.builtAt,
    expectedUntil: active.expectedUntil ?? null,
    hasViewer: placement !== undefined || course?.normalizedJson != null,
    id: active.id,
    kind: active.kind,
    levelLabel: levelLabel(active.levelIds, active.agilityhubLevel ?? null),
    thumbnailUrl: active.imageUrl ?? course?.thumbnailUrl ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Build sessions (R-16-11). The event stream (`GET /build-sessions/{id}/events`) is not mocked:
// MSW cannot serve an EventSource, so the app reads `GET /build-sessions/{id}` under the mocks.

const BUILD_STRATEGIES = ["EQUIPMENT_TYPE", "CLOSER_OBSTACLE_ORDER", "FREE_BUILD"] as const;
const BUILD_OBSTACLE_STATUSES = ["NOT_PLACED", "CURRENT", "PLACED", "SKIPPED", "NEEDS_CHECK"];
/** The join code's characters: uppercase letters and digits, without the look-alikes 0/O, 1/I. */
const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A deterministic pseudo-random sequence (an LCG over the world's sequence). */
function drawn(length: number, alphabet: string): string {
  courseState.sequence += 1;
  let seed = Math.imul(courseState.sequence, 2654435761) >>> 0;
  let value = "";
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    value += alphabet.charAt((seed >>> 8) % alphabet.length);
  }
  return value;
}

/** Open (NOT_STARTED or IN_PROGRESS) and younger than `courses.buildSessionMaxHours` (12). */
function sessionLive(session: BuildSession): boolean {
  if (session.status !== "NOT_STARTED" && session.status !== "IN_PROGRESS") return false;
  const hours = Number(findParameter("courses.buildSessionMaxHours")?.value ?? 12);
  return session.startedAt == null || Date.now() - Date.parse(session.startedAt) < hours * 3.6e6;
}

/** A six-character join code no open session of the club holds (drawn again otherwise). */
function joinCode(): string {
  const taken = new Set(courseState.buildSessions.filter(sessionLive).map((item) => item.joinCode));
  for (;;) {
    const code = drawn(6, JOIN_ALPHABET);
    if (!taken.has(code)) return code;
  }
}

/** A build session of the caller's club (another club's is `404 NOT_FOUND`). */
function clubBuildSession(id: string): BuildSession | undefined {
  return callerClubOwnsTheWorld()
    ? courseState.buildSessions.find((item) => item.id === id)
    : undefined;
}

function saveBuildSession(next: BuildSession): BuildSession {
  courseState.buildSessions = courseState.buildSessions.map((item) =>
    item.id === next.id ? next : item,
  );
  return next;
}

/** R-16-07 for `finish`: the course's discipline names the setup's kind. */
function setupKind(discipline: Course["discipline"]): RingSetup["kind"] {
  return discipline === "AGILITY" || discipline === "JUMPING" ? discipline : "FUN";
}

/**
 * R-16-11 `finish`'s setup (ruling E118): an ADMIN, or an INSTRUCTOR while
 * `courses.allowInstructorPublish`, refreshes the ring's ACTIVE setup when it already shows this
 * placement (as a renewal: builtAt, builtByAccountId, the same expectedUntil, a new expiresAt), or
 * else registers one as `POST /ring-setups` does (the placement as its source, the course's levels);
 * an INSTRUCTOR with the switch off registers none (`null`).
 */
function finishedSetup(session: BuildSession, course: Course): Response | string | null {
  if (!isAdmin() && !instructorsPublishSetups()) return null;
  const active = activeSetupOf(session.ringId);
  if (active?.placementId === session.placementId) {
    const refreshed: RingSetup = {
      ...active,
      builtAt: nowIso(),
      builtByAccountId: meId(),
      builtByName: scenario().me.account.name,
      expiresAt: setupExpiry(active.expectedUntil),
    };
    courseState.setups = courseState.setups.map((item) =>
      item.id === active.id ? refreshed : item,
    );
    return active.id;
  }
  if (courseState.geometries[session.ringId] === undefined) {
    return apiError("RING_WITHOUT_GEOMETRY", "Ring without geometry", 422);
  }
  return registerSetup({
    agilityhubLevel: course.agilityhubLevel ?? null,
    kind: setupKind(course.discipline),
    levelIds: levelsEnabled() ? [...course.levelIds] : [],
    placementId: session.placementId,
    ringId: session.ringId,
  }).setup.id;
}

/**
 * The inventories are stored per club: the world's under the scope itself, another club's
 * (`coursesOtherClub`) under its club id, so its `club` scope never reads or replaces this one's.
 */
function inventoryKey(scope: string): string {
  return callerClubOwnsTheWorld() ? scope : `${callerClubId()}:${scope}`;
}

function inventoryOf(scope: string): ObstacleInventory | undefined {
  const club = courseState.inventories[inventoryKey("club")];
  if (scope === "club") return club;
  if (!scope.startsWith("ring:")) return undefined;
  return courseState.inventories[inventoryKey(scope)] ?? club;
}

/**
 * The paper a mock plan is drawn on: a full-size rectangle turned white by a colour matrix (the
 * mock images are printed plans; an `<img>` cannot read the club's tokens, and no literal colour
 * is written), so the black `currentColor` lines read in the light and the dark themes.
 */
function paper(x: number, y: number, width: number, height: number): string {
  return `<defs><filter id="paper"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter></defs><rect x="${String(x)}" y="${String(y)}" width="${String(width)}" height="${String(height)}" filter="url(#paper)"/>`;
}

/** The thumbnail the mock storage serves for a fixture course: its plan on white paper. */
function thumbnailSvg(courseId: string): string | undefined {
  const model = courseModels[courseId];
  if (model === undefined) return undefined;
  const { designLengthMeters: length, designWidthMeters: width } = model;
  const shapes = model.obstacles
    .map((obstacle) =>
      obstacle.xMeters === null || obstacle.yMeters === null
        ? ""
        : `<circle cx="${String(obstacle.xMeters)}" cy="${String(obstacle.yMeters)}" r="0.6" fill="none" stroke="currentColor" stroke-width="0.15"/>`,
    )
    .join("");
  const numbers = model.numbers
    .map(
      (number) =>
        `<text x="${String(number.xMeters)}" y="${String(number.yMeters)}" font-size="1" font-family="sans-serif" fill="currentColor">${number.text}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${String(length + 2)} ${String(width + 2)}">${paper(-1, -1, length + 2, width + 2)}<rect x="0" y="0" width="${String(length)}" height="${String(width)}" fill="none" stroke="currentColor" stroke-width="0.1"/>${shapes}${numbers}</svg>`;
}

/** The fixture image course: a hand-drawn-looking plan on white paper. */
const GYMKHANA_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 25">${paper(0, 0, 40, 25)}` +
  '<rect x="1" y="1" width="38" height="23" fill="none" stroke="currentColor" stroke-width="0.2"/><path d="M4 20 C 10 4, 20 22, 28 6 S 36 18, 36 20" fill="none" stroke="currentColor" stroke-width="0.3" stroke-dasharray="1 0.6"/><circle cx="4" cy="20" r="1" fill="none" stroke="currentColor" stroke-width="0.2"/><circle cx="36" cy="20" r="1" fill="none" stroke="currentColor" stroke-width="0.2"/></svg>';

function svgResponse(svg: string): Response {
  return new HttpResponse(svg, { headers: { "Content-Type": "image/svg+xml" } });
}

// ---------------------------------------------------------------------------------------------

export const courseHandlers = [
  // ---- Course library (D18) -------------------------------------------------------------------
  http.get("*/api/v1/courses", ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "50");
    if (!Number.isInteger(page) || page < 0 || ![20, 50, 200, 1000].includes(size)) {
      return apiError("INVALID_FILTER", "Invalid page", 400);
    }
    const projection = fieldsProjection<CourseListItem>(url, COURSE_LIST_SPEC.fields, ["id"]);
    if (projection === undefined) return apiError("INVALID_FILTER", "Invalid fields", 400);
    // Default sort: updatedAt,desc.
    const ordered = [...courseState.courses]
      .filter(readable)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    const selected = selectItems(url, ordered, COURSE_LIST_SPEC);
    if (selected.error !== undefined) return selected.error;
    const locale = readerLocale(request);
    const items = selected.items
      .slice(page * size, (page + 1) * size)
      .map((course) => listItem(course, locale))
      .map(projection ?? ((item) => item));
    return HttpResponse.json<Schemas["CoursePage"]>({
      appliedFilters: selected.filters.map((filter) => ({
        field: filter.field,
        op: filter.op as Schemas["Filter"]["op"],
        value: ["between", "in", "nin"].includes(filter.op)
          ? filter.value.split(",")
          : filter.value,
      })),
      items,
      page,
      size,
      totalItems: selected.items.length,
      totalPages: Math.ceil(selected.items.length / size),
    });
  }),
  http.post("*/api/v1/courses/upload-urls", async ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const body = (await request.json()) as Schemas["CourseUploadUrlRequest"];
    const fits =
      body.purpose === "SMARTER_SOURCE"
        ? body.contentType === "text/plain"
        : body.purpose === "BUILD_SHEET"
          ? body.contentType === "application/pdf"
          : body.contentType.startsWith("image/");
    if (!fits) return apiError("FILE_TYPE_NOT_ALLOWED", "File type not allowed", 400);
    const maxSizeMb = body.purpose === "SMARTER_SOURCE" ? SMARTER_MAX_MB : MAX_SIZE_MB;
    if (body.size <= 0 || body.size > maxSizeMb * 1024 * 1024) {
      return apiError("FILE_TOO_LARGE", "File too large", 400, { maxSizeMb });
    }
    const fileKey = uploadFileKey();
    courseState.files.set(fileKey, {
      bytes: null,
      clubId: callerClubId(),
      contentType: body.contentType,
      placementId: null,
      purpose: body.purpose,
    });
    return HttpResponse.json<Schemas["CourseUploadUrl"]>(
      { fileKey, uploadUrl: `${COURSE_UPLOADS_ORIGIN}/${encodeURIComponent(fileKey)}` },
      { status: 201 },
    );
  }),
  // The storage side of a course upload URL: it keeps the bytes (thumbnails and build sheets are
  // served back). The URL is signed for the granted Content-Type: another one is S3's 403.
  http.put(`${COURSE_UPLOADS_ORIGIN}/:fileKey`, async ({ params, request }) => {
    const fileKey = decodeURIComponent(String(params.fileKey));
    const file = courseState.files.get(fileKey);
    const contentType = request.headers.get("Content-Type")?.split(";")[0]?.trim();
    if (file === undefined || contentType !== file.contentType) {
      return new HttpResponse(null, { status: 403 });
    }
    file.bytes = new Uint8Array(await request.arrayBuffer());
    return new HttpResponse(null, { status: 200 });
  }),
  http.get(`${COURSE_FILES_ORIGIN}/thumbnails/:name`, ({ params }) => {
    const svg = thumbnailSvg(String(params.name).replace(/\.svg$/u, ""));
    return svg === undefined ? new HttpResponse(null, { status: 404 }) : svgResponse(svg);
  }),
  http.get(`${COURSE_FILES_ORIGIN}/courses/gimcana.svg`, () => svgResponse(GYMKHANA_SVG)),
  http.get(`${COURSE_FILES_ORIGIN}/files/:fileKey`, ({ params }) => {
    const file = courseState.files.get(decodeURIComponent(String(params.fileKey)));
    return file?.bytes === null || file === undefined
      ? new HttpResponse(null, { status: 404 })
      : new HttpResponse(file.bytes, { headers: { "Content-Type": file.contentType } });
  }),
  http.post("*/api/v1/courses", async ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const body = JSON.parse(text) as Schemas["CourseRequest"];
      if (body.visibility === "PUBLIC") return fieldError("visibility", "INVALID");
      if (body.source === "AGILITYHUB_COPY") return fieldError("source", "INVALID");
      if (Object.values(body.name).every((name) => name.trim() === "")) {
        return fieldError("name", "REQUIRED");
      }
      if (body.source === "IMAGE") {
        if (body.imageFileKey === null || body.imageFileKey === undefined) {
          return fieldError("imageFileKey", "REQUIRED");
        }
      } else {
        const problem = modelProblem(body.normalizedJson, body.schemaVersion);
        if (problem !== undefined) return problem;
      }
      const files =
        uploaded(body.sourceFileKey, "SMARTER_SOURCE") ??
        uploaded(body.imageFileKey, "COURSE_IMAGE") ??
        uploaded(body.thumbnailFileKey, "THUMBNAIL");
      if (files !== undefined) return files;
      const levels = levelsProblem(body.levelIds);
      if (levels !== undefined) return levels;
      const at = nowIso();
      const model = body.normalizedJson ?? null;
      const course: Course = {
        agilityhubLevel: body.agilityhubLevel ?? null,
        canvasHeight: model?.canvasHeight ?? null,
        canvasWidth: model?.canvasWidth ?? null,
        clubId: callerClubId(),
        courseGrade: null,
        courseType: model?.metadata.courseType ?? null,
        createdAt: at,
        createdByAccountId: meId(),
        designLengthM: model?.designLengthMeters ?? null,
        designWidthM: model?.designWidthMeters ?? null,
        designedOn: body.designedOn ?? null,
        designerName: body.designerName ?? null,
        discipline: body.discipline,
        eventName: body.eventName ?? null,
        id: nextId("course"),
        imageFileKey: body.imageFileKey ?? null,
        imageUrl: body.imageFileKey == null ? null : courseFileUrl(body.imageFileKey),
        levelIds: [...body.levelIds],
        name: body.name.ca ?? Object.values(body.name)[0] ?? "",
        nameI18n: { ...body.name },
        normalizedJson: model,
        notes: body.notes ?? null,
        origin: model?.origin ?? null,
        ownerAccountId: null,
        ownerType: "CLUB",
        schemaVersion: model === null ? null : (body.schemaVersion ?? 1),
        sizeCategory: body.sizeCategory ?? null,
        source: body.source,
        sourceCourseId: null,
        sourceFileKey: body.sourceFileKey ?? null,
        stats: courseStats(model, body.pathLengthM ?? 0),
        tags: [...body.tags],
        thumbnailFileKey: body.thumbnailFileKey ?? null,
        thumbnailUrl:
          body.thumbnailFileKey == null
            ? body.imageFileKey == null
              ? null
              : courseFileUrl(body.imageFileKey)
            : courseFileUrl(body.thumbnailFileKey),
        updatedAt: at,
        version: 1,
        visibility: body.visibility,
      };
      courseState.courses.push(course);
      return HttpResponse.json(forReader(course, request), { status: 201 });
    });
  }),
  http.get("*/api/v1/courses/:id", ({ params, request }) => {
    const reader = readerGuard("Course");
    if (reader instanceof Response) return reader;
    const id = String(params.id);
    const course = reader === "MEMBER" ? memberVisibleCourse(id) : visibleCourse(id);
    if (course instanceof Response) return course;
    return HttpResponse.json(
      forReader(course, request, reader === "MEMBER" ? false : editable(course)),
    );
  }),
  http.patch("*/api/v1/courses/:id", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const course = visibleCourse(String(params.id));
    if (course instanceof Response) return course;
    if (!editable(course)) return apiError("FORBIDDEN", "Forbidden", 403);
    const body = (await request.json()) as Schemas["CoursePatchRequest"];
    if (body.version !== course.version) return apiError("STALE_VERSION", "Stale course", 409);
    if (body.visibility === "PUBLIC" && course.ownerType === "CLUB") {
      return fieldError("visibility", "INVALID");
    }
    if (body.pathLengthM != null && body.normalizedJson == null) {
      return fieldError("pathLengthM", "INVALID");
    }
    if (body.normalizedJson != null) {
      const problem = modelProblem(body.normalizedJson, body.schemaVersion);
      if (problem !== undefined) return problem;
    }
    const files =
      uploaded(body.thumbnailFileKey, "THUMBNAIL") ?? uploaded(body.imageFileKey, "COURSE_IMAGE");
    if (files !== undefined) return files;
    if (body.levelIds != null) {
      const levels = levelsProblem(body.levelIds);
      if (levels !== undefined) return levels;
    }
    const model = body.normalizedJson ?? course.normalizedJson ?? null;
    const next: Course = {
      ...course,
      ...(body.agilityhubLevel === undefined ? {} : { agilityhubLevel: body.agilityhubLevel }),
      ...(body.designedOn == null ? {} : { designedOn: body.designedOn }),
      ...(body.designerName == null ? {} : { designerName: body.designerName }),
      ...(body.discipline == null ? {} : { discipline: body.discipline }),
      ...(body.eventName == null ? {} : { eventName: body.eventName }),
      ...(body.levelIds == null ? {} : { levelIds: [...body.levelIds] }),
      ...(body.name === undefined
        ? {}
        : {
            name: body.name.ca ?? Object.values(body.name)[0] ?? course.name,
            nameI18n: { ...body.name },
          }),
      ...(body.notes == null ? {} : { notes: body.notes }),
      ...(body.tags == null ? {} : { tags: [...body.tags] }),
      ...(body.visibility == null ? {} : { visibility: body.visibility }),
      ...(body.thumbnailFileKey == null
        ? {}
        : {
            thumbnailFileKey: body.thumbnailFileKey,
            thumbnailUrl: courseFileUrl(body.thumbnailFileKey),
          }),
      ...(body.normalizedJson == null
        ? {}
        : { normalizedJson: model, stats: courseStats(model, body.pathLengthM ?? 0) }),
      updatedAt: nowIso(),
      version: course.version + 1,
    };
    courseState.courses = courseState.courses.map((item) => (item.id === course.id ? next : item));
    return HttpResponse.json(forReader(next, request));
  }),
  http.delete("*/api/v1/courses/:id", ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const course = visibleCourse(String(params.id));
    if (course instanceof Response) return course;
    if (!editable(course)) return apiError("FORBIDDEN", "Forbidden", 403);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (version !== course.version) return apiError("STALE_VERSION", "Stale course", 409);
    if (activeOnRings(course.id).length > 0) {
      return apiError("COURSE_IN_USE", "Course in use", 409);
    }
    courseState.courses = courseState.courses.filter((item) => item.id !== course.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/api/v1/courses/:id/duplicate", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const course = visibleCourse(String(params.id));
      if (course instanceof Response) return course;
      if (!editable(course)) return apiError("FORBIDDEN", "Forbidden", 403);
      const body = (text === "" ? {} : JSON.parse(text)) as Schemas["CourseCopyRequest"];
      const at = nowIso();
      const copy: Course = {
        ...course,
        createdAt: at,
        createdByAccountId: meId(),
        id: nextId("course"),
        ...(body.name == null
          ? {}
          : {
              name: body.name.ca ?? Object.values(body.name)[0] ?? course.name,
              nameI18n: { ...body.name },
            }),
        updatedAt: at,
        version: 0,
      };
      courseState.courses.push(copy);
      return HttpResponse.json(forReader(copy, request), { status: 201 });
    });
  }),
  http.post("*/api/v1/courses/:id/copy-to-club", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const course = visibleCourse(String(params.id));
      if (course instanceof Response) return course;
      if (course.visibility !== "PUBLIC") return fieldError("id", "INVALID");
      const body = (text === "" ? {} : JSON.parse(text)) as Schemas["CourseCopyRequest"];
      const at = nowIso();
      const names = body.name ?? course.nameI18n ?? { ca: course.name };
      const copy: Course = {
        ...course,
        agilityhubLevel: course.agilityhubLevel ?? null,
        clubId: callerClubId(),
        createdAt: at,
        createdByAccountId: meId(),
        id: nextId("course"),
        levelIds: [],
        name: names.ca ?? Object.values(names)[0] ?? course.name,
        nameI18n: { ...names },
        ownerAccountId: null,
        ownerType: "CLUB",
        source: "AGILITYHUB_COPY",
        sourceCourseId: course.id,
        updatedAt: at,
        version: 0,
        visibility: "CLUB",
      };
      courseState.courses.push(copy);
      return HttpResponse.json(forReader(copy, request), { status: 201 });
    });
  }),

  // ---- Placements (R-16-05, R-16-06, R-16-10) -------------------------------------------------
  http.get("*/api/v1/placements", ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const ringId = url.searchParams.get("ringId");
    const courseId = url.searchParams.get("courseId");
    const activityId = url.searchParams.get("activityId");
    // «each must be the club's»: another club's (or an unknown) ring or activity → NOT_FOUND.
    if (ringId !== null && ringOfClub(ringId) === undefined) {
      return apiError("NOT_FOUND", "Ring not found", 404);
    }
    if (courseId !== null) {
      const course = visibleCourse(courseId);
      if (course instanceof Response) return course;
    }
    if (activityId !== null && !activityOfClub(activityId)) {
      return apiError("NOT_FOUND", "Activity not found", 404);
    }
    const items = callerClubOwnsTheWorld()
      ? courseState.placements
          .filter((placement) => ringId === null || placement.ringId === ringId)
          .filter((placement) => courseId === null || placement.courseId === courseId)
          .filter((placement) => activityId === null || placement.activityId === activityId)
          .filter((placement) => {
            const course = findCourse(placement.courseId);
            return course !== undefined && readable(course);
          })
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
          .map(withClasses)
      : [];
    return HttpResponse.json(items);
  }),
  http.get("*/api/v1/placements/:id", ({ params }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const placement = clubPlacement(String(params.id));
    return placement === undefined
      ? apiError("NOT_FOUND", "Placement not found", 404)
      : HttpResponse.json(withClasses(placement));
  }),
  http.post("*/api/v1/placements", async ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const body = JSON.parse(text) as PlacementBody;
      const problem = placementProblem(body, isAdmin());
      if (problem !== undefined) return problem;
      const placement = storedPlacement(nextId("placement"), body, undefined);
      courseState.placements.push(placement);
      return HttpResponse.json(withClasses(placement), { status: 201 });
    });
  }),
  http.put("*/api/v1/placements/:id", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const current = clubPlacement(String(params.id));
    if (current === undefined) return apiError("NOT_FOUND", "Placement not found", 404);
    const body = (await request.json()) as PlacementBody;
    if (body.version !== current.version) return apiError("STALE_VERSION", "Stale placement", 409);
    if (body.ringId !== current.ringId) {
      return apiError("PLACEMENT_RING_MISMATCH", "Placement ring mismatch", 422);
    }
    if (body.courseId !== current.courseId) return fieldError("courseId", "INVALID");
    const problem = placementProblem(body, isAdmin());
    if (problem !== undefined) return problem;
    const next = storedPlacement(current.id, body, current);
    courseState.placements = courseState.placements.map((item) =>
      item.id === current.id ? next : item,
    );
    return HttpResponse.json(withClasses(next));
  }),
  // R-16-10 / T-16-19: the stored PDF's bytes; a placement without one → NOT_FOUND.
  http.get("*/api/v1/placements/:id/build-sheet", ({ params }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const placement = clubPlacement(String(params.id));
    if (placement === undefined) return apiError("NOT_FOUND", "Placement not found", 404);
    const key = placement.buildSheetFileKey;
    const bytes = key == null ? null : (courseState.files.get(key)?.bytes ?? null);
    return bytes === null
      ? apiError("NOT_FOUND", "Build sheet not found", 404)
      : new HttpResponse(bytes, { headers: { "Content-Type": "application/pdf" } });
  }),
  // R-16-10: binds this club's BUILD_SHEET upload (another club's key, another purpose, a key
  // bound to another placement or a key granted but never uploaded → NOT_FOUND: there is no PDF
  // to store) and replaces the previous sheet; the version stays.
  http.post("*/api/v1/placements/:id/build-sheet", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const body = (await request.json()) as Partial<Schemas["BuildSheetRequest"]>;
    if (typeof body.fileKey !== "string" || body.fileKey === "") {
      return fieldError("fileKey", "REQUIRED");
    }
    const placement = clubPlacement(String(params.id));
    if (placement === undefined) return apiError("NOT_FOUND", "Placement not found", 404);
    const file = courseState.files.get(body.fileKey);
    const free = file?.placementId == null || file.placementId === placement.id;
    // No file, or granted but never uploaded (no bytes yet).
    if (file?.bytes == null || !free || uploaded(body.fileKey, "BUILD_SHEET") !== undefined) {
      return apiError("NOT_FOUND", "File not found", 404);
    }
    const previous = placement.buildSheetFileKey;
    if (previous != null && previous !== body.fileKey) courseState.files.delete(previous);
    file.placementId = placement.id;
    const next: Placement = { ...placement, buildSheetFileKey: body.fileKey };
    courseState.placements = courseState.placements.map((item) =>
      item.id === placement.id ? next : item,
    );
    return HttpResponse.json(withClasses(next));
  }),

  // ---- Ring geometry and inventory (D16, R-16-04, R-16-12) ------------------------------------
  http.get("*/api/v1/rings/:id/geometry", ({ params }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const ringId = String(params.id);
    const geometry = ringOfClub(ringId) === undefined ? undefined : courseState.geometries[ringId];
    return geometry === undefined
      ? apiError("NOT_FOUND", "Ring without geometry", 404)
      : HttpResponse.json(geometry);
  }),
  http.put("*/api/v1/rings/:id/geometry", async ({ params, request }) => {
    const refused = guard(["ADMIN"]);
    if (refused !== undefined) return refused;
    const ringId = String(params.id);
    if (ringOfClub(ringId) === undefined) return apiError("NOT_FOUND", "Ring not found", 404);
    const body = (await request.json()) as Schemas["RingGeometryRequest"];
    const current = courseState.geometries[ringId];
    if (body.version !== (current?.version ?? 0)) {
      return apiError("STALE_VERSION", "Stale geometry", 409);
    }
    const violations = geometryViolations(body);
    if (violations.length > 0) {
      return apiError("GEOMETRY_INVALID", "Geometry invalid", 422, { violations });
    }
    const saved: RingGeometry = { ...body, updatedAt: nowIso(), version: body.version + 1 };
    courseState.geometries[ringId] = saved;
    // R-16-06: every placement of the ring is stale until the client recalculates it.
    courseState.placements = courseState.placements.map((placement) =>
      placement.ringId === ringId ? { ...placement, stale: true } : placement,
    );
    return HttpResponse.json(saved);
  }),
  http.delete("*/api/v1/rings/:id/geometry", ({ params, request }) => {
    const refused = guard(["ADMIN"]);
    if (refused !== undefined) return refused;
    const ringId = String(params.id);
    if (ringOfClub(ringId) === undefined) return apiError("NOT_FOUND", "Ring not found", 404);
    const current = courseState.geometries[ringId];
    if (current === undefined) return apiError("NOT_FOUND", "Ring without geometry", 404);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (version !== current.version) return apiError("STALE_VERSION", "Stale geometry", 409);
    const inUse =
      courseState.placements.some(
        (placement) => placement.ringId === ringId && placement.status !== "ARCHIVED",
      ) ||
      courseState.setups.some(
        (setup) =>
          setup.ringId === ringId && setup.status === "ACTIVE" && setup.placementId != null,
      );
    if (inUse) return apiError("RING_GEOMETRY_IN_USE", "Geometry in use", 409);
    Reflect.deleteProperty(courseState.geometries, ringId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/obstacle-inventories/:scope", ({ params }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const scope = String(params.scope);
    if (scope !== "club" && !scope.startsWith("ring:")) return fieldError("scope", "INVALID");
    if (scope.startsWith("ring:") && ringOfClub(scope.slice(5)) === undefined) {
      return apiError("NOT_FOUND", "Ring not found", 404);
    }
    const inventory = inventoryOf(scope);
    return inventory === undefined
      ? apiError("NOT_FOUND", "No inventory", 404)
      : HttpResponse.json(inventory);
  }),
  http.put("*/api/v1/obstacle-inventories/:scope", async ({ params, request }) => {
    const refused = guard(["ADMIN"]);
    if (refused !== undefined) return refused;
    const scope = String(params.scope);
    if (scope !== "club" && !scope.startsWith("ring:")) return fieldError("scope", "INVALID");
    if (scope.startsWith("ring:") && ringOfClub(scope.slice(5)) === undefined) {
      return apiError("NOT_FOUND", "Ring not found", 404);
    }
    const body = (await request.json()) as Schemas["InventoryRequest"];
    const types = body.items.map((item) => item.type);
    if (body.items.some((item) => item.count < 0) || new Set(types).size !== types.length) {
      return apiError("INVENTORY_INVALID", "Inventory invalid", 422);
    }
    const inventory: ObstacleInventory = {
      items: body.items.map((item) => ({ ...item })),
      ringId: scope === "club" ? null : scope.slice(5),
      scope: scope === "club" ? "CLUB" : "RING",
      updatedAt: nowIso(),
    };
    courseState.inventories[inventoryKey(scope)] = inventory;
    return HttpResponse.json(inventory);
  }),

  // ---- Setups (R-16-07, R-16-08) ---------------------------------------------------------------
  http.get("*/api/v1/rings/:id/setups", ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const ringId = String(params.id);
    if (ringOfClub(ringId) === undefined) return apiError("NOT_FOUND", "Ring not found", 404);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "20");
    const items = courseState.setups
      .filter((setup) => setup.ringId === ringId)
      .sort((a, b) => (a.builtAt < b.builtAt ? 1 : a.builtAt > b.builtAt ? -1 : 0));
    return HttpResponse.json<Schemas["RingSetupPage"]>({
      items: items.slice(page * size, (page + 1) * size),
      page,
      size,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / size),
    });
  }),
  // R-16-09: staff read any setup of the club; a MEMBER only an ACTIVE one (view MEMBER).
  http.get("*/api/v1/ring-setups/:id", ({ params }) => {
    const reader = readerGuard("Setup");
    if (reader instanceof Response) return reader;
    const setup = clubSetup(String(params.id));
    return setup === undefined || (reader === "MEMBER" && setup.status !== "ACTIVE")
      ? apiError("NOT_FOUND", "Setup not found", 404)
      : HttpResponse.json(setupForReader(setup, reader));
  }),
  http.post("*/api/v1/ring-setups", async ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    if (!isAdmin() && !instructorsPublishSetups()) return apiError("FORBIDDEN", "Forbidden", 403);
    const text = await request.text();
    return keyed(request, text, () => {
      const body = JSON.parse(text) as Schemas["RingSetupRequest"];
      if (ringOfClub(body.ringId) === undefined)
        return apiError("NOT_FOUND", "Ring not found", 404);
      const sources = [body.placementId, body.courseId, body.imageFileKey].filter(
        (source) => source !== null && source !== undefined,
      );
      if (body.kind === "EMPTY" && sources.length > 0) return fieldError("kind", "INVALID");
      if (body.kind !== "EMPTY" && sources.length === 0) {
        return apiError("SETUP_SOURCE_REQUIRED", "A source is required", 422);
      }
      if (body.placementId != null) {
        if (courseState.geometries[body.ringId] === undefined) {
          return apiError("RING_WITHOUT_GEOMETRY", "Ring without geometry", 422);
        }
        const placement = clubPlacement(body.placementId);
        if (placement === undefined) return apiError("NOT_FOUND", "Placement not found", 404);
        if (placement.ringId !== body.ringId) {
          return apiError("PLACEMENT_RING_MISMATCH", "Placement ring mismatch", 422);
        }
        if (body.courseId != null && body.courseId !== placement.courseId) {
          return fieldError("courseId", "INVALID");
        }
      }
      if (body.courseId != null) {
        const course = visibleCourse(body.courseId);
        if (course instanceof Response) return course;
      }
      const image = uploaded(body.imageFileKey, "COURSE_IMAGE");
      if (image !== undefined) return image;
      const levels = levelsProblem(body.levelIds);
      if (levels !== undefined) return levels;
      if (body.expectedUntil != null && body.expectedUntil < clubLocalDate()) {
        return fieldError("expectedUntil", "INVALID");
      }
      return HttpResponse.json<Schemas["RingSetupCreated"]>(registerSetup(body), {
        status: 201,
      });
    });
  }),
  http.post("*/api/v1/ring-setups/:id/dismantle", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const setup = clubSetup(String(params.id));
      if (setup === undefined) return apiError("NOT_FOUND", "Setup not found", 404);
      if (setup.status !== "ACTIVE") {
        return apiError("INVALID_STATE", "Invalid state", 409, { reason: setup.status });
      }
      const next: RingSetup = {
        ...setup,
        dismantledAt: nowIso(),
        dismantledByAccountId: meId(),
        status: "DISMANTLED",
      };
      courseState.setups = courseState.setups.map((item) => (item.id === setup.id ? next : item));
      return HttpResponse.json(next);
    });
  }),
  http.post("*/api/v1/ring-setups/:id/renewal", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const setup = clubSetup(String(params.id));
      if (setup === undefined) return apiError("NOT_FOUND", "Setup not found", 404);
      if (setup.status !== "ACTIVE") {
        return apiError("INVALID_STATE", "Invalid state", 409, { reason: setup.status });
      }
      const body = (text === "" ? {} : JSON.parse(text)) as Schemas["RenewalRequest"];
      if (body.expectedUntil != null && body.expectedUntil < clubLocalDate()) {
        return fieldError("expectedUntil", "INVALID");
      }
      const next: RingSetup = {
        ...setup,
        expectedUntil: body.expectedUntil ?? null,
        expiresAt: setupExpiry(body.expectedUntil),
      };
      courseState.setups = courseState.setups.map((item) => (item.id === setup.id ? next : item));
      return HttpResponse.json(next);
    });
  }),

  // ---- What the member reads (R-16-09; screens 08, 10, 07) ------------------------------------
  // `ringIds` as openapi-fetch sends an array (`ringIds=a&ringIds=b`) or comma-separated.
  http.get("*/api/v1/me/ring-setups", ({ request }) => {
    const current = scenario();
    if (!current.branding.modules.includes("COURSES")) {
      return apiError("MODULE_DISABLED", "Module disabled", 404);
    }
    const roles = current.me.membership?.roles ?? [];
    if (
      current.me.impersonation === undefined &&
      !roles.some((role) => role === "MEMBER" || role === "INSTRUCTOR")
    ) {
      return apiError("FORBIDDEN", "Forbidden", 403);
    }
    const requested = new URL(request.url).searchParams
      .getAll("ringIds")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => value !== "");
    const rings = [];
    if (requested.length > 0) {
      for (const id of requested) {
        const ring = ringOfClub(id);
        if (ring === undefined) return apiError("NOT_FOUND", "Ring not found", 404);
        rings.push(ring);
      }
    } else if (callerClubOwnsTheWorld()) {
      rings.push(
        ...catalogState.rings
          .filter((ring) => ring.active)
          .sort((left, right) => left.order - right.order),
      );
    }
    // A MEMBER (an impersonation included) reads every ring without its setup while
    // `courses.showSetupToMembers` is off; an INSTRUCTOR's projection is unchanged.
    const hidden = readsAsMember() && !setupsShownToMembers();
    return HttpResponse.json<Schemas["MeRingSetup"][]>(
      rings.map((ring) => ({ ringId: ring.id, setup: hidden ? null : meSetupSummary(ring.id) })),
    );
  }),

  // ---- Build sessions (R-16-11) ------------------------------------------------------------------
  http.post("*/api/v1/build-sessions", async ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const body = (text === "" ? {} : JSON.parse(text)) as Partial<Schemas["BuildSessionRequest"]>;
      if (typeof body.placementId !== "string" || body.placementId === "") {
        return fieldError("placementId", "REQUIRED");
      }
      if (typeof body.live !== "boolean") return fieldError("live", "REQUIRED");
      const strategy = body.selectedStrategy ?? "EQUIPMENT_TYPE";
      if (!BUILD_STRATEGIES.includes(strategy)) return fieldError("selectedStrategy", "INVALID");
      const placement = clubPlacement(body.placementId);
      if (placement === undefined) return apiError("NOT_FOUND", "Placement not found", 404);
      const course = findCourse(placement.courseId);
      if (course === undefined || !readable(course)) {
        return apiError("COURSE_NOT_VISIBLE", "Course not visible", 404);
      }
      const session: BuildSession = {
        buildSheetFileKey: placement.buildSheetFileKey ?? null,
        finishedAt: null,
        id: nextId("build-session"),
        joinCode: joinCode(),
        joinToken: drawn(32, "0123456789abcdef"),
        joinTokenRotatedAt: null,
        lastKnownMarkerId: null,
        live: body.live,
        localCacheVersion: 0,
        obstacles: placement.resolvedObstacles.map((obstacle) => ({
          at: null,
          byAccountId: null,
          lastUpdatedClientSessionId: null,
          obstacleId: obstacle.obstacleId,
          status: "NOT_PLACED" as const,
        })),
        participants: [],
        placementId: placement.id,
        ringId: placement.ringId,
        selectedStrategy: strategy,
        setupId: null,
        startedAt: nowIso(),
        startedByAccountId: meId(),
        status: "NOT_STARTED",
        version: 1,
      };
      courseState.buildSessions.push(session);
      return HttpResponse.json(session, { status: 201 });
    });
  }),
  http.post("*/api/v1/build-sessions/join", async ({ request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const body = (await request.json()) as Partial<Schemas["BuildJoinRequest"]>;
    if (typeof body.code !== "string" || body.code.trim() === "") {
      return fieldError("code", "REQUIRED");
    }
    const code = body.code.trim();
    const open = callerClubOwnsTheWorld() ? courseState.buildSessions.filter(sessionLive) : [];
    const byToken = open.find((item) => item.joinToken === code);
    const session = byToken ?? open.find((item) => item.joinCode === code.toUpperCase());
    if (session === undefined) return apiError("NOT_FOUND", "Build session not found", 404);
    if (session.participants.some((participant) => participant.accountId === meId())) {
      return HttpResponse.json(session);
    }
    return HttpResponse.json(
      saveBuildSession({
        ...session,
        participants: [
          ...session.participants,
          {
            accountId: meId(),
            joinedAt: nowIso(),
            joinedVia: byToken === undefined ? "CODE" : "QR",
          },
        ],
      }),
    );
  }),
  http.get("*/api/v1/build-sessions/:id", ({ params }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const session = clubBuildSession(String(params.id));
    return session === undefined
      ? apiError("NOT_FOUND", "Build session not found", 404)
      : HttpResponse.json(session);
  }),
  // Last write wins per obstacle: `version` is accepted and never compared.
  http.patch("*/api/v1/build-sessions/:id/obstacles/:obstacleId", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const body = (await request.json()) as Partial<Schemas["BuildObstacleRequest"]>;
    if (typeof body.status !== "string" || !BUILD_OBSTACLE_STATUSES.includes(body.status)) {
      return fieldError("status", body.status === undefined ? "REQUIRED" : "INVALID");
    }
    const status = body.status;
    const session = clubBuildSession(String(params.id));
    if (session === undefined) return apiError("NOT_FOUND", "Build session not found", 404);
    if (!sessionLive(session)) {
      return apiError("BUILD_SESSION_FINISHED", "Build session finished", 422);
    }
    const obstacleId = String(params.obstacleId);
    if (!session.obstacles.some((obstacle) => obstacle.obstacleId === obstacleId)) {
      return apiError("NOT_FOUND", "Obstacle not found", 404);
    }
    const at = nowIso();
    return HttpResponse.json(
      saveBuildSession({
        ...session,
        obstacles: session.obstacles.map((obstacle) =>
          obstacle.obstacleId === obstacleId
            ? { ...obstacle, at, byAccountId: meId(), status }
            : obstacle,
        ),
        status: "IN_PROGRESS",
        version: session.version + 1,
      }),
    );
  }),
  http.post("*/api/v1/build-sessions/:id/finish", async ({ params, request }) => {
    const refused = guard();
    if (refused !== undefined) return refused;
    const text = await request.text();
    return keyed(request, text, () => {
      const session = clubBuildSession(String(params.id));
      if (session === undefined) return apiError("NOT_FOUND", "Build session not found", 404);
      if (!sessionLive(session)) {
        return apiError("BUILD_SESSION_FINISHED", "Build session finished", 422);
      }
      const course = findCourse(clubPlacement(session.placementId)?.courseId ?? "");
      if (course === undefined || !readable(course)) {
        return apiError("COURSE_NOT_VISIBLE", "Course not visible", 404);
      }
      const setupId = finishedSetup(session, course);
      if (setupId instanceof Response) return setupId;
      return HttpResponse.json(
        saveBuildSession({
          ...session,
          finishedAt: nowIso(),
          setupId,
          status: "COMPLETED",
          version: session.version + 1,
        }),
      );
    });
  }),
];
