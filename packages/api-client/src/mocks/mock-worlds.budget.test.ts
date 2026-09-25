import { describe, expect, it, vi } from "vitest";

type Build = () => unknown;

// The last millisecond of a club week (Sunday 27-09-2026 23:59:59.999 in Europe/Madrid, CEST): the
// planning world depends on the current club week, so the parity check below builds both of its
// sides with `Date` frozen here. Only `Date` is faked: `performance.now()` stays real for the timings.
const frozenNow = new Date("2026-09-27T21:59:59.999Z");

function freezeDate(): void {
  vi.useFakeTimers({ now: frozenNow, toFake: ["Date"] });
}

async function importMockModules() {
  const [handlers, census, dayGrid, settings] = await Promise.all([
    import("./handlers"),
    import("./fixtures/census"),
    import("./fixtures/day-grid"),
    import("./fixtures/settings"),
  ]);
  return { census, dayGrid, handlers, settings };
}

type MockModules = Awaited<ReturnType<typeof importMockModules>>;

function worldsOf({ census, dayGrid, handlers, settings }: MockModules) {
  return {
    activityState: handlers.activityState,
    catalogState: handlers.catalogState,
    censusRecordState: census.censusRecordState,
    dayGridState: dayGrid.dayGridState,
    planningState: handlers.planningState,
    settingsState: settings.settingsState,
  };
}

// The start-up worlds, captured before any reset: the browser builds exactly these when MSW starts.
freezeDate();
const startup = await importMockModules();
const startupWorlds = structuredClone(worldsOf(startup));
vi.useRealTimers();

// Every stateful world `handlers.ts` exports (found by name, so a new world is timed too), plus the
// day grid, which the planning reset rebuilds.
const worlds: [string, Build][] = [
  ...Object.entries(startup.handlers).filter(
    (entry): entry is [string, Build] =>
      /^reset[A-Za-z]+State$/.test(entry[0]) && typeof entry[1] === "function",
  ),
  ["resetDayGridState", startup.dayGrid.resetDayGridState],
];

// A fixed piece of work of the kind the mock worlds do: dates through a cached `Intl.DateTimeFormat`
// (as `clubInstant` does), small objects and a structured clone. Each build is timed right after it,
// and the budgets are multiples of it, so a slower or busier host slows both sides alike: on CI at
// ca84417, the fastest of five planning builds took 59 ms against 14–17 ms here, and the 50 ms
// budget of round 1 failed there.
const referenceFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Madrid",
  year: "numeric",
});

function referenceWork(): void {
  const rows = Array.from({ length: 1_000 }, (_, hour) => {
    const instant = new Date(Date.UTC(2026, 0, 1, hour));
    return {
      at: instant.toISOString(),
      id: `row-${String(hour)}`,
      parts: referenceFormatter.formatToParts(instant),
    };
  });
  structuredClone(rows);
}

interface Cost {
  ms: number;
  ratio: number;
  referenceMs: number;
}

// The fastest build over the fastest reference work of five rounds, each timing one of each: the
// budget guards the cost of the code, not the speed or the load of the host. The reference work is
// warmed up first, so that its fastest round is a warm one.
async function relativeCost(build: Build, prepare: () => void = () => undefined): Promise<Cost> {
  for (let warmUp = 0; warmUp < 3; warmUp += 1) referenceWork();
  let ms = Number.POSITIVE_INFINITY;
  let referenceMs = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 5; round += 1) {
    prepare();
    let started = performance.now();
    referenceWork();
    referenceMs = Math.min(referenceMs, performance.now() - started);
    started = performance.now();
    const pending = build();
    if (pending instanceof Promise) await pending;
    ms = Math.min(ms, performance.now() - started);
  }
  return { ms, ratio: ms / referenceMs, referenceMs };
}

function costMessage(name: string, cost: Cost, budget: number): string {
  return `${name}: ${cost.ms.toFixed(2)} ms = ${cost.ratio.toFixed(2)} × the reference work (${cost.referenceMs.toFixed(2)} ms); budget ${String(budget)} ×`;
}

// Measured on 25-09 (Node 22, the executor's Mac, the reference work 4.6–4.9 ms): the planning world
// 3.01–3.12 × (14 ms: three calendar weeks, blocks and training bookings through `clubInstant`, plus
// the day grid), the day grid 0.10 ×, every other world 0.02 × or less; under a parallel
// `turbo run test`, the planning world 3.33 × (36 ms). The planning budget is about three times
// that; the small worlds share a floor of one reference work, well above timer noise. Without the
// per-zone formatter cache of `clubInstant` the planning world took 142–187 ms, and the first
// clubs-admin e2e pages timed out.
const budgetRatio: Readonly<Record<string, number>> = { resetPlanningState: 9 };
const defaultBudgetRatio = 1;

// A reset only rebuilds what depends on the date or on the requests: the rest is built once, when
// the modules are imported (`initialWeekTemplates` runs `withInconsistencies`, the JSON fixtures, the
// handler list), and the reset budgets never time it. A fresh import of `handlers.ts` runs all of
// it, as `startMockWorker` does. Measured on 25-09: 5.06–5.68 × (24–27 ms); under a parallel
// `turbo run test`, 9.07 × (64 ms). The budget is about three times the quiet measure.
const startupBudgetRatio = 17;

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

  it("imports the mock modules afresh within the start-up budget", async () => {
    let fresh: typeof startup.handlers = startup.handlers;
    const cost = await relativeCost(
      async () => {
        fresh = await import("./handlers");
      },
      () => {
        vi.resetModules();
      },
    );

    // A cached module would time nothing: each import must build its own worlds.
    expect(fresh.planningState).not.toBe(startup.handlers.planningState);
    expect(
      cost.ratio,
      costMessage("import of the mock modules", cost, startupBudgetRatio),
    ).toBeLessThan(startupBudgetRatio);
  });

  it.each(worlds)("builds %s within its budget", async (name, reset) => {
    const budget = budgetRatio[name] ?? defaultBudgetRatio;
    const cost = await relativeCost(reset);

    expect(cost.ratio, costMessage(name, cost, budget)).toBeLessThan(budget);
  });

  it("rebuilds on reset the same worlds the browser starts with, whatever the day", () => {
    freezeDate();
    try {
      expect(new Date().getTime()).toBe(frozenNow.getTime());
      for (const [, reset] of worlds) reset();

      expect(worldsOf(startup)).toEqual(startupWorlds);
    } finally {
      vi.useRealTimers();
    }
  });
});
