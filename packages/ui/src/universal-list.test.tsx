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
    expect(parseUniversalFilter("toMonth:exists:")).toEqual({
      field: "toMonth",
      operator: "exists",
      value: "",
    });
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

describe("E8-W03 round 4 #1 · operator-specific universal filter values", () => {
  it("E8-W06 #1 reloads suggested values when the operator changes from eq to lt", async () => {
    const loadFilterValues = vi.fn(() =>
      Promise.resolve([{ count: 1, label: "Octubre 2026", value: "2026-10" }]),
    );
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
        caption="Períodes"
        columns={[{ key: "id", label: "Id", render: (row) => row.id }]}
        filterColumns={[
          {
            key: "fromMonth",
            label: "Des de",
            operators: ["eq", "lt"],
            type: "date",
          },
        ]}
        labels={listLabels}
        listKey="operator-reload-test"
        loadFilterValues={loadFilterValues}
        onCreateView={() => Promise.reject(new Error("unused"))}
        onDeleteView={() => Promise.resolve()}
        onExport={() => undefined}
        onRenameView={() => Promise.reject(new Error("unused"))}
        onRetry={() => undefined}
        onStateChange={() => undefined}
        rowKey={(row) => row.id}
        rows={[{ id: "period-1" }]}
        savedViews={[]}
        state={state}
        totalPages={1}
      />,
    );

    const value = await screen.findByRole("combobox", { name: "Valor" });
    await waitFor(() => {
      expect(value).toBeEnabled();
      expect(loadFilterValues).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Operador" }), {
      target: { value: "lt" },
    });
    await waitFor(() => {
      expect(value).toBeEnabled();
      expect(loadFilterValues).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "Afegeix el filtre" })).toBeEnabled();
  });

  it("sends both range bounds for between and no value for exists", async () => {
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
        caption="Períodes"
        columns={[{ key: "id", label: "Id", render: (row) => row.id }]}
        filterColumns={[
          {
            key: "toMonth",
            label: "Fins a",
            operators: ["eq", "between", "exists"],
            range: {
              endLabel: "Mes final",
              inputType: "month",
              startLabel: "Mes inicial",
              toValue: (start, end) => `${start},${end}`,
            },
            type: "date",
          },
        ]}
        labels={listLabels}
        listKey="operator-value-test"
        loadFilterValues={() =>
          Promise.resolve([{ count: 1, label: "Octubre 2026", value: "2026-10" }])
        }
        onCreateView={() => Promise.reject(new Error("unused"))}
        onDeleteView={() => Promise.resolve()}
        onExport={() => undefined}
        onRenameView={() => Promise.reject(new Error("unused"))}
        onRetry={() => undefined}
        onStateChange={onStateChange}
        rowKey={(row) => row.id}
        rows={[{ id: "period-1" }]}
        savedViews={[]}
        state={state}
        totalPages={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Valor" })).toBeEnabled();
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Operador" }), {
      target: { value: "between" },
    });
    expect(screen.queryByRole("combobox", { name: "Valor" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Mes inicial"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("Mes final"), { target: { value: "2026-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Afegeix el filtre" }));
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [{ field: "toMonth", operator: "between", value: "2026-10,2026-12" }],
      }),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Operador" }), {
      target: { value: "exists" },
    });
    expect(screen.queryByRole("combobox", { name: "Valor" })).toBeNull();
    const add = screen.getByRole("button", { name: "Afegeix el filtre" });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [{ field: "toMonth", operator: "exists", value: "" }],
      }),
    );
  });
});

describe("E8-W01 · a selection the screen holds and rows the selection cannot take (D6, ruling E87)", () => {
  const state: UniversalListState = {
    columns: ["id"],
    filters: [],
    page: 0,
    q: "",
    size: 50,
    sort: [],
  };
  function renderSelectable(selected: ReadonlySet<string>, onSelectedChange = vi.fn()) {
    render(
      <UniversalList<Row>
        appliedFilters={[]}
        caption="Rebuts"
        columns={[{ key: "id", label: "Id", render: (row) => row.id }]}
        filterColumns={[]}
        isRowSelectable={(row) => row.id !== "collecting"}
        labels={listLabels}
        listKey="selection-test"
        loadFilterValues={() => Promise.resolve([])}
        onCreateView={() => Promise.reject(new Error("unused"))}
        onDeleteView={() => Promise.resolve()}
        onExport={() => undefined}
        onRenameView={() => Promise.reject(new Error("unused"))}
        onRetry={() => undefined}
        onSelectedChange={onSelectedChange}
        onStateChange={() => undefined}
        rowKey={(row) => row.id}
        rows={[{ id: "pending" }, { id: "collecting" }, { id: "failed" }]}
        savedViews={[]}
        selectable
        selected={selected}
        state={state}
        totalPages={1}
      />,
    );
    return onSelectedChange;
  }

  it("E8-W01: an unselectable row has a disabled checkbox and «select all» takes only the others", () => {
    const onSelectedChange = renderSelectable(new Set());
    expect(screen.getByRole("checkbox", { name: "collecting" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "pending" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tot" }));
    expect(onSelectedChange).toHaveBeenLastCalledWith(new Set(["pending", "failed"]));
  });

  it("E8-W01: a held selection is what the checkboxes show, and a click reports the next one", () => {
    const onSelectedChange = renderSelectable(new Set(["failed"]));
    expect(screen.getByRole("checkbox", { name: "failed" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "pending" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "pending" }));
    expect(onSelectedChange).toHaveBeenLastCalledWith(new Set(["failed", "pending"]));
    // The list does not keep a copy: until the screen passes the new set, nothing changes.
    expect(screen.getByRole("checkbox", { name: "pending" })).not.toBeChecked();
  });

  it("E8-W01: a list without free text (`searchable={false}`, the remittances) has no search box", () => {
    render(
      <UniversalList<Row>
        appliedFilters={[]}
        caption="Remeses"
        columns={[{ key: "id", label: "Id", render: (row) => row.id }]}
        filterColumns={[]}
        labels={listLabels}
        listKey="no-search-test"
        loadFilterValues={() => Promise.resolve([])}
        onCreateView={() => Promise.reject(new Error("unused"))}
        onDeleteView={() => Promise.resolve()}
        onExport={() => undefined}
        onRenameView={() => Promise.reject(new Error("unused"))}
        onRetry={() => undefined}
        onStateChange={() => undefined}
        rowKey={(row) => row.id}
        rows={[{ id: "r-1" }]}
        savedViews={[]}
        searchable={false}
        state={state}
        totalPages={1}
      />,
    );
    expect(screen.queryByRole("searchbox", { name: "Cerca" })).toBeNull();
  });
});

describe("E7-W06 step 5 (ruling E82, E6-W04 Q6) · stable data attributes on a list's rows", () => {
  it("E7-W06 step 5: `rowAttributes` puts each row's data attributes on its <tr> (D14: data-followup-id, data-unread), next to its class", () => {
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
        caption="Seguiment"
        columns={[{ key: "id", label: "Id", render: (row) => row.id }]}
        filterColumns={[]}
        labels={listLabels}
        listKey="row-attributes-test"
        loadFilterValues={() => Promise.resolve([])}
        onCreateView={() => Promise.reject(new Error("unused"))}
        onDeleteView={() => Promise.resolve()}
        onExport={() => undefined}
        onRenameView={() => Promise.reject(new Error("unused"))}
        onRetry={() => undefined}
        onStateChange={() => undefined}
        rowAttributes={(row) => ({
          "data-followup-id": row.id,
          "data-unread": String(row.id === "f-1"),
        })}
        rowClassName={(row) => (row.id === "f-1" ? "unread" : undefined)}
        rowKey={(row) => row.id}
        rows={[{ id: "f-1" }, { id: "f-2" }]}
        savedViews={[]}
        state={state}
        totalPages={1}
      />,
    );
    const rows = [...document.querySelectorAll("tbody tr")];
    expect(
      rows.map((row) => [
        row.getAttribute("data-followup-id"),
        row.getAttribute("data-unread"),
        row.getAttribute("class"),
      ]),
    ).toEqual([
      ["f-1", "true", "unread"],
      ["f-2", "false", null],
    ]);
  });
});
