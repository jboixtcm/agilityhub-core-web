import type { components } from "@agilityhub/api-client";
import {
  readUniversalListState,
  type UniversalFilter,
  type UniversalFilterOperator,
  type UniversalListSavedView,
  type UniversalListState,
  universalListSearchParams,
} from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import type { useTranslation } from "react-i18next";

type Translate = ReturnType<typeof useTranslation>["t"];

/** `filter=field:op:value` of the universal lists (CONVENCIONS_API §4). */
export function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

export interface ListData<Row> {
  appliedFilters: components["schemas"]["Filter"][];
  items: Row[];
  totalPages: number;
}

/** A list's rows for its state; an answer for an older state is dropped. */
export function useListData<Row>(load: () => Promise<ListData<Row>>, key: string) {
  const [reload, setReload] = useState(0);
  const requestKey = `${key}|${String(reload)}`;
  const [state, setState] = useState<{ data?: ListData<Row>; error?: unknown; key: string }>({
    key: "",
  });
  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) setState({ data, key: requestKey });
      },
      (error: unknown) => {
        if (current) setState((previous) => ({ ...previous, error, key: requestKey }));
      },
    );
    return () => {
      current = false;
    };
    // `load` is rebuilt on every render; the request identity is `requestKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  return {
    data: state.data,
    error: state.key === requestKey ? state.error : undefined,
    loading: state.key !== requestKey,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}

/**
 * The list's state in the URL (`?page=…&filter=…`), with the page's own parameters kept next to
 * it (`extra`, e.g. the register's tab `vista=`).
 */
export function useUrlListState(
  defaults: Parameters<typeof readUniversalListState>[1],
  extra: Readonly<Record<string, string>> = {},
) {
  const [state, setState] = useState(() =>
    readUniversalListState(window.location.search, defaults),
  );
  const extraKey = JSON.stringify(extra);
  const write = useCallback(
    (next: UniversalListState) => {
      const parameters = universalListSearchParams(next);
      for (const [key, value] of Object.entries(JSON.parse(extraKey) as Record<string, string>)) {
        parameters.set(key, value);
      }
      window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
    },
    [extraKey],
  );
  const update = useCallback(
    (next: UniversalListState) => {
      write(next);
      setState(next);
    },
    [write],
  );
  const applySavedView = useCallback(
    (view: UniversalListSavedView) => {
      setState((current) => {
        const next = {
          ...current,
          columns: view.columns,
          filters: view.filters,
          page: 0,
          sort: view.sort,
        };
        write(next);
        return next;
      });
    },
    [write],
  );
  return [state, update, applySavedView] as const;
}

/** The labels every universal list of the back office shares (D5's, `census:list.*`). */
export function universalListLabels(t: Translate, emptyDescription: string) {
  const operators: Record<UniversalFilterOperator, string> = {
    between: t("census:list.operators.between"),
    contains: t("census:list.operators.contains"),
    eq: t("census:list.operators.eq"),
    exists: t("census:list.operators.exists"),
    gt: t("census:list.operators.gt"),
    gte: t("census:list.operators.gte"),
    in: t("census:list.operators.in"),
    lt: t("census:list.operators.lt"),
    lte: t("census:list.operators.lte"),
    ne: t("census:list.operators.ne"),
    nin: t("census:list.operators.nin"),
    startsWith: t("census:list.operators.startsWith"),
  };
  return {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription,
    export: t("census:list.export"),
    filter: t("census:list.filter"),
    filterField: t("census:list.filterField"),
    filterOperator: t("census:list.filterOperator"),
    filterValue: t("census:list.filterValue"),
    formatPdf: t("census:list.formatPdf"),
    formatXlsx: t("census:list.formatXlsx"),
    loading: t("census:list.loading"),
    loadingFilterValues: t("census:list.loadingFilterValues"),
    nextPage: t("census:list.nextPage"),
    noSavedView: t("census:list.noSavedView"),
    operators,
    page: (page: number, totalPages: number) => t("census:list.page", { page, totalPages }),
    previousPage: t("census:list.previousPage"),
    removeFilter: (field: string) => t("census:list.removeFilter", { field }),
    renameView: t("census:list.renameView"),
    retry: t("census:list.retry"),
    rowsPerPage: t("census:list.rowsPerPage"),
    saveError: t("census:list.saveError"),
    saveViewName: t("census:list.saveViewName"),
    selectAll: t("census:list.selectAll"),
    selected: (count: number) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column: string) => t("census:list.sortAscending", { column }),
    sortDescending: (column: string) => t("census:list.sortDescending", { column }),
    view: (name: string) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };
}
