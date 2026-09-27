import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import type { components } from "../generated/schema";

import {
  JOBS_MOCK_NOW,
  mockScenario,
  resetBackofficeMockState,
  resetPlanningState,
  resetSettingsState,
  resetTrainingMockState,
  type MockScenario,
} from "./handlers";
import { server } from "./server";

type ApiError = components["schemas"]["ApiError"];
type JobRun = components["schemas"]["JobRun"];
type JobSummaries = components["schemas"]["JobSummaries"];
type RiskReviewForm = components["schemas"]["RiskReviewForm"];

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

describe("E5-W03 step 8 · S15 processes (GET /jobs, trigger, switch, runs) answer like the api", () => {
  it("T-15-32 lists the processes whose module is on: 10 in the full club, 9 in the Cànic, 8 in the club mínim", async () => {
    const names = async (scenario: MockScenario) => {
      const answer = await as<JobSummaries>(scenario, "GET", "/jobs");
      expect(answer.status).toBe(200);
      valid("JobSummaries", answer.body);
      return answer.body.items.map((item) => item.name);
    };
    expect(await names("jobsFullClub")).toHaveLength(10);
    // The Cànic has no SINGLE_CLASS: no `payment-timeouts`.
    expect(await names("admin")).not.toContain("payment-timeouts");
    expect(await names("admin")).toHaveLength(9);
    const minimal = await names("jobsMinimalClub");
    expect(minimal).toHaveLength(8);
    expect(minimal).toContain("waitlist-fifo");
    expect(minimal).not.toContain("billing-reminder");

    const jobs = (await as<JobSummaries>("jobsFullClub", "GET", "/jobs")).body.items;
    expect(jobs.find((job) => job.name === "billing-reminder")?.enabled).toBe(false);
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
});

describe("E5-W03 step 8 · S08 staff reads (registrants, waiting list, GET /bookings)", () => {
  it("answers the D4 class's 4 bookings (+ 1 late cancellation) and its 2 waiting entries; R-08-16 removal, then WAITLIST_ENTRY_NOT_LIVE", async () => {
    const bookings = await as<components["schemas"]["ClassBookings"]>(
      "admin",
      "GET",
      `/class-sessions/${D4_CLASS}/bookings`,
    );
    valid("ClassBookings", bookings.body);
    expect(
      bookings.body.items.map((item) => `${item.memberName} + ${item.dogName}:${item.state}`),
    ).toEqual([
      "Laura + Duna:ACTIVE",
      "Marc + Chun-li:ACTIVE",
      "Anna + Nass:ACTIVE",
      "Eva + Fish:ACTIVE",
      "Sergio + Thai:CANCELLED_LATE",
    ]);
    const waitlist = await as<components["schemas"]["ClassWaitlist"]>(
      "instructor",
      "GET",
      `/class-sessions/${D4_CLASS}/waitlist-entries`,
    );
    valid("ClassWaitlist", waitlist.body);
    // The Cànic's `waitlist.mode = ALL_AT_ONCE`: no positions (R-08-13).
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
