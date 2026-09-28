import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ATTENDANCE_STATES,
  AttendanceCircles,
  type AttendanceState,
  attendanceTone,
  canChooseAttendance,
  diffSheet,
  mergeSheet,
} from "./index";

const labels: Record<AttendanceState, string> = {
  NO_SHOW: "no presentat",
  NOTIFIED: "ha avisat",
  PENDING: "pendent",
  PRESENT: "present",
};

const open = { canMarkNotice: true, canMarkPresence: true, final: false };

function Circles({
  initial = "PENDING",
  onChange = () => undefined,
  permissions = open,
}: {
  initial?: AttendanceState;
  onChange?: (state: AttendanceState) => void;
  permissions?: typeof open;
}) {
  const [value, setValue] = useState<AttendanceState>(initial);
  return (
    <AttendanceCircles
      label="Assistència de Marc + Chun-li"
      labels={labels}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      permissions={permissions}
      value={value}
    />
  );
}

describe("E6-W01 step 3 AttendanceCircles (S10 R-10-03, mockup 21)", () => {
  it("renders the four circles white · green · yellow · red as one radio group", () => {
    render(<Circles />);
    const group = screen.getByRole("radiogroup", { name: "Assistència de Marc + Chun-li" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-label")),
    ).toEqual(["pendent", "present", "ha avisat", "no presentat"]);
    expect(within(group).getByRole("radio", { name: "pendent" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(ATTENDANCE_STATES).toEqual(["PENDING", "PRESENT", "NOTIFIED", "NO_SHOW"]);
  });

  it("a tap chooses a state; the arrow keys move to the next circle that can be chosen", () => {
    const onChange = vi.fn();
    render(<Circles onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "present" }));
    expect(onChange).toHaveBeenLastCalledWith("PRESENT");
    const present = screen.getByRole("radio", { name: "present" });
    expect(present).toHaveAttribute("aria-checked", "true");
    expect(present).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(present, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("NOTIFIED");
    expect(screen.getByRole("radio", { name: "ha avisat" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "ha avisat" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("radio", { name: "no presentat" }), { key: "ArrowRight" });
    // Wraps around to the first circle.
    expect(onChange).toHaveBeenLastCalledWith("PENDING");
  });

  it("a final (saved NOTIFIED) row is inert: no circle can be chosen or focused", () => {
    const onChange = vi.fn();
    render(
      <Circles initial="NOTIFIED" onChange={onChange} permissions={{ ...open, final: true }} />,
    );
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAttribute("aria-disabled", "true");
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
      fireEvent.click(radio);
    }
    expect(screen.getByRole("radio", { name: "ha avisat" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("canMarkPresence gates white, green and red; canMarkNotice gates yellow", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <Circles onChange={onChange} permissions={{ ...open, canMarkPresence: false }} />,
    );
    expect(screen.getByRole("radio", { name: "pendent" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "present" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "no presentat" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "ha avisat" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "present" }));
    expect(onChange).not.toHaveBeenCalled();
    unmount();

    render(<Circles permissions={{ ...open, canMarkNotice: false }} />);
    expect(screen.getByRole("radio", { name: "ha avisat" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "present" })).toBeEnabled();
  });

  it("canChooseAttendance and attendanceTone follow R-10-03 and the badge tones", () => {
    expect(canChooseAttendance("NOTIFIED", { ...open, canMarkNotice: false })).toBe(false);
    expect(canChooseAttendance("PRESENT", { ...open, canMarkNotice: false })).toBe(true);
    expect(canChooseAttendance("PENDING", { ...open, final: true })).toBe(false);
    expect(ATTENDANCE_STATES.map(attendanceTone)).toEqual([
      "neutral",
      "success",
      "warning",
      "danger",
    ]);
  });
});

describe("E6-W01 step 3 diffSheet and mergeSheet (S10 R-10-04)", () => {
  const rows = [
    { bookingId: "b1", state: "PRESENT" as const },
    { bookingId: "b2", state: "PENDING" as const },
    { bookingId: "b3", final: true, state: "NOTIFIED" as const },
    { bookingId: "b4", state: "NO_SHOW" as const },
  ];

  it("diffSheet sends only the rows whose local state differs, in the sheet's order", () => {
    expect(diffSheet(rows, {})).toEqual([]);
    expect(diffSheet(rows, { b1: "PRESENT", b4: "PENDING", b2: "PRESENT" })).toEqual([
      { bookingId: "b2", state: "PRESENT" },
      { bookingId: "b4", state: "PENDING" },
    ]);
  });

  it("mergeSheet keeps the caller's edits on the rows only the caller touched and takes the rest from details.current", () => {
    // R-10-04's example: Estel saved Laura=present meanwhile (b1 was PENDING when Marc loaded);
    // Marc had marked Eva no-show (b4) and Laura absent (b1). Laura is Estel's now, Eva stays Marc's.
    const base = [
      { bookingId: "b1", state: "PENDING" as const },
      { bookingId: "b2", state: "PENDING" as const },
      { bookingId: "b3", final: true, state: "NOTIFIED" as const },
      { bookingId: "b4", state: "PENDING" as const },
    ];
    const current = [
      { bookingId: "b1", state: "PRESENT" as const },
      { bookingId: "b2", state: "PENDING" as const },
      { bookingId: "b3", final: true, state: "NOTIFIED" as const },
      { bookingId: "b4", state: "PENDING" as const },
    ];
    const draft = { b1: "NO_SHOW", b2: "PRESENT", b4: "NO_SHOW" } as const;
    const merged = mergeSheet(current, draft, new Set(["b1", "b4"]), base);
    // b1: changed by the other person → theirs; b2: never touched by the caller → theirs; b4: mine.
    expect(merged).toEqual({ b4: "NO_SHOW" });
    expect(diffSheet(current, merged)).toEqual([{ bookingId: "b4", state: "NO_SHOW" }]);
  });

  it("mergeSheet drops an edit the server now holds, and any edit on a row that became final", () => {
    const current = [
      { bookingId: "b1", state: "PRESENT" as const },
      { bookingId: "b2", final: true, state: "NOTIFIED" as const },
    ];
    expect(
      mergeSheet(current, { b1: "PRESENT", b2: "PRESENT" }, new Set(["b1", "b2"]), [
        { bookingId: "b1", state: "PENDING" },
        { bookingId: "b2", state: "PENDING" },
      ]),
    ).toEqual({});
    // Without a base list, the caller's touched edits are kept on every row that is not final.
    expect(mergeSheet(current, { b1: "NO_SHOW" }, new Set(["b1"]))).toEqual({ b1: "NO_SHOW" });
  });
});
