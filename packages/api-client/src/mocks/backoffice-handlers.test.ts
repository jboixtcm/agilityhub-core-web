import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import openapiDocument from "../../openapi/openapi.json";
import type { components } from "../generated/schema";

import {
  JOBS_MOCK_NOW,
  mockScenario,
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
    expect(seen).toEqual([
      "AUTO_CANCELLED: ",
      "AUTO_CANCELLED: Laura + Duna CANCELLED_BY_CLUB",
      "AT_RISK: Pau + Blat ACTIVE",
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
    [
      "dg 27-09 at 12:00, the review's probe day (no active class ahead)",
      "2026-09-27T12:00:00+02:00",
      [],
    ],
  ])(
    "E5-W05 step 15: on %s each row is a class of its week in the state its status implies",
    async (_day, now, rows) => {
      vi.setSystemTime(new Date(now));
      resetPlanningState();
      expect(await riskRowsInTheirWeeks()).toEqual(rows);
    },
  );
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
  it("E5-W05 step 7: Duna's class of Sunday 2 at 20:00 (mockup 06's done class) belongs to the week that opens then, 2026-08-02, as Monday 3's does", async () => {
    // Mockup 06's member world (`bookingLimit`) holds the booking of Sunday 2 at 20:00.
    expect((await as<unknown>("bookingLimit", "GET", "/me/home")).status).toBe(200);
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
    expect(monday.every((row) => row.bookingWeekKey === "2026-08-02")).toBe(true);
    const registrants = await as<ClassBookings>(
      "admin",
      "GET",
      `/class-sessions/${D4_CLASS}/bookings`,
    );
    expect(registrants.body.items.every((row) => row.bookingWeekKey === "2026-08-09")).toBe(true);
    resetBookingMockState();
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
});
