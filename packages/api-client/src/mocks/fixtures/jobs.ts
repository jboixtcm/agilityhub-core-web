import type { components } from "../../generated/schema";

import { clubInstant } from "./calendar";
import { addDays } from "./planning";

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
  },
  {
    jobName: "RISK_REVIEW",
    module: null,
    name: "risk-review",
    parameter: "jobs.riskReview.enabled",
    schedule: daily("07:30"),
  },
  {
    jobName: "NO_SHOW_NOTICES",
    module: null,
    name: "no-show-notices",
    parameter: "jobs.noShowNotices.enabled",
    schedule: daily("21:00"),
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
  },
  {
    jobName: "BILLING_REMINDER",
    module: "BILLING",
    name: "billing-reminder",
    parameter: "jobs.billingReminder.enabled",
    schedule: { dayOfMonth: 22, dayOfWeek: null, kind: "MONTHLY", localTime: "06:00" },
  },
];

/** The next occurrence the api computes (club-local), for the scheduled processes. */
const NEXT_LOCAL: Readonly<Record<string, string>> = {
  "billing-reminder": "2026-08-22T06:00",
  cleanup: "2026-08-11T06:00",
  expirations: "2026-08-11T06:00",
  "no-show-notices": "2026-08-10T21:00",
  "risk-review": "2026-08-11T07:30",
  "week-opening": "2026-08-16T20:00",
};

/** The class ids of the risk review (fictional, as in the D1 fixture). */
export const RISK_CLASS_IDS = {
  c1: "41000000-0000-4000-8000-000000000001",
  c2: "41000000-0000-4000-8000-000000000002",
  c3: "41000000-0000-4000-8000-000000000003",
  c4: "41000000-0000-4000-8000-000000000004",
  /** A class of today that fell below the minimum after 7:30: what a manual run would cancel. */
  c5: "41000000-0000-4000-8000-000000000005",
} as const;

interface RunInput {
  counters?: Record<string, number>;
  dryRun?: boolean;
  durationMs?: number;
  errors?: JobError[];
  items?: JobEffectItem[];
  /** Club-local `YYYY-MM-DDTHH:mm` of the occurrence. */
  local: string;
  skipReason?: JobRun["skipReason"];
  status: JobRun["status"];
  trigger?: JobRun["trigger"];
}

function plusMs(instant: string, ms: number): string {
  return new Date(Date.parse(instant) + ms).toISOString().replace(".000Z", "Z");
}

function run(entry: CatalogEntry, index: number, input: RunInput): JobRun {
  const scheduledFor = clubInstant(input.local.slice(0, 10), input.local.slice(11, 16));
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

/** Three runs per process, newest first (the last one is `lastRun`). */
function initialRuns(entry: CatalogEntry): JobRun[] {
  const at = (index: number, input: RunInput) => run(entry, index, input);
  switch (entry.name) {
    case "week-opening":
      return [
        at(3, {
          counters: { activeClasses: 28, notified: 184 },
          local: "2026-08-09T20:00",
          status: "SUCCEEDED",
        }),
        at(2, {
          counters: { activeClasses: 27, notified: 181 },
          local: "2026-08-02T20:00",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { activeClasses: 28, notified: 180 },
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
              affected: ["booking-laura-duna"],
            }),
            classItem(RISK_CLASS_IDS.c3, "NOTIFY", {
              classId: RISK_CLASS_IDS.c3,
              newBookingIds: ["booking-pau-blat"],
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
          local: "2026-08-09T21:00",
          status: "FAILED",
        }),
        at(2, {
          counters: { late: 0, notices: 3 },
          local: "2026-08-08T21:00",
          status: "SUCCEEDED",
        }),
        at(1, {
          counters: { late: 1, notices: 2 },
          local: "2026-08-07T21:00",
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
      return [
        at(3, { local: "2026-08-10T06:00", status: "SUCCEEDED" }),
        at(2, { local: "2026-08-09T06:00", status: "SUCCEEDED" }),
        at(1, { local: "2026-08-08T06:00", status: "SUCCEEDED" }),
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
            affected: ["booking-marc-chunli"],
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
        counters: { activeClasses: 0, notified: 0 },
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
      return {
        counters: { classReminders: 1, trainingReminders: 0 },
        items: [
          {
            action: action("REMIND"),
            detail: { lead: 120, startsAt: "2026-08-10T08:30:00Z" },
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

export function jobSummary(job: StoredJob): JobSummary {
  const last = job.runs[0];
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
    nextScheduledForLocal: NEXT_LOCAL[job.entry.name] ?? null,
    schedule: job.entry.schedule,
  };
}

/** A manual run (R-15-09): synchronous, `scheduledFor` = now truncated to the minute. */
export function manualRun(job: StoredJob, dryRun: boolean, now: number): JobRun {
  jobsState.sequence += 1;
  const minute = Math.floor(now / 60_000) * 60_000;
  const scheduledFor = new Date(minute).toISOString().replace(".000Z", "Z");
  const local = new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric",
  })
    .format(new Date(minute))
    .replace(" ", "T");
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

/**
 * `GET /risk-review` (S15 §6 form A) for the club-local `date`: the four items of the spec's
 * example (AUTO_CANCELLED without and with `notified`, AT_RISK, WILL_CANCEL) on that day, the next
 * one and the one after, as the api orders them (by `startsAt`).
 */
export function riskReviewForm(date: string, empty: boolean): RiskReviewForm {
  const tomorrow = addDays(date, 1);
  const after = addDays(date, 2);
  const reviewAt = (day: string) => clubInstant(day, "07:30");
  const items: RiskReviewItem[] = [
    {
      bookedCount: 0,
      cancelledAt: plusMs(reviewAt(date), 2_000),
      classId: RISK_CLASS_IDS.c1,
      date,
      dayLabel: "TODAY",
      displayDescription: "Cadells",
      notified: [],
      reviewAt: reviewAt(date),
      ringName: "Cadells",
      startTime: "09:30",
      status: "AUTO_CANCELLED",
    },
    {
      bookedCount: 1,
      cancelledAt: plusMs(reviewAt(date), 3_000),
      classId: RISK_CLASS_IDS.c2,
      date,
      dayLabel: "TODAY",
      displayDescription: "Nivell D",
      notified: [{ dogName: "Duna", memberName: "Laura" }],
      reviewAt: reviewAt(date),
      ringName: "Petita",
      startTime: "17:40",
      status: "AUTO_CANCELLED",
    },
    {
      bookedCount: 1,
      cancelledAt: null,
      classId: RISK_CLASS_IDS.c3,
      date: tomorrow,
      dayLabel: "TOMORROW",
      displayDescription: "F i G",
      notified: [{ dogName: "Blat", memberName: "Pau" }],
      reviewAt: reviewAt(tomorrow),
      ringName: "Carretera",
      startTime: "20:00",
      status: "AT_RISK",
    },
    {
      bookedCount: 0,
      cancelledAt: null,
      classId: RISK_CLASS_IDS.c4,
      date: after,
      dayLabel: "OTHER",
      displayDescription: "Cadells",
      notified: [],
      reviewAt: reviewAt(after),
      ringName: "Cadells",
      startTime: "09:30",
      status: "WILL_CANCEL",
    },
  ];
  return {
    autoCancelSameDay: true,
    date,
    items: empty ? [] : items,
    lookaheadDays: 2,
    minDogs: 2,
    reviewTime: "07:30",
  };
}
