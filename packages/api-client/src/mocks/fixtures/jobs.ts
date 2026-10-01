import type { components } from "../../generated/schema";

import { clubInstant, RISK_REVIEW_DAY, riskReviewClassIds } from "./calendar";
import { addDays, clubLocalDate } from "./planning";
import { findParameter } from "./settings";

type ClassBookingItem = components["schemas"]["ClassBookingItem"];
type ClassSession = components["schemas"]["ClassSession"];
type JobSummary = components["schemas"]["JobSummary"];
type JobRun = components["schemas"]["JobRun"];
type JobEffectItem = components["schemas"]["JobEffectItem"];
type JobError = components["schemas"]["JobError"];
type RiskReviewForm = components["schemas"]["RiskReviewForm"];
type RiskReviewItem = components["schemas"]["RiskReviewItem"];

export type JobName = JobSummary["jobName"];
type JobModule = NonNullable<JobSummary["module"]>;

/**
 * Monday 10 August 2026 at 8:12 in the club, after the 7:30 review: the S15 §6 form A example day
 * (and the D1 fixture's `generatedAt`).
 */
export const JOBS_MOCK_NOW = "2026-08-10T08:12:00+02:00";
const TIME_ZONE = "Europe/Madrid";

interface CatalogEntry {
  jobName: JobName;
  module: JobModule | null;
  /** R-15-01 route id. */
  name: string;
  /** The `jobs.<name>.enabled` parameter the switch writes (S15 §9). */
  parameter: string;
  schedule: JobSummary["schedule"];
  /**
   * R-15-01 (the «Hora» column): the parameter the api reads the local time from (and, for the
   * week's opening, the day), so a saved change shows in `GET /jobs` at once, with its next run.
   */
  timeParameter?: string;
}

const daily = (localTime: string): JobSummary["schedule"] => ({
  dayOfMonth: null,
  dayOfWeek: null,
  kind: "DAILY",
  localTime,
});
const continuous: JobSummary["schedule"] = {
  dayOfMonth: null,
  dayOfWeek: null,
  kind: "CONTINUOUS",
  localTime: null,
};

/**
 * R-15-01, in the catalog's fixed order. The api lists a process only when its module is on
 * (`GET /jobs`): the full club shows the ten, the «club mínim» (WAITLIST, FAQ, PUSH) eight — no
 * `payment-timeouts` (SINGLE_CLASS) nor `billing-reminder` (BILLING).
 */
export const JOB_CATALOG: readonly CatalogEntry[] = [
  {
    jobName: "WEEK_OPENING",
    module: null,
    name: "week-opening",
    parameter: "jobs.weekOpening.enabled",
    schedule: { dayOfMonth: null, dayOfWeek: "SUNDAY", kind: "WEEKLY", localTime: "20:00" },
    timeParameter: "bookings.weekOpensAt",
  },
  {
    jobName: "RISK_REVIEW",
    module: null,
    name: "risk-review",
    parameter: "jobs.riskReview.enabled",
    schedule: daily("07:30"),
    timeParameter: "classes.riskReviewTime",
  },
  {
    jobName: "NO_SHOW_NOTICES",
    module: null,
    name: "no-show-notices",
    parameter: "jobs.noShowNotices.enabled",
    // The next day's batch (S15 R-15-13) at the club's `messaging.noShowNoticeTime`.
    schedule: daily("08:00"),
    timeParameter: "messaging.noShowNoticeTime",
  },
  {
    jobName: "REMINDERS",
    module: null,
    name: "reminders",
    parameter: "jobs.reminders.enabled",
    schedule: continuous,
  },
  {
    jobName: "EXPIRATIONS",
    module: null,
    name: "expirations",
    parameter: "jobs.expirations.enabled",
    schedule: daily("06:00"),
    timeParameter: "jobs.dailyTime",
  },
  {
    jobName: "WAITLIST_FIFO",
    module: "WAITLIST",
    name: "waitlist-fifo",
    parameter: "jobs.waitlistFifo.enabled",
    schedule: continuous,
  },
  {
    jobName: "PAYMENT_TIMEOUTS",
    module: "SINGLE_CLASS",
    name: "payment-timeouts",
    parameter: "jobs.paymentTimeouts.enabled",
    schedule: continuous,
  },
  {
    jobName: "CLASS_FINISHING",
    module: null,
    name: "class-finishing",
    parameter: "jobs.classFinishing.enabled",
    schedule: continuous,
  },
  {
    jobName: "CLEANUP",
    module: null,
    name: "cleanup",
    parameter: "jobs.cleanup.enabled",
    schedule: daily("06:00"),
    timeParameter: "jobs.dailyTime",
  },
  {
    jobName: "BILLING_REMINDER",
    module: "BILLING",
    name: "billing-reminder",
    parameter: "jobs.billingReminder.enabled",
    schedule: { dayOfMonth: 22, dayOfWeek: null, kind: "MONTHLY", localTime: "06:00" },
    timeParameter: "jobs.dailyTime",
  },
];

/**
 * The classes of the example day's risk review, as the calendar world holds them on that day
 * (`riskReviewSessions`), so D1's rows and the run's items open real D4 classes (T-15-33).
 */
export const RISK_CLASS_IDS = riskReviewClassIds(RISK_REVIEW_DAY);

/** The staff-read booking of a class's first registrant (`classBookingItems`). */
const firstBooking = (classId: string) => `cb-${classId}-0`;

interface RunInput {
  counters?: Record<string, number>;
  dryRun?: boolean;
  durationMs?: number;
  errors?: JobError[];
  items?: JobEffectItem[];
  /** Club-local `YYYY-MM-DDTHH:mm` of the occurrence. */
  local: string;
  /** Its instant when the caller already has it (`clubInstant` is costly at import time). */
  scheduledFor?: string;
  skipReason?: JobRun["skipReason"];
  status: JobRun["status"];
  trigger?: JobRun["trigger"];
}

function plusMs(instant: string, ms: number): string {
  return new Date(Date.parse(instant) + ms).toISOString().replace(".000Z", "Z");
}

function run(entry: CatalogEntry, index: number, input: RunInput): JobRun {
  const scheduledFor =
    input.scheduledFor ?? clubInstant(input.local.slice(0, 10), input.local.slice(11, 16));
  const durationMs = input.status === "RUNNING" ? null : (input.durationMs ?? 1_200);
  return {
    actorAccountId: input.trigger === "MANUAL" ? "10000000-0000-4000-8000-000000000001" : null,
    dryRun: input.dryRun ?? false,
    durationMs,
    effects: { counters: input.counters ?? {}, items: input.items ?? [] },
    errors: input.errors ?? [],
    finishedAt: durationMs === null ? null : plusMs(scheduledFor, durationMs),
    job: entry.jobName,
    parametersSnapshot: entry.name === "risk-review" ? RISK_PARAMETERS : {},
    runId: `run-${entry.name}-${String(index)}`,
    scheduledFor,
    scheduledForLocal: input.local,
    skipReason: input.skipReason ?? null,
    startedAt: scheduledFor,
    status: input.status,
    timeZone: TIME_ZONE,
    trigger: input.trigger ?? "SCHEDULE",
  };
}

const RISK_PARAMETERS = {
  "classes.minDogs": 2,
  "classes.riskAutoCancelSameDay": true,
  "classes.riskLookaheadDays": 2,
  "classes.riskReviewTime": "07:30",
};

const classItem = (id: string, action: string, detail: Record<string, unknown>): JobEffectItem => ({
  action,
  detail,
  entityId: id,
  entityType: "ClassSession",
});

/**
 * `cleanup`'s history: a month of daily runs, one failed on 14 July, and a manual dry run on
 * 5 August, so the run drawer pages through them and its filters narrow them.
 */
function cleanupRuns(at: (index: number, input: RunInput) => JobRun): JobRun[] {
  // 11 July – 10 August keeps one offset in Madrid (CEST): each 6:00 is the last one minus days.
  const last = Date.parse(clubInstant("2026-08-10", "06:00"));
  const daily = Array.from({ length: 30 }, (_, back) => {
    const local = `${addDays("2026-08-10", -back)}T06:00`;
    const scheduledFor = new Date(last - back * 86_400_000).toISOString().replace(".000Z", "Z");
    return back === 27
      ? at(30 - back, {
          errors: [
            {
              code: "INTERNAL_ERROR",
              entityId: null,
              message: "Storage cleanup timed out",
              traceId: "mock-trace-cleanup",
            },
          ],
          local,
          scheduledFor,
          status: "FAILED",
        })
      : at(30 - back, { local, scheduledFor, status: "SUCCEEDED" });
  });
  const dryRun = at(100, {
    dryRun: true,
    local: "2026-08-05T10:15",
    status: "SUCCEEDED",
    trigger: "MANUAL",
  });
  return [...daily, dryRun].sort((left, right) =>
    right.scheduledFor.localeCompare(left.scheduledFor),
  );
}

/** Three runs per process (a month of `cleanup`), newest first (the first one is `lastRun`). */
function initialRuns(entry: CatalogEntry): JobRun[] {
  const at = (index: number, input: RunInput) => run(entry, index, input);
  switch (entry.name) {
    case "week-opening":
      // S15 R-15-11 counters as the api sends them (`opened`, E68).
      return [
        at(3, {
          counters: { activeClasses: 28, notified: 184, opened: 1 },
          local: "2026-08-09T20:00",
          status: "SUCCEEDED",
        }),
        at(2, {
          counters: { activeClasses: 27, notified: 181, opened: 1 },
          local: "2026-08-02T20:00",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { activeClasses: 28, notified: 180, opened: 1 },
          local: "2026-07-26T20:00",
          status: "SUCCEEDED",
        }),
      ];
    case "risk-review":
      return [
        at(3, {
          counters: {
            atRisk: 1,
            cancelled: 2,
            cancelledSilent: 1,
            exempt: 0,
            notifiedMembers: 1,
            reviewed: 4,
            skippedStarted: 0,
          },
          items: [
            classItem(RISK_CLASS_IDS.c1, "CANCEL", {
              classId: RISK_CLASS_IDS.c1,
              dogsCount: 0,
              affected: [],
            }),
            classItem(RISK_CLASS_IDS.c2, "CANCEL", {
              classId: RISK_CLASS_IDS.c2,
              dogsCount: 1,
              affected: [firstBooking(RISK_CLASS_IDS.c2)],
            }),
            classItem(RISK_CLASS_IDS.c3, "NOTIFY", {
              classId: RISK_CLASS_IDS.c3,
              newBookingIds: [firstBooking(RISK_CLASS_IDS.c3)],
            }),
          ],
          local: "2026-08-10T07:30",
          status: "SUCCEEDED",
        }),
        at(2, {
          counters: { atRisk: 0, cancelled: 0, reviewed: 1 },
          local: "2026-08-09T07:30",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { atRisk: 1, cancelled: 0, reviewed: 2 },
          local: "2026-08-08T07:30",
          status: "SUCCEEDED",
        }),
      ];
    case "no-show-notices":
      // Each morning's batch at `messaging.noShowNoticeTime` (08:00): today's failed.
      return [
        at(3, {
          errors: [
            {
              code: "INTERNAL_ERROR",
              entityId: null,
              message: "Notification dispatcher unavailable",
              traceId: "mock-trace-no-show",
            },
          ],
          local: "2026-08-10T08:00",
          status: "FAILED",
        }),
        at(2, {
          counters: { late: 0, notices: 3 },
          local: "2026-08-09T08:00",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { late: 1, notices: 2 },
          local: "2026-08-08T08:00",
          status: "SUCCEEDED",
        }),
      ];
    case "reminders":
      return [
        at(3, {
          counters: { classReminders: 2, trainingReminders: 1 },
          durationMs: 300,
          local: "2026-08-10T08:10",
          status: "SUCCEEDED",
        }),
        at(2, {
          counters: { classReminders: 0, trainingReminders: 0 },
          durationMs: 200,
          local: "2026-08-10T08:09",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { classReminders: 1, trainingReminders: 0 },
          durationMs: 250,
          local: "2026-08-10T08:08",
          status: "SUCCEEDED",
        }),
      ];
    case "expirations":
      return [
        at(3, {
          errors: [
            {
              code: "STALE_VERSION",
              entityId: "pack-rock-2026",
              message: "Pack balance changed meanwhile",
              traceId: "mock-trace-expirations",
            },
          ],
          local: "2026-08-10T06:00",
          status: "PARTIAL",
        }),
        at(2, { local: "2026-08-09T06:00", status: "SUCCEEDED" }),
        at(1, { local: "2026-08-08T06:00", status: "SUCCEEDED" }),
      ];
    case "waitlist-fifo":
      // `waitlist.mode = ALL_AT_ONCE` in the club: skipped once an hour (R-15-03).
      return [
        at(3, { local: "2026-08-10T08:00", skipReason: "MODULE_OFF", status: "SKIPPED" }),
        at(2, { local: "2026-08-10T07:00", skipReason: "MODULE_OFF", status: "SKIPPED" }),
        at(1, { local: "2026-08-10T06:00", skipReason: "MODULE_OFF", status: "SKIPPED" }),
      ];
    case "billing-reminder":
      return [
        at(3, { local: "2026-07-22T06:00", skipReason: "DISABLED", status: "SKIPPED" }),
        at(2, { local: "2026-06-22T06:00", status: "SUCCEEDED" }),
        at(1, { local: "2026-05-22T06:00", status: "SUCCEEDED" }),
      ];
    case "cleanup":
      return cleanupRuns(at);
    case "class-finishing":
      // P8 (every minute), with the counters the api sends (R-15-18, E68).
      return [
        at(3, {
          counters: { activitiesFinished: 0, finished: 2, swept: 1 },
          durationMs: 150,
          local: "2026-08-10T08:11",
          status: "SUCCEEDED",
        }),
        at(2, {
          counters: { activitiesFinished: 0, finished: 0, swept: 0 },
          durationMs: 150,
          local: "2026-08-10T08:10",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { activitiesFinished: 1, finished: 0, swept: 0 },
          durationMs: 150,
          local: "2026-08-10T08:09",
          status: "SUCCEEDED",
        }),
      ];
    default:
      return [
        at(3, { durationMs: 150, local: "2026-08-10T08:11", status: "SUCCEEDED" }),
        at(2, { durationMs: 150, local: "2026-08-10T08:10", status: "SUCCEEDED" }),
        at(1, { durationMs: 150, local: "2026-08-10T08:09", status: "SUCCEEDED" }),
      ];
  }
}

/**
 * What a run would do now (`dryRun`) or does (manual run), per process: the plan's items carry
 * `WOULD_*` actions (R-15-08), the real run the same items without the prefix.
 */
export function jobEffects(name: string, dryRun: boolean): JobRun["effects"] {
  const action = (value: string) => (dryRun ? `WOULD_${value}` : value);
  switch (name) {
    case "risk-review":
      return {
        counters: { atRisk: 1, cancelled: 1, notifiedMembers: 0, reviewed: 3 },
        items: [
          classItem(RISK_CLASS_IDS.c5, action("CANCEL"), {
            affected: [firstBooking(RISK_CLASS_IDS.c5)],
            classId: RISK_CLASS_IDS.c5,
            dogsCount: 1,
          }),
          classItem(RISK_CLASS_IDS.c4, action("NOTIFY"), {
            classId: RISK_CLASS_IDS.c4,
            newBookingIds: [],
          }),
        ],
      };
    case "week-opening":
      return {
        counters: { activeClasses: 0, notified: 0, opened: 1 },
        items: [
          {
            action: action("OPEN"),
            detail: { activeClasses: 0, recipients: 184, weekKey: "2026-08-16" },
            entityId: "2026-08-16",
            entityType: "Week",
          },
        ],
      };
    case "reminders":
      // R-15-14: `WOULD_REMIND {bookingId, memberId, startsAt, lead}` for a booking due now
      // (`startsAt − lead ≤ now < startsAt`): the 8:30 class of the example day (06:30Z in CEST)
      // with a 2 h reminder, at 8:12.
      return {
        counters: { classReminders: 1, trainingReminders: 0 },
        items: [
          {
            action: action("REMIND"),
            detail: {
              bookingId: "booking-anna-nass",
              lead: 120,
              memberId: "member-anna",
              startsAt: "2026-08-10T06:30:00Z",
            },
            entityId: "booking-anna-nass",
            entityType: "Booking",
          },
        ],
      };
    default:
      return { counters: {}, items: [] };
  }
}

export interface StoredJob {
  enabled: boolean;
  entry: CatalogEntry;
  runs: JobRun[];
}

function initialJobs(): StoredJob[] {
  return JOB_CATALOG.map((entry) => ({
    enabled: entry.name !== "billing-reminder",
    entry,
    runs: initialRuns(entry),
  }));
}

export const jobsState: { jobs: StoredJob[]; sequence: number } = {
  jobs: initialJobs(),
  sequence: 0,
};

export function resetJobsState(): void {
  jobsState.jobs = initialJobs();
  jobsState.sequence = 0;
}

/**
 * The process's schedule as the api computes it (R-15-01): the catalog's cadence at the local time
 * of its parameter (`jobs.dailyTime`, `classes.riskReviewTime`, the week's opening day and time).
 */
function scheduleOf(
  entry: CatalogEntry,
  parameterValue: (key: string) => unknown,
): JobSummary["schedule"] {
  if (entry.timeParameter === undefined) return entry.schedule;
  const value = parameterValue(entry.timeParameter);
  if (typeof value === "string" && /^\d{2}:\d{2}$/u.test(value)) {
    return { ...entry.schedule, localTime: value };
  }
  if (typeof value === "object" && value !== null) {
    const { dayOfWeek, time } = value as { dayOfWeek?: unknown; time?: unknown };
    return {
      ...entry.schedule,
      ...(typeof dayOfWeek === "string"
        ? { dayOfWeek: dayOfWeek as NonNullable<JobSummary["schedule"]["dayOfWeek"]> }
        : {}),
      ...(typeof time === "string" ? { localTime: time } : {}),
    };
  }
  return entry.schedule;
}

/** The club-local `YYYY-MM-DDTHH:mm` of an instant. */
function localMinute(instant: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric",
  })
    .format(new Date(instant))
    .replace(" ", "T");
}

const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/**
 * `nextScheduledForLocal` as the api computes it (R-15-01): the first occurrence of the schedule
 * after `now`, club-local — the day (every day, the week's day or the month's) at its local time;
 * `null` for a continuous process.
 */
function nextOccurrence(schedule: JobSummary["schedule"], now: number): string | null {
  const time = schedule.localTime;
  if (schedule.kind === "CONTINUOUS" || time === null || time === undefined) return null;
  const current = localMinute(now);
  for (let offset = 0; offset <= 366; offset += 1) {
    const date = addDays(current.slice(0, 10), offset);
    const weekday = WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
    if (schedule.kind === "WEEKLY" && weekday !== schedule.dayOfWeek) continue;
    if (schedule.kind === "MONTHLY" && Number(date.slice(8, 10)) !== schedule.dayOfMonth) continue;
    if (`${date}T${time}` > current) return `${date}T${time}`;
  }
  return null;
}

export function jobSummary(
  job: StoredJob,
  parameterValue: (key: string) => unknown = () => undefined,
  now = Date.now(),
): JobSummary {
  const last = job.runs[0];
  const schedule = scheduleOf(job.entry, parameterValue);
  return {
    enabled: job.enabled,
    jobName: job.entry.jobName,
    lastRun:
      last === undefined
        ? null
        : {
            counters: last.effects.counters,
            dryRun: last.dryRun,
            finishedAt: last.finishedAt ?? null,
            runId: last.runId,
            status: last.status,
            trigger: last.trigger,
          },
    module: job.entry.module,
    name: job.entry.name,
    // From the same schedule, so a saved parameter moves both (E5-W05 round 2).
    nextScheduledForLocal: nextOccurrence(schedule, now),
    schedule,
  };
}

/** A manual run (R-15-09): synchronous, `scheduledFor` = now truncated to the minute. */
export function manualRun(job: StoredJob, dryRun: boolean, now: number): JobRun {
  jobsState.sequence += 1;
  const minute = Math.floor(now / 60_000) * 60_000;
  const scheduledFor = new Date(minute).toISOString().replace(".000Z", "Z");
  const local = localMinute(minute);
  return {
    actorAccountId: "10000000-0000-4000-8000-000000000001",
    dryRun,
    durationMs: 840,
    effects: jobEffects(job.entry.name, dryRun),
    errors: [],
    finishedAt: new Date(now + 840).toISOString(),
    job: job.entry.jobName,
    parametersSnapshot: job.entry.name === "risk-review" ? RISK_PARAMETERS : {},
    runId: `run-${job.entry.name}-manual-${String(jobsState.sequence)}`,
    scheduledFor,
    scheduledForLocal: local,
    skipReason: null,
    startedAt: new Date(now).toISOString(),
    status: "SUCCEEDED",
    timeZone: TIME_ZONE,
    trigger: "MANUAL",
  };
}

/** What `GET /risk-review` reads: the caller's club's classes and the review's parameters. */
export interface RiskReviewWorld {
  /** `classes.riskAutoCancelSameDay`. */
  autoCancelSameDay: boolean;
  /** Whether the process runs (`jobs.riskReview.enabled`). */
  enabled: boolean;
  /** `classes.riskLookaheadDays`. */
  lookaheadDays: number;
  /** `classes.minDogs`. */
  minDogs: number;
  now: number;
  /** A class's bookings, any state (`GET /class-sessions/{id}/bookings`). */
  registrants: (session: ClassSession) => readonly ClassBookingItem[];
  /** `classes.riskReviewTime`, club-local `HH:mm`. */
  reviewTime: string;
  ringName: (session: ClassSession) => string | null;
  /** The club's classes (the calendar world). */
  sessions: readonly ClassSession[];
}

/** The risk review's defaults (S15 §9) for the parameters the mock club does not list. */
export const RISK_REVIEW_DEFAULTS = {
  autoCancelSameDay: RISK_PARAMETERS["classes.riskAutoCancelSameDay"],
  lookaheadDays: RISK_PARAMETERS["classes.riskLookaheadDays"],
  minDogs: RISK_PARAMETERS["classes.minDogs"],
  reviewTime: RISK_PARAMETERS["classes.riskReviewTime"],
};

/** The club's `classes.minDogs` (S06 R-06-13, S15 R-15-12), or its default when it is not listed. */
export function minDogsParameter(): number {
  const value = findParameter("classes.minDogs")?.value;
  return typeof value === "number" ? value : RISK_REVIEW_DEFAULTS.minDogs;
}

/**
 * Whether a class is at risk (R-06-13), the same for D4's mark and D1's rows: an ACTIVE class,
 * not exempt, with fewer booked dogs than the club's `classes.minDogs`. The world's `atRisk` mark
 * stands for the api's window terms (the day within the lookahead, before its review), so a class
 * the world never marks, such as a one-seat «Teràpia», is not at risk however few it holds.
 */
export function atRiskNow(session: ClassSession, minDogs: number): boolean {
  return (
    session.state === "ACTIVE" &&
    session.atRisk &&
    !session.riskExempt &&
    session.counters.booked < minDogs
  );
}

/**
 * `GET /risk-review` (S15 §6 form A) for the club-local `date`, computed from the club's classes as
 * the api does (E5-W05 step 15): the ACTIVE classes at risk and the CANCELLED{RISK_REVIEW} ones of
 * `date` … `date + lookaheadDays`, by `startsAt`. At risk is `atRiskNow` with the club's
 * `classes.minDogs`, as D4 marks it, so D1's rows and D4's warnings agree. `notified`: the bookings
 * the cancellation affected; for an active class, its registrants once a review has already
 * covered its day — with the process on only (switched off, no review ran). `WILL_CANCEL`/
 * `WILL_REVIEW` only when P2 will still review the class and nobody was notified yet (E37);
 * otherwise `AT_RISK`. On the example day the calendar world holds the spec's c1…c4
 * (`riskReviewSessions`), so the form is S15's example.
 */
export function riskReviewForm(date: string, world: RiskReviewWorld): RiskReviewForm {
  const reviewAt = (day: string) => clubInstant(day, world.reviewTime);
  const today = clubLocalDate(new Date(world.now));
  // The last review that ran: today's once its time has passed, else yesterday's.
  const lastReview = Date.parse(reviewAt(today)) <= world.now ? today : addDays(today, -1);
  const coveredUpTo = addDays(lastReview, world.lookaheadDays);
  const last = addDays(date, world.lookaheadDays);
  const dayLabel = (day: string): RiskReviewItem["dayLabel"] =>
    day === date ? "TODAY" : day === addDays(date, 1) ? "TOMORROW" : "OTHER";
  const people = (session: ClassSession, state: ClassBookingItem["state"]) =>
    world
      .registrants(session)
      .filter((booking) => booking.state === state)
      .map((booking) => ({ dogName: booking.dogName, memberName: booking.memberName }));
  const item = (session: ClassSession): RiskReviewItem => {
    const review = reviewAt(session.date);
    const common = {
      classId: session.id,
      date: session.date,
      dayLabel: dayLabel(session.date),
      displayDescription: session.displayDescription,
      reviewAt: review,
      ringName: world.ringName(session),
      startTime: session.startTime,
    };
    if (session.state === "CANCELLED") {
      return {
        ...common,
        bookedCount: session.cancellation?.affectedBookings ?? 0,
        cancelledAt: session.cancellation?.at ?? null,
        notified: people(session, "CANCELLED_BY_CLUB"),
        status: "AUTO_CANCELLED",
      };
    }
    const notified = world.enabled && session.date <= coveredUpTo ? people(session, "ACTIVE") : [];
    const willReview =
      world.enabled &&
      Date.parse(review) > world.now &&
      Date.parse(session.startsAt) > Date.parse(review);
    return {
      ...common,
      bookedCount: session.counters.booked,
      cancelledAt: null,
      notified,
      status:
        willReview && notified.length === 0
          ? world.autoCancelSameDay
            ? "WILL_CANCEL"
            : "WILL_REVIEW"
          : "AT_RISK",
    };
  };
  return {
    autoCancelSameDay: world.autoCancelSameDay,
    date,
    items: world.sessions
      .filter(
        (session) =>
          session.date >= date &&
          session.date <= last &&
          (session.state === "CANCELLED"
            ? session.cancellation?.reason === "RISK_REVIEW"
            : atRiskNow(session, world.minDogs)),
      )
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map(item),
    lookaheadDays: world.lookaheadDays,
    minDogs: world.minDogs,
    reviewTime: world.reviewTime,
  };
}
