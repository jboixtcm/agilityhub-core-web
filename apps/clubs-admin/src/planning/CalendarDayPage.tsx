import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  ScheduleCell,
  ScheduleGrid,
  type ScheduleColumn,
  Skeleton,
  Toast,
  useBranding,
} from "@agilityhub/ui";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./planning.css";
import "./calendar.css";
import {
  addDays,
  type DayGridCell,
  parseFilter,
  timeLabel,
  useCalendarErrorMessage,
} from "./calendar-shared";
import { businessDate, mondayOf, useResource } from "./shared";
import type { DayView } from "./TemplateDayPage";

const NO_RING = "none";

interface DayCell {
  cell: DayGridCell;
  columnId: string;
  id: string;
}

function initialView(): DayView {
  return new URLSearchParams(window.location.search).get("vista") === "instructor"
    ? "instructor"
    : "ring";
}

/**
 * D4 day view (`/calendari/dia/:date`): the D3b layout fed by `GET /day-grid?view=instructor`
 * (form D) — per ring (rings of the response + «Sense») or per instructor. Read-only for everyone.
 */
export function CalendarDayPage({
  client,
  date,
  onNavigate = (path) => {
    window.location.assign(path);
  },
}: {
  client: ApiClient;
  date: string;
  onNavigate?: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const { formatDate } = useClubFormats();
  const branding = useBranding();
  const errorMessage = useCalendarErrorMessage();
  const waitlistEnabled = branding.modules.includes("WAITLIST");
  const [view, setView] = useState<DayView>(initialView);
  const [filter] = useState(() =>
    parseFilter(new URLSearchParams(window.location.search).get("estat")),
  );
  const grid = useResource(
    useCallback(async () => {
      const result = await client.GET("/day-grid", {
        params: { query: { date, view: "instructor" } },
      });
      if (result.data === undefined) throw new TypeError("Missing day grid");
      return result.data;
    }, [client, date]),
  );

  const data = grid.data?.date === date ? grid.data : undefined;
  const layout = useMemo(() => {
    if (data === undefined) return undefined;
    const cells = data.rows.flatMap((row) =>
      row.cells.map((cell, index) => ({
        cell,
        id: `${row.time}-${String(index)}`,
        time: row.time,
      })),
    );
    let columns: ScheduleColumn[];
    let columnOf: (cell: DayGridCell) => string | undefined;
    if (view === "ring") {
      const hasNoRing = cells.some(({ cell }) => cell.ringId === null || cell.ringId === undefined);
      columns = [
        ...data.columns
          .filter((column) => column.ringId !== null && column.ringId !== undefined)
          .map((column) => ({ color: column.color, id: column.ringId ?? "", label: column.name })),
        ...(hasNoRing ? [{ id: NO_RING, label: t("admin-scheduling:templates.day.noRing") }] : []),
      ];
      columnOf = (cell) => cell.ringId ?? NO_RING;
    } else {
      const names = [
        ...new Set(
          cells
            .filter(({ cell }) => cell.kind === "CLASS")
            .map(({ cell }) => cell.instructorName ?? "")
            .filter((name) => name !== ""),
        ),
      ];
      columns = names.map((name) => ({ id: name, label: name }));
      columnOf = (cell) =>
        cell.kind === "CLASS" && cell.instructorName !== null && cell.instructorName !== undefined
          ? cell.instructorName
          : undefined;
    }
    return {
      columns,
      rows: data.rows.map((row) => ({
        cells: row.cells.flatMap((cell, index): DayCell[] => {
          const columnId = columnOf(cell);
          return columnId === undefined
            ? []
            : [{ cell, columnId, id: `${row.time}-${String(index)}` }];
        }),
        id: row.time,
        label: timeLabel(row.time),
      })),
    };
  }, [data, t, view]);

  const ringName = (ringId: string | null | undefined) =>
    ringId === null || ringId === undefined
      ? t("admin-scheduling:calendar.cell.noRing")
      : (data?.columns.find((column) => column.ringId === ringId)?.name ?? "");
  const ringColor = (ringId: string | null | undefined) =>
    ringId === null || ringId === undefined
      ? null
      : (data?.columns.find((column) => column.ringId === ringId)?.color ?? null);

  const goToDay = (next: string) => {
    const params = new URLSearchParams({ estat: filter });
    if (view === "instructor") params.set("vista", "instructor");
    onNavigate(`/calendari/dia/${next}?${params.toString()}`);
  };

  const switchView = (next: DayView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "instructor") url.searchParams.set("vista", "instructor");
    else url.searchParams.delete("vista");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };

  const renderCell = ({ cell }: DayCell) => {
    if (cell.kind === "CLASS") {
      const occupancy = cell.occupancy;
      const meta =
        occupancy === undefined
          ? undefined
          : `${t("admin-scheduling:calendar.cell.counts", {
              booked: occupancy.booked,
              capacity: occupancy.capacity,
            })}${
              waitlistEnabled && (occupancy.waiting ?? 0) > 0
                ? ` ${t("admin-scheduling:calendar.cell.waiting", { count: occupancy.waiting ?? 0 })}`
                : ""
            }`;
      const cancelled = cell.state === "CANCELLED";
      const subtitle = view === "ring" ? (cell.instructorName ?? "") : ringName(cell.ringId);
      return (
        <ScheduleCell
          color={ringColor(cell.ringId)}
          label={[
            cell.description,
            meta,
            subtitle,
            cancelled ? t("enums:classState.CANCELLED") : undefined,
          ]
            .filter((value) => value !== undefined && value !== "")
            .join(" · ")}
          meta={meta}
          muted={cancelled}
          struck={cancelled}
          subtitle={subtitle}
          title={cell.description ?? ""}
          warning={cell.atRisk === true}
        />
      );
    }
    if (cell.kind === "TRAINING") {
      return (
        <ScheduleCell
          subtitle={view === "ring" ? undefined : ringName(cell.ringId)}
          title={t("admin-scheduling:calendar.day.training", { who: (cell.who ?? []).join(", ") })}
        />
      );
    }
    if (cell.kind === "ACTIVITY") {
      const title = t("admin-scheduling:calendar.cell.activity", { title: cell.title ?? "" });
      return (
        <ScheduleCell
          href={`/activitats/${cell.activityId ?? ""}`}
          icon="flag"
          label={title}
          title={title}
        />
      );
    }
    return (
      <ScheduleCell
        icon="cone"
        subtitle={cell.note ?? undefined}
        title={t("admin-scheduling:calendar.day.block", {
          reason:
            cell.reason === undefined
              ? ""
              : t(`enums:ringBlockReason.${cell.reason}`, { defaultValue: "" }),
        })}
      />
    );
  };

  const back = (
    <Button
      className="planning-back"
      onClick={() => {
        onNavigate(
          `/calendari?${new URLSearchParams({ estat: filter, setmana: mondayOf(date) }).toString()}`,
        );
      }}
      variant="ghost"
    >
      <Icon aria-hidden="true" className="planning-back__icon" name="chev" />
      {t("admin-scheduling:templates.day.back")}
    </Button>
  );

  return (
    <section className="planning-page calendar-page">
      <header className="planning-header">
        <h1>{t("admin-scheduling:calendar.title")}</h1>
        <Chip className="planning-template-chip">{formatDate(businessDate(date), "weekday")}</Chip>
        <div className="planning-day-selector">
          <IconButton
            className="planning-day-selector__previous"
            icon="chev"
            label={t("admin-scheduling:templates.day.previous")}
            onClick={() => {
              goToDay(addDays(date, -1));
            }}
          />
          <IconButton
            icon="chev"
            label={t("admin-scheduling:templates.day.next")}
            onClick={() => {
              goToDay(addDays(date, 1));
            }}
          />
        </div>
        <div
          aria-label={t("admin-scheduling:templates.day.viewLabel")}
          className="planning-segmented"
          role="group"
        >
          <button
            aria-pressed={view === "ring"}
            onClick={() => {
              switchView("ring");
            }}
            type="button"
          >
            {t("admin-scheduling:templates.day.byRing")}
          </button>
          <button
            aria-pressed={view === "instructor"}
            onClick={() => {
              switchView("instructor");
            }}
            type="button"
          >
            {t("admin-scheduling:templates.day.byInstructor")}
          </button>
        </div>
      </header>
      {grid.error === undefined ? null : (
        <div className="calendar-failure">
          <Toast tone="danger">{errorMessage(grid.error)}</Toast>
          <Button onClick={grid.reload} variant="ghost">
            {t("admin-scheduling:common.retry")}
          </Button>
        </div>
      )}
      {layout === undefined ? (
        grid.error === undefined ? (
          <Card className="planning-grid-card">
            <Skeleton height="16rem" label={t("admin-scheduling:common.loading")} />
          </Card>
        ) : null
      ) : layout.rows.length === 0 ? (
        <Card className="planning-grid-card">
          <EmptyState
            description={formatDate(businessDate(date), "weekday")}
            icon="cal"
            title={t("admin-scheduling:calendar.day.empty")}
          />
        </Card>
      ) : (
        <Card className="planning-grid-card">
          <ScheduleGrid<DayCell>
            columns={layout.columns}
            label={t("admin-scheduling:calendar.day.gridLabel", {
              day: formatDate(businessDate(date), "weekday"),
            })}
            renderCell={renderCell}
            rows={layout.rows}
          />
        </Card>
      )}
      {back}
    </section>
  );
}
