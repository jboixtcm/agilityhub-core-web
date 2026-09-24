import { describe, expect, it } from "vitest";

import { censusRecordState } from "./fixtures/census";
import { dayGridState, resetDayGridState } from "./fixtures/day-grid";
import { settingsState } from "./fixtures/settings";
import * as handlerModule from "./handlers";
import { activityState, catalogState, planningState } from "./handlers";

type Reset = () => void;

// The start-up worlds, captured before any reset: the browser builds exactly these when MSW starts.
const startupWorlds = structuredClone({
  activityState,
  catalogState,
  censusRecordState,
  dayGridState,
  planningState,
  settingsState,
});

// Every stateful world `handlers.ts` exports (found by name, so a new world is timed too), plus the
// day grid, which the planning reset rebuilds.
const worlds: [string, Reset][] = [
  ...Object.entries(handlerModule).filter(
    (entry): entry is [string, Reset] =>
      /^reset[A-Za-z]+State$/.test(entry[0]) && typeof entry[1] === "function",
  ),
  ["resetDayGridState", resetDayGridState],
];

// Fastest of five builds on 24-09 (Node 22, the executor's Mac; single test files took about as
// long in the CI log of d95b199): the planning world 14–17 ms (three calendar weeks, blocks and training bookings
// through `clubInstant`, plus the day grid), the day grid 0.4 ms, every other world under 0.1 ms.
// The planning budget is about three times that; the small worlds share a floor well above timer
// noise. Without the per-zone formatter cache of `clubInstant` the planning world took 159–187 ms,
// and the first clubs-admin e2e pages timed out.
const budgetMs: Readonly<Record<string, number>> = { resetPlanningState: 50 };
const defaultBudgetMs = 5;

// The fastest of a few builds: the budget guards the cost of the code, not the load of the host.
function fastestBuildMs(reset: Reset, runs = 5): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    reset();
    fastest = Math.min(fastest, performance.now() - started);
  }
  return fastest;
}

describe("E3-W10 build-time budget of the MSW mock worlds", () => {
  it("finds every stateful world the handlers reset", () => {
    expect(worlds.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "resetActivityState",
        "resetAuditMockState",
        "resetCatalogState",
        "resetCensusRecordState",
        "resetDashboardMockState",
        "resetDayGridState",
        "resetMemberSelfServiceState",
        "resetOnboardingMockState",
        "resetPlanningState",
        "resetSettingsState",
        "resetSignupMockState",
      ]),
    );
  });

  it.each(worlds)("builds %s within its budget", (name, reset) => {
    const budget = budgetMs[name] ?? defaultBudgetMs;
    const elapsed = fastestBuildMs(reset);

    expect(elapsed, `${name}: ${elapsed.toFixed(2)} ms (budget ${String(budget)} ms)`).toBeLessThan(
      budget,
    );
  });

  it("rebuilds on reset the same worlds the browser starts with", () => {
    for (const [, reset] of worlds) reset();

    expect({
      activityState,
      catalogState,
      censusRecordState,
      dayGridState,
      planningState,
      settingsState,
    }).toEqual(startupWorlds);
  });
});
