import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Button,
  DAY_GRID_NO_RING,
  type DayGridCellModel,
  type DayGridColumnModel,
  type DayGridLabels,
  type DayGridRowModel,
  Skeleton,
  Toast,
} from "@agilityhub/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { addDays, type DayGridApiCell, type DayGridResponse, weekChipDates } from "./useDayGrid";

type Translate = ReturnType<typeof useTranslation>["t"];
type FormatPlainDate = ReturnType<typeof useClubFormats>["formatPlainDate"];

/** «dt.» → «dt»: the chips and the header use the bare short weekday (mockups 10 and 23). */
function weekdayShort(date: string, formatPlainDate: FormatPlainDate) {
  return formatPlainDate(date, "weekdayShort").replaceAll(/[.,]/gu, "");
}

/** R-06-14: the selected day is a calendar date, formatted as the day it names in any zone. */
export function useDayLabel() {
  const { formatPlainDate } = useClubFormats();
  const { t } = useTranslation("home");
  return (date: string) =>
    t("home:today.dateHeader", {
      date: formatPlainDate(date, "dayMonth"),
      weekday: weekdayShort(date, formatPlainDate),
    });
}

/** AppBar «{title} ‹ dt 4 d'agost ›» + chips dl–ds of the ISO week of the selected day. */
export function DayScreenHeader({
  date,
  onDateChange,
  title,
}: {
  date: string;
  onDateChange: (date: string) => void;
  title: string;
}) {
  const { formatPlainDate } = useClubFormats();
  const { t } = useTranslation("home");
  const dayLabel = useDayLabel();

  return (
    <>
      <AppBar
        className="day-screen__bar"
        end={
          <div className="day-screen__date">
            <button
              aria-label={t("home:today.previousDay")}
              onClick={() => {
                onDateChange(addDays(date, -1));
              }}
              type="button"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <span aria-live="polite">{dayLabel(date)}</span>
            <button
              aria-label={t("home:today.nextDay")}
              onClick={() => {
                onDateChange(addDays(date, 1));
              }}
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        }
        title={<h1>{title}</h1>}
      />
      <div aria-label={t("home:today.weekDays")} className="day-screen__chips" role="group">
        {weekChipDates(date).map((chip) => (
          <button
            aria-pressed={chip === date}
            className="day-screen__chip"
            key={chip}
            onClick={() => {
              onDateChange(chip);
            }}
            type="button"
          >
            {t("home:today.dayChip", {
              day: String(Number(chip.slice(8, 10))),
              weekday: weekdayShort(chip, formatPlainDate),
            })}
          </button>
        ))}
      </div>
    </>
  );
}

export function useGridLabels(): DayGridLabels {
  const { t } = useTranslation(["home", "instructor", "enums"]);
  return {
    activity: (title) => t("home:today.activity", { title }),
    atRisk: t("home:today.atRisk"),
    block: t("instructor:overview.block"),
    cancelled: t("enums:classState.CANCELLED"),
    grid: t("home:today.grid"),
    occupied: t("home:today.occupied"),
    time: t("home:today.time"),
    training: t("instructor:overview.training"),
  };
}

/** Generic reason of an «Ocupada» / «Bloq.» cell (`enums:occupiedReason`, then `ringBlockReason`). */
export function reasonLabel(reason: DayGridApiCell["reason"], t: Translate): string | undefined {
  if (reason === undefined) return undefined;
  if (reason === "TRAINING") return t("enums:occupiedReason.TRAINING");
  if (reason === "MAINTENANCE") return t("enums:occupiedReason.MAINTENANCE");
  return t(`enums:ringBlockReason.${reason}`);
}

export function cellId(cell: DayGridApiCell, time: string, index: number): string {
  return (
    cell.classId ??
    cell.blockId ??
    cell.trainingBookingIds?.[0] ??
    (cell.activityId === undefined ? undefined : `${cell.activityId}-${time}`) ??
    `${time}-${cell.ringId ?? "none"}-${String(index)}`
  );
}

export interface MappedDayGrid {
  cellsById: ReadonlyMap<string, DayGridApiCell>;
  columns: DayGridColumnModel[];
  rows: DayGridRowModel[];
}

/** Form D → presenter models; the api decides visibility, nothing is derived here (A22 e). */
export function mapDayGrid(
  grid: DayGridResponse,
  t: Translate,
  pressable: (cell: DayGridApiCell) => boolean,
): MappedDayGrid {
  const cellsById = new Map<string, DayGridApiCell>();
  const rows = grid.rows.map((row) => ({
    cells: row.cells.map((cell, index): DayGridCellModel => {
      const id = cellId(cell, row.time, index);
      cellsById.set(id, cell);
      return {
        atRisk: cell.atRisk,
        cancelled: cell.state === "CANCELLED",
        dashed: cell.kind === "BLOCK" || (cell.kind === "OCCUPIED" && cell.reason !== "TRAINING"),
        description: cell.description,
        id,
        instructorName: cell.instructorName,
        kind: cell.kind,
        occupancy: cell.occupancy,
        pressable: pressable(cell),
        reasonLabel: reasonLabel(cell.reason, t),
        ringId: cell.ringId ?? null,
        title: cell.title,
        who: cell.who,
      };
    }),
    time: row.time,
  }));
  // Columns exactly as delivered, «Sense» included (`ringId: null`, label from the api).
  const columns = grid.columns.map((column) => ({
    color: column.color,
    id: column.ringId ?? DAY_GRID_NO_RING,
    label: column.shortName,
  }));
  return { cellsById, columns, rows };
}

export function ringName(
  grid: DayGridResponse,
  ringId: string | null | undefined,
): string | undefined {
  return grid.columns.find((column) => (column.ringId ?? null) === (ringId ?? null))?.name;
}

/** «08:30» → «8:30» */
export function timeLabel(time: string): string {
  return time.replace(/^0(?=\d)/u, "");
}

export function DayGridLoading() {
  const { t } = useTranslation("home");
  return (
    <Skeleton className="day-screen__skeleton" height="16rem" label={t("home:today.loading")} />
  );
}

export function DayGridError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("home");
  return (
    <Toast tone="danger">
      <span className="day-screen__error">
        {t("home:today.loadError")}
        <Button onClick={onRetry} type="button" variant="secondary">
          {t("home:today.retry")}
        </Button>
      </span>
    </Toast>
  );
}

export function DayScreen({ children }: { children: ReactNode }) {
  return <section className="day-screen">{children}</section>;
}
