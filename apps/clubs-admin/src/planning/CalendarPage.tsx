import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Modal,
  ScheduleCell,
  ScheduleGrid,
  type ScheduleColumn,
  Skeleton,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import {
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import "./planning.css";
import "./calendar.css";
import {
  addDays,
  apiFilter,
  type CalendarFilter,
  type CalendarSettings,
  type CancellationPreview,
  type ClassSession,
  dayLabel,
  defaultCalendarSettings,
  Emphasized,
  errorCode,
  ICON_MARKER,
  isIsoDate,
  loadCalendarSettings,
  loadOpeningHours,
  parseFilter,
  type RingBlock,
  timeLabel,
  useCalendarErrorMessage,
  type WeekCalendar,
  type WeekListItem,
  WithIcon,
} from "./calendar-shared";
import { CancelClassModal, type CancellationReason, type ClassHeading } from "./CancelClassModal";
import { CreateClassDrawer } from "./CreateClassDrawer";
import { RingBlockDrawer, type RingBlockDrawerMode } from "./RingBlockDrawer";
import { SELECTED_CARD_ID, SelectedClassCard } from "./SelectedClassCard";
import {
  clubToday,
  loadPlanningCatalogs,
  mondayOf,
  type PlanningCatalogs,
  useResource,
} from "./shared";

type Relative = WeekCalendar["week"]["relative"];

interface Feedback {
  message: string;
  tone: Tone;
}

type CalendarCell =
  | { block: RingBlock; columnId: string; id: string; kind: "block" }
  | { columnId: string; id: string; kind: "class"; session: ClassSession };

function readQuery(): { filter: CalendarFilter; week: string | undefined } {
  const params = new URLSearchParams(window.location.search);
  const week = params.get("setmana");
  return { filter: parseFilter(params.get("estat")), week: isIsoDate(week) ? week : undefined };
}

function WeekSelector({
  label,
  nextDisabled,
  onMove,
  onSelect,
  options,
  previousDisabled,
  range,
  selected,
}: {
  label: string | undefined;
  nextDisabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onSelect: (monday: string) => void;
  options: readonly { label: string; monday: string }[];
  previousDisabled: boolean;
  range: string;
  selected: string | undefined;
}) {
  const { t } = useTranslation("admin-scheduling");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const closeOnFocusOut = (event: FocusEvent<HTMLElement>) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      container.current?.contains(event.relatedTarget) !== true
    ) {
      setOpen(false);
    }
  };
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") setOpen(false);
  };
  return (
    <div className="calendar-week" ref={container}>
      <IconButton
        className="calendar-week__previous"
        disabled={previousDisabled}
        icon="chev"
        label={t("admin-scheduling:calendar.week.previous")}
        onClick={() => {
          onMove(-1);
        }}
      />
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("admin-scheduling:calendar.week.select")}
        className="calendar-week__toggle"
        onBlur={closeOnFocusOut}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={closeOnEscape}
        type="button"
      >
        {label === undefined ? null : <strong>{label}</strong>}
        {label === undefined ? null : <span aria-hidden="true"> · </span>}
        <span>{range}</span>
      </button>
      <IconButton
        disabled={nextDisabled}
        icon="chev"
        label={t("admin-scheduling:calendar.week.following")}
        onClick={() => {
          onMove(1);
        }}
      />
      {open ? (
        <ul className="planning-tab__menu calendar-week__menu" role="menu">
          {options.map((option) => (
            <li key={option.monday} role="none">
              <button
                aria-checked={option.monday === selected}
                onBlur={closeOnFocusOut}
                onClick={() => {
                  setOpen(false);
                  onSelect(option.monday);
                }}
                onKeyDown={closeOnEscape}
                role="menuitemradio"
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * D4 · D4b · D4c — class calendar (`/calendari?estat=…&setmana=…`, S06 P5). The state filter is the
 * main control and chooses the initial week (R-06-09); INSTRUCTOR reads it without actions (A22 c).
 */
export function CalendarPage({
  client,
  onNavigate = (path) => {
    window.location.assign(path);
  },
  readOnly,
}: {
  client: ApiClient;
  onNavigate?: (path: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const branding = useBranding();
  const { formatPlainDate, formatWeekRange } = useClubFormats();
  const errorMessage = useCalendarErrorMessage();
  const waitlistEnabled = branding.modules.includes("WAITLIST");
  const currentMonday = useMemo(() => mondayOf(clubToday(branding.timeZone)), [branding.timeZone]);
  const [initial] = useState(readQuery);
  const [filter, setFilter] = useState<CalendarFilter>(initial.filter);
  /** `undefined` = the initial week of the filter (R-06-09), resolved below. */
  const [chosenMonday, setMonday] = useState<string | undefined>(() =>
    initial.week === undefined ? undefined : mondayOf(initial.week),
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [confirmValidation, setConfirmValidation] = useState(false);
  const [validating, setValidating] = useState(false);
  const [cancellation, setCancellation] = useState<{
    key: string;
    preview: CancellationPreview;
    reason: CancellationReason;
    session: ClassSession;
  }>();
  const [createOpen, setCreateOpen] = useState(false);
  const [blockDrawer, setBlockDrawer] = useState<RingBlockDrawerMode>();

  const weeks = useResource(
    useCallback(async (): Promise<WeekListItem[]> => {
      const result = await client.GET("/weeks", {
        params: { query: { filter: [`startDate:gte:${currentMonday}`], sort: ["startDate,asc"] } },
      });
      return result.data?.items ?? [];
    }, [client, currentMonday]),
  );
  const draftWeeks = useMemo(
    () =>
      (weeks.data ?? [])
        .filter((week) => week.classCounts.draft > 0)
        .map((week) => week.startDate)
        .sort(),
    [weeks.data],
  );

  // Initial week per filter (R-06-09): Actives / Anul·lades → the current week; Esborrany → the
  // first week ≥ the current one with drafts (the current one when there is none).
  const monday =
    chosenMonday ??
    (filter !== "esborrany"
      ? currentMonday
      : weeks.data === undefined
        ? undefined
        : (draftWeeks[0] ?? currentMonday));

  useEffect(() => {
    if (monday === undefined) return;
    const params = new URLSearchParams({ estat: filter, setmana: monday });
    const next = `${window.location.pathname}?${params.toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [filter, monday]);

  const week = useResource(
    useMemo(
      () =>
        monday === undefined
          ? undefined
          : async () => {
              const result = await client.GET("/weeks", {
                params: { query: { filter: [`startDate:eq:${monday}`] } },
              });
              return { item: result.data?.items[0], monday };
            },
      [client, monday],
    ),
  );
  const weekItem = week.data?.monday === monday ? week.data?.item : undefined;
  const weekKnown = week.data?.monday === monday;
  const calendarKey = weekItem === undefined ? undefined : `${weekItem.id}:${filter}`;
  const calendar = useResource(
    useMemo(
      () =>
        weekItem === undefined
          ? undefined
          : async () => {
              const result = await client.GET("/weeks/{id}/calendar", {
                params: { path: { id: weekItem.id }, query: { filter: apiFilter[filter] } },
              });
              if (result.data === undefined) throw new TypeError("Missing calendar");
              return { data: result.data, key: `${weekItem.id}:${filter}` };
            },
      [client, filter, weekItem],
    ),
  );
  const current = calendar.data?.key === calendarKey ? calendar.data?.data : undefined;
  const catalogs = useResource(useCallback(() => loadPlanningCatalogs(client), [client]));
  const settings = useResource(
    useCallback(
      async (): Promise<CalendarSettings> =>
        readOnly ? defaultCalendarSettings : loadCalendarSettings(client),
      [client, readOnly],
    ),
  );
  const openingHours = useResource(
    useCallback(async () => (readOnly ? {} : loadOpeningHours(client)), [client, readOnly]),
  );

  const cat: PlanningCatalogs | undefined = catalogs.data;
  const config = settings.data ?? defaultCalendarSettings;
  const ringsById = useMemo(
    () => new Map((cat?.rings ?? []).map((ring) => [ring.id, ring])),
    [cat],
  );
  const instructorsOf = useCallback(
    (ids: readonly string[]) =>
      ids
        .map((id) => cat?.instructors.find((instructor) => instructor.id === id)?.shortName)
        .filter((name): name is string => name !== undefined)
        .join(", "),
    [cat],
  );

  const relativeOf = (startDate: string): Relative =>
    startDate === currentMonday
      ? "CURRENT"
      : startDate === addDays(currentMonday, 7)
        ? "NEXT"
        : "OTHER";
  const relativeLabel = (relative: Relative) =>
    relative === "CURRENT"
      ? t("admin-scheduling:calendar.week.current")
      : relative === "NEXT"
        ? t("admin-scheduling:calendar.week.next")
        : undefined;
  const rangeOf = (startDate: string) =>
    t("admin-scheduling:calendar.week.range", {
      range: formatWeekRange(startDate, addDays(startDate, 6)),
    });

  const shownRelative: Relative | undefined =
    monday === undefined ? undefined : (current?.week.relative ?? relativeOf(monday));
  const weekOptions = useMemo(() => {
    const mondays = [...new Set([...(weeks.data ?? []).map((item) => item.startDate), monday])]
      .filter((value): value is string => value !== undefined)
      .sort();
    return mondays;
  }, [monday, weeks.data]);

  const previousDraft =
    monday === undefined ? undefined : draftWeeks.filter((value) => value < monday).at(-1);
  const nextDraft = monday === undefined ? undefined : draftWeeks.find((value) => value > monday);

  const reloadAll = () => {
    week.reload();
    calendar.reload();
    weeks.reload();
  };

  const changeFilter = (next: CalendarFilter) => {
    if (next === filter) return;
    setFilter(next);
    setSelectedId(undefined);
    setFeedback(undefined);
    setMonday(undefined);
  };

  const moveWeek = (direction: -1 | 1) => {
    if (monday === undefined) return;
    setSelectedId(undefined);
    setFeedback(undefined);
    if (filter === "esborrany") {
      const target = direction < 0 ? previousDraft : nextDraft;
      if (target !== undefined) setMonday(target);
      return;
    }
    setMonday(addDays(monday, direction * 7));
  };

  const selected = current?.classes.find((item) => item.id === selectedId);
  const headingOf = (session: ClassSession): ClassHeading => ({
    day: dayLabel(session.date, formatPlainDate),
    description: session.displayDescription,
    instructors: instructorsOf(session.instructorIds),
    ring:
      session.ringId === null || session.ringId === undefined
        ? t("admin-scheduling:classCard.noRing")
        : (ringsById.get(session.ringId)?.name ?? ""),
    time: timeLabel(session.startTime),
  });

  const selectClass = (id: string) => {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      document.getElementById(SELECTED_CARD_ID)?.focus();
    });
  };

  const startCancellation = async (session: ClassSession, reason: CancellationReason) => {
    try {
      const result = await client.GET("/class-sessions/{id}/cancellation-preview", {
        params: { path: { id: session.id } },
      });
      if (result.data === undefined) return;
      setCancellation({ key: crypto.randomUUID(), preview: result.data, reason, session });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "danger" });
    }
  };

  const confirmCancellation = async (adminText: string | undefined) => {
    if (cancellation === undefined) return;
    try {
      await client.POST("/class-sessions/{id}/cancellation", {
        body: {
          reason: cancellation.reason,
          ...(adminText === undefined ? {} : { adminText }),
        },
        params: {
          header: { "Idempotency-Key": cancellation.key },
          path: { id: cancellation.session.id },
        },
      });
    } catch (error) {
      if (errorCode(error) === "INVALID_STATE") calendar.reload();
      throw error;
    }
    setFeedback({
      message:
        cancellation.reason === "DELETED"
          ? t("admin-scheduling:calendar.deleted")
          : t("admin-scheduling:calendar.cancelled"),
      tone: "success",
    });
    setCancellation(undefined);
    reloadAll();
  };

  const validateWeek = async () => {
    if (current === undefined) return;
    setValidating(true);
    try {
      const result = await client.POST("/weeks/{id}/validation", {
        body: {},
        params: { path: { id: current.week.id } },
      });
      setFeedback({
        message: t("admin-scheduling:calendar.validation.done", {
          count: result.data?.validatedClassIds.length ?? current.draftCount,
        }),
        tone: "success",
      });
      setConfirmValidation(false);
      setSelectedId(undefined);
      setFilter("actives");
      setMonday(current.week.startDate);
      reloadAll();
    } catch (error) {
      setConfirmValidation(false);
      setFeedback({ message: errorMessage(error), tone: "danger" });
      calendar.reload();
    } finally {
      setValidating(false);
    }
  };

  const columns = useMemo((): ScheduleColumn[] => {
    if (monday === undefined) return [];
    const hasSunday =
      current !== undefined &&
      [
        ...current.classes.map((item) => item.date),
        ...current.ringBlocks.map((item) => item.date),
      ].includes(addDays(monday, 6));
    return Array.from({ length: hasSunday ? 7 : 6 }, (_, index) => {
      const date = addDays(monday, index);
      return {
        id: date,
        label: dayLabel(date, formatPlainDate),
        onSelect: () => {
          onNavigate(`/calendari/dia/${date}?${new URLSearchParams({ estat: filter }).toString()}`);
        },
      };
    });
  }, [current, filter, formatPlainDate, monday, onNavigate]);

  const rows = useMemo(
    () =>
      (current?.rows ?? []).map((time) => ({
        cells: [
          ...(current?.classes ?? [])
            .filter((session) => session.startTime === time)
            .map((session): CalendarCell => ({
              columnId: session.date,
              id: session.id,
              kind: "class",
              session,
            })),
          ...(current?.ringBlocks ?? [])
            .filter((block) => block.fromLocal === time)
            .map((block): CalendarCell => ({
              block,
              columnId: block.date,
              id: block.id,
              kind: "block",
            })),
        ],
        id: time,
        label: timeLabel(time),
      })),
    [current],
  );

  const countsOf = (session: ClassSession) =>
    `${t("admin-scheduling:calendar.cell.counts", {
      booked: session.counters.booked,
      capacity: session.capacity,
    })}${
      waitlistEnabled && session.counters.waiting > 0
        ? ` ${t("admin-scheduling:calendar.cell.waiting", { count: session.counters.waiting })}`
        : ""
    }`;

  const renderCell = (cell: CalendarCell, isSelected: boolean) => {
    if (cell.kind === "block") {
      const { block } = cell;
      const ringName = ringsById.get(block.ringId)?.name ?? "";
      if (block.activityId !== null && block.activityId !== undefined) {
        const title = t("admin-scheduling:calendar.cell.activity", {
          title: block.activityTitle ?? "",
        });
        return (
          <ScheduleCell
            href={`/activitats/${block.activityId}`}
            icon="flag"
            label={title}
            subtitle={`${ringName} · ${block.fromLocal}–${block.toLocal}`}
            title={title}
          />
        );
      }
      const title = t("admin-scheduling:calendar.cell.blocked", { ring: ringName });
      const subtitle = t("admin-scheduling:calendar.cell.blockDetail", {
        from: block.fromLocal,
        reason: t(`enums:ringBlockReason.${block.reason}`),
        to: block.toLocal,
      });
      return (
        <ScheduleCell
          icon="cone"
          label={`${title} · ${subtitle}`}
          onClick={
            readOnly
              ? undefined
              : () => {
                  setBlockDrawer({ block, kind: "edit" });
                }
          }
          subtitle={subtitle}
          title={title}
        />
      );
    }
    const { session } = cell;
    const ring =
      session.ringId === null || session.ringId === undefined
        ? undefined
        : ringsById.get(session.ringId);
    const cancelled = session.state === "CANCELLED";
    const subtitle = cancelled
      ? t("admin-scheduling:calendar.cell.cancelled", {
          reason:
            session.cancellation === null || session.cancellation === undefined
              ? ""
              : t(`enums:cancellationReason.${session.cancellation.reason}`),
        })
      : `${ring?.name ?? t("admin-scheduling:calendar.cell.noRing")} · ${instructorsOf(session.instructorIds)}`;
    const meta = session.state === "DRAFT" ? undefined : countsOf(session);
    const types = new Map((current?.inconsistencies ?? []).map((item) => [item.id, item.type]));
    const details = [
      meta,
      subtitle,
      session.state === "ACTIVE" ? undefined : t(`enums:classState.${session.state}`),
      ...session.inconsistencyIds
        .map((id) => types.get(id))
        .filter((type) => type !== undefined)
        .map((type) => t(`enums:inconsistencyType.${type}`)),
    ].filter((value): value is string => value !== undefined && value !== "");
    return (
      <ScheduleCell
        color={ring?.color ?? null}
        dashed={session.state === "DRAFT"}
        label={t("admin-scheduling:calendar.cell.label", {
          description: session.displayDescription,
          details: details.join(" · "),
          when: `${dayLabel(session.date, formatPlainDate)} ${timeLabel(session.startTime)}`,
        })}
        meta={meta}
        muted={cancelled}
        onClick={() => {
          selectClass(session.id);
        }}
        selected={isSelected}
        struck={cancelled}
        subtitle={subtitle}
        title={session.displayDescription}
        warning={session.inconsistencyIds.length > 0 || session.atRisk}
      />
    );
  };

  const range = monday === undefined ? "" : rangeOf(monday);
  const header = (
    <header className="planning-header calendar-header">
      <h1>{t("admin-scheduling:calendar.title")}</h1>
      <div
        aria-label={t("admin-scheduling:calendar.filter.label")}
        className="calendar-filter"
        role="group"
      >
        {(["actives", "esborrany", "anul·lades"] as const).map((value) => (
          <button
            aria-pressed={filter === value}
            key={value}
            onClick={() => {
              changeFilter(value);
            }}
            type="button"
          >
            {value === "actives"
              ? t("admin-scheduling:calendar.filter.actives")
              : value === "esborrany"
                ? t("admin-scheduling:calendar.filter.drafts")
                : t("admin-scheduling:calendar.filter.cancelled")}
          </button>
        ))}
      </div>
      <WeekSelector
        label={shownRelative === undefined ? undefined : relativeLabel(shownRelative)}
        nextDisabled={monday === undefined || (filter === "esborrany" && nextDraft === undefined)}
        onMove={moveWeek}
        onSelect={(value) => {
          setSelectedId(undefined);
          setFeedback(undefined);
          setMonday(value);
        }}
        options={weekOptions.map((value) => {
          const relative = relativeLabel(relativeOf(value));
          return {
            label: relative === undefined ? rangeOf(value) : `${relative} · ${rangeOf(value)}`,
            monday: value,
          };
        })}
        previousDisabled={
          monday === undefined || (filter === "esborrany" && previousDraft === undefined)
        }
        range={range}
        selected={monday}
      />
      {readOnly ? null : (
        <div className="planning-header__actions">
          <Button
            disabled={cat === undefined}
            onClick={() => {
              setCreateOpen(true);
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-scheduling:calendar.create")}
          </Button>
          <Button
            disabled={cat === undefined}
            onClick={() => {
              setBlockDrawer({ kind: "create" });
            }}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="cone" />
            {t("admin-scheduling:calendar.block")}
          </Button>
        </div>
      )}
    </header>
  );

  const failure = weeks.error ?? week.error ?? calendar.error ?? catalogs.error;
  const loading =
    monday === undefined ||
    cat === undefined ||
    !weekKnown ||
    (weekItem !== undefined && current === undefined);
  const empty =
    !loading &&
    (current === undefined || (current.classes.length === 0 && current.ringBlocks.length === 0));

  const footer = (
    <p className="planning-grid__hint calendar-footer">
      {filter === "esborrany" ? (
        t("admin-scheduling:calendar.footer.draft")
      ) : (
        <WithIcon
          icon={<Icon aria-hidden="true" name="cone" />}
          text={t("admin-scheduling:calendar.footer.active", { icon: ICON_MARKER })}
        />
      )}
    </p>
  );

  const inconsistencies = current?.inconsistencies ?? [];

  return (
    <section className="planning-page calendar-page">
      {header}
      {feedback === undefined ? null : (
        <Toast
          dismissLabel={t("admin-scheduling:common.close")}
          onDismiss={() => {
            setFeedback(undefined);
          }}
          tone={feedback.tone}
        >
          {feedback.message}
        </Toast>
      )}
      {failure === undefined ? null : (
        <div className="calendar-failure">
          <Toast tone="danger">{errorMessage(failure)}</Toast>
          <Button
            onClick={() => {
              weeks.reload();
              week.reload();
              calendar.reload();
              catalogs.reload();
            }}
            variant="ghost"
          >
            {t("admin-scheduling:common.retry")}
          </Button>
        </div>
      )}
      {loading && failure === undefined ? (
        <Card className="planning-grid-card">
          <div className="planning-skeleton">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton height="2.6rem" key={row} label={t("admin-scheduling:common.loading")} />
            ))}
          </div>
        </Card>
      ) : null}
      {!loading && empty ? (
        <Card className="planning-grid-card">
          <EmptyState description={range} icon="cal" title={t("admin-scheduling:calendar.empty")} />
          {footer}
        </Card>
      ) : null}
      {!loading && !empty && current !== undefined ? (
        <Card className="planning-grid-card">
          <ScheduleGrid<CalendarCell>
            className="calendar-grid"
            columns={columns}
            footer={footer}
            label={t("admin-scheduling:calendar.gridLabel", {
              range: formatWeekRange(current.week.startDate, current.week.endDate),
            })}
            renderCell={renderCell}
            rows={rows}
            selectedCellId={selectedId}
          />
        </Card>
      ) : null}

      <div className="planning-cards calendar-cards">
        {selected === undefined || cat === undefined ? null : (
          <SelectedClassCard
            catalogs={cat}
            client={client}
            heading={headingOf(selected)}
            key={`${selected.id}:${String(selected.version)}`}
            onCancel={(reason) => void startCancellation(selected, reason)}
            onClose={() => {
              setSelectedId(undefined);
            }}
            onConflict={(message) => {
              // Page-level: the refetch brings a new version and remounts the card.
              setFeedback({ message, tone: "danger" });
              calendar.reload();
            }}
            onSaved={() => {
              setFeedback({ message: t("admin-scheduling:calendar.saved"), tone: "success" });
              calendar.reload();
              weeks.reload();
            }}
            openingHours={openingHours.data ?? {}}
            readOnly={readOnly}
            session={selected}
            settings={config}
            waitlistEnabled={waitlistEnabled}
          />
        )}
        {filter === "esborrany" && current !== undefined ? (
          <Card
            aria-labelledby="calendar-validation-title"
            className="calendar-validation-card"
            role="region"
          >
            <h2 className="planning-card-title" id="calendar-validation-title">
              {t("admin-scheduling:calendar.validation.title")}
            </h2>
            <p className="calendar-validation-card__summary">
              <Emphasized
                phrase={t("admin-scheduling:calendar.validation.count", {
                  count: current.draftCount,
                })}
                text={(() => {
                  const summary = {
                    draftCount: current.draftCount,
                    range: formatWeekRange(current.week.startDate, current.week.endDate),
                  };
                  const weekLabel = relativeLabel(current.week.relative);
                  // Neither current nor next: only the range (step 1).
                  return weekLabel === undefined
                    ? t("admin-scheduling:calendar.validation.summaryRange", summary)
                    : t("admin-scheduling:calendar.validation.summary", { ...summary, weekLabel });
                })()}
              />
              {inconsistencies.length === 0 ? (
                <Badge tone="success">{t("admin-scheduling:calendar.validation.clean")}</Badge>
              ) : (
                <Badge tone="warning">
                  {t("admin-scheduling:calendar.validation.issues", {
                    count: inconsistencies.length,
                  })}
                </Badge>
              )}
            </p>
            <p className="calendar-validation-card__help">
              {t("admin-scheduling:calendar.validation.help", { count: current.draftCount })}
            </p>
            {readOnly ? null : (
              <Button
                disabled={!current.canValidate}
                onClick={() => {
                  setConfirmValidation(true);
                }}
              >
                <Icon aria-hidden="true" name="check" />
                {t("admin-scheduling:calendar.validation.submit")}
              </Button>
            )}
          </Card>
        ) : null}
        {current === undefined ? null : (
          <Card
            aria-labelledby="calendar-warnings-title"
            className="calendar-warnings-card"
            role="region"
          >
            <h2 className="planning-card-title" id="calendar-warnings-title">
              {t("admin-scheduling:calendar.warnings.title")}
            </h2>
            {inconsistencies.length === 0 ? (
              <p className="calendar-warnings-card__empty">
                {t("admin-scheduling:calendar.warnings.empty")}
              </p>
            ) : (
              <ul className="calendar-warnings">
                {inconsistencies.map((inconsistency) => {
                  const target = inconsistency.itemIds.find((id) =>
                    current.classes.some((session) => session.id === id),
                  );
                  return (
                    <li key={inconsistency.id}>
                      <button
                        disabled={target === undefined}
                        onClick={() => {
                          if (target !== undefined) selectClass(target);
                        }}
                        type="button"
                      >
                        <Icon aria-hidden="true" name="warn" />
                        {inconsistency.message}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Modal
        closeLabel={t("admin-scheduling:common.close")}
        onClose={() => {
          setConfirmValidation(false);
        }}
        open={confirmValidation && current !== undefined}
        title={t("admin-scheduling:calendar.validation.title")}
      >
        <p>{t("admin-scheduling:calendar.validation.help", { count: current?.draftCount ?? 0 })}</p>
        <div className="calendar-modal__actions">
          <Button
            onClick={() => {
              setConfirmValidation(false);
            }}
            variant="ghost"
          >
            {t("admin-scheduling:common.cancel")}
          </Button>
          <Button
            loading={validating}
            loadingLabel={t("admin-scheduling:common.saving")}
            onClick={() => void validateWeek()}
          >
            {t("admin-scheduling:calendar.validation.submit")}
          </Button>
        </div>
      </Modal>

      {readOnly || cancellation === undefined ? null : (
        <CancelClassModal
          heading={headingOf(cancellation.session)}
          onClose={() => {
            setCancellation(undefined);
          }}
          onConfirm={confirmCancellation}
          preview={cancellation.preview}
          reason={cancellation.reason}
        />
      )}
      {readOnly || !createOpen || cat === undefined ? null : (
        <CreateClassDrawer
          catalogs={cat}
          client={client}
          onClose={() => {
            setCreateOpen(false);
          }}
          onCreated={(session) => {
            setCreateOpen(false);
            setFeedback({
              message: t("admin-scheduling:calendar.createForm.done"),
              tone: "success",
            });
            setFilter(session.state === "DRAFT" ? "esborrany" : "actives");
            setMonday(mondayOf(session.date));
            setSelectedId(session.id);
            reloadAll();
          }}
          openingHours={openingHours.data ?? {}}
          settings={config}
          timeZone={branding.timeZone}
        />
      )}
      {readOnly || blockDrawer === undefined || cat === undefined ? null : (
        <RingBlockDrawer
          client={client}
          mode={blockDrawer}
          modules={branding.modules}
          onClose={() => {
            setBlockDrawer(undefined);
          }}
          onNavigate={onNavigate}
          onSaved={(message) => {
            setBlockDrawer(undefined);
            setFeedback({ message, tone: "success" });
            calendar.reload();
          }}
          openingHours={openingHours.data ?? {}}
          rings={cat.rings}
          settings={config}
          timeZone={branding.timeZone}
        />
      )}
    </section>
  );
}
