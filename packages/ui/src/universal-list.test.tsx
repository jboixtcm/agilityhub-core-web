import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseUniversalFilter,
  readUniversalListState,
  serializeUniversalFilter,
  UNIVERSAL_FILTER_OPERATORS,
  UniversalList,
  universalListSearchParams,
  type UniversalListDefaults,
  type UniversalListLabels,
  type UniversalListState,
} from "./universal-list";

afterEach(() => {
  cleanup();
});

const defaults: UniversalListDefaults = {
  columns: ["fullName", "dogs", "plan", "displayStatus"],
  filters: [
    { field: "status", operator: "eq", value: "ACTIVE" },
    { field: "planId", operator: "eq", value: "plan-member" },
  ],
  size: 50,
  sort: ["lastName,asc", "firstName,asc"],
};

describe("T-03-38 universal list filter builder", () => {
  it("offers operators by field type from the universal contract", () => {
    expect(UNIVERSAL_FILTER_OPERATORS.text).toEqual(["contains", "startsWith", "eq", "ne"]);
    expect(UNIVERSAL_FILTER_OPERATORS.enum).toEqual(["eq", "ne", "in", "nin"]);
    expect(UNIVERSAL_FILTER_OPERATORS.date).toEqual([
      "eq",
      "ne",
      "lt",
      "lte",
      "gt",
      "gte",
      "between",
      "exists",
    ]);
  });

  it("round-trips filters whose values contain separators", () => {
    const filter = parseUniversalFilter("fullName:contains:Serra:Vidal");
    expect(filter).toEqual({
      field: "fullName",
      operator: "contains",
      value: "Serra:Vidal",
    });
    if (filter === undefined) {
      throw new TypeError("Expected a parsed filter");
    }
    expect(serializeUniversalFilter(filter)).toBe("fullName:contains:Serra:Vidal");
    expect(parseUniversalFilter("fullName:unknown:value")).toBeUndefined();
  });
});

describe("T-03-38 universal list URL sync", () => {
  it("reads repeated filters and sort values without losing column order", () => {
    const state = readUniversalListState(
      "?page=2&size=200&q=Duna&sort=city%2Cdesc&filter=status%3Aeq%3AACTIVE&filter=city%3Aeq%3ACabrera&fields=dogs%2CfullName%2Ccity",
      defaults,
    );

    expect(state).toEqual({
      columns: ["dogs", "fullName", "city"],
      filters: [
        { field: "status", operator: "eq", value: "ACTIVE" },
        { field: "city", operator: "eq", value: "Cabrera" },
      ],
      page: 2,
      q: "Duna",
      size: 200,
      sort: ["city,desc"],
    });
  });

  it("serializes the complete view state for links, reloads, and exports", () => {
    const parameters = universalListSearchParams({
      columns: ["dogs", "fullName"],
      filters: [
        { field: "status", operator: "eq", value: "ACTIVE" },
        { field: "planId", operator: "in", value: "plan-member,plan-family" },
      ],
      page: 1,
      q: "Laura",
      size: 20,
      sort: ["lastName,asc", "firstName,asc"],
    });

    expect(parameters.get("page")).toBe("1");
    expect(parameters.get("size")).toBe("20");
    expect(parameters.get("q")).toBe("Laura");
    expect(parameters.getAll("sort")).toEqual(["lastName,asc", "firstName,asc"]);
    expect(parameters.getAll("filter")).toEqual([
      "status:eq:ACTIVE",
      "planId:in:plan-member,plan-family",
    ]);
    expect(parameters.get("fields")).toBe("dogs,fullName");
  });

  it("falls back to approved defaults for invalid pagination values", () => {
    expect(readUniversalListState("?page=-1&size=12", defaults)).toMatchObject({
      columns: defaults.columns,
      filters: defaults.filters,
      page: 0,
      size: 50,
      sort: defaults.sort,
    });
  });
});

interface Row {
  id: string;
}

const listLabels: UniversalListLabels<Row> = {
  addFilter: "Afegeix el filtre",
  clearFilters: "Treu els filtres",
  closeError: "Tanca",
  columns: "Columnes",
  createView: "Desa la vista",
  defaultView: "Vista per defecte",
  deleteView: "Esborra la vista",
  emptyDescription: "",
  emptyTitle: "Cap fila",
  export: "Exporta",
  filter: "Filtre",
  filterField: "Columna",
  filterOperator: "Operador",
  filterValue: "Valor",
  formatPdf: "PDF",
  formatXlsx: "Excel",
  loading: "Carregant",
  loadingFilterValues: "Carregant valors",
  nextPage: "Següent",
  noSavedView: "Cap vista",
  operators: {
    between: "entre",
    contains: "conté",
    eq: "és",
    exists: "existeix",
    gt: ">",
    gte: "≥",
    in: "és un de",
    lt: "<",
    lte: "≤",
    ne: "no és",
    nin: "no és cap de",
    startsWith: "comença per",
  },
  page: (page, totalPages) => `${String(page)} de ${String(totalPages)}`,
  previousPage: "Anterior",
  removeFilter: (field) => `Treu ${field}`,
  renameView: "Canvia el nom",
  retry: "Torna-ho a provar",
  rowsPerPage: "Files",
  saveError: "Error",
  saveViewName: "Nom",
  search: "Cerca",
  selectAll: "Tot",
  selectRow: (row) => row.id,
  selected: (count) => String(count),
  sharedView: "Compartida",
  sortAscending: (column) => column,
  sortDescending: (column) => column,
  view: (name) => name,
  views: "Vistes",
};

describe("E5-W05 round 2 #2 · a range filter with no suggested values (ruling E80)", () => {
  it("offers two dates instead of the value list, never asks for the field's values, and adds the range's own value", async () => {
    const loadFilterValues = vi.fn((field: string) =>
      Promise.resolve([{ count: 3, label: `${field} 1`, value: `${field}-1` }]),
    );
    const onStateChange = vi.fn();
    const state: UniversalListState = {
      columns: ["id"],
      filters: [],
      page: 0,
      q: "",
      size: 50,
      sort: [],
    };
    render(
      <UniversalList<Row>
        appliedFilters={[]}
        caption="Bloquejos"
        columns={[{ key: "id", label: "Id", render: (row) => row.id }]}
        filterColumns={[
          { key: "ringId", label: "Pista", type: "relation" },
          {
            key: "from",
            label: "Dia",
            operators: ["between"],
            range: {
              endLabel: "Fins al",
              startLabel: "Des del",
              toValue: (start, end) => `${start}/${end}`,
            },
            type: "date",
          },
        ]}
        labels={listLabels}
        listKey="range-test"
        loadFilterValues={loadFilterValues}
        onCreateView={() => Promise.reject(new Error("unused"))}
        onDeleteView={() => Promise.resolve()}
        onExport={() => undefined}
        onRenameView={() => Promise.reject(new Error("unused"))}
        onRetry={() => undefined}
        onStateChange={onStateChange}
        rowKey={(row) => row.id}
        rows={[{ id: "rb-1" }]}
        savedViews={[]}
        state={state}
        totalPages={1}
      />,
    );
    await waitFor(() => {
      expect(loadFilterValues).toHaveBeenCalledWith("ringId");
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Columna" }), {
      target: { value: "from" },
    });
    expect(screen.queryByRole("combobox", { name: "Valor" })).toBeNull();
    const add = screen.getByRole("button", { name: "Afegeix el filtre" });
    // An end before the start is no range.
    fireEvent.change(screen.getByLabelText("Des del"), { target: { value: "2026-08-05" } });
    fireEvent.change(screen.getByLabelText("Fins al"), { target: { value: "2026-08-04" } });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Fins al"), { target: { value: "2026-08-06" } });
    fireEvent.click(add);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: "from", operator: "between", value: "2026-08-05/2026-08-06" }],
        page: 0,
      }),
    );
    expect(loadFilterValues.mock.calls.map(([field]) => field)).toEqual(["ringId"]);
  });
});
