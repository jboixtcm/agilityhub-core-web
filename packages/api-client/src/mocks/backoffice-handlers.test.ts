import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import type { components } from "../generated/schema";

import { BOOKING_MOCK_NOW } from "./fixtures/bookings";
import { dayGridClassSessions } from "./fixtures/day-grid";
import { findParameter, settingsState } from "./fixtures/settings";
import {
  JOBS_MOCK_NOW,
  mockScenario,
  planningState,
  resetBackofficeMockState,
  resetBookingMockState,
  resetPlanningState,
  resetSettingsState,
  resetTrainingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type ApiError = components["schemas"]["ApiError"];
type ClassBookings = components["schemas"]["ClassBookings"];
type ClassSession = components["schemas"]["ClassSession"];
type ClassWaitlist = components["schemas"]["ClassWaitlist"];
type JobRun = components["schemas"]["JobRun"];
type JobSummaries = components["schemas"]["JobSummaries"];
type RiskReviewForm = components["schemas"]["RiskReviewForm"];
type WaitlistEntry = components["schemas"]["WaitlistEntry"];
type WeekCalendar = components["schemas"]["WeekCalendar"];

const origin = "http://localhost";
const schemaId = "https://agilityhub.local/openapi.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(openapiDocument, schemaId);

function valid(name: string, value: unknown): void {
  const validate = ajv.compile({ $ref: `${schemaId}#/components/schemas/${name}` });
  expect(validate(value), `${name}: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- each call names its answer's schema.
async function as<Body>(scenario: MockScenario, method: string, path: string, body?: unknown) {
  mockScenario(scenario);
  const response = await fetch(`${origin}/api/v1${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
  });
  const text = await response.text();
  return { body: (text === "" ? undefined : JSON.parse(text)) as Body, status: response.status };
}

/** The D4 class of the calendar world with 4 booked and 2 waiting (Wednesday 12 at 18:50). */
const D4_CLASS = "cls-2026-08-12-1850-0";

/**
 * Sets a club parameter as a saved change would (`resetSettingsState` restores them); a key the mock
 * club does not list yet is added to its block, as a club that sets it.
 */
function setParameter(key: string, value: unknown): void {
  const found = findParameter(key);
  if (found !== undefined) {
    found.value = value;
    return;
  }
  const template = findParameter("classes.defaultCapacity");
  const block = settingsState.parameters.blocks.find((item) => item.key === "classes");
  if (template === undefined || block === undefined) {
    throw new TypeError("Missing the classes block");
  }
  block.rows.push({ ...structuredClone(template), key, value });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(JOBS_MOCK_NOW), shouldAdvanceTime: true, toFake: ["Date"] });
  resetPlanningState();
  resetTrainingMockState();
  resetBackofficeMockState();
  resetSettingsState();
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

/** `GET /jobs`'s route ids, after checking the answer against the contract. */
async function jobNames(scenario: MockScenario): Promise<string[]> {
  const answer = await as<JobSummaries>(scenario, "GET", "/jobs");
  expect(answer.status).toBe(200);
  valid("JobSummaries", answer.body);
  return answer.body.items.map((item) => item.name);
}

/**
 * What the core's `GET /jobs` listed for the default 13-module fixture with `waitlist.mode`
 * ALL_AT_ONCE, in catalog order: E7-W03 `106-e6-core-run.json` and `107-e6-core-run.json`,
 * `steps.jobs-listed.names`, image `c374bb2`.
 */
const CORE_ALL_AT_ONCE_JOBS = [
  "week-opening",
  "risk-review",
  "no-show-notices",
  "reminders",
  "expirations",
  "class-finishing",
  "cleanup",
];

describe("E7-W03 round 2 #6 · S15 §6 `GET /jobs`: the processes of a module that is off are absent (R-15-01, R-15-16)", () => {
  it("E7-W03 round 2 #6 · T-15-32: under waitlist.mode = ALL_AT_ONCE the default fixture lists exactly the core's seven processes in catalog order — no mock-only waitlist-fifo or billing-reminder", async () => {
    expect(findParameter("waitlist.mode")?.value).toBe("ALL_AT_ONCE");
    const defaultClub = await jobNames("admin");
    expect(defaultClub).toEqual(CORE_ALL_AT_ONCE_JOBS);
    // The club mínim (WAITLIST, FAQ, PUSH) in the same mode: exactly the core's seven.
    expect(await jobNames("jobsMinimalClub")).toEqual(CORE_ALL_AT_ONCE_JOBS);
    // With SINGLE_CLASS on: `payment-timeouts` at its catalog place, still no `waitlist-fifo`.
    const full = await jobNames("jobsFullClub");
    expect(full).not.toContain("waitlist-fifo");
    expect(full.slice(5, 7)).toEqual(["payment-timeouts", "class-finishing"]);
    expect(full).toHaveLength(8);
  });

  it("E7-W03 round 2 #6 · R-15-09: under ALL_AT_ONCE waitlist-fifo's routes answer like a process whose module is off — 404 MODULE_DISABLED (CATALEG_ERRORS §1) — and nothing runs or switches", async () => {
    const answers = [
      await as<ApiError>("admin", "GET", "/jobs/waitlist-fifo/runs?page=0&size=20"),
      await as<ApiError>("admin", "GET", "/jobs/waitlist-fifo/runs/run-waitlist-fifo-3"),
      await as<ApiError>("admin", "POST", "/jobs/waitlist-fifo/trigger", { dryRun: true }),
      await as<ApiError>("admin", "POST", "/jobs/waitlist-fifo/trigger", { dryRun: false }),
      await as<ApiError>("admin", "PUT", "/jobs/waitlist-fifo/switch", { enabled: false }),
      await as<ApiError>("jobsMinimalClub", "POST", "/jobs/waitlist-fifo/trigger", {
        dryRun: true,
      }),
    ];
    for (const answer of answers) {
      expect([answer.status, answer.body.code]).toEqual([404, "MODULE_DISABLED"]);
      valid("ApiError", answer.body);
    }
    expect(findParameter("jobs.waitlistFifo.enabled")?.value).toBe(true);
    // A process the catalog does not know is still JOB_UNKNOWN.
    const unknown = await as<ApiError>("admin", "GET", "/jobs/foo/runs");
    expect([unknown.status, unknown.body.code]).toEqual([404, "JOB_UNKNOWN"]);
  });

  it("E7-W03 round 2 #6 · T-15-24: with waitlist.mode = FIFO waitlist-fifo is listed at its catalog place and runs — its history is a FIFO club's, never SKIPPED{MODULE_OFF}", async () => {
    setParameter("waitlist.mode", "FIFO");
    const defaultClub = await jobNames("admin");
    expect(defaultClub).toHaveLength(8);
    expect(defaultClub[5]).toBe("waitlist-fifo");
    expect(await jobNames("jobsMinimalClub")).toEqual([
      ...CORE_ALL_AT_ONCE_JOBS.slice(0, 5),
      "waitlist-fifo",
      ...CORE_ALL_AT_ONCE_JOBS.slice(5),
    ]);
    const runs = await as<components["schemas"]["ListPageJobRunListItem"]>(
      "admin",
      "GET",
      "/jobs/waitlist-fifo/runs?page=0&size=20",
    );
    expect(runs.status).toBe(200);
    valid("ListPageJobRunListItem", runs.body);
    expect(runs.body.items.length).toBeGreaterThan(0);
    expect(runs.body.items.filter((item) => item.skipReason === "MODULE_OFF")).toEqual([]);
    const plan = await as<JobRun>("admin", "POST", "/jobs/waitlist-fifo/trigger", { dryRun: true });
    expect(plan.status).toBe(200);
    valid("JobRun", plan.body);
    expect(plan.body).toMatchObject({ dryRun: true, skipReason: null, status: "SUCCEEDED" });
    const off = await as<components["schemas"]["JobSwitchResponse"]>(
      "admin",
      "PUT",
      "/jobs/waitlist-fifo/switch",
      { enabled: false },
    );
    expect(off.body).toEqual({ enabled: false, name: "waitlist-fifo" });
  });
});

describe("E5-W03 step 8 · S15 processes (GET /jobs, trigger, switch, runs) answer like the api", () => {
  it("T-15-32 with waitlist.mode = FIFO lists the published processes whose module is on: 9 in the full club and 8 in the default and minimum clubs", async () => {
    // T-15-32's «P6 present» needs a FIFO club (R-15-01: `WAITLIST` + `waitlist.mode=FIFO`).
    setParameter("waitlist.mode", "FIFO");
    expect(await jobNames("jobsFullClub")).toHaveLength(9);
    // The default fixture has no SINGLE_CLASS: no `payment-timeouts`.
    expect(await jobNames("admin")).not.toContain("payment-timeouts");
    expect(await jobNames("admin")).toHaveLength(8);
    const minimal = await jobNames("jobsMinimalClub");
    expect(minimal).toHaveLength(8);
    expect(minimal).toContain("waitlist-fifo");
    expect(minimal).not.toContain("billing-reminder");

    const jobs = (await as<JobSummaries>("jobsFullClub", "GET", "/jobs")).body.items;
    expect(jobs.find((job) => job.name === "billing-reminder")).toBeUndefined();
    expect(jobs.find((job) => job.name === "no-show-notices")?.lastRun?.status).toBe("FAILED");
    expect(jobs.find((job) => job.name === "expirations")?.lastRun?.status).toBe("PARTIAL");
    expect(jobs.find((job) => job.name === "risk-review")?.schedule).toEqual({
      dayOfMonth: null,
      dayOfWeek: null,
      kind: "DAILY",
      localTime: "07:30",
    });
  });

  it("R-15-08 [Simula] answers the plan (WOULD_*), [Executa ara] the run; both are a JobRun and the history shows them", async () => {
    const plan = await as<JobRun>("admin", "POST", "/jobs/risk-review/trigger", { dryRun: true });
    expect(plan.status).toBe(200);
    valid("JobRun", plan.body);
    expect(plan.body).toMatchObject({ dryRun: true, trigger: "MANUAL" });
    expect(plan.body.effects.items.map((item) => item.action)).toEqual([
      "WOULD_CANCEL",
      "WOULD_NOTIFY",
    ]);

    const run = await as<JobRun>("admin", "POST", "/jobs/risk-review/trigger", { dryRun: false });
    valid("JobRun", run.body);
    expect(run.body.effects.items.map((item) => item.action)).toEqual(["CANCEL", "NOTIFY"]);
    expect(run.body.effects.counters).toMatchObject({ cancelled: 1, reviewed: 3 });

    const jobs = await as<JobSummaries>("admin", "GET", "/jobs");
    expect(jobs.body.items.find((job) => job.name === "risk-review")?.lastRun).toMatchObject({
      dryRun: false,
      runId: run.body.runId,
      trigger: "MANUAL",
    });

    const runs = await as<components["schemas"]["ListPageJobRunListItem"]>(
      "admin",
      "GET",
      "/jobs/risk-review/runs?page=0&size=20&sort=scheduledFor,desc",
    );
    valid("ListPageJobRunListItem", runs.body);
    expect(runs.body.items.slice(0, 2).map((item) => item.runId)).toEqual([
      run.body.runId,
      plan.body.runId,
    ]);
    const detail = await as<JobRun>("admin", "GET", `/jobs/risk-review/runs/${run.body.runId}`);
    valid("JobRun", detail.body);
    expect(
      (await as<ApiError>("admin", "GET", "/jobs/risk-review/runs?filter=job:eq:x")).status,
    ).toBe(400);
  });

  it("R-15-09 refuses an INSTRUCTOR and an impersonation token; JOB_UNKNOWN and MODULE_DISABLED are 404; a running process is 409", async () => {
    expect((await as<ApiError>("instructor", "GET", "/jobs")).body.code).toBe("FORBIDDEN");
    const impersonated = await as<ApiError>("impersonated", "POST", "/jobs/cleanup/trigger", {
      dryRun: true,
    });
    expect([impersonated.status, impersonated.body.code]).toEqual([403, "IMPERSONATION_DENIED"]);
    const unknown = await as<ApiError>("admin", "POST", "/jobs/foo/trigger", { dryRun: false });
    expect([unknown.status, unknown.body.code]).toEqual([404, "JOB_UNKNOWN"]);
    const moduleOff = await as<ApiError>("admin", "POST", "/jobs/payment-timeouts/trigger", {
      dryRun: false,
    });
    expect([moduleOff.status, moduleOff.body.code]).toEqual([404, "MODULE_DISABLED"]);
    const running = await as<ApiError>("admin", "POST", "/jobs/class-finishing/trigger", {
      dryRun: false,
    });
    expect([running.status, running.body.code]).toEqual([409, "JOB_ALREADY_RUNNING"]);
    valid("ApiError", running.body);
  });

  it("R-15-09 the switch answers {name, enabled} and GET /jobs reflects it; a disabled process still runs by hand", async () => {
    const off = await as<components["schemas"]["JobSwitchResponse"]>(
      "admin",
      "PUT",
      "/jobs/reminders/switch",
      { enabled: false },
    );
    valid("JobSwitchResponse", off.body);
    expect(off.body).toEqual({ enabled: false, name: "reminders" });
    const jobs = await as<JobSummaries>("admin", "GET", "/jobs");
    expect(jobs.body.items.find((job) => job.name === "reminders")?.enabled).toBe(false);
    const run = await as<JobRun>("admin", "POST", "/jobs/reminders/trigger", { dryRun: false });
    expect(run.status).toBe(200);
  });

  it("E7-W03 step 0e · R-15-14 [Simula] on reminders plans WOULD_REMIND {bookingId, memberId, startsAt, lead} for a booking due now, and [Executa ara] the same item as REMIND", async () => {
    const plan = await as<JobRun>("admin", "POST", "/jobs/reminders/trigger", { dryRun: true });
    expect(plan.status).toBe(200);
    valid("JobRun", plan.body);
    const [item] = plan.body.effects.items;
    expect(plan.body.effects.items).toHaveLength(1);
    expect(item).toMatchObject({ action: "WOULD_REMIND", entityType: "Booking" });
    expect(Object.keys(item?.detail ?? {}).sort()).toEqual([
      "bookingId",
      "lead",
      "memberId",
      "startsAt",
    ]);
    const detail = (item?.detail ?? {}) as { bookingId?: string; lead?: number; startsAt?: string };
    expect(detail.bookingId).toBe(item?.entityId);
    // Due now (R-15-14): startsAt − lead ≤ now < startsAt.
    const startsAt = Date.parse(detail.startsAt ?? "");
    const now = Date.parse(JOBS_MOCK_NOW);
    expect(startsAt - (detail.lead ?? 0) * 60_000).toBeLessThanOrEqual(now);
    expect(now).toBeLessThan(startsAt);

    const run = await as<JobRun>("admin", "POST", "/jobs/reminders/trigger", { dryRun: false });
    valid("JobRun", run.body);
    expect(run.body.effects.items).toEqual([{ ...item, action: "REMIND" }]);
  });

  it("E7-W03 round 2 #5 (D11) · R-15-14: [Simula] on reminders counts WOULD_REMIND and [Executa ara] classReminders, as the core does", async () => {
    // The core's plan and run of P4 (E7-W03 `106/107-e7-core-run.json`, `h-reminder.plan/run`).
    const plan = await as<JobRun>("admin", "POST", "/jobs/reminders/trigger", { dryRun: true });
    expect(plan.body.effects.counters).toEqual({ WOULD_REMIND: 1 });
    const run = await as<JobRun>("admin", "POST", "/jobs/reminders/trigger", { dryRun: false });
    expect(run.body.effects.counters).toEqual({ classReminders: 1 });
    const jobs = await as<JobSummaries>("admin", "GET", "/jobs");
    expect(jobs.body.items.find((job) => job.name === "reminders")?.lastRun?.counters).toEqual({
      classReminders: 1,
    });
  });
});

describe("E5-W03 step 8 · S15 §6 form A (GET /risk-review)", () => {
  it("T-15-33 sends the four statuses of the spec's example on the club's today; riskReviewEmpty sends none; MEMBER → 403", async () => {
    const review = await as<RiskReviewForm>("admin", "GET", "/risk-review");
    valid("RiskReviewForm", review.body);
    expect(review.body.date).toBe("2026-08-10");
    expect(
      review.body.items.map((item) => [item.status, item.dayLabel, item.notified.length]),
    ).toEqual([
      ["AUTO_CANCELLED", "TODAY", 0],
      ["AUTO_CANCELLED", "TODAY", 1],
      ["AT_RISK", "TOMORROW", 1],
      ["WILL_CANCEL", "OTHER", 0],
    ]);
    // Wednesday 12 at 7:30 in Madrid (CEST).
    expect(review.body.items[3]?.reviewAt).toBe("2026-08-12T05:30:00Z");
    expect((await as<RiskReviewForm>("instructor", "GET", "/risk-review")).status).toBe(200);
    expect((await as<RiskReviewForm>("riskReviewEmpty", "GET", "/risk-review")).body.items).toEqual(
      [],
    );
    expect((await as<ApiError>("member", "GET", "/risk-review")).status).toBe(403);
  });

  it("E5-W03 round 2 · review #5: on the example day each item is a calendar class of its day, and its registrants are the notified ones", async () => {
    const review = await as<RiskReviewForm>("admin", "GET", "/risk-review");
    const seen: string[] = [];
    for (const item of review.body.items) {
      const registrants = await as<components["schemas"]["ClassBookings"]>(
        "admin",
        "GET",
        `/class-sessions/${item.classId}/bookings`,
      );
      expect(registrants.status).toBe(200);
      const bookings = registrants.body.items;
      expect(bookings.every((booking) => booking.classStartsAt.startsWith(item.date))).toBe(true);
      seen.push(
        `${item.status}: ${bookings.map((booking) => `${booking.memberName} + ${booking.dogName} ${booking.state}`).join(", ")}`,
      );
    }
    // The notified members are the registrants of the classes the review cancelled or flagged.
    // c4 is the calendar's own Wednesday class: active and without registrants until the Wednesday
    // review cancels it (E5-W05 step 15; before, the world showed it already cancelled here).
    // E5-W05 round 3 #4: «Nivell D» takes a D dog and «F i G» an F or G one (R-08-04), where mockup
    // D1 names Laura + Duna («C») and Pau + Blat («B»).
    expect(seen).toEqual([
      "AUTO_CANCELLED: ",
      "AUTO_CANCELLED: Clara + Trevi CANCELLED_BY_CLUB",
      "AT_RISK: Dani + Rayo ACTIVE",
      "WILL_CANCEL: ",
    ]);
  });
});

/** The club-local Monday of a date: the calendar world's weeks are `week-{monday}`. */
function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/**
 * The admin's `GET /risk-review` rows, each found in D4's week of its date (`GET /weeks/{id}/
 * calendar`) in the state its status implies (S15 §6 form A: an ACTIVE class at risk, or a
 * CANCELLED{RISK_REVIEW} one), with the registrants the row names.
 */
async function riskRowsInTheirWeeks(): Promise<string[]> {
  const review = await as<RiskReviewForm>("admin", "GET", "/risk-review");
  expect(review.status).toBe(200);
  valid("RiskReviewForm", review.body);
  const rows: string[] = [];
  for (const item of review.body.items) {
    const week = await as<WeekCalendar>(
      "admin",
      "GET",
      `/weeks/week-${mondayOf(item.date)}/calendar?filter=ACTIVE`,
    );
    const session = week.body.classes.find((candidate) => candidate.id === item.classId);
    expect(session, `${item.status} ${item.classId} is a class of its week`).toBeDefined();
    if (session === undefined) continue;
    expect([session.date, session.startTime, session.displayDescription]).toEqual([
      item.date,
      item.startTime,
      item.displayDescription,
    ]);
    const registrants = (
      await as<ClassBookings>("admin", "GET", `/class-sessions/${item.classId}/bookings`)
    ).body.items;
    const names = (state: string) =>
      registrants
        .filter((booking) => booking.state === state)
        .map((booking) => `${booking.memberName} + ${booking.dogName}`);
    const notified = item.notified.map((person) => `${person.memberName} + ${person.dogName}`);
    if (item.status === "AUTO_CANCELLED") {
      expect([session.state, session.cancellation?.reason]).toEqual(["CANCELLED", "RISK_REVIEW"]);
      expect(item.cancelledAt).toBe(session.cancellation?.at);
      expect(item.bookedCount).toBe(session.cancellation?.affectedBookings);
      expect(notified).toEqual(names("CANCELLED_BY_CLUB"));
    } else {
      // AT_RISK, WILL_CANCEL and WILL_REVIEW name a class that is still active, at risk in D4.
      expect([session.state, session.atRisk], item.classId).toEqual(["ACTIVE", true]);
      expect(item.bookedCount).toBe(session.counters.booked);
      expect(names("ACTIVE")).toEqual(expect.arrayContaining(notified));
    }
    if (item.status === "WILL_CANCEL" || item.status === "WILL_REVIEW") {
      // P2 still reviews it (E37): its review is ahead and the class starts after it.
      const reviewAt = Date.parse(item.reviewAt ?? "");
      expect(reviewAt).toBeGreaterThan(Date.now());
      expect(Date.parse(session.startsAt)).toBeGreaterThan(reviewAt);
    }
    rows.push(`${item.status} ${item.dayLabel} ${session.state} ${item.classId}`);
  }
  return rows;
}

describe("E5-W05 step 15 · the risk review's rows are classes of the calendar world on any day", () => {
  it("E5-W05 step 15: on S15's example day (dl 10 at 8:12) each row is a class of its week in the state its status implies, and the WILL_CANCEL class is still active", async () => {
    expect(await riskRowsInTheirWeeks()).toEqual([
      "AUTO_CANCELLED TODAY CANCELLED cls-2026-08-10-0930-7",
      "AUTO_CANCELLED TODAY CANCELLED cls-2026-08-10-1740-9",
      "AT_RISK TOMORROW ACTIVE cls-2026-08-11-2000-10",
      "WILL_CANCEL OTHER ACTIVE cls-2026-08-12-0930-0",
    ]);
  });

  it.each([
    [
      "dt 11-08 at 9:00, the day after the example",
      "2026-08-11T09:00:00+02:00",
      ["WILL_CANCEL TOMORROW ACTIVE cls-2026-08-12-0930-0"],
    ],
    [
      "dc 23-09 at 10:00, after that day's review",
      "2026-09-23T10:00:00+02:00",
      ["AUTO_CANCELLED TODAY CANCELLED cls-2026-09-23-0930-0"],
    ],
    // E5-W05 round 2 #12: a day with rows, so the assertion is real (the probe day has none).
    [
      "dl 21-09 at 12:00, a Monday after its review (Wednesday's «Cadells» ahead)",
      "2026-09-21T12:00:00+02:00",
      ["WILL_CANCEL OTHER ACTIVE cls-2026-09-23-0930-0"],
    ],
  ])(
    "E5-W05 step 15: on %s each row is a class of its week in the state its status implies",
    async (_day, now, rows) => {
      vi.setSystemTime(new Date(now));
      resetPlanningState();
      expect(await riskRowsInTheirWeeks()).toEqual(rows);
    },
  );

  it("E5-W05 round 2 #12: on dg 27-09 at 12:00, the review's probe day, the form has no row because no active class falls in its window: the week ahead is still a draft", async () => {
    vi.setSystemTime(new Date("2026-09-27T12:00:00+02:00"));
    resetPlanningState();
    const review = await as<RiskReviewForm>("admin", "GET", "/risk-review");
    expect([review.status, review.body.date, review.body.items]).toEqual([200, "2026-09-27", []]);
    // The window is Sunday 27 to Tuesday 29: the ending week has no class on Sunday, and the
    // classes of Monday 28 and Tuesday 29 are drafts, which the review never covers.
    const ending = await as<WeekCalendar>(
      "admin",
      "GET",
      "/weeks/week-2026-09-21/calendar?filter=ACTIVE",
    );
    expect(ending.body.classes.length).toBeGreaterThan(0);
    expect(ending.body.classes.filter((item) => item.date >= "2026-09-27")).toEqual([]);
    const ahead = await as<WeekCalendar>(
      "admin",
      "GET",
      "/weeks/week-2026-09-28/calendar?filter=DRAFT",
    );
    const inWindow = ahead.body.classes.filter((item) => item.date <= "2026-09-29");
    expect(inWindow.length).toBeGreaterThan(0);
    expect(inWindow.every((item) => item.state === "DRAFT")).toBe(true);
  });
});

describe("E5-W05 step 16 · the back-office mock finds classes and waiting entries in the caller's club only", () => {
  it("E5-W05 step 16: an ADMIN of another club cannot cancel the entry (404), nor read the class's registrants and waiting list, nor see its classes in the risk review", async () => {
    const list = () =>
      as<ClassWaitlist>("admin", "GET", `/class-sessions/${D4_CLASS}/waitlist-entries`);
    const entryId = (await list()).body.items[0]?.id ?? "";
    const path = `/waitlist-entries/${entryId}/cancellation`;
    const cancelled = await as<ApiError>("adminOtherClub", "POST", path);
    expect([cancelled.status, cancelled.body.code]).toEqual([404, "NOT_FOUND"]);
    valid("ApiError", cancelled.body);
    for (const read of ["bookings", "waitlist-entries"]) {
      const answer = await as<ApiError>(
        "adminOtherClub",
        "GET",
        `/class-sessions/${D4_CLASS}/${read}`,
      );
      expect([answer.status, answer.body.code], read).toEqual([404, "NOT_FOUND"]);
    }
    const review = await as<RiskReviewForm>("adminOtherClub", "GET", "/risk-review");
    expect([review.status, review.body.items]).toEqual([200, []]);
    // Nothing was written: the club's own ADMIN still finds the entry live, and removes it.
    expect((await list()).body.items.find((item) => item.id === entryId)?.state).toBe("ACTIVE");
    const removed = await as<WaitlistEntry>("admin", "POST", path);
    expect(removed.body).toMatchObject({ cancelReason: "ADMIN", state: "CANCELLED" });
  });
});

describe("E5-W03 step 8 · S08 staff reads (registrants, waiting list, GET /bookings)", () => {
  it("answers the D4 class's 4 bookings (+ 1 late cancellation) and its 2 waiting entries; R-08-16 removal, then WAITLIST_ENTRY_NOT_LIVE", async () => {
    const bookings = await as<components["schemas"]["ClassBookings"]>(
      "admin",
      "GET",
      `/class-sessions/${D4_CLASS}/bookings`,
    );
    valid("ClassBookings", bookings.body);
    // E5-W05 round 3 #4: a «B+C» class takes only B and C dogs (R-08-04). E7-W07 step 5: Nass,
    // Fish and Blat already hold their two classes of the week (Monday's «B+C» and Tuesday's
    // «A+B», R-08-03), so the class takes the next B and C dogs; Duna's second class is this one.
    expect(
      bookings.body.items.map((item) => `${item.memberName} + ${item.dogName}:${item.state}`),
    ).toEqual([
      "Laura + Duna:ACTIVE",
      "Jana + Mixa:ACTIVE",
      "Irene + Kai:ACTIVE",
      "Nil + Coco:ACTIVE",
      "Joel + Rumba:CANCELLED_LATE",
    ]);
    const waitlist = await as<components["schemas"]["ClassWaitlist"]>(
      "instructor",
      "GET",
      `/class-sessions/${D4_CLASS}/waitlist-entries`,
    );
    valid("ClassWaitlist", waitlist.body);
    // The default fixture's `waitlist.mode = ALL_AT_ONCE`: no positions (R-08-13).
    expect(waitlist.body.items.map((item) => [item.dogName, item.position, item.state])).toEqual([
      ["Kira", null, "ACTIVE"],
      ["Lluna", null, "ACTIVE"],
    ]);
    const entryId = waitlist.body.items[0]?.id ?? "";
    expect(
      (await as<ApiError>("instructor", "POST", `/waitlist-entries/${entryId}/cancellation`))
        .status,
    ).toBe(403);
    const removed = await as<components["schemas"]["WaitlistEntry"]>(
      "admin",
      "POST",
      `/waitlist-entries/${entryId}/cancellation`,
    );
    valid("WaitlistEntry", removed.body);
    expect(removed.body).toMatchObject({ cancelReason: "ADMIN", state: "CANCELLED" });
    const again = await as<ApiError>("admin", "POST", `/waitlist-entries/${entryId}/cancellation`);
    expect([again.status, again.body.code]).toEqual([422, "WAITLIST_ENTRY_NOT_LIVE"]);
    expect(
      (await as<ApiError>("member", "GET", `/class-sessions/${D4_CLASS}/bookings`)).status,
    ).toBe(403);
    expect((await as<ApiError>("admin", "GET", "/class-sessions/unknown/bookings")).status).toBe(
      404,
    );
  });

  it("E5-W03 round 2 · review #7: a removal checks WAITLIST, the role and the entry's owner; an impersonation never reaches another member's entry", async () => {
    const list = () =>
      as<components["schemas"]["ClassWaitlist"]>(
        "admin",
        "GET",
        `/class-sessions/${D4_CLASS}/waitlist-entries`,
      );
    const entryId = (await list()).body.items[0]?.id ?? "";
    const path = `/waitlist-entries/${entryId}/cancellation`;
    // S08 §6 «MEMBER (pròpia) · ADMIN»: Kira's entry is Júlia's, never these members'.
    const member = await as<ApiError>("member", "POST", path);
    expect([member.status, member.body.code]).toEqual([404, "NOT_FOUND"]);
    const impersonated = await as<ApiError>("impersonated", "POST", path);
    expect([impersonated.status, impersonated.body.code]).toEqual([404, "NOT_FOUND"]);
    const instructor = await as<ApiError>("instructor", "POST", path);
    expect([instructor.status, instructor.body.code]).toEqual([403, "FORBIDDEN"]);
    // An ADMIN of a club without WAITLIST.
    const moduleOff = await as<ApiError>("activitiesNoWaitlist", "POST", path);
    expect([moduleOff.status, moduleOff.body.code]).toEqual([404, "MODULE_DISABLED"]);
    // Nothing was written by any refusal.
    expect((await list()).body.items.find((item) => item.id === entryId)?.state).toBe("ACTIVE");
    const removed = await as<components["schemas"]["WaitlistEntry"]>("admin", "POST", path);
    expect(removed.body).toMatchObject({ cancelReason: "ADMIN", state: "CANCELLED" });
  });

  it("T-08-47 GET /bookings filters by member, refuses an undeclared filter (400 INVALID_FILTER) and a MEMBER (403)", async () => {
    const list = await as<components["schemas"]["ListPageBookingListItem"]>(
      "admin",
      "GET",
      "/bookings?filter=memberId:eq:member-laura&sort=classStartsAt,desc&size=20&fields=id,classStartsAt,dogName,state",
    );
    valid("ListPageBookingListItem", list.body);
    expect(list.body.totalItems).toBeGreaterThan(0);
    // Laura's dogs only: Duna (the staff world's registrant) and Rock (the member world's booking).
    expect(new Set(list.body.items.map((item) => item.dogName))).toEqual(new Set(["Duna", "Rock"]));
    expect(Object.keys(list.body.items[0] ?? {}).sort()).toEqual([
      "classStartsAt",
      "dogName",
      "id",
      "state",
    ]);
    const starts = list.body.items.map((item) => item.classStartsAt ?? "");
    expect([...starts].sort().reverse()).toEqual(starts);
    const invalid = await as<ApiError>("admin", "GET", "/bookings?filter=ringId:eq:ring-central");
    expect([invalid.status, invalid.body.code]).toEqual([400, "INVALID_FILTER"]);
    expect((await as<ApiError>("admin", "GET", "/bookings?size=30")).status).toBe(400);
    expect((await as<ApiError>("member", "GET", "/bookings")).status).toBe(403);
  });
});

describe("E5-W03 step 8 · S09 ring-usage register (GET /training-bookings, GET /ring-blocks)", () => {
  it("T-09-27 lists the week's training bookings for the staff (MEMBER 403, FREE_TRAINING off 404) and exports only for ADMIN", async () => {
    const list = await as<components["schemas"]["ListPageTrainingBookingListItem"]>(
      "instructor",
      "GET",
      "/training-bookings?filter=date:between:2026-08-03,2026-08-09&sort=startsAt,desc",
    );
    valid("ListPageTrainingBookingListItem", list.body);
    expect(list.body.totalItems).toBeGreaterThan(5);
    expect(list.body.items.some((item) => item.memberId === "member-laura")).toBe(true);
    expect((await as<ApiError>("member", "GET", "/training-bookings")).status).toBe(403);
    expect(
      (await as<ApiError>("trainingModuleOffInstructor", "GET", "/training-bookings")).status,
    ).toBe(404);
    mockScenario("admin");
    const exported = await fetch(
      `${origin}/api/v1/training-bookings/export?format=xlsx&columns=date,ringName`,
    );
    expect(exported.status).toBe(200);
    mockScenario("instructor");
    expect((await fetch(`${origin}/api/v1/training-bookings/export?format=pdf`)).status).toBe(403);
  });

  it("T-09-30 redacts the blocks for a MEMBER, refuses him `note`, and keeps the activity's block and a cancelled one from being cancelled", async () => {
    const staff = await as<components["schemas"]["ListPageRingBlockListItem"]>(
      "admin",
      "GET",
      "/ring-blocks?sort=from,asc",
    );
    valid("ListPageRingBlockListItem", staff.body);
    expect(staff.body.items.some((item) => item.note === "Reg de la sorra")).toBe(true);
    const member = await as<components["schemas"]["ListPageRingBlockListItem"]>(
      "member",
      "GET",
      "/ring-blocks",
    );
    expect(member.body.items.every((item) => !("note" in item) && !("createdByName" in item))).toBe(
      true,
    );
    expect((await as<ApiError>("member", "GET", "/ring-blocks?fields=id,note")).body.code).toBe(
      "INVALID_FILTER",
    );
    const activity = staff.body.items.find(
      (item) => item.activityId !== null && item.activityId !== undefined,
    );
    const managed = await as<ApiError>(
      "admin",
      "POST",
      `/ring-blocks/${activity?.id ?? ""}/cancellation`,
      {},
    );
    expect([managed.status, managed.body.code]).toEqual([422, "RING_BLOCK_MANAGED_BY_ACTIVITY"]);
    const cancelled = await as<components["schemas"]["RingBlock"]>(
      "admin",
      "POST",
      "/ring-blocks/rb-2026-08-03-1600-carretera/cancellation",
      {},
    );
    valid("RingBlock", cancelled.body);
    expect(cancelled.body.state).toBe("CANCELLED");
    const twice = await as<ApiError>(
      "admin",
      "POST",
      "/ring-blocks/rb-2026-08-03-1600-carretera/cancellation",
      {},
    );
    expect([twice.status, twice.body.code]).toEqual([409, "INVALID_STATE"]);
  });
});

describe("E5-W05 step 7 · the staff lists' bookingWeekKey follows R-08-01 (the opening's hour)", () => {
  // E5-W05 round 2 #12: the member world is reset even when an assertion fails.
  afterEach(() => {
    resetBookingMockState();
  });

  it("E5-W05 step 7: Duna's class of Sunday 2 at 20:00 (mockup 06's done class) belongs to the week that opens then, 2026-08-02, as Monday 3's does", async () => {
    // The `bookingLimitDone` member world holds the booking of Sunday 2 at 20:00 (E7-W07 round 2
    // #5a: mockup 06's done row; the `bookingLimit` world keeps Duna's week at 2 of 2 without it).
    expect((await as<unknown>("bookingLimitDone", "GET", "/me/home")).status).toBe(200);
    const list = await as<{
      items: { bookingWeekKey?: string; classSessionId?: string; classStartsAt?: string }[];
    }>(
      "admin",
      "GET",
      `/bookings?filter=${encodeURIComponent("memberId:eq:member-laura")}&size=1000&fields=classSessionId,classStartsAt,bookingWeekKey`,
    );
    expect(list.status).toBe(200);
    const sunday = list.body.items.filter((row) =>
      (row.classStartsAt ?? "").startsWith("2026-08-02T18:00"),
    );
    expect(sunday.length).toBeGreaterThan(0);
    expect(sunday.every((row) => row.bookingWeekKey === "2026-08-02")).toBe(true);
    const monday = list.body.items.filter((row) =>
      (row.classStartsAt ?? "").startsWith("2026-08-03"),
    );
    // E5-W05 round 2 #12: `every` holds on an empty array, so the rows must be there.
    expect(monday.length).toBeGreaterThan(0);
    expect(monday.every((row) => row.bookingWeekKey === "2026-08-02")).toBe(true);
    const registrants = await as<ClassBookings>(
      "admin",
      "GET",
      `/class-sessions/${D4_CLASS}/bookings`,
    );
    expect(registrants.body.items.length).toBeGreaterThan(0);
    expect(registrants.body.items.every((row) => row.bookingWeekKey === "2026-08-09")).toBe(true);
  });
});

describe("E5-W05 step 5 · complete filter values (CONVENCIONS_API §4) and the lists' search (E75)", () => {
  type FilterValues = components["schemas"]["FilterValues"];
  interface Page<Item> {
    items: Item[];
    totalItems: number;
  }
  type TrainingRow = components["schemas"]["TrainingBookingListItem"];
  type BlockRow = components["schemas"]["RingBlockListItem"];
  const week = encodeURIComponent("date:between:2026-08-03,2026-08-09");

  beforeEach(() => {
    vi.setSystemTime(new Date("2026-08-03T07:10:00+02:00"));
  });

  it("E5-W05 step 5: registerMany has more than 1000 training bookings; «Nil Fictici Soler» is not in the first 1000, and GET /training-bookings/filter-values counts him over the whole set", async () => {
    const first = await as<Page<TrainingRow>>(
      "registerMany",
      "GET",
      `/training-bookings?filter=${week}&page=0&size=1000&fields=memberId,memberName`,
    );
    expect(first.status).toBe(200);
    expect(first.body.totalItems).toBeGreaterThan(1000);
    expect(first.body.items.some((row) => row.memberName === "Nil Fictici Soler")).toBe(false);
    const values = await as<FilterValues>(
      "registerMany",
      "GET",
      `/training-bookings/filter-values?field=memberId&filter=${week}`,
    );
    expect(values.status).toBe(200);
    valid("FilterValues", values.body);
    expect(values.body.field).toBe("memberId");
    expect(values.body.values).toContainEqual({
      count: 5,
      label: "Nil Fictici Soler",
      value: "member-nil-many",
    });
    expect(values.body.values).toContainEqual({
      count: 1000,
      label: "Pau Fictici Mas",
      value: "member-pau-many",
    });
    // The filters on the field itself are left out; q narrows the set as the list's search does.
    const narrowed = await as<FilterValues>(
      "registerMany",
      "GET",
      `/training-bookings/filter-values?field=memberId&filter=${week}&filter=${encodeURIComponent("memberId:eq:member-pau-many")}&q=Coco`,
    );
    expect(narrowed.body.values.map((value) => value.label)).toEqual(["Nil Fictici Soler"]);
    const refused = await as<ApiError>(
      "registerMany",
      "GET",
      "/training-bookings/filter-values?field=note",
    );
    expect([refused.status, refused.body.code]).toEqual([400, "INVALID_FILTER"]);
    const member = await as<ApiError>(
      "member",
      "GET",
      "/training-bookings/filter-values?field=memberId",
    );
    expect(member.status).toBe(403);
  });

  it("E5-W05 step 5: GET /ring-blocks/filter-values counts every block, «Cadells» (only after row 1000) included, labelled with the ring's name", async () => {
    const range = encodeURIComponent("from:between:2026-08-02T22:00:00Z,2026-08-09T22:00:00Z");
    const first = await as<Page<BlockRow>>(
      "registerMany",
      "GET",
      `/ring-blocks?filter=${range}&page=0&size=1000&fields=ringId,ringName`,
    );
    expect(first.body.totalItems).toBeGreaterThan(1000);
    expect(first.body.items.some((row) => row.ringId === "ring-cadells")).toBe(false);
    const values = await as<FilterValues>(
      "registerMany",
      "GET",
      `/ring-blocks/filter-values?field=ringId&filter=${range}`,
    );
    expect(values.status).toBe(200);
    valid("FilterValues", values.body);
    expect(values.body.values).toContainEqual({
      count: 5,
      label: "Cadells",
      value: "ring-cadells",
    });
    const member = await as<ApiError>("member", "GET", "/ring-blocks/filter-values?field=ringId");
    expect(member.status).toBe(403);
  });

  it("E5-W05 step 5: GET /bookings/filter-values counts the member's classes by state; GET /bookings has no search (a non-blank q is INVALID_FILTER, E75)", async () => {
    const laura = encodeURIComponent("memberId:eq:member-laura");
    const values = await as<FilterValues>(
      "admin",
      "GET",
      `/bookings/filter-values?field=state&filter=${laura}`,
    );
    expect(values.status).toBe(200);
    valid("FilterValues", values.body);
    const list = await as<Page<components["schemas"]["BookingListItem"]>>(
      "admin",
      "GET",
      `/bookings?filter=${laura}&size=1000&fields=state`,
    );
    const counted = new Map<string, number>();
    for (const row of list.body.items) {
      counted.set(row.state ?? "", (counted.get(row.state ?? "") ?? 0) + 1);
    }
    expect(counted.size).toBeGreaterThan(0);
    expect(
      Object.fromEntries(values.body.values.map((value) => [value.value, value.count])),
    ).toEqual(Object.fromEntries(counted));
    const searched = await as<ApiError>("admin", "GET", "/bookings?q=Duna");
    expect([searched.status, searched.body.code]).toEqual([400, "INVALID_FILTER"]);
    const blank = await as<Page<unknown>>("admin", "GET", "/bookings?q=%20");
    expect(blank.status).toBe(200);
  });

  it("E5-W05 round 2 #11.a: GET /bookings/filter-values labels a class «{club-local start YYYY-MM-DDTHH:mm} · {description}», as the core does", async () => {
    const values = await as<FilterValues>(
      "admin",
      "GET",
      "/bookings/filter-values?field=classSessionId",
    );
    expect(values.status).toBe(200);
    valid("FilterValues", values.body);
    const list = await as<Page<components["schemas"]["BookingListItem"]>>(
      "admin",
      "GET",
      "/bookings?size=1000&fields=classSessionId,classStartsAt,classDescription",
    );
    expect(values.body.values.length).toBeGreaterThan(0);
    for (const value of values.body.values) {
      // The core's shape (`bookings-filter-values-core.json`): «2026-10-08T17:40 · D+E».
      expect(value.label).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2} · \S/u);
      const row = list.body.items.find((item) => item.classSessionId === value.value);
      if (row?.classStartsAt === undefined) throw new TypeError(`No row of ${String(value.value)}`);
      const local = new Intl.DateTimeFormat("sv-SE", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Madrid",
        year: "numeric",
      })
        .format(new Date(row.classStartsAt))
        .replace(" ", "T");
      expect(value.label).toBe(`${local} · ${row.classDescription ?? ""}`);
    }
    // Monday 3 at 18:50 in the club (16:50Z), D4's «B+C».
    expect(values.body.values.map((value) => value.label)).toContain("2026-08-03T18:50 · B+C");
  });

  it("E5-W05 step 5: a ring block's search reads its ring's name and, for staff, its note (S09 §2, E75)", async () => {
    const byRing = await as<Page<BlockRow>>(
      "admin",
      "GET",
      "/ring-blocks?q=carretera&fields=ringName",
    );
    expect(byRing.body.items.length).toBeGreaterThan(0);
    expect(byRing.body.items.every((row) => row.ringName === "Carretera")).toBe(true);
    const byNote = await as<Page<BlockRow>>("admin", "GET", "/ring-blocks?q=sorra&fields=note");
    expect(byNote.body.items.map((row) => row.note)).toContain("Reg de la sorra");
    const memberNote = await as<Page<BlockRow>>("member", "GET", "/ring-blocks?q=sorra");
    expect(memberNote.body.items).toEqual([]);
  });

  it("E5-W05 round 2 #4: an ADMIN of another club (adminOtherClub) finds no booking, training booking or ring block of this club, and no filter value: the tenant comes from the JWT", async () => {
    const lists: [path: string, field: string][] = [
      ["/bookings", "state"],
      ["/training-bookings", "memberId"],
      ["/ring-blocks", "ringId"],
    ];
    for (const [path, field] of lists) {
      const own = await as<Page<unknown>>("admin", "GET", path);
      expect(own.body.totalItems, path).toBeGreaterThan(0);
      const ownValues = await as<FilterValues>(
        "admin",
        "GET",
        `${path}/filter-values?field=${field}`,
      );
      expect(ownValues.body.values.length, path).toBeGreaterThan(0);
      const other = await as<Page<unknown>>("adminOtherClub", "GET", path);
      expect([other.status, other.body.items, other.body.totalItems], path).toEqual([200, [], 0]);
      const values = await as<FilterValues>(
        "adminOtherClub",
        "GET",
        `${path}/filter-values?field=${field}`,
      );
      expect([values.status, values.body], path).toEqual([200, { field, values: [] }]);
      valid("FilterValues", values.body);
    }
  });

  it("E7-W07 step 8 (E5-W05 round 3 review #1, R-09-13): an ADMIN of another club cannot cancel a block of this club's register (404 NOT_FOUND, the activity's block too), and the block is still ACTIVE for this club's own ADMIN, who cancels it", async () => {
    const block = "rb-2026-08-03-1600-carretera";
    const state = async (id: string) =>
      (
        await as<Page<BlockRow>>(
          "admin",
          "GET",
          `/ring-blocks?filter=${encodeURIComponent(`id:eq:${id}`)}&fields=id,state`,
        )
      ).body.items.map((row) => row.state);
    expect(await state(block)).toEqual(["ACTIVE"]);
    for (const id of [block, "rb-2026-08-06-1000-muntanya-activity"]) {
      const other = await as<ApiError>(
        "adminOtherClub",
        "POST",
        `/ring-blocks/${id}/cancellation`,
        {},
      );
      expect([other.status, other.body.code], id).toEqual([404, "NOT_FOUND"]);
      valid("ApiError", other.body);
    }
    // Nothing was written: the club's own ADMIN still finds the block live, and cancels it.
    expect(await state(block)).toEqual(["ACTIVE"]);
    const own = await as<components["schemas"]["RingBlock"]>(
      "admin",
      "POST",
      `/ring-blocks/${block}/cancellation`,
      {},
    );
    expect([own.status, own.body.state]).toEqual([200, "CANCELLED"]);
  });
});

describe("E5-W05 round 2 · the staff registrants' level is the dog's own, and follows levels.enabled (S08 §6)", () => {
  it("E5-W05 round 2 #3: GET /class-sessions/{id}/bookings sends each dog's own level (D4's «B+C»: Duna «C», Mixa «C», Kai «B», Coco «C», Rumba «B»), and null in a club with levels.enabled = false", async () => {
    const levels = async (scenario: MockScenario) => {
      const answer = await as<ClassBookings>(
        scenario,
        "GET",
        `/class-sessions/${D4_CLASS}/bookings`,
      );
      expect(answer.status).toBe(200);
      valid("ClassBookings", answer.body);
      return answer.body.items.map((item) => `${item.dogName}:${item.levelCode ?? "—"}`);
    };
    // E5-W05 round 3 #4: D4's «B+C» takes only B and C dogs (R-08-04), Duna «C» first; E7-W07
    // step 5: none over its week's limit (R-08-03).
    expect(await levels("admin")).toEqual(["Duna:C", "Mixa:C", "Kai:B", "Coco:C", "Rumba:B"]);
    // Without levels every 18:50 class may take any dog: Monday's two and Tuesday's have taken the
    // first ones' two classes of the week (E7-W07 step 5, R-08-03).
    expect(await levels("planningNoLevels")).toEqual([
      "Blat:—",
      "Trevi:—",
      "Mixa:—",
      "Bruc:—",
      "Nala:—",
    ]);
  });

  it("E5-W05 round 3 #4: in every class of the calendar and day-grid worlds each registrant's level is one the class allows (S08 R-08-04), no dog is listed twice, and the rows match the class's counters", async () => {
    mockScenario("admin");
    const sessions = [...planningState.sessions, ...dayGridClassSessions()].filter(
      (session) => session.state !== "DRAFT",
    );
    expect(sessions.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const session of sessions) {
      const answer = await as<ClassBookings>(
        "admin",
        "GET",
        `/class-sessions/${session.id}/bookings`,
      );
      expect(answer.status, session.id).toBe(200);
      const allowed = new Set(
        session.levelIds.map((id) => id.replace(/^level-/u, "").toUpperCase()),
      );
      const items = answer.body.items;
      const expected =
        session.state === "CANCELLED"
          ? (session.cancellation?.affectedBookings ?? 0)
          : session.counters.booked;
      const counted = items.filter((item) =>
        session.state === "CANCELLED"
          ? item.state === "CANCELLED_BY_CLUB"
          : item.state === "ACTIVE",
      ).length;
      if (counted !== expected) {
        problems.push(`${session.id}: ${String(counted)} rows for ${String(expected)}`);
      }
      if (new Set(items.map((item) => item.dogId)).size !== items.length) {
        problems.push(`${session.id}: a dog twice`);
      }
      for (const item of items) {
        if (allowed.size > 0 && !allowed.has(item.levelCode ?? "")) {
          problems.push(
            `${session.id} (${[...allowed].join("+")}): ${item.dogName} ${item.levelCode ?? "—"}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("E5-W05 round 2 · the jobs mock reads its parameters (S15 R-15-01, R-15-12)", () => {
  const summary = async (name: string) => {
    const jobs = await as<JobSummaries>("admin", "GET", "/jobs");
    expect(jobs.status).toBe(200);
    valid("JobSummaries", jobs.body);
    return jobs.body.items.find((job) => job.name === name);
  };

  it("E5-W05 round 2 #11.d: no-show-notices runs at messaging.noShowNoticeTime (08:00): its schedule, its runs and its next run; a saved change moves the schedule and the next run", async () => {
    expect((await summary("no-show-notices"))?.schedule).toEqual({
      dayOfMonth: null,
      dayOfWeek: null,
      kind: "DAILY",
      localTime: "08:00",
    });
    // At 8:12 on Monday 10, today's 8:00 batch has run: the next one is Tuesday's.
    expect((await summary("no-show-notices"))?.nextScheduledForLocal).toBe("2026-08-11T08:00");
    const runs = await as<components["schemas"]["ListPageJobRunListItem"]>(
      "admin",
      "GET",
      "/jobs/no-show-notices/runs?sort=scheduledFor,desc",
    );
    expect(runs.body.items.map((item) => item.scheduledForLocal)).toEqual([
      "2026-08-10T08:00",
      "2026-08-09T08:00",
      "2026-08-08T08:00",
    ]);
    setParameter("messaging.noShowNoticeTime", "21:00");
    expect(await summary("no-show-notices")).toMatchObject({
      nextScheduledForLocal: "2026-08-10T21:00",
      schedule: { kind: "DAILY", localTime: "21:00" },
    });
  });

  it("E5-W05 round 2 #14: nextScheduledForLocal follows jobs.dailyTime, classes.riskReviewTime and bookings.weekOpensAt, as schedule.localTime does", async () => {
    const next = async () =>
      Object.fromEntries(
        (await as<JobSummaries>("admin", "GET", "/jobs")).body.items.map((job) => [
          job.name,
          [job.schedule.localTime, job.nextScheduledForLocal],
        ]),
      );
    expect(await next()).toMatchObject({
      cleanup: ["06:00", "2026-08-11T06:00"],
      expirations: ["06:00", "2026-08-11T06:00"],
      reminders: [null, null],
      "risk-review": ["07:30", "2026-08-11T07:30"],
      "week-opening": ["20:00", "2026-08-16T20:00"],
    });
    setParameter("jobs.dailyTime", "05:15");
    // Today's 9:00 review is still ahead at 8:12.
    setParameter("classes.riskReviewTime", "09:00");
    setParameter("bookings.weekOpensAt", { dayOfWeek: "SATURDAY", time: "10:00" });
    expect(await next()).toMatchObject({
      cleanup: ["05:15", "2026-08-11T05:15"],
      expirations: ["05:15", "2026-08-11T05:15"],
      "risk-review": ["09:00", "2026-08-10T09:00"],
      "week-opening": ["10:00", "2026-08-15T10:00"],
    });
  });

  it("E5-W05 round 2 #14: the risk review reads classes.minDogs, as D4's risk mark does: with minDogs = 1 the class with one dog is at risk in neither D1 nor D4", async () => {
    const c3 = "cls-2026-08-11-2000-10";
    const c4 = "cls-2026-08-12-0930-0";
    const reviewed = async () => {
      const review = await as<RiskReviewForm>("admin", "GET", "/risk-review");
      valid("RiskReviewForm", review.body);
      return {
        classes: review.body.items.map((item) => `${item.status} ${item.classId}`),
        minDogs: review.body.minDogs,
      };
    };
    const d4 = async (id: string) => {
      const week = await as<WeekCalendar>(
        "admin",
        "GET",
        "/weeks/week-2026-08-10/calendar?filter=ACTIVE",
      );
      const detail = await as<components["schemas"]["ClassSession"]>(
        "admin",
        "GET",
        `/class-sessions/${id}`,
      );
      return [week.body.classes.find((item) => item.id === id)?.atRisk, detail.body.atRisk];
    };
    expect(await reviewed()).toEqual({
      classes: [
        "AUTO_CANCELLED cls-2026-08-10-0930-7",
        "AUTO_CANCELLED cls-2026-08-10-1740-9",
        `AT_RISK ${c3}`,
        `WILL_CANCEL ${c4}`,
      ],
      minDogs: 2,
    });
    expect(await d4(c3)).toEqual([true, true]);
    setParameter("classes.minDogs", 1);
    // c3 has one dog: enough now. c4 has none: still at risk, in both screens.
    expect(await reviewed()).toEqual({
      classes: [
        "AUTO_CANCELLED cls-2026-08-10-0930-7",
        "AUTO_CANCELLED cls-2026-08-10-1740-9",
        `WILL_CANCEL ${c4}`,
      ],
      minDogs: 1,
    });
    expect(await d4(c3)).toEqual([false, false]);
    expect(await d4(c4)).toEqual([true, true]);
  });

  it("E5-W05 round 2 #14: with the risk review switched off, no active class names notified members (no review ran); a class it cancelled keeps the ones it notified", async () => {
    const notified = async () =>
      (await as<RiskReviewForm>("admin", "GET", "/risk-review")).body.items.map(
        (item) => `${item.status} ${String(item.notified.length)}`,
      );
    expect(await notified()).toEqual([
      "AUTO_CANCELLED 0",
      "AUTO_CANCELLED 1",
      "AT_RISK 1",
      "WILL_CANCEL 0",
    ]);
    const off = await as<unknown>("admin", "PUT", "/jobs/risk-review/switch", { enabled: false });
    expect(off.status).toBe(200);
    expect(await notified()).toEqual([
      "AUTO_CANCELLED 0",
      "AUTO_CANCELLED 1",
      "AT_RISK 0",
      "AT_RISK 0",
    ]);
  });
});

describe("E7-W07 step 5 · the staff reads never book a dog over its week's limit (S08 R-08-02, R-08-03, R-08-19)", () => {
  /** A row of `GET /bookings` or of `GET /class-sessions/{id}/bookings`. */
  interface Row {
    bookingWeekKey?: string;
    classSessionId?: string;
    dogId?: string;
    dogName?: string;
    id: string;
    state?: string;
  }
  const WEEK_MS = 7 * 86_400_000;

  /** R-08-02: what counts towards a week's limit (never CANCELLED nor CANCELLED_BY_CLUB). */
  const counts = (state: string | undefined) =>
    state === "ACTIVE" || state === "PAYMENT_PENDING" || state === "CANCELLED_LATE";

  function parameter(key: string, fallback: number): number {
    const value = findParameter(key)?.value;
    return typeof value === "number" ? value : fallback;
  }

  /**
   * The most bookings a dog can hold in a booking week at the clock (R-08-03): while the week is W1
   * it takes `bookings.maxNextWeek`, once it is W0 up to `bookings.maxCurrentWeek` (a past week was
   * W0 when it was last booked), and a week after W1 has not opened yet (R-08-01).
   */
  function weekLimit(weekKey: string, currentKey: string): number {
    const index = Math.round((Date.parse(weekKey) - Date.parse(currentKey)) / WEEK_MS);
    const current = parameter("bookings.maxCurrentWeek", 2);
    const next = parameter("bookings.maxNextWeek", 1);
    return index >= 2 ? 0 : index === 1 ? next : Math.max(current, next);
  }

  afterEach(() => {
    resetBookingMockState();
  });

  /**
   * Reads every class of the calendar and day-grid worlds (and D10's list) at the clock and lists
   * what breaks R-08-02/R-08-03/R-08-04: a dog over its week's limit, counted with the member's own
   * bookings; a class whose rows miss its counters; a dog twice; a level the class does not allow.
   */
  async function weekLimitProblems(): Promise<string[]> {
    // The booking week of now, as the member's 03 counts it (R-08-01).
    const home = await as<components["schemas"]["MeHome"]>("member", "GET", "/me/home");
    expect(home.status).toBe(200);
    const currentKey = home.body.limits.currentWeek.weekKey;
    const calendarIds = new Set(planningState.sessions.map((session) => session.id));
    // D10's list: the member world's own bookings (Duna's, Rock's) beside the calendar's
    // registrants (R-08-19: the back office's bookings count as the member's).
    const listed = await as<{ items: Row[] }>(
      "admin",
      "GET",
      "/bookings?size=1000&fields=id,classSessionId,dogId,dogName,state,bookingWeekKey",
    );
    expect(listed.status).toBe(200);
    const memberWorld = listed.body.items.filter(
      (row) => !calendarIds.has(row.classSessionId ?? ""),
    );
    expect(memberWorld.some((row) => row.dogId === "dog-duna" && counts(row.state))).toBe(true);
    const problems: string[] = [];
    const worlds: [string, ClassSession[]][] = [
      ["calendar", planningState.sessions],
      ["day grid", dayGridClassSessions()],
    ];
    for (const [world, sessions] of worlds) {
      const rows: Row[] = [...memberWorld];
      const read = sessions.filter((session) => session.state !== "DRAFT");
      expect(read.length, world).toBeGreaterThan(0);
      for (const session of read) {
        const answer = await as<ClassBookings>(
          "admin",
          "GET",
          `/class-sessions/${session.id}/bookings`,
        );
        expect(answer.status, session.id).toBe(200);
        const items = answer.body.items;
        const cancelled = session.state === "CANCELLED";
        const expected = cancelled
          ? (session.cancellation?.affectedBookings ?? 0)
          : session.counters.booked;
        const live = items.filter(
          (item) => item.state === (cancelled ? "CANCELLED_BY_CLUB" : "ACTIVE"),
        ).length;
        if (live !== expected) {
          problems.push(`${world} ${session.id}: ${String(live)} rows for ${String(expected)}`);
        }
        if (new Set(items.map((item) => item.dogId)).size !== items.length) {
          problems.push(`${world} ${session.id}: a dog twice`);
        }
        const allowed = session.levelIds.map((id) => id.replace(/^level-/u, "").toUpperCase());
        for (const item of items) {
          if (allowed.length > 0 && !allowed.includes(item.levelCode ?? "")) {
            problems.push(`${world} ${session.id}: ${item.dogName} ${item.levelCode ?? "—"}`);
          }
        }
        rows.push(...items);
      }
      if (world === "calendar") {
        // D10 lists the very registrants D4 reads.
        const ids = (items: readonly Row[]) =>
          items
            .filter((row) => calendarIds.has(row.classSessionId ?? ""))
            .map((row) => row.id)
            .sort();
        expect(ids(listed.body.items)).toEqual(ids(rows));
      }
      const perWeek = new Map<string, { count: number; weekKey: string }>();
      for (const row of rows.filter((item) => counts(item.state))) {
        const key = `${row.dogName ?? ""} (${row.dogId ?? ""}) in the week of ${row.bookingWeekKey ?? ""}`;
        const current = perWeek.get(key);
        perWeek.set(key, {
          count: (current?.count ?? 0) + 1,
          weekKey: row.bookingWeekKey ?? "",
        });
      }
      for (const [key, { count, weekKey }] of perWeek) {
        const limit = weekLimit(weekKey, currentKey);
        if (count > limit) {
          problems.push(`${world}: ${key}: ${String(count)} > ${String(limit)}`);
        }
      }
    }
    return problems;
  }

  it.each([
    ["dl 10 at 8:12 (D1 and D10, S15's example day)", JOBS_MOCK_NOW],
    ["dc 12 at 10:00 (D4)", "2026-08-12T10:00:00+02:00"],
    ["dl 3 at 7:10 (the ring-usage register)", "2026-08-03T07:10:00+02:00"],
    ["dl 3 at 21:00 (screen 23's drawer)", "2026-08-03T21:00:00+02:00"],
    ["dg 2 at 20:30 (the member world)", BOOKING_MOCK_NOW],
  ])(
    "T-08-03 E7-W07 step 5 (R-08-02, R-08-03, R-08-19): at %s no dog of the default world is booked over its week's limit in the calendar or the day grid, counted with the member's own bookings; every class still lists its counters' registrants, of a level it allows, no dog twice",
    async (_clock, now) => {
      vi.setSystemTime(new Date(now));
      resetPlanningState();
      resetBookingMockState();
      expect(await weekLimitProblems()).toEqual([]);
    },
  );

  /** Tuesday 11's 18:50 class (D4's week): it has registrants, a late cancellation among them. */
  const TUESDAY_CLASS = "cls-2026-08-11-1850-0";

  async function registrants(id: string): Promise<ClassBookings["items"]> {
    const answer = await as<ClassBookings>("admin", "GET", `/class-sessions/${id}/bookings`);
    expect(answer.status, id).toBe(200);
    return answer.body.items;
  }

  /** D10's rows of Tuesday's and Wednesday's 18:50 classes. */
  async function registerRows(): Promise<Row[]> {
    const filter = encodeURIComponent(`classSessionId:in:${TUESDAY_CLASS},${D4_CLASS}`);
    const answer = await as<{ items: (Row & { bookedAt?: string })[] }>(
      "admin",
      "GET",
      `/bookings?size=1000&filter=${filter}&fields=id,classSessionId,dogId,dogName,state,bookedAt`,
    );
    expect(answer.status).toBe(200);
    return answer.body.items;
  }

  /** Cancels Tuesday's class as the club (ADMIN, with the notice its registrants need, R-06-10). */
  async function cancelTuesday(): Promise<void> {
    const cancelled = await as<ClassSession>(
      "admin",
      "POST",
      `/class-sessions/${TUESDAY_CLASS}/cancellation`,
      { adminText: "Pista inundada", reason: "CLUB_MANUAL" },
    );
    expect([cancelled.status, cancelled.body.state]).toEqual([200, "CANCELLED"]);
    expect(cancelled.body.cancellation?.affectedBookings).toBeGreaterThan(0);
  }

  it("T-08-03 E7-W07 round 2 #3 (R-08-02, R-08-19): at dl 10 at 8:12, cancelling Tuesday's 18:50 class leaves Wednesday's registrants as they were (ids, dogs, states, bookedAt), in D4 and in D10's list; Tuesday's are the same dogs under the same ids, now CANCELLED_BY_CLUB, and its late cancellation stays CANCELLED_LATE", async () => {
    vi.setSystemTime(new Date(JOBS_MOCK_NOW));
    resetPlanningState();
    resetBookingMockState();
    const wednesday = await registrants(D4_CLASS);
    const tuesday = await registrants(TUESDAY_CLASS);
    const listed = await registerRows();
    // The review's reproduction: Wednesday's live dogs before the cancellation.
    expect(wednesday.filter((item) => item.state === "ACTIVE").map((item) => item.dogName)).toEqual(
      ["Duna", "Mixa", "Kai", "Coco"],
    );
    expect(tuesday.some((item) => item.state === "ACTIVE")).toBe(true);
    expect(tuesday.some((item) => item.state === "CANCELLED_LATE")).toBe(true);
    await cancelTuesday();
    expect(await registrants(D4_CLASS)).toEqual(wednesday);
    // R-06-10: each ACTIVE booking turns CANCELLED_BY_CLUB, the same booking, and no longer counts
    // (R-08-02); the late cancellation stays as it was.
    const byClub = <Item extends { state?: string }>(item: Item): Item =>
      item.state === "ACTIVE" ? { ...item, state: "CANCELLED_BY_CLUB" } : item;
    expect(await registrants(TUESDAY_CLASS)).toEqual(
      tuesday.map((item) =>
        item.state === "ACTIVE"
          ? { ...byClub(item), displayState: "CANCELLED_BY_CLUB", late: false }
          : item,
      ),
    );
    expect(await registerRows()).toEqual(
      listed.map((row) => (row.classSessionId === TUESDAY_CLASS ? byClub(row) : row)),
    );
  });

  it("T-08-03 E7-W07 round 2 #3 (R-08-02, R-08-03): after Tuesday's 18:50 class is cancelled, still no dog of the calendar or the day grid is booked over its week's limit, and every class lists its counters' registrants", async () => {
    vi.setSystemTime(new Date(JOBS_MOCK_NOW));
    resetPlanningState();
    resetBookingMockState();
    expect(await weekLimitProblems()).toEqual([]);
    await cancelTuesday();
    expect(await weekLimitProblems()).toEqual([]);
  });
});

describe("E7-W07 round 2 #5b · the staff rows were booked, and the waiting entries joined, before now (S08 R-08-01)", () => {
  afterEach(() => {
    resetBookingMockState();
  });

  /**
   * When a class of the booking week `weekKey` could first be booked (R-08-01): the opening of the
   * week before its own, at `bookings.weekOpensAt`. The worlds read here are on summer time (+02:00).
   */
  function firstBookableAt(weekKey: string): number {
    const opening = findParameter("bookings.weekOpensAt")?.value as { time?: string } | undefined;
    const previous = new Date(Date.parse(`${weekKey}T12:00:00Z`) - 7 * 86_400_000);
    return Date.parse(
      `${previous.toISOString().slice(0, 10)}T${opening?.time ?? "20:00"}:00+02:00`,
    );
  }

  it.each([
    ["dl 10 at 8:12 (D1 and D10, S15's example day)", JOBS_MOCK_NOW],
    ["dc 12 at 10:00 (D4)", "2026-08-12T10:00:00+02:00"],
    ["dl 3 at 7:10 (the ring-usage register)", "2026-08-03T07:10:00+02:00"],
    ["dg 2 at 20:30 (the member world)", BOOKING_MOCK_NOW],
  ])(
    "T-08-03 E7-W07 round 2 #5b (R-08-01): at %s every staff row's bookedAt (D4, screen 23, D10's list) and every waiting entry's joinedAt is no later than now and no earlier than its class's week first opened",
    async (_clock, now) => {
      vi.setSystemTime(new Date(now));
      resetPlanningState();
      resetBookingMockState();
      const problems: string[] = [];
      const check = (label: string, instant: string, weekKey: string | undefined) => {
        if (Date.parse(instant) > Date.now()) problems.push(`${label}: ${instant} is after now`);
        if (weekKey !== undefined && Date.parse(instant) < firstBookableAt(weekKey)) {
          problems.push(`${label}: ${instant} is before the week of ${weekKey} opened`);
        }
      };
      const sessions = [...planningState.sessions, ...dayGridClassSessions()].filter(
        (session) => session.state !== "DRAFT",
      );
      let rows = 0;
      for (const session of sessions) {
        const answer = await as<ClassBookings>(
          "admin",
          "GET",
          `/class-sessions/${session.id}/bookings`,
        );
        expect(answer.status, session.id).toBe(200);
        rows += answer.body.items.length;
        for (const item of answer.body.items) {
          check(`${item.id} (${item.dogName})`, item.bookedAt, item.bookingWeekKey);
        }
        if (session.counters.waiting === 0) continue;
        const waiting = await as<ClassWaitlist>(
          "admin",
          "GET",
          `/class-sessions/${session.id}/waitlist-entries`,
        );
        expect(waiting.status, session.id).toBe(200);
        // A full class: its rows carry the class's week.
        const weekKey = answer.body.items[0]?.bookingWeekKey;
        for (const entry of waiting.body.items) {
          check(`${entry.id} (${entry.dogName ?? ""})`, entry.joinedAt, weekKey);
        }
      }
      // `every` holds on nothing: the worlds must have registrants at the clock.
      expect(rows).toBeGreaterThan(0);
      // D10's list: the member world's rows too (fixed in July, before every clock here).
      const listed = await as<{
        items: { bookedAt?: string; id: string }[];
        totalItems: number;
      }>("admin", "GET", "/bookings?size=1000&fields=id,bookedAt");
      expect(listed.status).toBe(200);
      expect(listed.body.totalItems).toBeLessThanOrEqual(1000);
      for (const item of listed.body.items) check(item.id, item.bookedAt ?? "", undefined);
      expect(problems).toEqual([]);
    },
  );
});
