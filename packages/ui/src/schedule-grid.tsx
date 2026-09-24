import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/names";

function classes(...values: (false | string | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

/** Catalog colours (rings, levels) travel as a custom property, never as a literal style colour. */
function scheduleColorStyle(color: string | null | undefined): CSSProperties | undefined {
  return color === undefined || color === null || color === ""
    ? undefined
    : ({ "--schedule-color": color } as CSSProperties);
}

export interface ScheduleColumn {
  id: string;
  label: string;
  color?: string | null | undefined;
  onSelect?: (() => void) | undefined;
}

export interface ScheduleGridCell {
  columnId: string;
  id: string;
}

export interface ScheduleRow<Cell extends ScheduleGridCell> {
  cells: readonly Cell[];
  id: string;
  label: string;
  onSelect?: (() => void) | undefined;
  selectLabel?: string | undefined;
}

export interface ScheduleGridProps<Cell extends ScheduleGridCell> {
  columns: readonly ScheduleColumn[];
  label: string;
  renderCell: (cell: Cell, selected: boolean) => ReactNode;
  rows: readonly ScheduleRow<Cell>[];
  className?: string;
  footer?: ReactNode;
  renderEmpty?: ((row: ScheduleRow<Cell>, column: ScheduleColumn) => ReactNode) | undefined;
  selectedCellId?: string | undefined;
}

/**
 * Generic rows × columns grid with stacked cells (D3 week template, D3b day view, D4 calendar,
 * screens 10/23 day grids). Rows are separated by thin lines at the band limits.
 */
export function ScheduleGrid<Cell extends ScheduleGridCell>({
  className,
  columns,
  footer,
  label,
  renderCell,
  renderEmpty,
  rows,
  selectedCellId,
}: ScheduleGridProps<Cell>) {
  return (
    <div className={classes("ah-schedule-grid", className)}>
      <div className="ah-schedule-grid__scroll">
        <table
          className="ah-schedule-grid__table"
          style={{ "--schedule-columns": String(columns.length) } as CSSProperties}
        >
          <caption className="ah-sr-only">{label}</caption>
          <thead>
            <tr>
              <td className="ah-schedule-grid__corner" />
              {columns.map((column) => (
                <th
                  className={classes(
                    "ah-schedule-grid__column",
                    column.color !== undefined &&
                      column.color !== null &&
                      "ah-schedule-grid__column--colored",
                  )}
                  key={column.id}
                  scope="col"
                  style={scheduleColorStyle(column.color)}
                >
                  {column.onSelect === undefined ? (
                    <span className="ah-schedule-grid__column-label">{column.label}</span>
                  ) : (
                    <button
                      className="ah-schedule-grid__column-button"
                      onClick={column.onSelect}
                      type="button"
                    >
                      <span className="ah-schedule-grid__column-label">{column.label}</span>
                      <Icon aria-hidden="true" name="chev" />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="ah-schedule-grid__row" key={row.id}>
                <th className="ah-schedule-grid__row-label" scope="row">
                  {row.onSelect === undefined ? (
                    row.label
                  ) : (
                    <button
                      aria-label={row.selectLabel ?? row.label}
                      className="ah-schedule-grid__row-button"
                      onClick={row.onSelect}
                      type="button"
                    >
                      {row.label}
                    </button>
                  )}
                </th>
                {columns.map((column) => {
                  const cells = row.cells.filter((cell) => cell.columnId === column.id);
                  return (
                    <td className="ah-schedule-grid__slot" key={column.id}>
                      <div className="ah-schedule-grid__stack">
                        {cells.length === 0
                          ? (renderEmpty?.(row, column) ?? (
                              <span
                                aria-hidden="true"
                                className="ah-schedule-cell ah-schedule-cell--empty"
                              />
                            ))
                          : cells.map((cell) => (
                              <div className="ah-schedule-grid__item" key={cell.id}>
                                {renderCell(cell, cell.id === selectedCellId)}
                              </div>
                            ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export interface ScheduleCellProps {
  title: string;
  color?: string | null | undefined;
  /** D4b draft: dashed outline. */
  dashed?: boolean;
  /** Link cell (activity block → its page). */
  href?: string | undefined;
  icon?: IconName | undefined;
  label?: string | undefined;
  /** Bold counts after the title («4/5 +1»). */
  meta?: string | undefined;
  muted?: boolean;
  onClick?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** Occupied ring (training, block): grey text without background (screens 10/23). */
  plain?: boolean;
  selected?: boolean;
  /** Cancelled class: struck-through text (with `muted`). */
  struck?: boolean;
  subtitle?: string | undefined;
  warning?: boolean;
}

/**
 * One class in a schedule slot: line 1 = description (+ counts), line 2 = ring/instructors. Tinted
 * with the ring colour (`--schedule-color`); no colour = grey «sense pista» tone; `warning` =
 * inconsistency outline; `dashed` = draft; `muted` + `struck` = cancelled.
 */
export function ScheduleCell({
  color,
  dashed = false,
  href,
  icon,
  label,
  meta,
  muted = false,
  onClick,
  plain = false,
  selected = false,
  struck = false,
  subtitle,
  title,
  warning = false,
}: ScheduleCellProps) {
  const className = classes(
    "ah-schedule-cell",
    (color === undefined || color === null || color === "") && "ah-schedule-cell--neutral",
    dashed && "ah-schedule-cell--dashed",
    muted && "ah-schedule-cell--muted",
    plain && "ah-schedule-cell--plain",
    struck && "ah-schedule-cell--struck",
    selected && "ah-schedule-cell--selected",
    warning && "ah-schedule-cell--warning",
  );
  const content = (
    <>
      <span className="ah-schedule-cell__title">
        {icon === undefined ? null : <Icon aria-hidden="true" name={icon} />}
        {title}
        {meta === undefined || meta === "" ? null : (
          <strong className="ah-schedule-cell__meta">{meta}</strong>
        )}
      </span>
      {subtitle === undefined || subtitle === "" ? null : (
        <span className="ah-schedule-cell__subtitle">{subtitle}</span>
      )}
    </>
  );
  if (href !== undefined) {
    return (
      <a aria-label={label} className={className} href={href} style={scheduleColorStyle(color)}>
        {content}
      </a>
    );
  }
  return onClick === undefined ? (
    <div
      aria-label={label}
      className={className}
      role={label === undefined ? undefined : "group"}
      style={scheduleColorStyle(color)}
    >
      {content}
    </div>
  ) : (
    <button
      aria-label={label}
      aria-pressed={selected}
      className={className}
      onClick={onClick}
      style={scheduleColorStyle(color)}
      type="button"
    >
      {content}
    </button>
  );
}
