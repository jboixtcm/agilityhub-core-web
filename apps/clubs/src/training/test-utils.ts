import {
  mockScenario,
  resetActivityState,
  resetBookingMockState,
  resetPlanningState,
  resetTrainingMockState,
  TRAINING_MOCK_NOW,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

/** Monday 3 August 2026, 7:10 club-local: the S09 world of screens 08 and 24 (E5-W02). */
export const TRAINING_NOW = new Date(TRAINING_MOCK_NOW);

/** Every request the page made, as `METHOD path?query` (the MSW `request:start` events). */
export function recordRequests(): {
  bodies: Map<string, unknown[]>;
  keys: string[];
  list: string[];
} {
  const record = {
    bodies: new Map<string, unknown[]>(),
    keys: [] as string[],
    list: [] as string[],
  };
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const line = `${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`;
    record.list.push(line);
    const key = request.headers.get("Idempotency-Key");
    if (request.method === "POST" && key !== null) record.keys.push(key);
    if (request.method === "POST") {
      void request
        .clone()
        .json()
        .then(
          (body: unknown) => {
            const path = url.pathname.replace(/^\/api\/v1/u, "");
            record.bodies.set(path, [...(record.bodies.get(path) ?? []), body]);
          },
          () => undefined,
        );
    }
  });
  return record;
}

/** MSW with the clock at `TRAINING_NOW` and fresh S08/S09 worlds per case. */
export function setupTrainingWorld(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  beforeEach(() => {
    vi.useFakeTimers({ now: TRAINING_NOW, shouldAdvanceTime: true, toFake: ["Date"] });
    resetPlanningState();
    resetTrainingMockState();
    resetBookingMockState();
    resetActivityState();
    mockScenario("member");
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    cleanup();
    server.events.removeAllListeners();
    server.resetHandlers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetTrainingMockState();
    resetPlanningState();
    resetBookingMockState();
    resetActivityState();
    mockScenario("member");
  });
  afterAll(() => {
    server.close();
  });
}
