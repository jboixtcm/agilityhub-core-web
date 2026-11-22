import type { ApiClient, components } from "@agilityhub/api-client";
import type { UniversalFilter, UniversalListSavedView, UniversalListState } from "@agilityhub/ui";
import { useEffect, useState } from "react";

type SavedView = components["schemas"]["SavedView"];

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function toSavedView(view: SavedView): UniversalListSavedView {
  return {
    columns: [...view.columns],
    filters: view.filters.map((filter) => ({
      field: filter.field,
      operator: filter.op,
      value: filterValue(filter.value),
    })),
    id: view.id,
    name: view.name,
    shared: view.shared,
    sort: [...view.sort],
  };
}

/** Saved views of a universal list (`/saved-views?listKey=`), as D5. */
export function useSavedViews(
  client: ApiClient,
  listKey: string,
  onDefault: (view: UniversalListSavedView) => void,
) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let current = true;
    void client.GET("/saved-views", { params: { query: { listKey: listKey } } }).then(
      (result) => {
        if (!current || result.data === undefined) return;
        setViews(result.data);
        const defaultId = localStorage.getItem(`agilityhub.list.defaultView.${listKey}`);
        const view = result.data.find((item) => item.id === defaultId);
        if (view !== undefined && new URLSearchParams(window.location.search).size === 0) {
          onDefault(toSavedView(view));
        }
        setResolved(true);
      },
      () => {
        if (current) setResolved(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, listKey, onDefault]);

  const filters = (state: { filters: UniversalFilter[] }) =>
    state.filters.map((filter) => ({
      field: filter.field,
      op: filter.operator,
      value: filter.value,
    }));

  return {
    create: async (name: string, shared: boolean, state: UniversalListState) => {
      const result = await client.POST("/saved-views", {
        body: {
          columns: state.columns,
          filters: filters(state),
          listKey: listKey,
          name,
          shared,
          sort: state.sort,
        },
      });
      if (result.data === undefined)
        throw new TypeError("Saved view response did not contain data");
      const created = result.data;
      setViews((current) => [...current, created]);
      return toSavedView(created);
    },
    remove: async (id: string) => {
      await client.DELETE("/saved-views/{id}", { params: { path: { id } } });
      setViews((current) => current.filter((view) => view.id !== id));
    },
    rename: async (view: UniversalListSavedView, name: string) => {
      const source = views.find((item) => item.id === view.id);
      if (source === undefined) throw new TypeError("Saved view version is unavailable");
      const result = await client.PUT("/saved-views/{id}", {
        body: {
          columns: view.columns,
          filters: filters(view),
          listKey: listKey,
          name,
          shared: view.shared,
          sort: view.sort,
          version: source.version,
        },
        params: { path: { id: view.id } },
      });
      if (result.data === undefined)
        throw new TypeError("Saved view response did not contain data");
      const updated = result.data;
      setViews((current) => current.map((item) => (item.id === view.id ? updated : item)));
      return toSavedView(updated);
    },
    resolved,
    views: views.map(toSavedView),
  };
}
