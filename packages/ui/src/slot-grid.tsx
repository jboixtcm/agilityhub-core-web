import type { CSSProperties } from "react";

import { dayGridTimeLabel } from "./day-grid";

/** A cell's state and reason, as `GET /training-slots` sends them (S09 R-09-03). */
export type SlotCellState = "BLOCKED" | "BOOKED" | "FREE";
export type SlotCellReason = "CLASS" | "OWN_TRAINING" | "RING_BLOCK" | "TRAINING";

export interface SlotCellModel {
  /** The slot's id: `{ringId}_{startsAt}`, or the aggregate's own id («Qualsevol»). */
  id: string;
  columnId: string;
  state: SlotCellState;
  reason?: SlotCellReason | null;
  /**
   * A `FREE` cell that cannot be taken now (already started, out of the window: `bookable` of
   * R-09-04) is drawn taken. Defaults to `true`.
   */
  bookable?: boolean;
  /** «18:50»: the class's own start when the api sends it (instructor projection), else the row's. */
  classTime?: string | null;
  /** Instructor projection: who trains («Pau + Blat»), the block's reason or the class. */
  detail?: string | null;
  /** Marked after a `409 RING_BLOCK_CONFLICT` (R-09-11). */
  conflict?: boolean;
}

export interface SlotGridRow {
  /** Club-local `HH:mm` of the slot's start. */
  time: string;
  cells: SlotCellModel[];
}

export interface SlotGridColumn {
  id: string;
  label: string;
  color?: string | null;
  disabled?: boolean;
}

export interface SlotGridLabels {
  /** The grid's accessible name. */
  grid: string;
  /** The time column's header (several columns only). */
  time: string;
  /** «18:50 classe». */
  classLabel: (time: string) => string;
  /** «8:00 · meva»: the viewer's own training. */
  own: (time: string) => string;
  /** A cell's accessible name: «8:30, lliure». */
  cell: (time: string, state: string) => string;
  free: string;
  taken: string;
  /** Why a taken cell is taken («entrenament», «bloqueig»): its state in the accessible name. */
  reason?: (reason: SlotCellReason) => string;
}

export type SlotGridMode = "contiguous" | "single";

export interface SlotGridProps {
  columns: readonly SlotGridColumn[];
  rows: readonly SlotGridRow[];
  labels: SlotGridLabels;
  mode: SlotGridMode;
  selection?: { cellIds: readonly string[] };
  onCellPress?: (cell: SlotCellModel) => void;
  /** The selection the press leads to (`contiguousSelection` in `contiguous` mode). */
  onSelectionChange?: (cellIds: string[]) => void;
}

type Variant = "class" | "free" | "own" | "taken";

/** How a cell is drawn: only a bookable `FREE` cell can be pressed. */
export function slotCellVariant(cell: SlotCellModel): Variant {
  if (cell.state === "FREE") return cell.bookable === false ? "taken" : "free";
  if (cell.reason === "CLASS") return "class";
  if (cell.reason === "OWN_TRAINING") return "own";
  return "taken";
}

export function isSlotCellPressable(cell: SlotCellModel): boolean {
  return slotCellVariant(cell) === "free";
}

/**
 * The next selection of a column when `pressed` is pressed, never with a gap (screen 24,
 * R-09-11): the first press selects the cell; a neighbour of the run extends it; an end of the
 * run leaves it; a farther cell fills the range when every cell between can be pressed, and
 * starts a new run otherwise; an inert cell changes nothing.
 */
export function contiguousSelection(
  cells: readonly SlotCellModel[],
  current: readonly string[],
  pressed: string,
): string[] {
  const index = cells.findIndex((cell) => cell.id === pressed);
  const target = cells[index];
  if (target === undefined || !isSlotCellPressable(target)) return [...current];
  const selected = cells
    .map((cell, position) => (current.includes(cell.id) ? position : -1))
    .filter((position) => position >= 0);
  const first = selected[0];
  const last = selected.at(-1);
  if (first === undefined || last === undefined) return [pressed];
  if (index === first || index === last) {
    return first === last
      ? []
      : cells
          .slice(index === first ? first + 1 : first, index === last ? last : last + 1)
          .map((cell) => cell.id);
  }
  if (index > first && index < last) return [pressed];
  const from = Math.min(first, index);
  const to = Math.max(last, index);
  const range = cells.slice(from, to + 1);
  return range.every(isSlotCellPressable) ? range.map((cell) => cell.id) : [pressed];
}

function cellText(cell: SlotCellModel, time: string, labels: SlotGridLabels): string {
  const variant = slotCellVariant(cell);
  if (variant === "class") return labels.classLabel(dayGridTimeLabel(cell.classTime ?? time));
  if (variant === "own") return labels.own(time);
  return time;
}

/**
 * S09 screens 08 and 24 (and later time × ring views): half-hour slots per ring. A single column
 * lays its times out three to a row, as the mockups do; several columns make a time × ring table
 * with identical column widths. Cells follow the api's `state`/`reason`: free (outlined in the
 * primary colour, pressable), taken (struck, inert), class («18:50 classe», dimmed, inert), own
 * training (the «meva» tone, inert), selected (filled). A pure presenter: the page decides what
 * is selected and what a press does.
 */
export function SlotGrid({
  columns,
  labels,
  mode,
  onCellPress,
  onSelectionChange,
  rows,
  selection,
}: SlotGridProps) {
  const selected = selection?.cellIds ?? [];
  const press = (cell: SlotCellModel) => {
    if (!isSlotCellPressable(cell)) return;
    onCellPress?.(cell);
    if (onSelectionChange === undefined) return;
    if (mode === "single") {
      onSelectionChange([cell.id]);
      return;
    }
    const columnCells = rows.flatMap((row) =>
      row.cells.filter((candidate) => candidate.columnId === cell.columnId),
    );
    onSelectionChange(contiguousSelection(columnCells, selected, cell.id));
  };

  const renderCell = (cell: SlotCellModel, time: string) => {
    const variant = slotCellVariant(cell);
    const isSelected = selected.includes(cell.id);
    const text = cellText(cell, time, labels);
    const takenBy =
      cell.reason === null || cell.reason === undefined || labels.reason === undefined
        ? labels.taken
        : labels.reason(cell.reason);
    const state = variant === "free" ? labels.free : variant === "taken" ? takenBy : text;
    const className = [
      "ah-slot",
      `ah-slot--${variant}`,
      isSelected ? "ah-slot--selected" : "",
      cell.conflict === true ? "ah-slot--conflict" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const pressable = variant === "free";
    return (
      <button
        aria-label={labels.cell(time, state)}
        aria-pressed={pressable ? isSelected : undefined}
        className={className}
        disabled={!pressable}
        key={cell.id}
        onClick={() => {
          press(cell);
        }}
        title={cell.detail ?? undefined}
        type="button"
      >
        <span className="ah-slot__time">{text}</span>
        {cell.detail === null || cell.detail === undefined || cell.detail === "" ? null : (
          <span className="ah-slot__detail">{cell.detail}</span>
        )}
      </button>
    );
  };

  if (columns.length <= 1) {
    const column = columns[0];
    return (
      <div aria-label={labels.grid} className="ah-slot-grid ah-slot-grid--flow" role="group">
        {rows.flatMap((row) =>
          row.cells
            .filter((cell) => column === undefined || cell.columnId === column.id)
            .map((cell) => renderCell(cell, dayGridTimeLabel(row.time))),
        )}
      </div>
    );
  }

  const style = {
    gridTemplateColumns: `var(--ah-slot-grid-time, 2.75rem) repeat(${String(columns.length)}, minmax(0, 1fr))`,
  } satisfies CSSProperties;
  return (
    <div
      aria-label={labels.grid}
      className="ah-slot-grid ah-slot-grid--table"
      role="table"
      style={style}
    >
      <div className="ah-slot-grid__row" role="row">
        <span className="ah-slot-grid__corner" role="columnheader">
          <span className="ah-sr-only">{labels.time}</span>
        </span>
        {columns.map((column) => (
          <span
            className="ah-slot-grid__column"
            data-disabled={column.disabled === true ? "" : undefined}
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
        <div className="ah-slot-grid__row" key={row.time} role="row">
          <span className="ah-slot-grid__time" role="rowheader">
            {dayGridTimeLabel(row.time)}
          </span>
          {columns.map((column) => {
            const cell = row.cells.find((candidate) => candidate.columnId === column.id);
            return (
              <div className="ah-slot-grid__slot" key={column.id} role="cell">
                {cell === undefined ? null : renderCell(cell, dayGridTimeLabel(row.time))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
