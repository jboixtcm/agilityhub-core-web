import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ATTENDANCE_STATES,
  AttendanceBadgeCycler,
  AttendanceCircles,
  type AttendanceState,
  attendanceTone,
  canChooseAttendance,
  diffSheet,
  mergeSheet,
  nextAttendanceState,
} from "./index";

const labels: Record<AttendanceState, string> = {
  NO_SHOW: "no presentat",
  NOTIFIED: "ha avisat",
  PENDING: "pendent",
  PRESENT: "present",
};

const open = { canMarkNotice: true, canMarkPresence: true, final: false };
const openSheet = { canMarkNotice: true, canMarkPresence: true };

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
    const merged = mergeSheet(current, draft, new Set(["b1", "b4"]), base, openSheet);
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
      mergeSheet(
        current,
        { b1: "PRESENT", b2: "PRESENT" },
        new Set(["b1", "b2"]),
        [
          { bookingId: "b1", state: "PENDING" },
          { bookingId: "b2", state: "PENDING" },
        ],
        openSheet,
      ),
    ).toEqual({});
    // On a row nobody else changed, the caller's touched edit is kept while the list allows it.
    expect(mergeSheet(current, { b1: "NO_SHOW" }, new Set(["b1"]), current, openSheet)).toEqual({
      b1: "NO_SHOW",
    });
  });
});

describe("E6-W03 steps 11 and 12 (E6-W01 round-2 review #1 and #2): mergeSheet and the permissions just read", () => {
  const rows = [
    { bookingId: "b1", state: "PRESENT" as const },
    { bookingId: "b2", state: "PENDING" as const },
    { bookingId: "b4", state: "NO_SHOW" as const },
  ];
  const draft = { b1: "PENDING", b2: "NOTIFIED", b4: "PRESENT" } as const;
  const touched = new Set(["b1", "b2", "b4"]);

  it("step 11: the window closed (canMarkPresence false) drops every choice but «ha avisat», which canMarkNotice still allows", () => {
    expect(
      mergeSheet(rows, draft, touched, rows, { canMarkNotice: true, canMarkPresence: false }),
    ).toEqual({ b2: "NOTIFIED" });
  });

  it("step 11: «ha avisat» switched off drops the «ha avisat» choice; a closed sheet keeps nothing", () => {
    expect(
      mergeSheet(rows, draft, touched, rows, { canMarkNotice: false, canMarkPresence: true }),
    ).toEqual({ b1: "PENDING", b4: "PRESENT" });
    expect(
      mergeSheet(rows, draft, touched, rows, { canMarkNotice: false, canMarkPresence: false }),
    ).toEqual({});
  });

  it("step 12: the base rows and the permissions are required arguments", () => {
    // @ts-expect-error: without `baseRows` the «someone else changed this row» check is lost (A8).
    expect(() => mergeSheet(rows, draft, touched)).toThrow(TypeError);
  });
});

describe("E6-W03 step 14 (E6-W01 round-2 review #4): no flash on every save", () => {
  it("while a save is in flight the circles are locked but not faded; only the ones the api refuses fade", () => {
    const { rerender } = render(
      <AttendanceCircles
        disabled
        label="Assistència de Marc + Chun-li"
        labels={labels}
        onChange={() => undefined}
        permissions={open}
        value="PRESENT"
      />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
      expect(radio).not.toHaveClass("ah-attendance__circle--unavailable");
    }
    rerender(
      <AttendanceCircles
        label="Assistència de Marc + Chun-li"
        labels={labels}
        onChange={() => undefined}
        permissions={{ ...open, canMarkNotice: false }}
        value="PRESENT"
      />,
    );
    expect(screen.getByRole("radio", { name: "ha avisat" })).toHaveClass(
      "ah-attendance__circle--unavailable",
    );
    expect(screen.getByRole("radio", { name: "present" })).not.toHaveClass(
      "ah-attendance__circle--unavailable",
    );
  });
});

const badgeLabels: Record<AttendanceState, string> = {
  NO_SHOW: "no presentat",
  NOTIFIED: "avisat",
  PENDING: "—",
  PRESENT: "present",
};

function Cycler({
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
    <AttendanceBadgeCycler
      {...permissions}
      label={`Assistència de Pau + Blat: ${badgeLabels[value]}`}
      labels={badgeLabels}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      value={value}
    />
  );
}

describe("E6-W03 step 1 AttendanceBadgeCycler (mockup D12, S10 R-10-03)", () => {
  it("cycles «— → present → avisat → no presentat → —» on each click, in the state's tone", () => {
    const onChange = vi.fn();
    render(<Cycler onChange={onChange} />);
    const badge = screen.getByRole("button", { name: /^Assistència de Pau \+ Blat/u });
    expect(badge).toHaveTextContent("—");
    expect(badge).toHaveClass("ah-tone--neutral");
    const seen: string[] = [];
    for (let click = 0; click < 4; click += 1) {
      fireEvent.click(badge);
      seen.push(badge.textContent);
    }
    expect(seen).toEqual(["present", "avisat", "no presentat", "—"]);
    expect(onChange.mock.calls.map(([state]) => state as AttendanceState)).toEqual([
      "PRESENT",
      "NOTIFIED",
      "NO_SHOW",
      "PENDING",
    ]);
    fireEvent.click(badge);
    expect(badge).toHaveClass("ah-tone--success");
  });

  it("skips «avisat» without canMarkNotice", () => {
    render(<Cycler initial="PRESENT" permissions={{ ...open, canMarkNotice: false }} />);
    const badge = screen.getByRole("button");
    fireEvent.click(badge);
    expect(badge).toHaveTextContent("no presentat");
    expect(nextAttendanceState("PRESENT", { ...open, canMarkNotice: false })).toBe("NO_SHOW");
  });

  it("stops cycling on a final row and without canMarkPresence; a save only locks it", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <Cycler initial="NOTIFIED" onChange={onChange} permissions={{ ...open, final: true }} />,
    );
    const final = screen.getByRole("button");
    expect(final).toBeDisabled();
    expect(final).toHaveClass("ah-attendance-badge--inert");
    fireEvent.click(final);
    expect(final).toHaveTextContent("avisat");
    unmount();
    render(<Cycler onChange={onChange} permissions={{ ...open, canMarkPresence: false }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onChange).not.toHaveBeenCalled();
    cleanup();
    render(
      <AttendanceBadgeCycler
        {...open}
        disabled
        label="Assistència de Pau + Blat: —"
        labels={badgeLabels}
        onChange={onChange}
        value="PENDING"
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).not.toHaveClass("ah-attendance-badge--inert");
  });

  it("is a native button, so it is keyboard-operable (focusable; Enter and Space click it)", () => {
    render(<Cycler />);
    const badge = screen.getByRole("button");
    badge.focus();
    expect(badge).toHaveFocus();
    expect(badge).toHaveAttribute("type", "button");
    expect(badge.tagName).toBe("BUTTON");
  });
});
