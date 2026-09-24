import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleCell, ScheduleGrid } from "./schedule-grid";

interface Cell {
  columnId: string;
  id: string;
  title: string;
}

describe("ScheduleGrid", () => {
  it("stacks cells per slot, exposes day buttons and tints cells through --schedule-color", () => {
    const onDay = vi.fn();
    const onCell = vi.fn();
    render(
      <ScheduleGrid<Cell>
        columns={[
          { id: "MONDAY", label: "dilluns", onSelect: onDay },
          { id: "TUESDAY", label: "dimarts" },
        ]}
        label="Quadre"
        renderCell={(cell, selected) => (
          <ScheduleCell
            color={cell.id === "c2" ? null : "var(--ah-color-info)"}
            onClick={() => {
              onCell(cell.id);
            }}
            selected={selected}
            subtitle="Laura"
            title={cell.title}
            warning={cell.id === "c2"}
          />
        )}
        rows={[
          {
            cells: [
              { columnId: "MONDAY", id: "c1", title: "B+C" },
              { columnId: "MONDAY", id: "c2", title: "Obed. urbana" },
            ],
            id: "b1",
            label: "8:30",
          },
        ]}
        selectedCellId="c1"
      />,
    );

    const table = screen.getByRole("table", { name: "Quadre" });
    const bandRow = within(table).getAllByRole("row")[1];
    expect(bandRow).toBeDefined();
    if (bandRow === undefined) return;
    const mondaySlot = within(bandRow).getAllByRole("cell")[0];
    expect(mondaySlot).toBeDefined();
    if (mondaySlot === undefined) return;
    const buttons = within(mondaySlot).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[0]?.getAttribute("style")).toContain("--schedule-color: var(--ah-color-info)");
    expect(buttons[1]).toHaveClass("ah-schedule-cell--neutral", "ah-schedule-cell--warning");

    fireEvent.click(screen.getByRole("button", { name: "dilluns" }));
    expect(onDay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Obed\. urbana/u }));
    expect(onCell).toHaveBeenCalledWith("c2");
    expect(screen.getByRole("rowheader", { name: "8:30" })).toBeInTheDocument();
  });
});
