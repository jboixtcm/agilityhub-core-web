import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  contiguousSelection,
  SlotGrid,
  type SlotCellModel,
  type SlotGridLabels,
  type SlotGridRow,
} from "./slot-grid";

const labels: SlotGridLabels = {
  cell: (time, state) => `${time}, ${state}`,
  classLabel: (time) => `${time} classe`,
  free: "lliure",
  grid: "Hores",
  own: (time) => `${time} · meva`,
  taken: "ocupada",
  time: "Hora",
};

function cell(time: string, overrides: Partial<SlotCellModel> = {}): SlotCellModel {
  return { columnId: "ring-mun", id: `ring-mun_${time}`, state: "FREE", ...overrides };
}

function row(time: string, overrides: Partial<SlotCellModel> = {}): SlotGridRow {
  return { cells: [cell(time, overrides)], time };
}

const columns = [{ id: "ring-mun", label: "Muntanya" }];

describe("SlotGrid presenter (S09 screens 08 and 24)", () => {
  it("draws each variant of the api's state and reason, and only a bookable FREE cell is pressable", () => {
    const onCellPress = vi.fn();
    render(
      <SlotGrid
        columns={columns}
        labels={labels}
        mode="single"
        onCellPress={onCellPress}
        rows={[
          row("07:00", { state: "BOOKED", reason: "TRAINING" }),
          row("07:30"),
          row("08:00", { reason: "OWN_TRAINING", state: "BOOKED" }),
          row("08:30", { bookable: false }),
          row("18:30", { classTime: "18:50", reason: "CLASS", state: "BLOCKED" }),
          row("19:00", { reason: "RING_BLOCK", state: "BLOCKED" }),
        ]}
        selection={{ cellIds: [] }}
      />,
    );
    const grid = screen.getByRole("group", { name: "Hores" });
    expect(grid).toHaveClass("ah-slot-grid--flow");

    const free = screen.getByRole("button", { name: "7:30, lliure" });
    expect(free).toHaveClass("ah-slot--free");
    expect(free).toBeEnabled();
    expect(free).toHaveAttribute("aria-pressed", "false");

    const booked = screen.getByRole("button", { name: "7:00, ocupada" });
    expect(booked).toHaveClass("ah-slot--taken");
    expect(booked).toBeDisabled();
    // A started FREE slot is drawn taken (R-09-04).
    expect(screen.getByRole("button", { name: "8:30, ocupada" })).toHaveClass("ah-slot--taken");
    // A class shows its own start when the api sends it, dimmed and inert.
    const classCell = screen.getByRole("button", { name: "18:30, 18:50 classe" });
    expect(classCell).toHaveClass("ah-slot--class");
    expect(classCell).toHaveTextContent("18:50 classe");
    expect(classCell).toBeDisabled();
    expect(screen.getByRole("button", { name: "8:00, 8:00 · meva" })).toHaveClass("ah-slot--own");
    expect(screen.getByRole("button", { name: "19:00, ocupada" })).toHaveClass("ah-slot--taken");

    for (const inert of [
      "7:00, ocupada",
      "8:30, ocupada",
      "18:30, 18:50 classe",
      "19:00, ocupada",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: inert }));
    }
    expect(onCellPress).not.toHaveBeenCalled();
    fireEvent.click(free);
    expect(onCellPress).toHaveBeenCalledWith(expect.objectContaining({ id: "ring-mun_07:30" }));
    // E5-W04: the hooks the real-core E2E selects cells by (variant and ring).
    expect(free).toHaveAttribute("data-slot-state", "free");
    expect(free).toHaveAttribute("data-ring", "ring-mun");
    expect(booked).toHaveAttribute("data-slot-state", "taken");
  });

  it("names why a taken cell is taken when the page gives the reasons", () => {
    render(
      <SlotGrid
        columns={columns}
        labels={{
          ...labels,
          reason: (reason) => (reason === "RING_BLOCK" ? "bloqueig" : "entrenament"),
        }}
        mode="single"
        rows={[
          row("09:00", { reason: "RING_BLOCK", state: "BLOCKED" }),
          row("09:30", { reason: "TRAINING", state: "BOOKED" }),
          row("10:00", { bookable: false }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "9:00, bloqueig" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "9:30, entrenament" })).toBeDisabled();
    // A free half hour that has begun has no reason: it reads as taken.
    expect(screen.getByRole("button", { name: "10:00, ocupada" })).toBeDisabled();
  });

  it("fills the selected cell", () => {
    render(
      <SlotGrid
        columns={columns}
        labels={labels}
        mode="single"
        rows={[row("08:30")]}
        selection={{ cellIds: ["ring-mun_08:30"] }}
      />,
    );
    const selected = screen.getByRole("button", { name: "8:30, lliure" });
    expect(selected).toHaveClass("ah-slot--selected");
    expect(selected).toHaveAttribute("aria-pressed", "true");
  });

  it("contiguous selection extends a run, shrinks it from an end and never keeps a gap", () => {
    const cells = [
      cell("18:00"),
      cell("18:30"),
      cell("19:00", { state: "BOOKED", reason: "TRAINING" }),
      cell("19:30"),
      cell("20:00"),
    ];
    expect(contiguousSelection(cells, [], "ring-mun_18:00")).toEqual(["ring-mun_18:00"]);
    expect(contiguousSelection(cells, ["ring-mun_18:00"], "ring-mun_18:30")).toEqual([
      "ring-mun_18:00",
      "ring-mun_18:30",
    ]);
    // Across the booked 19:00: no range, a new run.
    expect(
      contiguousSelection(cells, ["ring-mun_18:00", "ring-mun_18:30"], "ring-mun_19:30"),
    ).toEqual(["ring-mun_19:30"]);
    // A free range fills; an end leaves the run.
    expect(contiguousSelection(cells, ["ring-mun_19:30"], "ring-mun_20:00")).toEqual([
      "ring-mun_19:30",
      "ring-mun_20:00",
    ]);
    expect(
      contiguousSelection(cells, ["ring-mun_19:30", "ring-mun_20:00"], "ring-mun_19:30"),
    ).toEqual(["ring-mun_20:00"]);
    // An inert cell changes nothing.
    expect(contiguousSelection(cells, ["ring-mun_18:00"], "ring-mun_19:00")).toEqual([
      "ring-mun_18:00",
    ]);
  });

  it("in contiguous mode the grid hands the next run to the page", () => {
    function Harness() {
      const [cellIds, setCellIds] = useState<string[]>([]);
      return (
        <SlotGrid
          columns={columns}
          labels={labels}
          mode="contiguous"
          onSelectionChange={setCellIds}
          rows={[row("18:00"), row("18:30"), row("19:00", { state: "BOOKED" }), row("19:30")]}
          selection={{ cellIds }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "18:00, lliure" }));
    fireEvent.click(screen.getByRole("button", { name: "18:30, lliure" }));
    expect(screen.getByRole("button", { name: "18:00, lliure" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "18:30, lliure" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "19:30, lliure" }));
    expect(screen.getByRole("button", { name: "18:00, lliure" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "19:30, lliure" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("several rings make a time × ring table with identical columns", () => {
    render(
      <SlotGrid
        columns={[
          { color: "var(--ah-color-info)", id: "ring-mun", label: "Muntanya" },
          { id: "ring-cen", label: "Central" },
        ]}
        labels={labels}
        mode="single"
        rows={[
          {
            cells: [
              cell("08:30"),
              cell("08:30", { columnId: "ring-cen", id: "ring-cen_08:30", state: "BOOKED" }),
            ],
            time: "08:30",
          },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Hores" });
    expect(table.style.gridTemplateColumns).toBe(
      "var(--ah-slot-grid-time, 2.75rem) repeat(2, minmax(0, 1fr))",
    );
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Hora",
      "Muntanya",
      "Central",
    ]);
    expect(screen.getByRole("rowheader")).toHaveTextContent("8:30");
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });
});

describe("E5-W05 step 14: SlotGrid's disabled columns (E5-W02 round-2 review #4)", () => {
  it("E5-W05 step 14: a disabled single column disables its free cells and never calls onCellPress", () => {
    const onCellPress = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <SlotGrid
        columns={[{ disabled: true, id: "ring-mun", label: "Muntanya" }]}
        labels={labels}
        mode="single"
        onCellPress={onCellPress}
        onSelectionChange={onSelectionChange}
        rows={[row("07:30"), row("08:00")]}
        selection={{ cellIds: [] }}
      />,
    );
    expect(screen.getByRole("group", { name: "Hores" })).toHaveClass("ah-slot-grid--flow");
    const cells = ["7:30, lliure", "8:00, lliure"].map((name) =>
      screen.getByRole("button", { name }),
    );
    for (const free of cells) fireEvent.click(free);
    expect(onCellPress).not.toHaveBeenCalled();
    expect(onSelectionChange).not.toHaveBeenCalled();
    for (const free of cells) {
      expect(free).toBeDisabled();
      expect(free).not.toHaveAttribute("aria-pressed");
    }
  });

  it("E5-W05 step 14: in the table only the disabled column's cells are inert; the others still press", () => {
    const onCellPress = vi.fn();
    const onSelectionChange = vi.fn();
    const both = (time: string): SlotGridRow => ({
      cells: [cell(time), cell(time, { columnId: "ring-cen", id: `ring-cen_${time}` })],
      time,
    });
    render(
      <SlotGrid
        columns={[
          { id: "ring-mun", label: "Muntanya" },
          { disabled: true, id: "ring-cen", label: "Central" },
        ]}
        labels={labels}
        mode="contiguous"
        onCellPress={onCellPress}
        onSelectionChange={onSelectionChange}
        rows={[both("08:30"), both("09:00")]}
        selection={{ cellIds: [] }}
      />,
    );
    const table = screen.getByRole("table", { name: "Hores" });
    const central = [...table.querySelectorAll<HTMLButtonElement>('[data-ring="ring-cen"]')];
    const muntanya = [...table.querySelectorAll<HTMLButtonElement>('[data-ring="ring-mun"]')];
    expect(central).toHaveLength(2);
    expect(muntanya).toHaveLength(2);
    for (const button of central) fireEvent.click(button);
    expect(onCellPress).not.toHaveBeenCalled();
    expect(onSelectionChange).not.toHaveBeenCalled();
    for (const button of central) expect(button).toBeDisabled();
    for (const button of muntanya) expect(button).toBeEnabled();
    fireEvent.click(muntanya[0] ?? table);
    expect(onCellPress).toHaveBeenCalledTimes(1);
    expect(onCellPress).toHaveBeenCalledWith(expect.objectContaining({ id: "ring-mun_08:30" }));
    expect(onSelectionChange).toHaveBeenCalledWith(["ring-mun_08:30"]);
  });

  it("E5-W05 round 2 #13: a selected cell of a disabled column still says it is selected (aria-pressed), as it still looks", () => {
    render(
      <SlotGrid
        columns={[{ disabled: true, id: "ring-mun", label: "Muntanya" }]}
        labels={labels}
        mode="single"
        onSelectionChange={vi.fn()}
        rows={[row("07:30"), row("08:00")]}
        selection={{ cellIds: ["ring-mun_07:30"] }}
      />,
    );
    const chosen = screen.getByRole("button", { name: "7:30, lliure" });
    expect(chosen).toHaveClass("ah-slot--selected");
    expect(chosen).toBeDisabled();
    expect(chosen).toHaveAttribute("aria-pressed", "true");
    // The cell that is neither pressable nor chosen announces no pressed state.
    expect(screen.getByRole("button", { name: "8:00, lliure" })).not.toHaveAttribute(
      "aria-pressed",
    );
  });
});
