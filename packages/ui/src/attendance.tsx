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

/** The sheet-wide permissions the api delivers (`sheet.canMarkPresence`, `sheet.canMarkNotice`). */
export type AttendanceSheetPermissions = Omit<AttendancePermissions, "final">;

/**
 * R-10-04's rebase of the caller's choices on a list just read (after `409 STALE_VERSION` it is
 * `details.current`; after any other refusal, the list read again): only the caller's own edits
 * (`touchedIds`) are reapplied, and never on a row the other person changed meanwhile (its state
 * differs from `baseRows`, the list the caller edited), nor a choice the list just read no longer
 * allows (R-10-03: a `final` row, the window closed, «ha avisat» switched off). Everything else
 * comes from the server. `baseRows` and `permissions` are required, so neither check can be
 * switched off by omission.
 */
export function mergeSheet(
  serverRows: readonly AttendanceSheetRow[],
  draft: AttendanceDraft,
  touchedIds: ReadonlySet<string>,
  baseRows: readonly AttendanceSheetRow[],
  permissions: AttendanceSheetPermissions,
): Record<string, AttendanceState> {
  const base = new Map(baseRows.map((row) => [row.bookingId, row.state]));
  const merged: Record<string, AttendanceState> = {};
  for (const row of serverRows) {
    const mine = draft[row.bookingId];
    const theirs = base.has(row.bookingId) && base.get(row.bookingId) !== row.state;
    if (
      mine !== undefined &&
      touchedIds.has(row.bookingId) &&
      !theirs &&
      mine !== row.state &&
      canChooseAttendance(mine, { ...permissions, final: row.final === true })
    ) {
      merged[row.bookingId] = mine;
    }
  }
  return merged;
}

export interface AttendanceCirclesProps {
  /**
   * Inert while the sheet is being saved, whatever the permissions. Unlike a circle the api does
   * not allow now, a locked one keeps its look: a save does not flash the list.
   */
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
  const available = ATTENDANCE_STATES.filter((state) => canChooseAttendance(state, permissions));
  const enabled = disabled ? [] : available;
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
            className={[
              "ah-attendance__circle",
              `ah-attendance__circle--${state.toLowerCase().replace("_", "-")}`,
              // Refused by the api's permissions (R-10-03), not merely locked by a save.
              ...(available.includes(state) ? [] : ["ah-attendance__circle--unavailable"]),
            ].join(" ")}
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

/**
 * The state a click on D12's badge moves to (mockup D12: «— → present → avisat → no presentat →
 * —»): the next one in that cycle the api allows now, skipping «avisat» without `canMarkNotice`.
 */
export function nextAttendanceState(
  value: AttendanceState,
  permissions: AttendancePermissions,
): AttendanceState {
  const from = ATTENDANCE_STATES.indexOf(value);
  for (let step = 1; step < ATTENDANCE_STATES.length; step += 1) {
    const next = ATTENDANCE_STATES[(from + step) % ATTENDANCE_STATES.length];
    if (next !== undefined && canChooseAttendance(next, permissions)) return next;
  }
  return value;
}

export interface AttendanceBadgeCyclerProps extends AttendancePermissions {
  /** Locked while the sheet is being saved (not faded, unlike an inert badge). */
  disabled?: boolean;
  /** The accessible name: who, and the state now («Assistència de Laura + Duna: present»). */
  label: string;
  /** The badge text of each state (`enums:attendanceStateShort.*`, «—» for `PENDING`). */
  labels: Readonly<Record<AttendanceState, string>>;
  onChange: (state: AttendanceState) => void;
  value: AttendanceState;
}

/**
 * D12's attendance control (mockup D12, S10 R-10-03): a badge in the state's tone that cycles on
 * each click (or Enter/Space), skipping «avisat» without `canMarkNotice`. It is inert on a `final`
 * row (a saved «ha avisat» never changes) and without `canMarkPresence`.
 */
export function AttendanceBadgeCycler({
  canMarkNotice,
  canMarkPresence,
  disabled = false,
  final,
  label,
  labels,
  onChange,
  value,
}: AttendanceBadgeCyclerProps) {
  const inert = final || !canMarkPresence;
  return (
    <button
      aria-label={label}
      className={[
        "ah-badge",
        `ah-tone--${attendanceTone(value)}`,
        "ah-attendance-badge",
        ...(inert ? ["ah-attendance-badge--inert"] : []),
      ].join(" ")}
      disabled={inert || disabled}
      onClick={() => {
        onChange(nextAttendanceState(value, { canMarkNotice, canMarkPresence, final }));
      }}
      type="button"
    >
      {labels[value]}
    </button>
  );
}
