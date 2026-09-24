import { http, HttpResponse } from "msw";

import {
  DAY_GRID_TENANT,
  dayGridClassSessions,
  dayGridFixture,
  dayGridMemberSession,
  dayGridState,
  isDayGridFixtureDate,
  memberBlockView,
} from "./fixtures/day-grid";
import { apiError, validationError } from "./planning-handlers";
import {
  currentMockScenario,
  currentMockScenarioName,
  type MockScenarioDefinition,
} from "./scenarios";

function readerLocale(request: Request): "ca" | "en" | "es" {
  const language = request.headers.get("Accept-Language")?.slice(0, 2).toLowerCase();
  return language === "es" || language === "en" ? language : "ca";
}

/** A real `YYYY-MM-DD` date (400 `VALIDATION_ERROR` otherwise, as the api answers). */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The tenant comes from the JWT; in the mocks, from the scenario's club. */
function ownTenant(scenario: MockScenarioDefinition): boolean {
  return scenario.branding.club.slug === DAY_GRID_TENANT;
}

function isImpersonation(scenario: MockScenarioDefinition): boolean {
  return scenario.me.impersonation !== undefined;
}

function isStaff(scenario: MockScenarioDefinition): boolean {
  return (
    !isImpersonation(scenario) &&
    (scenario.me.membership?.roles.some((role) => role === "ADMIN" || role === "INSTRUCTOR") ??
      false)
  );
}

/** Impersonation tokens only reach `/day-grid?view=member` and `GET /class-sessions/{id}`. */
function denied(scenario: MockScenarioDefinition) {
  return isImpersonation(scenario)
    ? apiError("IMPERSONATION_DENIED", "Impersonation allows only the member view", 403)
    : apiError("FORBIDDEN", "Forbidden", 403);
}

function isFixtureClass(id: string): boolean {
  return dayGridClassSessions().some((session) => session.id === id);
}

/**
 * Screens 10 / 23 (S06 form D) on the mockup days. Registered before `calendarHandlers`: any other
 * date, class or block falls through to the calendar world of E4-W02 (a resolver returning nothing
 * passes the request to the next matching handler). Role, impersonation and tenant guards follow
 * S06 §6 and `MATRIU_PERMISOS.md`.
 */
export const dayGridHandlers = [
  http.get("*/api/v1/day-grid", ({ request }) => {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? "";
    if (!isRealDate(date)) return validationError("date");
    const view = url.searchParams.get("view") === "instructor" ? "instructor" : "member";
    const scenario = currentMockScenario();
    if (view === "instructor" && !isStaff(scenario)) return denied(scenario);
    const options = {
      locale: readerLocale(request),
      modules: scenario.branding.modules,
      timeZone: scenario.branding.timeZone,
    };
    if (!ownTenant(scenario)) {
      // Another club never sees this world: its day has no rings and no elements.
      return HttpResponse.json({ ...dayGridFixture(date, view, options), columns: [], rows: [] });
    }
    if (currentMockScenarioName() === "dayGridEmpty") {
      return HttpResponse.json({ ...dayGridFixture(date, view, options), rows: [] });
    }
    return isDayGridFixtureDate(date)
      ? HttpResponse.json(dayGridFixture(date, view, options))
      : undefined;
  }),
  http.get("*/api/v1/class-sessions/:id", ({ params }) => {
    const id = String(params.id);
    if (!isFixtureClass(id)) return undefined;
    const scenario = currentMockScenario();
    if (!ownTenant(scenario)) return apiError("NOT_FOUND", "Class not found", 404);
    if (isStaff(scenario)) {
      return HttpResponse.json(dayGridClassSessions().find((session) => session.id === id));
    }
    const view = dayGridMemberSession(id, scenario.branding.modules);
    return view === undefined
      ? apiError("NOT_FOUND", "Class not found", 404)
      : HttpResponse.json(view);
  }),
  http.get("*/api/v1/ring-blocks/:id", ({ params }) => {
    const block = dayGridState.blocks.find((item) => item.id === String(params.id));
    if (block === undefined) return undefined;
    const scenario = currentMockScenario();
    if (!ownTenant(scenario)) return apiError("NOT_FOUND", "Ring block not found", 404);
    if (isImpersonation(scenario)) return denied(scenario);
    return HttpResponse.json(isStaff(scenario) ? block : memberBlockView(block));
  }),
  http.post("*/api/v1/ring-blocks/:id/cancellation", ({ params }) => {
    const current = dayGridState.blocks.find((item) => item.id === String(params.id));
    if (current === undefined) return undefined;
    const scenario = currentMockScenario();
    if (!ownTenant(scenario)) return apiError("NOT_FOUND", "Ring block not found", 404);
    if (!isStaff(scenario)) return denied(scenario);
    if (current.activityId !== null && current.activityId !== undefined) {
      return apiError("RING_BLOCK_MANAGED_BY_ACTIVITY", "Managed by an activity", 422);
    }
    if (current.state !== "ACTIVE") {
      return apiError("INVALID_STATE", "The block is already cancelled", 409);
    }
    const next = { ...current, state: "CANCELLED" as const, version: current.version + 1 };
    dayGridState.blocks = dayGridState.blocks.map((block) => (block.id === next.id ? next : block));
    return HttpResponse.json(next);
  }),
];
