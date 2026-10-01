import {
  type ApiClient,
  type AttendanceSheet,
  type AttendanceSheetRow,
  attendanceSheetTransport,
  type components,
  isApiError,
  saveFile,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AttendanceBadgeCycler,
  type AttendanceSheetNotice,
  type AttendanceSheetStart,
  type AttendanceState,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  ScheduleCell,
  ScheduleGrid,
  type ScheduleGridCell,
  type ScheduleRow,
  Skeleton,
  Toast,
  useAttendanceSheet,
  useBranding,
} from "@agilityhub/ui";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { addDays, dayLabel, isIsoDate, minutesOf, timeLabel } from "../planning/calendar-shared";
import { RingBlockCard } from "../training/RingBlockCard";

import "./week-agenda.css";

type InstructorWeek = components["schemas"]["InstructorWeek"];
type WeekCell = components["schemas"]["WeekCell"];
type Translate = ReturnType<typeof useTranslation>["t"];
type GridCell = WeekCell & ScheduleGridCell;

const STATES: readonly AttendanceState[] = ["PENDING", "PRESENT", "NOTIFIED", "NO_SHOW"];

/** D12's address: `?setmana=&instructor=&pista=` (S10 §2) and the selected class. */
interface AgendaQuery {
  /** The selected class (its attendance panel), kept for the way back from D13. */
  classe?: string | undefined;
  /** `me` = «Els meus»; none = «Tots» (R-10-01). */
  instructor?: string | undefined;
  pista?: string | undefined;
  /** Any day of the week; none = the api's today. */
  setmana?: string | undefined;
}

function readQuery(): AgendaQuery {
  const parameters = new URLSearchParams(window.location.search);
  const value = (name: string) => {
    const raw = parameters.get(name);
    return raw === null || raw === "" ? undefined : raw;
  };
  const setmana = value("setmana");
  return {
    classe: value("classe"),
    instructor: value("instructor"),
    pista: value("pista"),
    setmana: isIsoDate(setmana) ? setmana : undefined,
  };
}

/** Rewrites the address in place (no history entry): the back button returns to this week. */
function writeQuery(query: AgendaQuery): void {
  const parameters = new URLSearchParams();
  for (const name of ["setmana", "instructor", "pista", "classe"] as const) {
    const value = query[name];
    if (value !== undefined) parameters.set(name, value);
  }
  const search = parameters.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${search === "" ? "" : `?${search}`}`,
  );
}

/** The api's query of the week (and of its PDF): the same parameters for both (R-10-15). */
function apiQuery(query: AgendaQuery) {
  return {
    ...(query.setmana === undefined ? {} : { date: query.setmana }),
    ...(query.instructor === undefined ? {} : { instructorId: query.instructor }),
    ...(query.pista === undefined ? {} : { ringId: query.pista }),
  };
}

/** A failure by its code (`errors:<CODE>`), never the api's message (AGENTS rule 4). */
function errorText(t: Translate, error: unknown, fallback: string): string {
  return isApiError(error) && error.status !== 0
    ? t(`errors:${error.code}`, { defaultValue: t("errors:INTERNAL_ERROR") })
    : fallback;
}

function cellId(cell: WeekCell, index: number): string {
  return cell.classId ?? cell.trainingBookingId ?? cell.blockId ?? `${cell.kind}-${String(index)}`;
}

/** «dl»: the bare short weekday of a business date (mockup D12's legend). */
function bareWeekday(
  date: string,
  formatPlainDate: ReturnType<typeof useClubFormats>["formatPlainDate"],
) {
  return formatPlainDate(date, "weekdayShort").replaceAll(/[.,]/gu, "");
}

type WeekState =
  | { error: unknown; key: string; status: "error" }
  | { data: InstructorWeek; key: string; status: "ready" }
  | { key: string; status: "loading" };

/** `GET /instructor/week` for the query on screen; an answer for another query is dropped. */
function useWeek(client: ApiClient, query: AgendaQuery) {
  const [reload, setReload] = useState(0);
  const params = apiQuery(query);
  const queryKey = `${JSON.stringify(params)}|`;
  const key = `${queryKey}${String(reload)}`;
  const [state, setState] = useState<WeekState>({ key: "", status: "loading" });
  useEffect(() => {
    let current = true;
    // A refresh of the same week (after a save, a new block) keeps it on screen, even if it fails.
    const keep = (previous: WeekState, next: WeekState) =>
      previous.status === "ready" && previous.key.startsWith(queryKey) ? previous : next;
    client.GET("/instructor/week", { params: { query: params } }).then(
      ({ data }) => {
        if (!current) return;
        if (data === undefined) {
          const failed: WeekState = { error: new TypeError("No week"), key, status: "error" };
          setState((previous) => keep(previous, failed));
        } else {
          setState({ data, key, status: "ready" });
        }
      },
      (error: unknown) => {
        if (current) setState((previous) => keep(previous, { error, key, status: "error" }));
      },
    );
    return () => {
      current = false;
    };
    // `params` is rebuilt on every render; the request identity is `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  const retry = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  const shown =
    state.key === key || (state.status === "ready" && state.key.startsWith(queryKey))
      ? state
      : { key, status: "loading" as const };
  return { ...shown, retry };
}

/**
 * The unsaved choices of each class the caller opened, kept in this page's history entry: they
 * survive another class's panel and the way to D13 and back, and are rebased on the list read
 * again (`useAttendanceSheet`'s `start`). Only booking ids and states: no names in the history.
 */
const HISTORY_KEY = "agendaSheets";

function storedSheets(): Record<string, AttendanceSheetStart> {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null || !(HISTORY_KEY in state)) return {};
  const stored = (state as Record<string, unknown>)[HISTORY_KEY];
  return typeof stored === "object" && stored !== null
    ? (stored as Record<string, AttendanceSheetStart>)
    : {};
}

function storedSheet(classId: string): AttendanceSheetStart | undefined {
  const stored = storedSheets()[classId];
  return stored?.draft === undefined || Object.keys(stored.draft).length === 0 ? undefined : stored;
}

function storeSheet(
  classId: string,
  rows: readonly AttendanceSheetRow[],
  draft: Record<string, AttendanceState>,
) {
  const state: unknown = window.history.state;
  const base =
    typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {};
  // A class without unsaved choices keeps no entry.
  const sheets = Object.fromEntries(
    Object.entries(storedSheets()).filter(([id]) => id !== classId),
  );
  if (Object.keys(draft).length > 0) {
    sheets[classId] = {
      baseRows: rows.map((row) => ({
        bookingId: row.bookingId,
        final: row.final,
        state: row.state,
      })),
      draft,
    };
  }
  window.history.replaceState({ ...base, [HISTORY_KEY]: sheets }, "", window.location.href);
}

function noticeToast(t: Translate, notice: AttendanceSheetNotice) {
  switch (notice.kind) {
    case "saved":
      return { message: t("instructor:attendance.saved"), tone: "success" as const };
    case "stale":
      return { message: t("instructor:attendance.staleToast"), tone: "warning" as const };
    case "inProgress":
      // Not the save's answer: [DESA LA LLISTA] sends it again with the same key (E80).
      return { message: t("common:inProgress"), tone: "warning" as const };
    case "error":
      return {
        message: t(`errors:${notice.code}`, { defaultValue: t("errors:INTERNAL_ERROR") }),
        tone: "danger" as const,
      };
  }
}

function statusLine(
  t: Translate,
  row: AttendanceSheetRow,
  noShowNoticeTime: string,
): string | undefined {
  if (row.notice != null) {
    return t("instructor:agenda.noticeShort", {
      released: row.notice.seatReleased ? "yes" : "no",
      waitlist: row.notice.waitlistNotified ? "yes" : "no",
    });
  }
  if (row.state === "NO_SHOW") {
    return row.noShowNotice?.sentAt == null
      ? t("instructor:agenda.noShowNotice", { time: timeLabel(noShowNoticeTime) })
      : t("instructor:attendance.noticeAlreadySent");
  }
  return undefined;
}

function studentName(
  t: Translate,
  student: { dogName: string; handlerName?: string | null; memberFirstName: string },
) {
  return t("instructor:student.name", {
    dog: student.dogName,
    handler: student.handlerName ?? student.memberFirstName,
  });
}

/**
 * D12's attendance panel (S10 §2 row D12, R-10-02…R-10-06): the class's sheet under the grid, the
 * same `GET`/`PUT` as screen 21 (`attendanceSheetTransport` + `useAttendanceSheet`), each name a
 * link to D13, the badge that cycles, the status lines from the api's fields and [DESA LA LLISTA].
 */
function AttendancePanel({
  classId,
  client,
  onListChanged,
  onNavigate,
}: {
  classId: string;
  client: ApiClient;
  /** A save (or someone else's, seen by a 409) changed the list: the week is read again. */
  onListChanged: () => void;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["instructor", "enums", "errors", "common"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const transport = useMemo(() => attendanceSheetTransport(client, classId), [client, classId]);
  const [start] = useState(() => storedSheet(classId));
  const sheet = useAttendanceSheet(transport, start);
  const data: AttendanceSheet | undefined = sheet.status === "ready" ? sheet.sheet : undefined;
  const waitlistOn = branding.modules.includes("WAITLIST");
  const tasksOn = branding.modules.includes("TASKS");

  // The choices survive another class's panel and the way to D13 and back (this history entry).
  useEffect(() => {
    if (data !== undefined) storeSheet(classId, data.rows, sheet.draft);
  }, [classId, data, sheet.draft]);

  // The grid shows what the save changed (its «passar llista pendent» mark, `n/n`).
  const { notice } = sheet;
  useEffect(() => {
    if (notice?.kind === "saved" || notice?.kind === "stale") onListChanged();
  }, [notice, onListChanged]);

  if (sheet.status === "loading") {
    return (
      <Card className="week-agenda__panel">
        <Skeleton height="12rem" label={t("instructor:agenda.sheetLoading")} />
      </Card>
    );
  }
  if (sheet.status === "error") {
    return (
      <Card className="week-agenda__panel">
        <Toast tone="danger">
          <span className="week-agenda__error">
            {errorText(t, sheet.error, t("instructor:agenda.sheetLoadError"))}
            <Button onClick={sheet.refetch} variant="secondary">
              {t("instructor:agenda.retry")}
            </Button>
          </span>
        </Toast>
      </Card>
    );
  }
  const session = sheet.sheet.classSession;
  const cancelled = session.state === "CANCELLED";
  const toast = sheet.notice === undefined ? undefined : noticeToast(t, sheet.notice);
  const badgeLabels = Object.fromEntries(
    STATES.map((state) => [
      state,
      state === "PENDING"
        ? t("instructor:agenda.pendingMark")
        : t(`enums:attendanceStateShort.${state}`),
    ]),
  ) as Record<AttendanceState, string>;
  const waitlist = waitlistOn ? sheet.sheet.waitlist : undefined;
  const title = t("instructor:agenda.sheetTitle", {
    booked: session.booked,
    capacity: session.capacity,
    day: dayLabel(session.date, formats.formatPlainDate),
    description: session.displayDescription,
    instructor: session.instructorName ?? "none",
    ring: session.ring?.name ?? "none",
    time: timeLabel(session.startTime),
    waiting: waitlistOn ? (session.waiting ?? 0) : 0,
  });

  return (
    <Card className="week-agenda__panel">
      <h2 className="week-agenda__panel-title">{title}</h2>
      {cancelled ? <Toast tone="danger">{t("instructor:attendance.cancelledBanner")}</Toast> : null}
      {toast === undefined ? null : (
        <Toast
          dismissLabel={t("instructor:attendance.dismiss")}
          onDismiss={sheet.dismissNotice}
          tone={toast.tone}
        >
          {toast.message}
        </Toast>
      )}
      <ul className="week-agenda__rows">
        {sheet.sheet.rows.map((row) => {
          const name = studentName(t, row);
          const chosen: AttendanceState | undefined = sheet.draft[row.bookingId];
          const value = chosen ?? row.state;
          const line = statusLine(t, row, sheet.sheet.sheet.noShowNoticeTime);
          const href = `/alumnes/${encodeURIComponent(row.dogId)}`;
          return (
            // Stable hooks for the core specs (E6-W04 Q6): the booking and the state shown.
            <li
              className="week-agenda__row"
              data-attendance-state={value}
              data-booking-id={row.bookingId}
              key={row.bookingId}
            >
              <span className="week-agenda__who">
                <a
                  className="week-agenda__student"
                  href={href}
                  onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onNavigate(href);
                  }}
                >
                  {name}
                </a>
                {row.memberFullName === undefined ? null : (
                  <span className="week-agenda__owner">
                    {t("instructor:student.owner", { name: row.memberFullName })}
                  </span>
                )}
                {row.levelCode == null ? null : (
                  <Chip className="week-agenda__level">{row.levelCode}</Chip>
                )}
              </span>
              <span className="week-agenda__tasks">
                {tasksOn && row.pendingTasksCount !== undefined && row.pendingTasksCount > 0
                  ? t("instructor:attendance.pendingTasks", { count: row.pendingTasksCount })
                  : null}
              </span>
              <span className="week-agenda__status">{line}</span>
              <AttendanceBadgeCycler
                canMarkNotice={sheet.sheet.sheet.canMarkNotice}
                canMarkPresence={sheet.sheet.sheet.canMarkPresence}
                disabled={sheet.saving || cancelled}
                final={row.final}
                label={t("instructor:agenda.badge", {
                  name,
                  state: t(`enums:attendanceState.${value}`),
                })}
                labels={badgeLabels}
                onChange={(next) => {
                  sheet.choose(row.bookingId, next);
                }}
                value={value}
              />
            </li>
          );
        })}
      </ul>
      <div className="week-agenda__panel-footer">
        <span>
          {waitlist === undefined || waitlist.entries.length === 0
            ? null
            : t("instructor:agenda.waitingList", {
                names: waitlist.entries.map((entry) => studentName(t, entry)).join(" · "),
              })}
        </span>
        {cancelled ? null : (
          <Button
            disabled={sheet.changes.length === 0}
            loading={sheet.saving}
            loadingLabel={t("instructor:attendance.saving")}
            onClick={() => void sheet.save()}
            variant="secondary"
          >
            {t("instructor:agenda.saveSheet")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * A free-training booking (R-10-15): `training.slotMinutes` (its own length) out of the class
 * height. The half height clips a long «{guia} + {gos}» (review #6 of E6-W03), so the whole text is
 * the cell's name and tooltip, and the cell grows over the next row on hover, on keyboard focus,
 * and while pressed (a click keeps it open).
 */
function TrainingCellView({ cell }: { cell: WeekCell }): ReactNode {
  const { t } = useTranslation(["instructor"]);
  const [open, setOpen] = useState(false);
  const minutes = minutesOf(cell.endTime) - minutesOf(cell.time);
  const span = Math.min(Math.max(minutes / 60, 0.25), 1);
  const full = t("instructor:agenda.trainingFull", {
    ring: cell.ringName ?? "",
    time: timeLabel(cell.time),
    who: cell.who ?? "",
  });
  return (
    <div
      className={open ? "week-agenda__half week-agenda__half--open" : "week-agenda__half"}
      style={{ "--week-agenda-span": String(span) } as CSSProperties}
      title={full}
    >
      <ScheduleCell
        dashed
        label={full}
        onClick={() => {
          setOpen((value) => !value);
        }}
        plain
        selected={open}
        subtitle={t("instructor:agenda.trainingWho", {
          ring: cell.ringName ?? "",
          who: cell.who ?? "",
        })}
        title={t("instructor:agenda.training", { time: timeLabel(cell.time) })}
      />
    </div>
  );
}

function WeekCellView({
  cell,
  onSelect,
  selected,
}: {
  cell: WeekCell;
  onSelect: (classId: string) => void;
  selected: boolean;
}): ReactNode {
  const { t } = useTranslation(["instructor", "enums"]);
  const branding = useBranding();
  if (cell.kind === "TRAINING") return <TrainingCellView cell={cell} />;
  if (cell.kind === "BLOCK") {
    const reason = cell.reason === undefined ? "" : t(`enums:ringBlockReason.${cell.reason}`);
    return (
      <div className="week-agenda__block" title={cell.note ?? undefined}>
        <ScheduleCell
          dashed
          plain
          subtitle={t("instructor:agenda.blockReason", { reason, ring: cell.ringName ?? "" })}
          title={t("instructor:agenda.block", {
            from: timeLabel(cell.time),
            to: timeLabel(cell.endTime),
          })}
        />
      </div>
    );
  }
  const cancelled = cell.state === "CANCELLED";
  // R-10-15: FINISHED and CANCELLED classes are dimmed; only a cancelled one is struck through.
  const dimmed = cancelled || cell.state === "FINISHED";
  const waiting = branding.modules.includes("WAITLIST") ? (cell.waiting ?? 0) : 0;
  const where =
    cell.ringName == null
      ? t("instructor:agenda.classWhereNoRing", { instructor: cell.instructorName ?? "", waiting })
      : t("instructor:agenda.classWhere", {
          instructor: cell.instructorName ?? "",
          ring: cell.ringName,
          waiting,
        });
  return (
    <ScheduleCell
      color={cell.ringColor}
      marker={cell.attendanceStatus === "PENDING" ? t("instructor:day.pendingSheet") : undefined}
      meta={t("instructor:day.occupancy", {
        booked: cell.booked ?? 0,
        capacity: cell.capacity ?? 0,
      })}
      muted={dimmed}
      onClick={() => {
        if (cell.classId !== undefined) onSelect(cell.classId);
      }}
      selected={selected}
      struck={cancelled}
      subtitle={cancelled ? `${where} · ${t("enums:classState.CANCELLED")}` : where}
      title={cell.displayDescription ?? ""}
    />
  );
}

/**
 * D12 «Agenda de la setmana» (`/agenda?setmana=&instructor=&pista=`, S10 §2, R-10-15): the week
 * the api composes (dl–ds, Sunday only with items), the instructor and ring filters, the
 * synchronous PDF of the same query, and under the grid the selected class's attendance panel and
 * S09's «Reservar o bloquejar pista» card. INSTRUCTOR and ADMIN; the api decides everything shown.
 */
export function WeekAgendaPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["instructor", "enums", "errors"]);
  const formats = useClubFormats();
  const branding = useBranding();
  const [query, setQuery] = useState<AgendaQuery>(readQuery);
  const week = useWeek(client, query);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string>();
  const data = week.status === "ready" ? week.data : undefined;

  const update = useCallback((next: AgendaQuery) => {
    writeQuery(next);
    setQuery(next);
  }, []);

  // The selected class, while the week on screen shows it (another week or a filter hides it).
  const selected = data?.cells.find(
    (cell) => cell.kind === "CLASS" && cell.classId === query.classe,
  );
  const selectedId = selected?.classId;

  const days = useMemo(() => {
    if (data === undefined) return [];
    const list: string[] = [];
    for (let day = data.week.startDate; day <= data.week.endDate; day = addDays(day, 1))
      list.push(day);
    // Sunday only when a cell falls on it (R-10-15).
    const sunday = addDays(data.week.startDate, 6);
    if (!list.includes(sunday) && data.cells.some((cell) => cell.date === sunday))
      list.push(sunday);
    return list;
  }, [data]);

  const rows = useMemo((): ScheduleRow<GridCell>[] => {
    if (data === undefined) return [];
    const cells = data.cells.map((cell, index): GridCell => ({
      ...cell,
      columnId: cell.date,
      id: cellId(cell, index),
    }));
    return data.rows.map((time, index) => {
      const previous = data.rows[index - 1];
      return {
        cells: cells.filter((cell) => cell.time === time),
        // Thin lines at the hour boundaries only (mockup V6).
        className:
          previous !== undefined && previous.slice(0, 2) !== time.slice(0, 2)
            ? "week-agenda__hour"
            : undefined,
        id: time,
        label: timeLabel(time),
      };
    });
  }, [data]);

  const downloadPdf = async () => {
    if (data === undefined || pdfBusy) return;
    setPdfBusy(true);
    setPdfError(undefined);
    try {
      const { data: file } = await client.GET("/instructor/week/export", {
        headers: { Accept: "application/pdf" },
        params: {
          query: { ...apiQuery({ ...query, setmana: data.week.startDate }), format: "pdf" },
        },
        parseAs: "blob",
      });
      if (file === undefined) throw new TypeError("The PDF answer had no file");
      saveFile(file, `agenda-${data.week.startDate}.pdf`);
    } catch (error) {
      setPdfError(errorText(t, error, t("errors:INTERNAL_ERROR")));
    } finally {
      setPdfBusy(false);
    }
  };

  const trainingOn = branding.modules.includes("FREE_TRAINING");
  const instructorValue = query.instructor ?? "";
  const instructorName =
    instructorValue === ""
      ? t("instructor:agenda.all")
      : instructorValue === "me"
        ? t("instructor:agenda.mine")
        : (data?.filters.instructors.find((item) => item.id === instructorValue)?.shortName ??
          instructorValue);
  const range =
    data === undefined ? "" : formats.formatWeekRange(data.week.startDate, data.week.endDate);

  return (
    <section className="week-agenda">
      <header className="week-agenda__header">
        <h1 className="ah-sr-only">{t("instructor:agenda.title")}</h1>
        <div className="week-agenda__navigator">
          <IconButton
            className="week-agenda__arrow week-agenda__arrow--previous"
            disabled={data === undefined}
            icon="chev"
            label={t("instructor:agenda.previousWeek")}
            onClick={() => {
              if (data !== undefined)
                update({ ...query, classe: undefined, setmana: addDays(data.week.startDate, -7) });
            }}
          />
          {data?.week.relative === "CURRENT" ? (
            <strong className="week-agenda__current">{t("instructor:agenda.currentWeek")}</strong>
          ) : null}
          <IconButton
            className="week-agenda__arrow"
            disabled={data === undefined}
            icon="chev"
            label={t("instructor:agenda.nextWeek")}
            onClick={() => {
              if (data !== undefined)
                update({ ...query, classe: undefined, setmana: addDays(data.week.startDate, 7) });
            }}
          />
          {data === undefined ? null : (
            <span className="week-agenda__range">{t("instructor:agenda.range", { range })}</span>
          )}
        </div>
        <div
          aria-label={t("instructor:agenda.filters")}
          className="week-agenda__filters"
          role="group"
        >
          <label className="week-agenda__filter week-agenda__filter--instructor">
            <Icon aria-hidden="true" name="user" />
            <span className="ah-sr-only">{t("instructor:agenda.instructorLabel")}</span>
            <select
              aria-label={t("instructor:agenda.instructorLabel")}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update({ ...query, instructor: value === "" ? undefined : value });
              }}
              value={instructorValue}
            >
              <option value="">
                {t("instructor:agenda.instructorFilter", { value: t("instructor:agenda.all") })}
              </option>
              <option value="me">
                {t("instructor:agenda.instructorFilter", { value: t("instructor:agenda.mine") })}
              </option>
              {(data?.filters.instructors ?? []).map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {t("instructor:agenda.instructorFilter", { value: instructor.shortName })}
                </option>
              ))}
              {instructorValue !== "" &&
              instructorValue !== "me" &&
              !(data?.filters.instructors ?? []).some((item) => item.id === instructorValue) ? (
                <option value={instructorValue}>
                  {t("instructor:agenda.instructorFilter", { value: instructorName })}
                </option>
              ) : null}
            </select>
          </label>
          <label className="week-agenda__filter">
            <span className="ah-sr-only">{t("instructor:agenda.ringLabel")}</span>
            <select
              aria-label={t("instructor:agenda.ringLabel")}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update({ ...query, pista: value === "" ? undefined : value });
              }}
              value={query.pista ?? ""}
            >
              <option value="">{t("instructor:agenda.allRings")}</option>
              {(data?.filters.rings ?? []).map((ring) => (
                <option key={ring.id} value={ring.id}>
                  {ring.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={data === undefined}
            loading={pdfBusy}
            loadingLabel={t("instructor:agenda.pdfBusy")}
            onClick={() => void downloadPdf()}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="export" />
            {t("instructor:agenda.pdf")}
          </Button>
        </div>
      </header>
      {pdfError === undefined ? null : (
        <Toast
          dismissLabel={t("instructor:attendance.dismiss")}
          onDismiss={() => {
            setPdfError(undefined);
          }}
          tone="danger"
        >
          {pdfError}
        </Toast>
      )}
      {week.status === "loading" ? (
        <Skeleton height="20rem" label={t("instructor:agenda.loading")} />
      ) : null}
      {week.status === "error" ? (
        <Toast tone="danger">
          <span className="week-agenda__error">
            {errorText(t, week.error, t("instructor:agenda.loadError"))}
            {isApiError(week.error, "IMPERSONATION_DENIED") ? null : (
              <Button onClick={week.retry} variant="secondary">
                {t("instructor:agenda.retry")}
              </Button>
            )}
          </span>
        </Toast>
      ) : null}
      {data === undefined ? null : data.cells.length === 0 ? (
        <Card className="week-agenda__grid">
          <EmptyState
            description={t("instructor:agenda.emptyDescription")}
            icon="cal"
            title={t("instructor:agenda.empty")}
          />
        </Card>
      ) : (
        <Card className="week-agenda__grid">
          <ScheduleGrid<GridCell>
            columns={days.map((day) => ({
              id: day,
              label: dayLabel(day, formats.formatPlainDate),
            }))}
            footer={
              <p className="week-agenda__legend">
                {t("instructor:agenda.legend", {
                  day:
                    selected === undefined
                      ? ""
                      : bareWeekday(selected.date, formats.formatPlainDate),
                  // E6-W04 step 0c: the half height's minutes are the api's
                  // (`trainingSlotMinutes`, `training.slotMinutes`); `null` prints none.
                  minutes: data.trainingSlotMinutes ?? 0,
                  selected: selected === undefined ? "no" : "yes",
                  slot: data.trainingSlotMinutes == null ? "no" : "yes",
                  time: selected === undefined ? "" : timeLabel(selected.time),
                  training: trainingOn ? "yes" : "no",
                })}
              </p>
            }
            label={t("instructor:agenda.gridLabel", { range })}
            renderCell={(cell, isSelected) => (
              <WeekCellView
                cell={cell}
                onSelect={(classId) => {
                  update({ ...query, classe: classId });
                }}
                selected={isSelected}
              />
            )}
            rows={rows}
            selectedCellId={selectedId}
          />
        </Card>
      )}
      <div className="week-agenda__below">
        {selectedId === undefined ? (
          <span />
        ) : (
          <AttendancePanel
            classId={selectedId}
            client={client}
            key={selectedId}
            onListChanged={week.retry}
            onNavigate={onNavigate}
          />
        )}
        {/* A block made here shows in the grid at once (a read right after the write). */}
        <RingBlockCard client={client} onCreated={week.retry} />
      </div>
    </section>
  );
}
