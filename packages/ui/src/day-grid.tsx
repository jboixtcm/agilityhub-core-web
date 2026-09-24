import type { CSSProperties, MouseEvent } from "react";

import { ScheduleCell } from "./schedule-grid";

/** Column id of the «Sense» column (cells without `ringId`). */
export const DAY_GRID_NO_RING = "__no-ring__";

export type DayGridView = "instructor" | "member";

export type DayGridCellKind = "ACTIVITY" | "BLOCK" | "CLASS" | "OCCUPIED" | "TRAINING";

export interface DayGridColumnModel {
  id: string;
  label: string;
  color?: string | null | undefined;
}

export interface DayGridOccupancyModel {
  booked: number;
  capacity: number;
  waiting?: number | undefined;
}

/** One element of form D (`GET /day-grid`), as delivered by the api; `ringId: null` = «Sense». */
export interface DayGridCellModel {
  id: string;
  kind: DayGridCellKind;
  ringId: string | null;
  atRisk?: boolean | undefined;
  cancelled?: boolean | undefined;
  description?: string | undefined;
  instructorName?: string | null | undefined;
  occupancy?: DayGridOccupancyModel | undefined;
  /** Translated reason of `OCCUPIED` / `BLOCK` cells («entren.», «manteniment»). */
  reasonLabel?: string | undefined;
  /** Blocks draw a dashed outline; training bookings do not. */
  dashed?: boolean | undefined;
  /** Only pressable cells call `onCellPress`. */
  pressable?: boolean | undefined;
  title?: string | undefined;
  who?: readonly string[] | undefined;
}

export interface DayGridRowModel {
  time: string;
  cells: readonly DayGridCellModel[];
}

export interface DayGridLabels {
  /** Accessible name of the grid. */
  grid: string;
  /** Header of the time column (screen readers only). */
  time: string;
  /** «en risc ⚠» */
  atRisk: string;
  /** «anul·lada» */
  cancelled: string;
  /** «Ocupada» */
  occupied: string;
  /** «Entren.» */
  training: string;
  /** «Bloq.» */
  block: string;
  /** «Activitat · {title}» */
  activity: (title: string) => string;
}

export interface DayGridProps {
  columns: readonly DayGridColumnModel[];
  labels: DayGridLabels;
  noRingLabel: string;
  rows: readonly DayGridRowModel[];
  view: DayGridView;
  onCellPress?: ((cell: DayGridCellModel, element: HTMLElement) => void) | undefined;
  selectedCellId?: string | undefined;
  /** «+e» suffix of the instructor counts (`WAITLIST` module). */
  showWaiting?: boolean | undefined;
}

const SEPARATOR = " · ";

/** «08:30» → «8:30». */
export function dayGridTimeLabel(time: string): string {
  return time.replace(/^0(?=\d)/u, "");
}

/** Ring columns in api order, plus «Sense» only when a cell has no ring (R-06-12). */
export function dayGridColumns(
  columns: readonly DayGridColumnModel[],
  rows: readonly DayGridRowModel[],
  noRingLabel: string,
): DayGridColumnModel[] {
  const withoutRing = rows.some((row) => row.cells.some((cell) => cell.ringId === null));
  return [
    ...columns.filter((column) => column.id !== DAY_GRID_NO_RING),
    ...(withoutRing ? [{ id: DAY_GRID_NO_RING, label: noRingLabel }] : []),
  ];
}

function counts(occupancy: DayGridOccupancyModel, showWaiting: boolean): string {
  const waiting =
    showWaiting && occupancy.waiting !== undefined && occupancy.waiting > 0
      ? ` +${String(occupancy.waiting)}`
      : "";
  return `${String(occupancy.booked)}/${String(occupancy.capacity)}${waiting}`;
}

function joined(...parts: (string | null | undefined)[]): string {
  return parts.filter((part) => part !== undefined && part !== null && part !== "").join(SEPARATOR);
}

interface CellText {
  title: string;
  lines: string[];
  muted?: boolean;
  plain?: boolean;
  warning?: boolean;
}

/** What each role sees per element (R-06-12); the member view never renders counts. */
function cellText(
  cell: DayGridCellModel,
  view: DayGridView,
  labels: DayGridLabels,
  showWaiting: boolean,
): CellText | null {
  switch (cell.kind) {
    case "CLASS": {
      const title = cell.description ?? "";
      if (view === "member") {
        if (cell.cancelled === true) return null;
        if (cell.atRisk === true) return { lines: [labels.atRisk], title, warning: true };
        return { lines: [cell.instructorName ?? ""], title };
      }
      if (cell.cancelled === true) {
        return {
          lines: [joined(labels.cancelled, cell.instructorName)],
          muted: true,
          title,
        };
      }
      return {
        lines: [
          joined(
            cell.occupancy === undefined ? undefined : counts(cell.occupancy, showWaiting),
            cell.instructorName,
          ),
        ],
        title,
        warning: cell.atRisk === true,
      };
    }
    case "OCCUPIED":
      return { lines: [cell.reasonLabel ?? ""], plain: true, title: labels.occupied };
    case "TRAINING":
      return view === "member"
        ? { lines: [cell.reasonLabel ?? ""], plain: true, title: labels.occupied }
        : { lines: [...(cell.who ?? [])], plain: true, title: labels.training };
    case "BLOCK":
      return view === "member"
        ? { lines: [cell.reasonLabel ?? ""], plain: true, title: labels.occupied }
        : { lines: [cell.reasonLabel ?? ""], plain: true, title: labels.block };
    case "ACTIVITY":
      return { lines: [], title: labels.activity(cell.title ?? "") };
  }
}

/**
 * Screens 10 and 23 (and the desktop day views): rings × start times of form D. Pure presenter —
 * the page maps the api response and decides which cells are pressable.
 */
export function DayGrid({
  columns,
  labels,
  noRingLabel,
  onCellPress,
  rows,
  selectedCellId,
  showWaiting = false,
  view,
}: DayGridProps) {
  const allColumns = dayGridColumns(columns, rows, noRingLabel);
  const colorOf = new Map(allColumns.map((column) => [column.id, column.color]));
  const style = {
    gridTemplateColumns: `var(--ah-day-grid-time, 2.25rem) repeat(${String(allColumns.length)}, minmax(0, 1fr))`,
  } satisfies CSSProperties;

  return (
    <div aria-label={labels.grid} className="ah-day-grid" role="table" style={style}>
      <div className="ah-day-grid__row" role="row">
        <span className="ah-day-grid__corner" role="columnheader">
          <span className="ah-sr-only">{labels.time}</span>
        </span>
        {allColumns.map((column) => (
          <span
            className="ah-day-grid__column"
            data-colored={column.color === undefined || column.color === null ? undefined : ""}
            key={column.id}
            role="columnheader"
            style={
              column.color === undefined || column.color === null
                ? undefined
                : ({ "--schedule-color": column.color } as CSSProperties)
            }
          >
            {column.label}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div className="ah-day-grid__row" key={row.time} role="row">
          <span className="ah-day-grid__time" role="rowheader">
            {dayGridTimeLabel(row.time)}
          </span>
          {allColumns.map((column) => {
            const cells = row.cells
              .filter((cell) => (cell.ringId ?? DAY_GRID_NO_RING) === column.id)
              .map((cell) => ({ cell, text: cellText(cell, view, labels, showWaiting) }))
              .filter(
                (entry): entry is { cell: DayGridCellModel; text: CellText } => entry.text !== null,
              );
            return (
              <div className="ah-day-grid__slot" key={column.id} role="cell">
                {cells.length === 0 ? (
                  <span aria-hidden="true" className="ah-schedule-cell ah-schedule-cell--empty" />
                ) : (
                  cells.map(({ cell, text }) => (
                    <ScheduleCell
                      color={text.plain === true ? undefined : colorOf.get(column.id)}
                      dashed={text.plain === true && cell.dashed === true}
                      key={cell.id}
                      muted={text.muted === true}
                      onClick={
                        onCellPress !== undefined && cell.pressable === true
                          ? (event: MouseEvent<HTMLButtonElement>) => {
                              onCellPress(cell, event.currentTarget);
                            }
                          : undefined
                      }
                      plain={text.plain === true}
                      selected={cell.id === selectedCellId}
                      subtitle={text.lines.filter((line) => line !== "").join("\n")}
                      title={text.title}
                      warning={text.warning === true}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
