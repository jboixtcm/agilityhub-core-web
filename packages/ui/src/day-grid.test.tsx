import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DAY_GRID_NO_RING,
  DayGrid,
  type DayGridCellModel,
  dayGridColumns,
  type DayGridLabels,
  dayGridTimeLabel,
} from "./day-grid";

const labels: DayGridLabels = {
  activity: (title) => `Activitat · ${title}`,
  atRisk: "en risc ⚠",
  block: "Bloq.",
  cancelled: "anul·lada",
  grid: "Quadre del dia",
  occupied: "Ocupada",
  time: "Hora",
  training: "Entren.",
};

const columns = [
  { color: "var(--ah-color-info)", id: "ring-mun", label: "MUN" },
  { color: "var(--ah-color-success)", id: "ring-car", label: "CAR" },
];

function slot(slots: readonly HTMLElement[], index: number): HTMLElement {
  const element = slots[index];
  if (element === undefined) throw new TypeError(`Missing grid slot ${String(index)}`);
  return element;
}

function classCell(overrides: Partial<DayGridCellModel>): DayGridCellModel {
  return {
    description: "B+C",
    id: "cls-1",
    instructorName: "Marc",
    kind: "CLASS",
    occupancy: { booked: 5, capacity: 5, waiting: 2 },
    ringId: "ring-mun",
    ...overrides,
  };
}

describe("DayGrid presenter (screens 10 / 23)", () => {
  it("keeps identical ring columns and strips the leading zero of each start time", () => {
    render(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={[{ cells: [classCell({})], time: "08:30" }]}
        view="member"
      />,
    );
    const grid = screen.getByRole("table", { name: "Quadre del dia" });
    expect(grid.style.gridTemplateColumns).toBe(
      "var(--ah-day-grid-time, 2.25rem) repeat(2, minmax(0, 1fr))",
    );
    expect(screen.getByRole("rowheader", { name: "8:30" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Hora",
      "MUN",
      "CAR",
    ]);
    expect(dayGridTimeLabel("17:40")).toBe("17:40");
    expect(dayGridTimeLabel("09:30")).toBe("9:30");
  });

  it("stacks two cells of the same ring and row and draws empty placeholders", () => {
    const { container } = render(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={[
          {
            cells: [
              { id: "t1", kind: "TRAINING", ringId: "ring-car", who: ["Júlia + Kira"] },
              { id: "t2", kind: "TRAINING", ringId: "ring-car", who: ["Sergio + Thai"] },
            ],
            time: "19:00",
          },
        ]}
        view="instructor"
      />,
    );
    const slots = screen.getAllByRole("cell");
    expect(slots).toHaveLength(2);
    expect(slots[0]?.querySelector(".ah-schedule-cell--empty")).not.toBeNull();
    const carretera = slot(slots, 1);
    expect(within(carretera).getAllByText("Entren.")).toHaveLength(2);
    expect(within(carretera).getByText("Júlia + Kira")).toBeVisible();
    expect(within(carretera).getByText("Sergio + Thai")).toBeVisible();
    expect(container.querySelectorAll(".ah-schedule-cell--plain")).toHaveLength(2);
  });

  it("adds the «Sense» column only when a cell has no ring", () => {
    const rows = [{ cells: [classCell({ ringId: null })], time: "10:00" }];
    expect(dayGridColumns(columns, rows, "Sense").map((column) => column.id)).toEqual([
      "ring-mun",
      "ring-car",
      DAY_GRID_NO_RING,
    ]);
    expect(
      dayGridColumns(columns, [{ cells: [classCell({})], time: "10:00" }], "Sense"),
    ).toHaveLength(2);

    render(
      <DayGrid columns={columns} labels={labels} noRingLabel="Sense" rows={rows} view="member" />,
    );
    expect(screen.getByRole("columnheader", { name: "Sense" })).toBeInTheDocument();
    const slots = screen.getAllByRole("cell");
    expect(within(slot(slots, 2)).getByText("B+C")).toBeVisible();
  });

  it("never renders occupancy in the member view even when the model carries it", () => {
    render(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={[
          {
            cells: [
              classCell({}),
              classCell({
                description: "Teràpia",
                id: "cls-2",
                instructorName: null,
                ringId: "ring-car",
              }),
            ],
            time: "18:50",
          },
        ]}
        showWaiting
        view="member"
      />,
    );
    expect(screen.getByText("Marc")).toBeVisible();
    expect(screen.queryByText(/5\/5/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+2/u)).not.toBeInTheDocument();
    const therapy = screen.getByText("Teràpia").closest(".ah-schedule-cell");
    expect(therapy?.querySelector(".ah-schedule-cell__subtitle")).toBeNull();
  });

  it("shows «n/n +e · instructor» in the instructor view, «+e» only with WAITLIST", () => {
    const rows = [{ cells: [classCell({})], time: "18:50" }];
    const { rerender } = render(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={rows}
        showWaiting
        view="instructor"
      />,
    );
    expect(screen.getByText("5/5 +2 · Marc")).toBeVisible();
    rerender(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={rows}
        view="instructor"
      />,
    );
    expect(screen.getByText("5/5 · Marc")).toBeVisible();
  });

  it("marks risk, dims cancelled classes and renders occupied, block and activity cells", () => {
    const onCellPress = vi.fn();
    const { container, rerender } = render(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        onCellPress={onCellPress}
        rows={[
          {
            cells: [
              classCell({ atRisk: true, description: "D i sup.", pressable: true }),
              { id: "o1", kind: "OCCUPIED", reasonLabel: "entren.", ringId: "ring-car" },
            ],
            time: "20:00",
          },
        ]}
        view="member"
      />,
    );
    const risky = screen.getByRole("button", { name: /D i sup\./u });
    expect(risky).toHaveClass("ah-schedule-cell--warning");
    expect(within(risky).getByText("en risc ⚠")).toBeVisible();
    fireEvent.click(risky);
    expect(onCellPress).toHaveBeenCalledWith(expect.objectContaining({ id: "cls-1" }), risky);
    const occupied = screen.getByText("Ocupada").closest(".ah-schedule-cell");
    expect(occupied).toHaveClass("ah-schedule-cell--plain");
    expect(occupied).not.toHaveClass("ah-schedule-cell--dashed");
    expect(within(occupied as HTMLElement).getByText("entren.")).toBeVisible();

    rerender(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={[
          {
            cells: [
              classCell({ cancelled: true, id: "cls-x" }),
              {
                dashed: true,
                id: "b1",
                kind: "BLOCK",
                reasonLabel: "manteniment",
                ringId: "ring-car",
              },
            ],
            time: "16:00",
          },
          {
            cells: [{ id: "a1", kind: "ACTIVITY", ringId: "ring-mun", title: "Taller de salts" }],
            time: "17:00",
          },
        ]}
        view="instructor"
      />,
    );
    expect(screen.getByText("anul·lada · Marc").closest(".ah-schedule-cell")).toHaveClass(
      "ah-schedule-cell--muted",
    );
    const block = screen.getByText("Bloq.").closest(".ah-schedule-cell");
    expect(block).toHaveClass("ah-schedule-cell--plain", "ah-schedule-cell--dashed");
    expect(screen.getByText("Activitat · Taller de salts")).toBeVisible();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("hides cancelled classes from the member view", () => {
    render(
      <DayGrid
        columns={columns}
        labels={labels}
        noRingLabel="Sense"
        rows={[{ cells: [classCell({ cancelled: true })], time: "20:00" }]}
        view="member"
      />,
    );
    expect(screen.queryByText("B+C")).not.toBeInTheDocument();
  });
});
