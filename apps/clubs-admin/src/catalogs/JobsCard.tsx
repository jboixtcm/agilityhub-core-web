import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { addDays, classCalendarPath, clubInstant, isIsoDate } from "../planning/calendar-shared";
import { mondayOf } from "../planning/shared";

type JobSummary = components["schemas"]["JobSummary"];
type JobRun = components["schemas"]["JobRun"];
type JobRunListItem = components["schemas"]["JobRunListItem"];
type RunStatus = JobRun["status"];
type Translate = ReturnType<typeof useTranslation>["t"];

/** The anchor of the card (`/parametres#processos`, S15 §2; N-42 opens it). */
export const JOBS_CARD_ID = "processos";

const STATUS_TONES: Readonly<Record<RunStatus, Tone>> = {
  FAILED: "danger",
  PARTIAL: "warning",
  RUNNING: "info",
  SKIPPED: "neutral",
  SUCCEEDED: "success",
};

const WEEKDAY_OFFSETS: Readonly<Record<string, number>> = {
  FRIDAY: 4,
  MONDAY: 0,
  SATURDAY: 5,
  SUNDAY: 6,
  THURSDAY: 3,
  TUESDAY: 1,
  WEDNESDAY: 2,
};
/** A Monday: the weekday names come from the club formatter, never from a literal. */
const REFERENCE_MONDAY = Date.UTC(2026, 7, 3);

const INTL_LOCALES: Readonly<Record<string, string>> = { ca: "ca-ES", en: "en-US", es: "es-ES" };

/** «7:30» from the api's club-local «07:30» (R-15-02: the schedule is already in the club's zone). */
function clockTime(value: string): string {
  return value.replace(/^0(?=\d:)/u, "");
}

/** «{n} classes revisades» for each counter the api sends (zeros are no effect); an unknown key reads as sent. */
export function counterTexts(t: Translate, counters: Readonly<Record<string, number>>): string[] {
  return Object.entries(counters)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) =>
      t(`admin-settings:jobs.counter.${key}`, {
        count: value,
        defaultValue: t("admin-settings:jobs.counterRaw", { count: value, key }),
      }),
    );
}

function errorText(t: Translate, cause: unknown): string {
  return isApiError(cause)
    ? t(`errors:${cause.code}`, { defaultValue: t("errors:INTERNAL_ERROR") })
    : t("errors:INTERNAL_ERROR");
}

/** The run history's page size (CONVENCIONS_API §4 sizes). */
const RUNS_PAGE_SIZE = 20;
const RUN_STATUSES: readonly RunStatus[] = ["SUCCEEDED", "PARTIAL", "FAILED", "SKIPPED", "RUNNING"];
const RUN_TRIGGERS: readonly NonNullable<JobRunListItem["trigger"]>[] = [
  "SCHEDULE",
  "CATCH_UP",
  "MANUAL",
];

/** The drawer's filters over the api's `x-filterable` fields of the run list. */
interface RunFilters {
  dryRun: "" | "false" | "true";
  /** Club-local `YYYY-MM-DD` bounds of `scheduledFor`, both included. */
  from: string;
  status: "" | RunStatus;
  to: string;
  trigger: "" | NonNullable<JobRunListItem["trigger"]>;
}

const NO_RUN_FILTERS: RunFilters = { dryRun: "", from: "", status: "", to: "", trigger: "" };

function nextDay(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * `filter=field:op:value` (CONVENCIONS_API §4) for the drawer's filters: the `scheduledFor` range
 * runs from the club-local start of `from` to the last second of `to`, in the club's zone.
 */
export function runFilterParams(filters: RunFilters, timeZone: string): string[] {
  const start = filters.from === "" ? undefined : clubInstant(filters.from, "00:00", timeZone);
  const end =
    filters.to === ""
      ? undefined
      : new Date(Date.parse(clubInstant(nextDay(filters.to), "00:00", timeZone)) - 1_000)
          .toISOString()
          .replace(".000Z", "Z");
  return [
    ...(filters.status === "" ? [] : [`status:eq:${filters.status}`]),
    ...(filters.trigger === "" ? [] : [`trigger:eq:${filters.trigger}`]),
    ...(filters.dryRun === "" ? [] : [`dryRun:eq:${filters.dryRun}`]),
    ...(start !== undefined && end !== undefined
      ? [`scheduledFor:between:${start},${end}`]
      : start !== undefined
        ? [`scheduledFor:gte:${start}`]
        : end !== undefined
          ? [`scheduledFor:lte:${end}`]
          : []),
  ];
}

/**
 * The run history of a process (S15 §6 `GET /jobs/{name}/runs`, newest first) page by page, with
 * the universal list's filters on `status`, `trigger`, `dryRun` and the `scheduledFor` range, and
 * one run's sheet (`GET /jobs/{name}/runs/{runId}`: effects and errors, R-15-21). The full run
 * browser is S17's.
 */
function RunsDrawer({
  client,
  job,
  onClose,
  onNavigate,
}: {
  client: ApiClient;
  job: JobSummary;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const formats = useClubFormats();
  const branding = useBranding();
  const { t } = useTranslation(["admin-settings", "enums", "errors"]);
  const [filters, setFilters] = useState<RunFilters>(NO_RUN_FILTERS);
  const [page, setPage] = useState(0);
  // [Torna-ho a provar] reads the same page again.
  const [attempt, setAttempt] = useState(0);
  const timeZone = branding.timeZone;
  // An answer for other filters or another page than the ones shown now is dropped.
  const queryKey = JSON.stringify([runFilterParams(filters, timeZone), page, attempt]);
  const [runs, setRuns] = useState<{
    error?: string;
    items?: JobRunListItem[];
    key: string;
    totalPages?: number;
  }>({ key: "" });
  // The pages the last answer counted: a failed page keeps the pager (S15 §2 error and retry).
  const [knownPages, setKnownPages] = useState(0);
  const [detail, setDetail] = useState<{ error?: string; run?: JobRun; runId: string }>();

  useEffect(() => {
    let current = true;
    client
      .GET("/jobs/{name}/runs", {
        params: {
          path: { name: job.name },
          query: {
            filter: runFilterParams(filters, timeZone),
            page,
            size: RUNS_PAGE_SIZE,
            sort: ["scheduledFor,desc"],
          },
        },
      })
      .then(
        ({ data }) => {
          if (current) {
            setRuns({ items: data?.items ?? [], key: queryKey, totalPages: data?.totalPages ?? 0 });
            setKnownPages(data?.totalPages ?? 0);
          }
        },
        (cause: unknown) => {
          if (current) setRuns({ error: errorText(t, cause), key: queryKey });
        },
      );
    return () => {
      current = false;
    };
  }, [attempt, client, filters, job.name, page, queryKey, t, timeZone]);

  const loading = runs.key !== queryKey;
  const totalPages = runs.totalPages ?? knownPages;
  const filtered = Object.values(filters).some((value) => value !== "");
  const change = (next: Partial<RunFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(0);
  };

  const open = (runId: string) => {
    setDetail({ runId });
    client.GET("/jobs/{name}/runs/{runId}", { params: { path: { name: job.name, runId } } }).then(
      ({ data }) => {
        setDetail((value) =>
          value?.runId === runId && data !== undefined ? { run: data, runId } : value,
        );
      },
      (cause: unknown) => {
        setDetail((value) =>
          value?.runId === runId ? { error: errorText(t, cause), runId } : value,
        );
      },
    );
  };

  const when = (local: string | undefined) =>
    local === undefined
      ? t("admin-settings:jobs.none")
      : `${formats.formatPlainDate(local.slice(0, 10), "short")} ${clockTime(local.slice(11, 16))}`;

  return (
    <Drawer
      closeLabel={t("admin-settings:common.close")}
      onClose={onClose}
      open
      title={t("admin-settings:jobs.runs.title", {
        name: t(`admin-settings:jobs.name.${job.jobName}`),
      })}
    >
      <div
        aria-label={t("admin-settings:jobs.runs.filters")}
        className="jobs-card__run-filters"
        role="group"
      >
        <FormField id="jobs-runs-status" label={t("admin-settings:jobs.runs.status")}>
          <Select
            id="jobs-runs-status"
            onChange={(event) => {
              const value = event.currentTarget.value;
              change({ status: RUN_STATUSES.find((status) => status === value) ?? "" });
            }}
            value={filters.status}
          >
            <option value="">{t("admin-settings:jobs.runs.all")}</option>
            {RUN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`enums:jobRunStatus.${status}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="jobs-runs-trigger" label={t("admin-settings:jobs.runs.trigger")}>
          <Select
            id="jobs-runs-trigger"
            onChange={(event) => {
              const value = event.currentTarget.value;
              change({ trigger: RUN_TRIGGERS.find((trigger) => trigger === value) ?? "" });
            }}
            value={filters.trigger}
          >
            <option value="">{t("admin-settings:jobs.runs.all")}</option>
            {RUN_TRIGGERS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {t(`enums:jobTrigger.${trigger}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="jobs-runs-dry-run" label={t("admin-settings:jobs.runs.dryRun")}>
          <Select
            id="jobs-runs-dry-run"
            onChange={(event) => {
              const value = event.currentTarget.value;
              change({ dryRun: value === "true" || value === "false" ? value : "" });
            }}
            value={filters.dryRun}
          >
            <option value="">{t("admin-settings:jobs.runs.all")}</option>
            <option value="true">{t("admin-settings:jobs.runs.dryRunOnly")}</option>
            <option value="false">{t("admin-settings:jobs.runs.realOnly")}</option>
          </Select>
        </FormField>
        <FormField id="jobs-runs-from" label={t("admin-settings:jobs.runs.from")}>
          <Input
            id="jobs-runs-from"
            onChange={(event) => {
              change({ from: event.currentTarget.value });
            }}
            type="date"
            value={filters.from}
          />
        </FormField>
        <FormField id="jobs-runs-to" label={t("admin-settings:jobs.runs.to")}>
          <Input
            id="jobs-runs-to"
            onChange={(event) => {
              change({ to: event.currentTarget.value });
            }}
            type="date"
            value={filters.to}
          />
        </FormField>
        <Button
          disabled={!filtered}
          onClick={() => {
            setFilters(NO_RUN_FILTERS);
            setPage(0);
          }}
          variant="ghost"
        >
          {t("admin-settings:jobs.runs.clear")}
        </Button>
      </div>
      {loading || runs.error === undefined ? null : (
        <p className="jobs-card__runs-error" role="alert">
          {runs.error}{" "}
          <Button
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
            variant="ghost"
          >
            {t("admin-settings:jobs.retry")}
          </Button>
        </p>
      )}
      {!loading && runs.error !== undefined ? null : (
        <DataTable<JobRunListItem>
          caption={t("admin-settings:jobs.runs.caption")}
          columns={[
            {
              header: t("admin-settings:jobs.runs.when"),
              key: "when",
              render: (run) => (
                <button
                  className="jobs-card__link"
                  onClick={() => {
                    open(run.runId);
                  }}
                  type="button"
                >
                  {when(run.scheduledForLocal)}
                </button>
              ),
            },
            {
              header: t("admin-settings:jobs.runs.trigger"),
              key: "trigger",
              render: (run) =>
                run.trigger === undefined
                  ? t("admin-settings:jobs.none")
                  : t(`enums:jobTrigger.${run.trigger}`),
            },
            {
              header: t("admin-settings:jobs.runs.status"),
              key: "status",
              render: (run) =>
                run.status === undefined ? null : (
                  <Badge tone={STATUS_TONES[run.status]}>
                    {t(`enums:jobRunStatus.${run.status}`)}
                    {run.dryRun === true ? ` · ${t("admin-settings:jobs.dryRunTag")}` : ""}
                  </Badge>
                ),
            },
            {
              header: t("admin-settings:jobs.runs.effects"),
              key: "effects",
              render: (run) =>
                counterTexts(t, run.counters ?? {}).join(" · ") || t("admin-settings:jobs.none"),
            },
            {
              header: t("admin-settings:jobs.runs.errors"),
              key: "errors",
              render: (run) => String(run.errorCount ?? 0),
            },
          ]}
          empty={
            filtered
              ? t("admin-settings:jobs.runs.emptyFiltered")
              : t("admin-settings:jobs.runs.empty")
          }
          loading={loading}
          loadingLabel={t("admin-settings:common.loading")}
          rowKey={(run) => run.runId}
          rows={runs.items ?? []}
        />
      )}
      {totalPages > 1 ? (
        <nav aria-label={t("admin-settings:jobs.runs.pages")} className="jobs-card__pager">
          <Button
            disabled={loading || page === 0}
            onClick={() => {
              setPage((value) => Math.max(0, value - 1));
            }}
            variant="ghost"
          >
            {t("admin-settings:jobs.runs.previousPage")}
          </Button>
          <span>{t("admin-settings:jobs.runs.page", { page: page + 1, totalPages })}</span>
          <Button
            disabled={loading || page + 1 >= totalPages}
            onClick={() => {
              setPage((value) => value + 1);
            }}
            variant="ghost"
          >
            {t("admin-settings:jobs.runs.nextPage")}
          </Button>
        </nav>
      ) : null}
      {detail === undefined ? null : (
        <section aria-label={t("admin-settings:jobs.runs.detail")} className="jobs-card__run">
          <h3>{t("admin-settings:jobs.runs.detail")}</h3>
          {detail.error === undefined ? null : <p role="alert">{detail.error}</p>}
          {detail.run === undefined ? (
            detail.error === undefined ? (
              <Skeleton label={t("admin-settings:common.loading")} />
            ) : null
          ) : (
            <RunEffects client={client} onNavigate={onNavigate} run={detail.run} />
          )}
        </section>
      )}
    </Drawer>
  );
}

type JobEffectItem = JobRun["effects"]["items"][number];

/**
 * R-15-21: where the back office has a page for an effect's entity, the item links to it. A class
 * opens in D4 (its week comes from `GET /class-sessions/{id}`), a week in D4, a member in D10.
 */
function directPath(item: JobEffectItem): string | undefined {
  if (item.entityType === "Week" && isIsoDate(item.entityId)) {
    // The booking week's key is the day it opens (S08 R-08-01), any day of the week before its
    // classes (`bookings.weekOpensAt` is the club's): six days on is always in its classes' week.
    return `/calendari?${new URLSearchParams({ setmana: mondayOf(addDays(item.entityId, 6)) }).toString()}`;
  }
  if (item.entityType === "Member") return `/abonats/${encodeURIComponent(item.entityId)}`;
  return undefined;
}

/** A run's effects as the api delivers them: items «{entityType} {entityId} · {action}», counters, errors. */
function RunEffects({
  client,
  onNavigate,
  run,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
  run: JobRun;
}) {
  const { t } = useTranslation(["admin-settings", "enums", "errors"]);
  const counters = counterTexts(t, run.effects.counters);
  const [opening, setOpening] = useState<string>();
  const [openError, setOpenError] = useState<string>();
  // A lookup answered after the sheet closed (or showed another run) navigates nowhere.
  const shownRun = useRef<string | undefined>(run.runId);
  useEffect(() => {
    shownRun.current = run.runId;
    return () => {
      shownRun.current = undefined;
    };
  }, [run.runId]);

  const openClass = async (item: JobEffectItem) => {
    const forRun = run.runId;
    setOpening(item.entityId);
    setOpenError(undefined);
    try {
      const result = await client.GET("/class-sessions/{id}", {
        params: { path: { id: item.entityId } },
      });
      if (result.data === undefined) throw new TypeError("The class response had no data");
      if (shownRun.current === forRun) onNavigate(classCalendarPath(result.data));
    } catch (cause) {
      if (shownRun.current === forRun) setOpenError(errorText(t, cause));
    } finally {
      setOpening((value) => (value === item.entityId ? undefined : value));
    }
  };

  return (
    <div className="jobs-card__effects">
      <p>
        <Badge tone={STATUS_TONES[run.status]}>{t(`enums:jobRunStatus.${run.status}`)}</Badge>
        {counters.length === 0 ? null : ` ${counters.join(" · ")}`}
      </p>
      {run.effects.items.length === 0 ? (
        <p>{t("admin-settings:jobs.noItems")}</p>
      ) : (
        <ul>
          {run.effects.items.map((item) => {
            const text = t("admin-settings:jobs.item", {
              action: item.action,
              entityId: item.entityId,
              entityType: item.entityType,
            });
            const path = directPath(item);
            return (
              <li key={`${item.entityType}-${item.entityId}-${item.action}`}>
                {item.entityType === "ClassSession" ? (
                  <button
                    aria-busy={opening === item.entityId}
                    className="jobs-card__link"
                    disabled={opening !== undefined}
                    onClick={() => void openClass(item)}
                    type="button"
                  >
                    {text}
                  </button>
                ) : path === undefined ? (
                  text
                ) : (
                  <a
                    className="jobs-card__link"
                    href={path}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(path);
                    }}
                  >
                    {text}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {openError === undefined ? null : <p role="alert">{openError}</p>}
      {run.errors.length === 0 ? null : (
        <ul className="jobs-card__errors">
          {run.errors.map((error) => (
            <li key={error.traceId}>
              {t(`errors:${error.code}`, { defaultValue: error.message })}
              {error.entityId === null || error.entityId === undefined
                ? ""
                : ` · ${error.entityId}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Pending {
  kind: "dryRun" | "run" | "switch";
  name: string;
}

interface Confirm {
  job: JobSummary;
  kind: "disable" | "run";
}

/**
 * D11 «Processos automàtics» (S15 §2, no mockup: built with the design system, pending Josep's
 * validation in staging): one row per process the api lists (`GET /jobs`; a module that is off
 * leaves its row out), its cadence in club-local time, its last run, the switch, [Simula] and
 * [Executa ara] (R-15-08, R-15-09). ADMIN only; an impersonation token cannot use the routes, so
 * the api's `403 IMPERSONATION_DENIED` hides the rows and says why.
 */
export function JobsCard({
  children,
  client,
  onNavigate = (path) => {
    window.location.assign(path);
  },
  scheduleKey = "",
}: {
  children?: ReactNode;
  client: ApiClient;
  /** Opens a run effect's entity (R-15-21: D4, D10). */
  onNavigate?: (path: string) => void;
  /**
   * The versions of the parameters the processes' times come from (R-15-01): a saved change reads
   * `GET /jobs` again, so the new cadence shows at once.
   */
  scheduleKey?: string;
}) {
  const formats = useClubFormats();
  const { t } = useTranslation(["admin-settings", "enums", "errors"]);
  const [impersonating, setImpersonating] = useState(false);
  const [jobs, setJobs] = useState<JobSummary[]>();
  // «fa 2 h» counts from the moment the list arrived (a render never reads the clock).
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<Pending>();
  const [confirm, setConfirm] = useState<Confirm>();
  const [plan, setPlan] = useState<{ job: JobSummary; run: JobRun }>();
  const [runsOf, setRunsOf] = useState<JobSummary>();
  const [feedback, setFeedback] = useState<{ message: string; tone: Tone }>();
  const [modalError, setModalError] = useState<string>();
  const triggerKeys = useRef(new Map<string, string>());
  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  useEffect(() => {
    let current = true;
    client.GET("/jobs").then(
      ({ data }) => {
        if (!current) return;
        setJobs(data?.items ?? []);
        setLoadedAt(Date.now());
        setLoadError(undefined);
      },
      (cause: unknown) => {
        if (!current) return;
        if (isApiError(cause, "IMPERSONATION_DENIED")) setImpersonating(true);
        else setLoadError(errorText(t, cause));
      },
    );
    return () => {
      current = false;
    };
  }, [client, reload, scheduleKey, t]);

  const jobName = (job: JobSummary) => t(`admin-settings:jobs.name.${job.jobName}`);

  const cadence = (schedule: JobSummary["schedule"]) => {
    const time = clockTime(schedule.localTime ?? "");
    switch (schedule.kind) {
      case "DAILY":
        return t("admin-settings:jobs.cadence.DAILY", { time });
      case "WEEKLY": {
        const offset = WEEKDAY_OFFSETS[schedule.dayOfWeek ?? ""] ?? 0;
        const date = new Date(REFERENCE_MONDAY + offset * 86_400_000).toISOString().slice(0, 10);
        return t("admin-settings:jobs.cadence.WEEKLY", {
          day: formats.formatPlainDate(date, "weekdayLong"),
          time,
        });
      }
      case "MONTHLY":
        return t("admin-settings:jobs.cadence.MONTHLY", { day: schedule.dayOfMonth ?? "", time });
      default:
        return t("admin-settings:jobs.cadence.CONTINUOUS");
    }
  };

  const relative = (instant: string) => {
    const minutes = Math.max(0, Math.round((loadedAt - Date.parse(instant)) / 60_000));
    const format = new Intl.RelativeTimeFormat(INTL_LOCALES[formats.locale] ?? "ca-ES", {
      numeric: "always",
      style: "short",
    });
    if (minutes < 60) return format.format(-minutes, "minute");
    if (minutes < 24 * 60) return format.format(-Math.round(minutes / 60), "hour");
    return format.format(-Math.round(minutes / (24 * 60)), "day");
  };

  const lastRun = (job: JobSummary) => {
    const run = job.lastRun;
    if (run === null || run === undefined) return t("admin-settings:jobs.lastRun.never");
    const parts = [
      run.finishedAt === null || run.finishedAt === undefined
        ? t("enums:jobRunStatus.RUNNING")
        : `${relative(run.finishedAt)} · ${t(`enums:jobRunStatus.${run.status}`)}`,
      ...(run.dryRun ? [t("admin-settings:jobs.dryRunTag")] : []),
      ...counterTexts(t, run.counters),
    ];
    return parts.join(" · ");
  };

  /** 409 JOB_ALREADY_RUNNING, 404 MODULE_DISABLED and JOB_UNKNOWN (404, or 422 by rule 0): the list is read again. */
  const failed = (cause: unknown, inModal: boolean) => {
    const message = errorText(t, cause);
    if (inModal) setModalError(message);
    else setFeedback({ message, tone: "danger" });
    if (
      isApiError(cause, "JOB_ALREADY_RUNNING") ||
      isApiError(cause, "MODULE_DISABLED") ||
      isApiError(cause, "JOB_UNKNOWN")
    ) {
      refetch();
    }
  };

  const setEnabled = async (job: JobSummary, enabled: boolean) => {
    setPending({ kind: "switch", name: job.name });
    setFeedback(undefined);
    setModalError(undefined);
    try {
      const result = await client.PUT("/jobs/{name}/switch", {
        body: { enabled },
        params: { path: { name: job.name } },
      });
      const saved = result.data;
      if (saved !== undefined) {
        setJobs((current) =>
          current?.map((item) =>
            item.name === saved.name ? { ...item, enabled: saved.enabled } : item,
          ),
        );
      }
      setConfirm(undefined);
    } catch (cause) {
      failed(cause, confirm !== undefined);
    } finally {
      setPending(undefined);
    }
  };

  const trigger = async (job: JobSummary, dryRun: boolean) => {
    setPending({ kind: dryRun ? "dryRun" : "run", name: job.name });
    setFeedback(undefined);
    setModalError(undefined);
    // One Idempotency-Key per payload, kept only while its outcome is unknown (an answer lost to
    // the network): a retry then replays that run instead of running the process twice.
    const payload = `${job.name}|${String(dryRun)}`;
    const key = triggerKeys.current.get(payload) ?? crypto.randomUUID();
    triggerKeys.current.set(payload, key);
    try {
      const result = await client.POST("/jobs/{name}/trigger", {
        body: { dryRun },
        headers: { "Idempotency-Key": key },
        params: { path: { name: job.name } },
      });
      triggerKeys.current.delete(payload);
      const run = result.data;
      if (run === undefined) throw new TypeError("The run response did not contain data");
      if (dryRun) {
        setPlan({ job, run });
      } else {
        setConfirm(undefined);
        setFeedback({
          message: t("admin-settings:jobs.runDone", {
            name: jobName(job),
            summary: [
              t(`enums:jobRunStatus.${run.status}`),
              ...counterTexts(t, run.effects.counters),
            ].join(" · "),
          }),
          tone:
            run.status === "FAILED" ? "danger" : run.status === "PARTIAL" ? "warning" : "success",
        });
        refetch();
      }
    } catch (cause) {
      if (!isApiError(cause, "NETWORK")) triggerKeys.current.delete(payload);
      failed(cause, !dryRun);
    } finally {
      setPending(undefined);
    }
  };

  if (impersonating) {
    return (
      <Card className="settings-card jobs-card" id={JOBS_CARD_ID}>
        <h2>{t("admin-settings:jobs.title")}</h2>
        <p className="jobs-card__note">{t("admin-settings:jobs.impersonationNote")}</p>
      </Card>
    );
  }

  return (
    <Card
      aria-labelledby="jobs-card-title"
      className="settings-card jobs-card"
      id={JOBS_CARD_ID}
      role="region"
    >
      <h2 id="jobs-card-title">{t("admin-settings:jobs.title")}</h2>
      {feedback === undefined ? null : (
        <Toast
          dismissLabel={t("admin-settings:common.close")}
          onDismiss={() => {
            setFeedback(undefined);
          }}
          tone={feedback.tone}
        >
          {feedback.message}
        </Toast>
      )}
      {loadError === undefined ? null : (
        <Toast tone="danger">
          {loadError}{" "}
          <Button onClick={refetch} variant="ghost">
            {t("admin-settings:jobs.retry")}
          </Button>
        </Toast>
      )}
      {jobs === undefined ? (
        loadError === undefined ? (
          <Skeleton height="10rem" label={t("admin-settings:common.loading")} />
        ) : null
      ) : (
        <ul className="jobs-card__list">
          {jobs.map((job) => {
            const busy = pending !== undefined;
            const failedRun = job.lastRun?.status === "FAILED";
            return (
              <li
                className={job.enabled ? "jobs-card__row" : "jobs-card__row jobs-card__row--off"}
                data-job={job.name}
                key={job.name}
              >
                <div className="jobs-card__main">
                  <strong>{jobName(job)}</strong>
                  <span>{cadence(job.schedule)}</span>
                  <button
                    className={
                      failedRun ? "jobs-card__last jobs-card__last--failed" : "jobs-card__last"
                    }
                    onClick={() => {
                      setRunsOf(job);
                    }}
                    type="button"
                  >
                    {lastRun(job)}
                  </button>
                </div>
                <div className="jobs-card__actions">
                  <Switch
                    checked={job.enabled}
                    disabled={busy}
                    label={t("admin-settings:jobs.switchLabel", { name: jobName(job) })}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        void setEnabled(job, true);
                      } else {
                        setModalError(undefined);
                        setConfirm({ job, kind: "disable" });
                      }
                    }}
                  />
                  <Button
                    aria-label={t("admin-settings:jobs.dryRunLabel", { name: jobName(job) })}
                    disabled={busy}
                    loading={pending?.kind === "dryRun" && pending.name === job.name}
                    loadingLabel={t("admin-settings:jobs.running")}
                    onClick={() => void trigger(job, true)}
                    variant="secondary"
                  >
                    {t("admin-settings:jobs.dryRun")}
                  </Button>
                  <Button
                    aria-label={t("admin-settings:jobs.runLabel", { name: jobName(job) })}
                    disabled={busy}
                    onClick={() => {
                      setModalError(undefined);
                      setConfirm({ job, kind: "run" });
                    }}
                    variant="ghost"
                  >
                    {t("admin-settings:jobs.run")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {children === undefined || children === null ? null : (
        <div className="settings-parameters jobs-card__parameters">{children}</div>
      )}

      <Modal
        closeLabel={t("admin-settings:common.close")}
        onClose={() => {
          if (pending === undefined) setConfirm(undefined);
        }}
        open={confirm !== undefined}
        title={
          confirm === undefined
            ? ""
            : confirm.kind === "disable"
              ? t("admin-settings:jobs.disableTitle", { name: jobName(confirm.job) })
              : t("admin-settings:jobs.runTitle", { name: jobName(confirm.job) })
        }
      >
        <p>
          {confirm?.kind === "disable"
            ? t("admin-settings:jobs.disableConfirm")
            : t("admin-settings:jobs.runConfirm")}
        </p>
        {modalError === undefined ? null : <p role="alert">{modalError}</p>}
        <div className="jobs-card__modal-actions">
          <Button
            disabled={pending !== undefined}
            onClick={() => {
              setConfirm(undefined);
            }}
            variant="ghost"
          >
            {t("admin-settings:jobs.cancel")}
          </Button>
          <Button
            loading={pending !== undefined}
            loadingLabel={t("admin-settings:jobs.running")}
            onClick={() => {
              if (confirm === undefined) return;
              if (confirm.kind === "disable") void setEnabled(confirm.job, false);
              else void trigger(confirm.job, false);
            }}
            variant={confirm?.kind === "disable" ? "danger" : "primary"}
          >
            {confirm?.kind === "disable"
              ? t("admin-settings:jobs.disable")
              : t("admin-settings:jobs.run")}
          </Button>
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-settings:common.close")}
        onClose={() => {
          setPlan(undefined);
        }}
        open={plan !== undefined}
        title={
          plan === undefined
            ? ""
            : t("admin-settings:jobs.dryRunTitle", { name: jobName(plan.job) })
        }
      >
        {plan === undefined ? null : (
          <>
            <p className="jobs-card__note">{t("admin-settings:jobs.dryRunNote")}</p>
            <RunEffects client={client} onNavigate={onNavigate} run={plan.run} />
          </>
        )}
      </Modal>

      {runsOf === undefined ? null : (
        <RunsDrawer
          client={client}
          job={runsOf}
          onClose={() => {
            setRunsOf(undefined);
          }}
          onNavigate={onNavigate}
        />
      )}
    </Card>
  );
}
