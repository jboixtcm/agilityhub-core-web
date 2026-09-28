import { type KeyboardEvent, useRef } from "react";

import type { Tone } from "./components";
import { Icon } from "./icons/Icon";

/** S10 §5: the state of one booking on the attendance sheet (screens 21 and D12). */
export type AttendanceState = "NO_SHOW" | "NOTIFIED" | "PENDING" | "PRESENT";

/** The four circles in the mockup order: white · green · yellow · red (mockup 21). */
export const ATTENDANCE_STATES: readonly AttendanceState[] = [
  "PENDING",
  "PRESENT",
  "NOTIFIED",
  "NO_SHOW",
];

/** The design-system tone of a state, as badges show it elsewhere (D12, D13, 22). */
export function attendanceTone(state: AttendanceState): Tone {
  switch (state) {
    case "PRESENT":
      return "success";
    case "NOTIFIED":
      return "warning";
    case "NO_SHOW":
      return "danger";
    case "PENDING":
      return "neutral";
  }
}

/** The api's permissions of one row (R-10-03), rendered as delivered. */
export interface AttendancePermissions {
  canMarkNotice: boolean;
  canMarkPresence: boolean;
  /** A saved NOTIFIED row is fixed. */
  final: boolean;
}

/**
 * Whether a circle can be chosen now (R-10-03): nothing on a `final` row; the yellow circle
 * («ha avisat») by `canMarkNotice`; white, green and red by `canMarkPresence`.
 */
export function canChooseAttendance(
  state: AttendanceState,
  { canMarkNotice, canMarkPresence, final }: AttendancePermissions,
): boolean {
  if (final) return false;
  return state === "NOTIFIED" ? canMarkNotice : canMarkPresence;
}

/** A row of the sheet as the api delivers it: its booking and its saved state. */
export interface AttendanceSheetRow {
  bookingId: string;
  final?: boolean;
  state: AttendanceState;
}

/** The caller's local choices, by booking. */
export type AttendanceDraft = Readonly<Record<string, AttendanceState>>;

/**
 * R-10-04: what `PUT /class-sessions/{id}/attendance` sends — only the rows whose local state
 * differs from the server row, in the sheet's order. An unchanged sheet sends nothing.
 */
export function diffSheet(
  rows: readonly AttendanceSheetRow[],
  draft: AttendanceDraft,
): { bookingId: string; state: AttendanceState }[] {
  return rows.flatMap((row) => {
    const state = draft[row.bookingId];
    return state === undefined || state === row.state ? [] : [{ bookingId: row.bookingId, state }];
  });
}

/**
 * R-10-04's merge after `409 STALE_VERSION`: the list becomes `details.current` (`serverRows`) and
 * only the caller's own edits (`touchedIds`) are reapplied, except on a row the other person
 * changed meanwhile (its state differs from `baseRows`, the list the caller edited) or that is now
 * `final`: those take the server's state. Everything else comes from the server.
 */
export function mergeSheet(
  serverRows: readonly AttendanceSheetRow[],
  draft: AttendanceDraft,
  touchedIds: ReadonlySet<string>,
  baseRows: readonly AttendanceSheetRow[] = [],
): Record<string, AttendanceState> {
  const base = new Map(baseRows.map((row) => [row.bookingId, row.state]));
  const merged: Record<string, AttendanceState> = {};
  for (const row of serverRows) {
    const mine = draft[row.bookingId];
    const theirs = base.has(row.bookingId) && base.get(row.bookingId) !== row.state;
    if (
      mine !== undefined &&
      touchedIds.has(row.bookingId) &&
      row.final !== true &&
      !theirs &&
      mine !== row.state
    ) {
      merged[row.bookingId] = mine;
    }
  }
  return merged;
}

export interface AttendanceCirclesProps {
  /** Inert while the sheet is being saved, whatever the permissions. */
  disabled?: boolean;
  /** The group's accessible name («Assistència de Laura + Duna»). */
  label: string;
  /** Each state's name (`enums:attendanceState.*`), the accessible name of its circle. */
  labels: Readonly<Record<AttendanceState, string>>;
  onChange: (state: AttendanceState) => void;
  permissions: AttendancePermissions;
  value: AttendanceState;
}

/**
 * The four circles of mockup 21 as one radio group (R-10-03): one tap chooses a state locally;
 * the arrow keys move among the circles that can be chosen. A `final` row, or a circle the api
 * does not allow now, is inert.
 */
export function AttendanceCircles({
  disabled = false,
  label,
  labels,
  onChange,
  permissions,
  value,
}: AttendanceCirclesProps) {
  const buttons = useRef(new Map<AttendanceState, HTMLButtonElement>());
  const enabled = disabled
    ? []
    : ATTENDANCE_STATES.filter((state) => canChooseAttendance(state, permissions));
  // The one tab stop of the group: the chosen circle, else the first one that can be chosen.
  const tabStop = enabled.includes(value) ? value : enabled[0];

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: AttendanceState) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 || enabled.length === 0) return;
    event.preventDefault();
    const index = enabled.indexOf(from);
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (next === undefined) return;
    buttons.current.get(next)?.focus();
    onChange(next);
  };

  return (
    <div
      aria-disabled={enabled.length === 0 || undefined}
      aria-label={label}
      className="ah-attendance"
      role="radiogroup"
    >
      {ATTENDANCE_STATES.map((state) => {
        const allowed = enabled.includes(state);
        const checked = state === value;
        return (
          <button
            aria-checked={checked}
            aria-label={labels[state]}
            className={`ah-attendance__circle ah-attendance__circle--${state.toLowerCase().replace("_", "-")}`}
            disabled={!allowed}
            key={state}
            onClick={() => {
              if (allowed && !checked) onChange(state);
            }}
            onKeyDown={(event) => {
              move(event, state);
            }}
            ref={(element) => {
              if (element === null) buttons.current.delete(state);
              else buttons.current.set(state, element);
            }}
            role="radio"
            tabIndex={state === tabStop ? 0 : -1}
            type="button"
          >
            {state === "PENDING" ? null : (
              <Icon aria-hidden="true" name={state === "NO_SHOW" ? "x" : "check"} />
            )}
          </button>
        );
      })}
    </div>
  );
}
