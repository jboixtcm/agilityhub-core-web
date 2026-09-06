import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button, Checkbox, EmptyState, Skeleton, Toast } from "./components";
import { Icon } from "./icons/Icon";

export const UNIVERSAL_LIST_PAGE_SIZES = [20, 50, 200, 1000] as const;

export type UniversalFilterOperator =
  | "between"
  | "contains"
  | "eq"
  | "exists"
  | "gt"
  | "gte"
  | "in"
  | "lt"
  | "lte"
  | "ne"
  | "nin"
  | "startsWith";

export type UniversalFilterType = "boolean" | "date" | "enum" | "number" | "relation" | "text";

export const UNIVERSAL_FILTER_OPERATORS = {
  boolean: ["eq", "ne"],
  date: ["eq", "ne", "lt", "lte", "gt", "gte", "between", "exists"],
  enum: ["eq", "ne", "in", "nin"],
  number: ["eq", "ne", "lt", "lte", "gt", "gte", "between"],
  relation: ["eq", "ne", "in", "nin", "exists"],
  text: ["contains", "startsWith", "eq", "ne"],
} as const satisfies Record<UniversalFilterType, readonly UniversalFilterOperator[]>;

export interface UniversalFilter {
  field: string;
  operator: UniversalFilterOperator;
  value: string;
}

export interface AppliedUniversalFilter extends UniversalFilter {
  fieldLabel: string;
  valueLabel: string;
}

export interface UniversalFilterValue {
  count: number;
  label: string;
  value: string;
}

export interface UniversalListState {
  columns: string[];
  filters: UniversalFilter[];
  page: number;
  q: string;
  size: (typeof UNIVERSAL_LIST_PAGE_SIZES)[number];
  sort: string[];
}

export interface UniversalListDefaults {
  columns: string[];
  filters?: UniversalFilter[];
  page?: number;
  q?: string;
  size?: UniversalListState["size"];
  sort?: string[];
}

export interface UniversalListColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  sortKey?: string;
}

export interface UniversalListFilterColumn {
  key: string;
  label: string;
  operators?: readonly UniversalFilterOperator[];
  type: UniversalFilterType;
}

export interface UniversalListStatusOption {
  label: string;
  value: string;
}

export interface UniversalListSavedView {
  columns: string[];
  filters: UniversalFilter[];
  id: string;
  name: string;
  shared: boolean;
  sort: string[];
}

export interface UniversalListLabels<Row> {
  addFilter: string;
  clearFilters: string;
  closeError: string;
  columns: string;
  createView: string;
  defaultView: string;
  deleteView: string;
  emptyDescription: string;
  emptyTitle: string;
  export: string;
  filter: string;
  filterField: string;
  filterOperator: string;
  filterValue: string;
  formatPdf: string;
  formatXlsx: string;
  loading: string;
  loadingFilterValues: string;
  nextPage: string;
  noSavedView: string;
  operators: Record<UniversalFilterOperator, string>;
  page: (page: number, totalPages: number) => string;
  previousPage: string;
  removeFilter: (field: string) => string;
  renameView: string;
  retry: string;
  rowsPerPage: string;
  saveError: string;
  saveViewName: string;
  search: string;
  selectAll: string;
  selectRow: (row: Row) => string;
  selected: (count: number) => string;
  sharedView: string;
  sortAscending: (column: string) => string;
  sortDescending: (column: string) => string;
  view: (name: string) => string;
  views: string;
}

export interface UniversalListProps<Row> {
  appliedFilters: AppliedUniversalFilter[];
  caption: string;
  columns: UniversalListColumn<Row>[];
  filterColumns: UniversalListFilterColumn[];
  getExportHref: (format: "pdf" | "xlsx", state: UniversalListState) => string;
  labels: UniversalListLabels<Row>;
  listKey: string;
  loadFilterValues: (field: string) => Promise<UniversalFilterValue[]>;
  onCreateView: (
    name: string,
    shared: boolean,
    state: UniversalListState,
  ) => Promise<UniversalListSavedView>;
  onDeleteView: (id: string) => Promise<void>;
  onRenameView: (view: UniversalListSavedView, name: string) => Promise<UniversalListSavedView>;
  onRetry: () => void;
  onStateChange: (state: UniversalListState) => void;
  rowHref: (row: Row) => string;
  rowKey: (row: Row) => string;
  rows: Row[];
  savedViews: UniversalListSavedView[];
  state: UniversalListState;
  statusFilter: {
    field: string;
    label: string;
    options: UniversalListStatusOption[];
  };
  totalPages: number;
  bulkActions?: (selected: string[], clear: () => void) => ReactNode;
  error?: string;
  loading?: boolean;
  selectable?: boolean;
}

function isFilterOperator(value: string): value is UniversalFilterOperator {
  return Object.values(UNIVERSAL_FILTER_OPERATORS).some((operators) =>
    (operators as readonly string[]).includes(value),
  );
}

export function serializeUniversalFilter(filter: UniversalFilter): string {
  return `${filter.field}:${filter.operator}:${filter.value}`;
}

export function parseUniversalFilter(value: string): UniversalFilter | undefined {
  const firstSeparator = value.indexOf(":");
  const secondSeparator = value.indexOf(":", firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) {
    return undefined;
  }
  const field = value.slice(0, firstSeparator);
  const operator = value.slice(firstSeparator + 1, secondSeparator);
  const filterValue = value.slice(secondSeparator + 1);
  if (!isFilterOperator(operator) || filterValue === "") {
    return undefined;
  }
  return { field, operator, value: filterValue };
}

function isPageSize(value: number): value is UniversalListState["size"] {
  return (UNIVERSAL_LIST_PAGE_SIZES as readonly number[]).includes(value);
}

export function readUniversalListState(
  search: string | URLSearchParams,
  defaults: UniversalListDefaults,
): UniversalListState {
  const parameters = typeof search === "string" ? new URLSearchParams(search) : search;
  const parsedPage = Number(parameters.get("page"));
  const parsedSize = Number(parameters.get("size"));
  const fields = parameters.get("fields");
  const filters = parameters
    .getAll("filter")
    .map(parseUniversalFilter)
    .filter((filter): filter is UniversalFilter => filter !== undefined);
  const sort = parameters.getAll("sort");

  return {
    columns:
      fields === null
        ? [...defaults.columns]
        : fields.split(",").filter((column) => column.length > 0),
    filters: filters.length === 0 ? [...(defaults.filters ?? [])] : filters,
    page: Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : (defaults.page ?? 0),
    q: parameters.get("q") ?? defaults.q ?? "",
    size: isPageSize(parsedSize) ? parsedSize : (defaults.size ?? 50),
    sort: sort.length === 0 ? [...(defaults.sort ?? [])] : sort,
  };
}

export function universalListSearchParams(state: UniversalListState): URLSearchParams {
  const parameters = new URLSearchParams();
  parameters.set("page", String(state.page));
  parameters.set("size", String(state.size));
  if (state.q !== "") {
    parameters.set("q", state.q);
  }
  state.sort.forEach((sort) => {
    parameters.append("sort", sort);
  });
  state.filters.forEach((filter) => {
    parameters.append("filter", serializeUniversalFilter(filter));
  });
  parameters.set("fields", state.columns.join(","));
  return parameters;
}

function defaultViewStorageKey(listKey: string): string {
  return `agilityhub.list.defaultView.${listKey}`;
}

function currentStatus(state: UniversalListState, field: string): string {
  return state.filters.find((filter) => filter.field === field)?.value ?? "";
}

function formatActiveFilter(filters: AppliedUniversalFilter[]): string {
  const first = filters[0];
  return first === undefined ? "" : `${first.fieldLabel} = «${first.valueLabel}»`;
}

export function UniversalList<Row>({
  appliedFilters,
  bulkActions,
  caption,
  columns,
  error,
  filterColumns,
  getExportHref,
  labels,
  listKey,
  loadFilterValues,
  loading = false,
  onCreateView,
  onDeleteView,
  onRenameView,
  onRetry,
  onStateChange,
  rowHref,
  rowKey,
  rows,
  savedViews,
  selectable = false,
  state,
  statusFilter,
  totalPages,
}: UniversalListProps<Row>) {
  const universalFilters = appliedFilters.filter((filter) => filter.field !== statusFilter.field);
  const firstFilterColumn = filterColumns[0];
  const [filterField, setFilterField] = useState(firstFilterColumn?.key ?? "");
  const selectedFilterColumn = filterColumns.find((column) => column.key === filterField);
  const initialOperator =
    selectedFilterColumn?.operators?.[0] ??
    (selectedFilterColumn === undefined
      ? "eq"
      : UNIVERSAL_FILTER_OPERATORS[selectedFilterColumn.type][0]);
  const [filterOperator, setFilterOperator] = useState<UniversalFilterOperator>(initialOperator);
  const [filterValue, setFilterValue] = useState("");
  const [filterValues, setFilterValues] = useState<UniversalFilterValue[]>([]);
  const [filterValuesLoading, setFilterValuesLoading] = useState(firstFilterColumn !== undefined);
  const [searchValue, setSearchValue] = useState(state.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedViewId, setSelectedViewId] = useState(() => {
    if (typeof localStorage === "undefined") {
      return savedViews[0]?.id ?? "";
    }
    return localStorage.getItem(defaultViewStorageKey(listKey)) ?? savedViews[0]?.id ?? "";
  });
  const [defaultViewId, setDefaultViewId] = useState(() => {
    if (typeof localStorage === "undefined") {
      return "";
    }
    return localStorage.getItem(defaultViewStorageKey(listKey)) ?? "";
  });
  const [viewName, setViewName] = useState("");
  const [sharedView, setSharedView] = useState(false);
  const [savedViewError, setSavedViewError] = useState(false);
  const draggedColumn = useRef<string>("");

  useEffect(() => {
    if (searchValue === state.q) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      onStateChange({ ...state, page: 0, q: searchValue });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [onStateChange, searchValue, state]);

  useEffect(() => {
    if (filterField === "") {
      return undefined;
    }
    let current = true;
    void loadFilterValues(filterField).then(
      (values) => {
        if (current) {
          setFilterValues(values);
          setFilterValue(values[0]?.value ?? "");
          setFilterValuesLoading(false);
        }
      },
      () => {
        if (current) {
          setFilterValues([]);
          setFilterValue("");
          setFilterValuesLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [filterField, loadFilterValues]);

  const visibleColumns = useMemo(
    () =>
      state.columns
        .map((key) => columns.find((column) => column.key === key))
        .filter((column): column is UniversalListColumn<Row> => column !== undefined),
    [columns, state.columns],
  );
  const orderedColumns = useMemo(
    () => [...visibleColumns, ...columns.filter((column) => !state.columns.includes(column.key))],
    [columns, state.columns, visibleColumns],
  );
  const selectedIds = [...selected];
  const selectedView = savedViews.find((view) => view.id === selectedViewId);
  const statusValue = currentStatus(state, statusFilter.field);

  const changeFilterField = (event: ChangeEvent<HTMLSelectElement>) => {
    const field = event.currentTarget.value;
    const definition = filterColumns.find((column) => column.key === field);
    const operator =
      definition?.operators?.[0] ??
      (definition === undefined ? "eq" : UNIVERSAL_FILTER_OPERATORS[definition.type][0]);
    setFilterField(field);
    setFilterOperator(operator);
    setFilterValuesLoading(true);
  };

  const addFilter = () => {
    if (filterField === "" || filterValue === "") {
      return;
    }
    const withoutField = state.filters.filter((filter) => filter.field !== filterField);
    onStateChange({
      ...state,
      filters: [
        ...withoutField,
        { field: filterField, operator: filterOperator, value: filterValue },
      ],
      page: 0,
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const toggleAll = () => {
    const rowIds = rows.map(rowKey);
    const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      rowIds.forEach((id) => {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  const selectView = (id: string) => {
    setSelectedViewId(id);
    const view = savedViews.find((candidate) => candidate.id === id);
    if (view !== undefined) {
      onStateChange({
        ...state,
        columns: view.columns.filter((key) => columns.some((column) => column.key === key)),
        filters: view.filters,
        page: 0,
        sort: view.sort,
      });
      setViewName(view.name);
      setSharedView(view.shared);
    }
  };

  const runSavedViewAction = (action: Promise<UniversalListSavedView | undefined>) => {
    setSavedViewError(false);
    void action.then(
      (view) => {
        if (view !== undefined) {
          setSelectedViewId(view.id);
          setViewName(view.name);
        }
      },
      () => {
        setSavedViewError(true);
      },
    );
  };

  return (
    <section aria-label={caption} className="ah-universal-list">
      {error === undefined ? null : (
        <Toast dismissLabel={labels.closeError} tone="danger">
          <span>{error}</span>
          <Button onClick={onRetry} variant="ghost">
            {labels.retry}
          </Button>
        </Toast>
      )}

      <div className="ah-universal-list__toolbar">
        <label className="ah-universal-list__search">
          <span className="ah-sr-only">{labels.search}</span>
          <Icon aria-hidden="true" name="search" />
          <input
            aria-label={labels.search}
            onChange={(event) => {
              setSearchValue(event.currentTarget.value);
            }}
            placeholder={labels.search}
            type="search"
            value={searchValue}
          />
        </label>

        <select
          aria-label={statusFilter.label}
          className="ah-universal-list__status"
          onChange={(event) => {
            const value = event.currentTarget.value;
            const withoutStatus = state.filters.filter(
              (filter) => filter.field !== statusFilter.field,
            );
            onStateChange({
              ...state,
              filters:
                value === ""
                  ? withoutStatus
                  : [...withoutStatus, { field: statusFilter.field, operator: "eq", value }],
              page: 0,
            });
          }}
          value={statusValue}
        >
          {statusFilter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <details className="ah-universal-list__menu ah-universal-list__filter-menu">
          <summary
            className={universalFilters.length > 0 ? "ah-universal-list__summary--active" : ""}
          >
            <Icon aria-hidden="true" name="filter" />
            {universalFilters.length === 0
              ? labels.filter
              : `${labels.filter} (${String(universalFilters.length)}): ${formatActiveFilter(universalFilters)}`}
            <span aria-hidden="true">▾</span>
          </summary>
          <div className="ah-universal-list__menu-panel">
            {universalFilters.map((filter) => (
              <div className="ah-universal-list__active-filter" key={filter.field}>
                <span>{`${filter.fieldLabel} = «${filter.valueLabel}»`}</span>
                <button
                  aria-label={labels.removeFilter(filter.fieldLabel)}
                  onClick={() => {
                    onStateChange({
                      ...state,
                      filters: state.filters.filter((item) => item.field !== filter.field),
                      page: 0,
                    });
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" name="x" />
                </button>
              </div>
            ))}
            <label>
              <span>{labels.filterField}</span>
              <select onChange={changeFilterField} value={filterField}>
                {filterColumns.map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{labels.filterOperator}</span>
              <select
                onChange={(event) => {
                  if (isFilterOperator(event.currentTarget.value)) {
                    setFilterOperator(event.currentTarget.value);
                  }
                }}
                value={filterOperator}
              >
                {(
                  selectedFilterColumn?.operators ??
                  (selectedFilterColumn === undefined
                    ? ["eq"]
                    : UNIVERSAL_FILTER_OPERATORS[selectedFilterColumn.type])
                ).map((operator) => (
                  <option key={operator} value={operator}>
                    {labels.operators[operator]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{labels.filterValue}</span>
              <select
                aria-busy={filterValuesLoading || undefined}
                disabled={filterValuesLoading || filterValues.length === 0}
                onChange={(event) => {
                  setFilterValue(event.currentTarget.value);
                }}
                value={filterValue}
              >
                {filterValuesLoading ? (
                  <option>{labels.loadingFilterValues}</option>
                ) : (
                  filterValues.map((value) => (
                    <option key={value.value} value={value.value}>
                      {`${value.label} (${String(value.count)})`}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="ah-universal-list__menu-actions">
              <Button disabled={filterValue === ""} onClick={addFilter}>
                {labels.addFilter}
              </Button>
              <Button
                onClick={() => {
                  onStateChange({
                    ...state,
                    filters: state.filters.filter((filter) => filter.field === statusFilter.field),
                    page: 0,
                  });
                }}
                variant="ghost"
              >
                {labels.clearFilters}
              </Button>
            </div>
          </div>
        </details>

        <details className="ah-universal-list__menu">
          <summary>
            {labels.columns} <span aria-hidden="true">▾</span>
          </summary>
          <div className="ah-universal-list__menu-panel">
            <ul className="ah-universal-list__columns">
              {orderedColumns.map((column) => (
                <li
                  draggable
                  key={column.key}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDragStart={() => {
                    draggedColumn.current = column.key;
                  }}
                  onDrop={(event: DragEvent<HTMLLIElement>) => {
                    event.preventDefault();
                    const source = draggedColumn.current;
                    const target = column.key;
                    if (source === "" || source === target) {
                      return;
                    }
                    const order = orderedColumns.map((item) => item.key);
                    const from = order.indexOf(source);
                    const to = order.indexOf(target);
                    if (from < 0 || to < 0) {
                      return;
                    }
                    order.splice(from, 1);
                    order.splice(to, 0, source);
                    onStateChange({
                      ...state,
                      columns: order.filter((key) => state.columns.includes(key)),
                    });
                  }}
                >
                  <span aria-hidden="true">↕</span>
                  <label>
                    <Checkbox
                      checked={state.columns.includes(column.key)}
                      onChange={() => {
                        onStateChange({
                          ...state,
                          columns: state.columns.includes(column.key)
                            ? state.columns.filter((key) => key !== column.key)
                            : [...state.columns, column.key],
                        });
                      }}
                    />
                    {column.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details className="ah-universal-list__menu">
          <summary>
            {selectedView === undefined ? labels.views : labels.view(selectedView.name)}
            <span aria-hidden="true">▾</span>
          </summary>
          <div className="ah-universal-list__menu-panel ah-universal-list__views">
            <label>
              <span>{labels.views}</span>
              <select
                onChange={(event) => {
                  selectView(event.currentTarget.value);
                }}
                value={selectedViewId}
              >
                <option value="">{labels.noSavedView}</option>
                {savedViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{labels.saveViewName}</span>
              <input
                maxLength={40}
                onChange={(event) => {
                  setViewName(event.currentTarget.value);
                }}
                value={viewName}
              />
            </label>
            <label className="ah-universal-list__check-label">
              <Checkbox
                checked={sharedView}
                onChange={(event) => {
                  setSharedView(event.currentTarget.checked);
                }}
              />
              {labels.sharedView}
            </label>
            <label className="ah-universal-list__check-label">
              <Checkbox
                checked={selectedViewId !== "" && defaultViewId === selectedViewId}
                disabled={selectedViewId === ""}
                onChange={(event) => {
                  const id = event.currentTarget.checked ? selectedViewId : "";
                  setDefaultViewId(id);
                  if (typeof localStorage !== "undefined") {
                    if (id === "") {
                      localStorage.removeItem(defaultViewStorageKey(listKey));
                    } else {
                      localStorage.setItem(defaultViewStorageKey(listKey), id);
                    }
                  }
                }}
              />
              {labels.defaultView}
            </label>
            <div className="ah-universal-list__menu-actions">
              <Button
                disabled={viewName.trim() === ""}
                onClick={() => {
                  runSavedViewAction(onCreateView(viewName.trim(), sharedView, state));
                }}
              >
                {labels.createView}
              </Button>
              <Button
                disabled={selectedView === undefined || viewName.trim() === ""}
                onClick={() => {
                  if (selectedView !== undefined) {
                    runSavedViewAction(onRenameView(selectedView, viewName.trim()));
                  }
                }}
                variant="ghost"
              >
                {labels.renameView}
              </Button>
              <Button
                disabled={selectedView === undefined}
                onClick={() => {
                  if (selectedView !== undefined) {
                    runSavedViewAction(onDeleteView(selectedView.id).then(() => undefined));
                    setSelectedViewId("");
                    setViewName("");
                  }
                }}
                variant="danger"
              >
                {labels.deleteView}
              </Button>
            </div>
            {savedViewError ? <p role="alert">{labels.saveError}</p> : null}
          </div>
        </details>

        <details className="ah-universal-list__menu ah-universal-list__export">
          <summary>
            <Icon aria-hidden="true" name="export" />
            {labels.export}
          </summary>
          <div className="ah-universal-list__menu-panel">
            <a download href={getExportHref("xlsx", state)}>
              {labels.formatXlsx}
            </a>
            <a download href={getExportHref("pdf", state)}>
              {labels.formatPdf}
            </a>
          </div>
        </details>
      </div>

      <div className="ah-universal-list__table-wrap">
        <table>
          <caption className="ah-sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th className="ah-universal-list__selection" scope="col">
                  <Checkbox
                    aria-label={labels.selectAll}
                    checked={rows.length > 0 && rows.every((row) => selected.has(rowKey(row)))}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              {visibleColumns.map((column) => {
                const sortKey = column.sortKey;
                const activeSort = state.sort[0]?.split(",");
                const sorted = activeSort?.[0] === sortKey;
                const direction = sorted ? activeSort?.[1] : undefined;
                return (
                  <th key={column.key} scope="col">
                    {sortKey === undefined ? (
                      column.label
                    ) : (
                      <button
                        aria-label={
                          direction === "asc"
                            ? labels.sortDescending(column.label)
                            : labels.sortAscending(column.label)
                        }
                        onClick={() => {
                          onStateChange({
                            ...state,
                            page: 0,
                            sort: [`${sortKey},${direction === "asc" ? "desc" : "asc"}`],
                          });
                        }}
                        type="button"
                      >
                        {column.label}
                        {sorted ? (
                          <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
                        ) : null}
                      </button>
                    )}
                  </th>
                );
              })}
              <th className="ah-universal-list__chevron" scope="col" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, index) => (
                  <tr key={index}>
                    <td colSpan={visibleColumns.length + (selectable ? 2 : 1)}>
                      <Skeleton label={labels.loading} />
                    </td>
                  </tr>
                ))
              : rows.map((row) => {
                  const id = rowKey(row);
                  const href = rowHref(row);
                  return (
                    <tr key={id}>
                      {selectable ? (
                        <td className="ah-universal-list__selection">
                          <Checkbox
                            aria-label={labels.selectRow(row)}
                            checked={selected.has(id)}
                            onChange={() => {
                              setSelected((current) => {
                                const next = new Set(current);
                                if (next.has(id)) {
                                  next.delete(id);
                                } else {
                                  next.add(id);
                                }
                                return next;
                              });
                            }}
                          />
                        </td>
                      ) : null}
                      {visibleColumns.map((column) => (
                        <td key={column.key}>
                          <a href={href}>{column.render(row)}</a>
                        </td>
                      ))}
                      <td className="ah-universal-list__chevron">
                        <a href={href}>
                          <Icon aria-hidden="true" name="chev" />
                          <span className="ah-sr-only">{labels.selectRow(row)}</span>
                        </a>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setSearchValue("");
                  onStateChange({
                    ...state,
                    filters: state.filters.filter((filter) => filter.field === statusFilter.field),
                    page: 0,
                    q: "",
                  });
                }}
                variant="secondary"
              >
                {labels.clearFilters}
              </Button>
            }
            description={labels.emptyDescription}
            icon="search"
            title={labels.emptyTitle}
          />
        ) : null}
      </div>

      <footer className="ah-universal-list__footer">
        <div className="ah-universal-list__bulk">
          {selectedIds.length === 0 || bulkActions === undefined ? null : (
            <>
              <strong>{labels.selected(selectedIds.length)}</strong>
              {bulkActions(selectedIds, clearSelection)}
            </>
          )}
        </div>
        <div className="ah-universal-list__pagination">
          <button
            aria-label={labels.previousPage}
            disabled={state.page <= 0}
            onClick={() => {
              onStateChange({ ...state, page: Math.max(0, state.page - 1) });
            }}
            type="button"
          >
            <Icon aria-hidden="true" name="chev" />
          </button>
          <span>{labels.page(state.page + 1, Math.max(totalPages, 1))}</span>
          <button
            aria-label={labels.nextPage}
            disabled={state.page + 1 >= totalPages}
            onClick={() => {
              onStateChange({ ...state, page: state.page + 1 });
            }}
            type="button"
          >
            <Icon aria-hidden="true" name="chev" />
          </button>
          <label>
            <span className="ah-sr-only">{labels.rowsPerPage}</span>
            <select
              aria-label={labels.rowsPerPage}
              onChange={(event) => {
                const size = Number(event.currentTarget.value);
                if (isPageSize(size)) {
                  onStateChange({ ...state, page: 0, size });
                }
              }}
              value={state.size}
            >
              {UNIVERSAL_LIST_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {`${String(size)} ${labels.rowsPerPage}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </footer>
    </section>
  );
}
