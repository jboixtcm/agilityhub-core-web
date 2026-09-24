import { http, HttpResponse } from "msw";

import {
  dayGridClassSessions,
  dayGridFixture,
  dayGridState,
  isDayGridFixtureDate,
} from "./fixtures/day-grid";
import { apiError, validationError } from "./planning-handlers";
import { currentMockScenario, currentMockScenarioName } from "./scenarios";

function readerLocale(request: Request): "ca" | "en" | "es" {
  const language = request.headers.get("Accept-Language")?.slice(0, 2).toLowerCase();
  return language === "es" || language === "en" ? language : "ca";
}

/**
 * Screens 10 / 23 (S06 form D) on the mockup days. Registered before `calendarHandlers`: any other
 * date, class or block falls through to the calendar world of E4-W02 (a resolver returning nothing
 * passes the request to the next matching handler).
 */
export const dayGridHandlers = [
  http.get("*/api/v1/day-grid", ({ request }) => {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return validationError("date");
    const view = url.searchParams.get("view") === "instructor" ? "instructor" : "member";
    const scenario = currentMockScenario();
    if (view === "instructor") {
      if (scenario.me.impersonation !== undefined) {
        return apiError("IMPERSONATION_DENIED", "Impersonation allows only the member view", 403);
      }
      if (scenario.me.membership?.roles.every((role) => role === "MEMBER") !== false) {
        return apiError("FORBIDDEN", "Forbidden", 403);
      }
    }
    const options = {
      locale: readerLocale(request),
      modules: scenario.branding.modules,
      timeZone: scenario.branding.timeZone,
    };
    if (currentMockScenarioName() === "dayGridEmpty") {
      return HttpResponse.json({ ...dayGridFixture(date, view, options), rows: [] });
    }
    return isDayGridFixtureDate(date)
      ? HttpResponse.json(dayGridFixture(date, view, options))
      : undefined;
  }),
  http.get("*/api/v1/class-sessions/:id", ({ params }) => {
    const session = dayGridClassSessions().find((item) => item.id === String(params.id));
    return session === undefined ? undefined : HttpResponse.json(session);
  }),
  http.get("*/api/v1/ring-blocks/:id", ({ params }) => {
    const block = dayGridState.blocks.find((item) => item.id === String(params.id));
    return block === undefined ? undefined : HttpResponse.json(block);
  }),
  http.post("*/api/v1/ring-blocks/:id/cancellation", ({ params }) => {
    const current = dayGridState.blocks.find((item) => item.id === String(params.id));
    if (current === undefined) return undefined;
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
