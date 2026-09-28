import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import {
  ATTENDANCE_INSTRUCTORS,
  type AttendanceContext,
  attendanceSheetView,
  applyOtherSave,
  findAttendanceClass,
  instructorCardView,
  instructorDayView,
  OWN_INSTRUCTOR_ID,
  resetAttendanceState,
  saveAttendanceItems,
  attendanceState,
} from "./fixtures/attendance";
import { apiError, levelsEnabled, validationError } from "./planning-handlers";
import { currentMockScenario, type MockScenarioDefinition } from "./scenarios";

type AttendanceSaveRequest = components["schemas"]["AttendanceSaveRequest"];

const STATES = ["PENDING", "PRESENT", "NOTIFIED", "NO_SHOW"] as const;

/** Resets the S10 world (tests call it between cases, like the other mock states). */
export function resetAttendanceMockState(): void {
  resetAttendanceState();
}

function isImpersonation(scenario: MockScenarioDefinition): boolean {
  return scenario.me.impersonation !== undefined;
}

function isAdmin(scenario: MockScenarioDefinition): boolean {
  return scenario.me.membership?.roles.includes("ADMIN") ?? false;
}

function isStaff(scenario: MockScenarioDefinition): boolean {
  return isAdmin(scenario) || (scenario.me.membership?.roles.includes("INSTRUCTOR") ?? false);
}

/**
 * S10 §6: every instructor route is INSTRUCTOR/ADMIN only; an impersonation token gets
 * `403 IMPERSONATION_DENIED` (E6-T01), any other role `403 FORBIDDEN`.
 */
function refusal(scenario: MockScenarioDefinition) {
  if (isImpersonation(scenario)) {
    return apiError("IMPERSONATION_DENIED", "Impersonation tokens cannot use this route", 403);
  }
  return isStaff(scenario) ? undefined : apiError("FORBIDDEN", "Forbidden", 403);
}

function context(scenario: MockScenarioDefinition): AttendanceContext {
  return {
    admin: isAdmin(scenario),
    levelsEnabled: levelsEnabled(),
    modules: scenario.branding.modules,
    variant: scenario.attendance,
  };
}

/** The caller's instructor profile: the INSTRUCTOR scenario is Estel; an ADMIN without one gets the first by shortName (R-10-01). */
function callerInstructorId(scenario: MockScenarioDefinition): string {
  if (scenario.me.membership?.roles.includes("INSTRUCTOR") === true) return OWN_INSTRUCTOR_ID;
  const [first] = [...ATTENDANCE_INSTRUCTORS].sort((left, right) =>
    left.shortName.localeCompare(right.shortName),
  );
  return first?.id ?? OWN_INSTRUCTOR_ID;
}

function callerName(scenario: MockScenarioDefinition): string {
  if (scenario.me.membership?.roles.includes("INSTRUCTOR") === true) {
    return ATTENDANCE_INSTRUCTORS.find((item) => item.id === OWN_INSTRUCTOR_ID)?.shortName ?? "";
  }
  return scenario.me.account.name.split(" ")[0] ?? "";
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function clubToday(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Madrid",
    year: "numeric",
  }).format(new Date(now));
}

/** Screens 20, 21 and 22 (S10 §6, api E6-T01), mocks-first on the published contract. */
export const attendanceHandlers = [
  http.get("*/api/v1/instructor/day", ({ request }) => {
    const scenario = currentMockScenario();
    const refused = refusal(scenario);
    if (refused !== undefined) return refused;
    const url = new URL(request.url);
    const now = Date.now();
    const date = url.searchParams.get("date") ?? clubToday(now);
    if (!isRealDate(date)) return validationError("date");
    const requested = url.searchParams.get("instructorId");
    const instructorId =
      requested === null || requested === "" || requested === "me"
        ? callerInstructorId(scenario)
        : requested;
    if (!ATTENDANCE_INSTRUCTORS.some((instructor) => instructor.id === instructorId)) {
      return apiError("NOT_FOUND", "Instructor not found", 404);
    }
    return HttpResponse.json(instructorDayView(date, instructorId, now, context(scenario)));
  }),
  http.get("*/api/v1/class-sessions/:id/attendance", ({ params }) => {
    const scenario = currentMockScenario();
    const refused = refusal(scenario);
    if (refused !== undefined) return refused;
    const stored = findAttendanceClass(String(params.id));
    if (stored === undefined) return apiError("NOT_FOUND", "Class not found", 404);
    return HttpResponse.json(attendanceSheetView(stored, context(scenario)));
  }),
  http.put("*/api/v1/class-sessions/:id/attendance", async ({ params, request }) => {
    const scenario = currentMockScenario();
    const refused = refusal(scenario);
    if (refused !== undefined) return refused;
    const key = request.headers.get("Idempotency-Key");
    if (key === null || key === "") return validationError("Idempotency-Key", "REQUIRED");
    const body = (await request.json().catch(() => null)) as AttendanceSaveRequest | null;
    const id = String(params.id);
    const signature = JSON.stringify({ body, id });
    // CONVENCIONS_API §7: the same key replays the first answer; with another payload it is 409.
    const replay = attendanceState.idempotency.get(key);
    if (replay !== undefined) {
      return replay.signature === signature
        ? HttpResponse.json(replay.body, { status: replay.status })
        : apiError("IDEMPOTENCY_KEY_REUSED", "Idempotency key reused", 409);
    }
    const answer = (status: number, payload: Record<string, unknown>) => {
      attendanceState.idempotency.set(key, { body: payload, signature, status });
      return HttpResponse.json(payload, { status });
    };
    const fail = (status: number, code: string, details: Record<string, unknown> = {}) =>
      answer(status, { code, details, message: code, traceId: "mock-trace-id" });
    const stored = findAttendanceClass(id);
    if (stored === undefined) return fail(404, "NOT_FOUND");
    const items = Array.isArray(body?.items) ? body.items : undefined;
    if (body === null || typeof body.version !== "number" || items === undefined) {
      return fail(400, "VALIDATION_ERROR", { fieldErrors: [{ code: "REQUIRED", field: "items" }] });
    }
    const ids = items.map((item) => item.bookingId);
    if (items.some((item) => !STATES.includes(item.state)) || new Set(ids).size !== ids.length) {
      return fail(400, "VALIDATION_ERROR", { fieldErrors: [{ code: "INVALID", field: "items" }] });
    }
    if (stored.state === "CANCELLED") return fail(409, "INVALID_STATE");
    const now = Date.now();
    if (scenario.attendance === "stale") applyOtherSave(stored, now);
    const view = context(scenario);
    if (body.version !== stored.version) {
      return fail(409, "STALE_VERSION", { current: attendanceSheetView(stored, view) });
    }
    const result = saveAttendanceItems(stored, items, {
      ...view,
      callerName: callerName(scenario),
      now,
    });
    if ("code" in result) return fail(result.status, result.code, result.details);
    return answer(200, { ...attendanceSheetView(stored, view), applied: result.applied });
  }),
  http.get("*/api/v1/dogs/:id/instructor-card", ({ params }) => {
    const scenario = currentMockScenario();
    const refused = refusal(scenario);
    if (refused !== undefined) return refused;
    const card = instructorCardView(String(params.id), context(scenario));
    return card === undefined
      ? apiError("NOT_FOUND", "Dog not found", 404)
      : HttpResponse.json(card);
  }),
];
