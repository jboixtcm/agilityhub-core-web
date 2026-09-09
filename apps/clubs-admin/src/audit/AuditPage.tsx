import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Badge,
  Drawer,
  Icon,
  Toast,
  UniversalList,
  type UniversalFilter,
  type UniversalFilterOperator,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
  type UniversalListSavedView,
  type UniversalListState,
  readUniversalListState,
  universalListSearchParams,
  useBranding,
} from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useExportsDrawer } from "./ExportsDrawer";

type AuditEntry = components["schemas"]["AuditEntry"];
type AuditEntryListItem = components["schemas"]["AuditEntryListItem"];
type AuditListResponse = components["schemas"]["ListPageAuditEntryListItem"];
type ExportAccepted = components["schemas"]["ExportAccepted"];
type ListFilter = components["schemas"]["Filter"];
type SavedView = components["schemas"]["SavedView"];
type SavedViewCreate = components["schemas"]["SavedViewCreate"];
type SavedViewUpdate = components["schemas"]["SavedViewUpdate"];
type Translation = ReturnType<typeof useTranslation>["t"];

const DEFAULT_COLUMNS = [
  "at",
  "action",
  "entityLabel",
  "actorName",
  "impersonatedName",
  "changes",
  "origin",
];

const FEATURED_ACTIONS: readonly AuditEntryListItem["action"][] = [
  "MEMBER_UPDATED",
  "MEMBER_PAYMENT_METHOD_CHANGED",
  "MEMBER_PLAN_CHANGED",
  "DOG_LEVEL_CHANGED",
  "PARAMETER_CHANGED",
  "DATA_EXPORTED",
];

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function savedViewFilters(filters: readonly UniversalFilter[]): ListFilter[] {
  return filters.map((filter) => ({
    field: filter.field,
    op: filter.operator,
    value: filter.value,
  }));
}

function universalFilters(filters: readonly ListFilter[]): UniversalFilter[] {
  return filters.map((filter) => ({
    field: filter.field,
    operator: filter.op,
    value: scalar(filter.value),
  }));
}

function toUniversalSavedView(view: SavedView): UniversalListSavedView {
  return {
    columns: [...view.columns],
    filters: universalFilters(view.filters),
    id: view.id,
    name: view.name,
    shared: view.shared,
    sort: [...view.sort],
  };
}

function queryFor(state: UniversalListState) {
  return {
    fields: state.columns.join(","),
    filter: apiFilters(state.filters),
    page: state.page,
    ...(state.q === "" ? {} : { q: state.q }),
    size: state.size,
    sort: state.sort,
  };
}

function actionLabel(t: Translation, action: string): string {
  return t(`admin-audit:actions.${action}`, { defaultValue: action });
}

function originLabel(t: Translation, origin: AuditEntryListItem["origin"]): string {
  switch (origin) {
    case "APP":
      return t("admin-audit:origins.APP");
    case "BACKOFFICE":
      return t("admin-audit:origins.BACKOFFICE");
    case "SYSTEM":
      return t("admin-audit:origins.SYSTEM");
    case "WEBHOOK":
      return t("admin-audit:origins.WEBHOOK");
  }
}

function roleLabel(t: Translation, role: AuditEntryListItem["actorRole"]): string {
  switch (role) {
    case "ADMIN":
      return t("admin-audit:roles.ADMIN");
    case "INSTRUCTOR":
      return t("admin-audit:roles.INSTRUCTOR");
    case "MEMBER":
      return t("admin-audit:roles.MEMBER");
    case "PLATFORM":
      return t("admin-audit:roles.PLATFORM");
    case "SYSTEM":
      return t("admin-audit:roles.SYSTEM");
    case "WEBHOOK":
      return t("admin-audit:roles.WEBHOOK");
  }
}

function filterLabel(t: Translation, field: string, value: string): string {
  if (field === "action") return actionLabel(t, value);
  if (field === "origin" && ["APP", "BACKOFFICE", "SYSTEM", "WEBHOOK"].includes(value)) {
    return originLabel(t, value as AuditEntryListItem["origin"]);
  }
  if (
    field === "actorRole" &&
    ["ADMIN", "INSTRUCTOR", "MEMBER", "PLATFORM", "SYSTEM", "WEBHOOK"].includes(value)
  ) {
    return roleLabel(t, value as AuditEntryListItem["actorRole"]);
  }
  return value;
}

function auditValue(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function initialFilters(memberId: string | undefined): UniversalFilter[] {
  if (memberId !== undefined) return [];
  const parameters = new URLSearchParams(window.location.search);
  return ["entityType", "entityId"].flatMap((field) => {
    const value = parameters.get(field);
    return value === null ? [] : [{ field, operator: "eq" as const, value }];
  });
}

function useAuditState(memberId: string | undefined) {
  const defaults = useMemo(
    () => ({
      columns: DEFAULT_COLUMNS,
      filters: initialFilters(memberId),
      size: 50 as const,
      sort: ["at,desc"],
    }),
    [memberId],
  );
  const [state, setState] = useState(() =>
    readUniversalListState(window.location.search, defaults),
  );
  const update = useCallback((next: UniversalListState) => {
    const parameters = universalListSearchParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
    setState(next);
  }, []);
  const applySavedView = useCallback((view: UniversalListSavedView) => {
    setState((current) => {
      const next = {
        ...current,
        columns: view.columns,
        filters: view.filters,
        page: 0,
        sort: view.sort,
      };
      const parameters = universalListSearchParams(next);
      window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
      return next;
    });
  }, []);
  return [state, update, applySavedView] as const;
}

function useAuditData(client: ApiClient, memberId: string | undefined, state: UniversalListState) {
  const [data, setData] = useState<AuditListResponse>();
  const [error, setError] = useState<unknown>();
  const [completedKey, setCompletedKey] = useState("");
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify({ memberId, reload, state });

  useEffect(() => {
    let current = true;
    const request =
      memberId === undefined
        ? client.GET("/audit-entries", { params: { query: queryFor(state) } })
        : client.GET("/members/{id}/audit-entries", {
            params: { path: { id: memberId }, query: queryFor(state) },
          });
    void request.then(
      (result) => {
        if (!current) return;
        if (result.data === undefined) {
          setError(new TypeError("Audit response did not contain data"));
        } else {
          setData(result.data);
          setError(undefined);
        }
        setCompletedKey(requestKey);
      },
      (reason: unknown) => {
        if (current) {
          setError(reason);
          setCompletedKey(requestKey);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, memberId, requestKey, state]);

  return {
    data,
    error,
    loading: completedKey !== requestKey,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}

function useSavedViews(client: ApiClient, onDefaultView: (view: UniversalListSavedView) => void) {
  const listKey = "audit-entries";
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    let current = true;
    void client.GET("/saved-views", { params: { query: { listKey } } }).then((result) => {
      if (current && result.data !== undefined) {
        setViews(result.data);
        const defaultId = localStorage.getItem(`agilityhub.list.defaultView.${listKey}`);
        const defaultView = result.data.find((view) => view.id === defaultId);
        if (defaultView !== undefined && new URLSearchParams(window.location.search).size === 0) {
          onDefaultView(toUniversalSavedView(defaultView));
        }
      }
    });
    return () => {
      current = false;
    };
  }, [client, onDefaultView]);

  const create = async (name: string, shared: boolean, state: UniversalListState) => {
    const body: SavedViewCreate = {
      columns: state.columns,
      filters: savedViewFilters(state.filters),
      listKey,
      name,
      shared,
      sort: state.sort,
    };
    const result = await client.POST("/saved-views", { body });
    if (result.data === undefined) throw new TypeError("Saved view response did not contain data");
    setViews((current) => [...current, result.data]);
    return toUniversalSavedView(result.data);
  };
  const rename = async (view: UniversalListSavedView, name: string) => {
    const source = views.find((item) => item.id === view.id);
    if (source === undefined) throw new TypeError("Saved view version is unavailable");
    const body: SavedViewUpdate = {
      columns: view.columns,
      filters: savedViewFilters(view.filters),
      listKey,
      name,
      shared: view.shared,
      sort: view.sort,
      version: source.version,
    };
    const result = await client.PUT("/saved-views/{id}", {
      body,
      params: { path: { id: view.id } },
    });
    if (result.data === undefined) throw new TypeError("Saved view response did not contain data");
    setViews((current) => current.map((item) => (item.id === view.id ? result.data : item)));
    return toUniversalSavedView(result.data);
  };
  const remove = async (id: string) => {
    await client.DELETE("/saved-views/{id}", { params: { path: { id } } });
    setViews((current) => current.filter((view) => view.id !== id));
  };
  return { create, remove, rename, views: views.map(toUniversalSavedView) };
}

function DetailDrawer({
  client,
  entryId,
  onClose,
}: {
  client: ApiClient;
  entryId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin-audit");
  const [entry, setEntry] = useState<AuditEntry>();
  const [failedEntryId, setFailedEntryId] = useState<string>();
  useEffect(() => {
    if (entryId === undefined) return undefined;
    let current = true;
    void client.GET("/audit-entries/{id}", { params: { path: { id: entryId } } }).then(
      (result) => {
        if (current && result.data !== undefined) setEntry(result.data);
      },
      () => {
        if (current) setFailedEntryId(entryId);
      },
    );
    return () => {
      current = false;
    };
  }, [client, entryId]);

  return (
    <Drawer
      closeLabel={t("admin-audit:drawer.close")}
      onClose={onClose}
      open={entryId !== undefined}
      title={t("admin-audit:drawer.title")}
    >
      {failedEntryId === entryId ? (
        <p role="alert">{t("admin-audit:drawer.genericError")}</p>
      ) : entry === undefined || entry.id !== entryId ? (
        <p role="status">{t("admin-audit:drawer.loading")}</p>
      ) : (
        <div className="audit-detail">
          <dl>
            <div>
              <dt>{t("admin-audit:drawer.action")}</dt>
              <dd>{actionLabel(t, entry.action)}</dd>
            </div>
            <div>
              <dt>{t("admin-audit:drawer.entity")}</dt>
              <dd>{entry.entityLabel ?? entry.entityType}</dd>
            </div>
            <div>
              <dt>{t("admin-audit:drawer.actor")}</dt>
              <dd>{entry.actorName ?? roleLabel(t, entry.actorRole)}</dd>
            </div>
            <div>
              <dt>{t("admin-audit:drawer.origin")}</dt>
              <dd>{originLabel(t, entry.origin)}</dd>
            </div>
          </dl>
          <h3>{t("admin-audit:drawer.changes")}</h3>
          {entry.changes.length === 0 ? (
            <p>{t("admin-audit:drawer.noChanges")}</p>
          ) : (
            <ul className="audit-detail__changes">
              {entry.changes.map((change, index) => (
                <li key={`${change.path}-${String(index)}`}>
                  <strong>{change.path}</strong>
                  <div>
                    <span>{t("admin-audit:drawer.before")}</span>
                    <code>{auditValue(change.before, t("admin-audit:none"))}</code>
                  </div>
                  <Icon aria-hidden="true" name="chev" />
                  <div>
                    <span>{t("admin-audit:drawer.after")}</span>
                    <code>{auditValue(change.after, t("admin-audit:none"))}</code>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {entry.details === undefined ? null : (
            <>
              <h3>{t("admin-audit:drawer.details")}</h3>
              <pre>{JSON.stringify(entry.details, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function AuditTrail({ client, memberId }: { client: ApiClient; memberId?: string }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation(["admin-audit", "census", "errors"]);
  const { openExports } = useExportsDrawer();
  const [state, setState, applySavedView] = useAuditState(memberId);
  const { data, error, loading, retry } = useAuditData(client, memberId, state);
  const savedViews = useSavedViews(client, applySavedView);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("entry") ?? undefined,
  );
  const [exportError, setExportError] = useState<string>();
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;

  const filterColumns: UniversalListFilterColumn[] = [
    { key: "action", label: t("admin-audit:filters.action"), type: "enum" },
    { key: "at", label: t("admin-audit:filters.at"), operators: ["between"], type: "date" },
    { key: "entityType", label: t("admin-audit:filters.entity"), type: "relation" },
    { key: "entityId", label: t("admin-audit:filters.entityId"), type: "relation" },
    { key: "actorAccountId", label: t("admin-audit:filters.actor"), type: "relation" },
    { key: "actorRole", label: t("admin-audit:filters.actorRole"), type: "enum" },
    { key: "impersonatedMemberId", label: t("admin-audit:filters.asMember"), type: "relation" },
    { key: "origin", label: t("admin-audit:filters.origin"), type: "enum" },
  ];
  const columns = useMemo<UniversalListColumn<AuditEntryListItem>[]>(
    () => [
      {
        key: "at",
        label: t("admin-audit:columns.at"),
        render: (entry) =>
          new Intl.DateTimeFormat(locale, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: branding.timeZone,
          }).format(new Date(entry.at)),
        sortKey: "at",
      },
      {
        key: "action",
        label: t("admin-audit:columns.action"),
        render: (entry) => <strong>{actionLabel(t, entry.action)}</strong>,
      },
      {
        key: "entityLabel",
        label: t("admin-audit:columns.entity"),
        render: (entry) => entry.entityLabel ?? entry.entityType,
      },
      {
        key: "actorName",
        label: t("admin-audit:columns.actor"),
        render: (entry) => entry.actorName ?? roleLabel(t, entry.actorRole),
      },
      {
        key: "impersonatedName",
        label: t("admin-audit:columns.asMember"),
        render: (entry) =>
          entry.impersonatedName === undefined
            ? t("admin-audit:none")
            : t("admin-audit:asMember", { name: entry.impersonatedName }),
      },
      {
        key: "changes",
        label: t("admin-audit:columns.changes"),
        render: (entry) => t("admin-audit:changesCount", { count: entry.changes.length }),
      },
      {
        key: "origin",
        label: t("admin-audit:columns.origin"),
        render: (entry) => <Badge>{originLabel(t, entry.origin)}</Badge>,
      },
      {
        key: "details",
        label: t("admin-audit:columns.details"),
        render: (entry) => auditValue(entry.details, t("admin-audit:none")),
      },
    ],
    [branding.timeZone, locale, t],
  );
  const loadFilterValues = useCallback(
    async (field: string) => {
      const query = {
        field,
        filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
        ...(state.q === "" ? {} : { q: state.q }),
      };
      const result = await client.GET("/audit-entries/filter-values", { params: { query } });
      if (result.data === undefined)
        throw new TypeError("Filter values response did not contain data");
      return result.data.values.map((item) => {
        const value = scalar(item.value);
        return { count: item.count, label: filterLabel(t, field, value), value };
      });
    },
    [client, state.filters, state.q, t],
  );

  const operatorLabels: Record<UniversalFilterOperator, string> = {
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
  const labels: UniversalListLabels<AuditEntryListItem> = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription: t("admin-audit:emptyDescription"),
    emptyTitle: t("admin-audit:emptyTitle"),
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
    operators: operatorLabels,
    page: (page, totalPages) => t("census:list.page", { page, totalPages }),
    previousPage: t("census:list.previousPage"),
    removeFilter: (field) => t("census:list.removeFilter", { field }),
    renameView: t("census:list.renameView"),
    retry: t("census:list.retry"),
    rowsPerPage: t("census:list.rowsPerPage"),
    saveError: t("census:list.saveError"),
    saveViewName: t("census:list.saveViewName"),
    search: t("admin-audit:search"),
    selectAll: t("census:list.selectAll"),
    selected: (count) => t("census:list.selected", { count }),
    selectRow: (entry) => t("admin-audit:rowLabel", { action: actionLabel(t, entry.action) }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column) => t("census:list.sortAscending", { column }),
    sortDescending: (column) => t("census:list.sortDescending", { column }),
    view: (name) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };
  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = scalar(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel: filterLabel(t, filter.field, value),
    };
  });

  const exportAudit = async (format: "pdf" | "xlsx", current: UniversalListState) => {
    setExportError(undefined);
    const filter = apiFilters(current.filters);
    if (memberId !== undefined) filter.push(`memberId:eq:${memberId}`);
    try {
      const result = await client.GET("/audit-entries/export", {
        params: {
          query: {
            columns: current.columns.join(","),
            filter,
            format,
            ...(current.q === "" ? {} : { q: current.q }),
            sort: current.sort,
          },
        },
      });
      if (result.response.status === 202) {
        const accepted = result.data as ExportAccepted | undefined;
        if (accepted === undefined || typeof accepted !== "object" || !("jobId" in accepted))
          throw new TypeError("Queued export response did not contain a job id");
        openExports({ jobId: accepted.jobId });
        return;
      }
      const contents = typeof result.data === "string" ? result.data : "";
      const url = URL.createObjectURL(
        new Blob([contents], {
          type: result.response.headers.get("Content-Type") ?? "application/octet-stream",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download =
        result.response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/u)?.[1] ??
        `audit.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      if (isApiError(reason, "EXPORT_LIMIT")) openExports({ errorCode: "EXPORT_LIMIT" });
      else setExportError(t("admin-audit:genericError"));
    }
  };

  const exportHref = (format: "pdf" | "xlsx", current: UniversalListState) => {
    const parameters = universalListSearchParams(current);
    parameters.delete("page");
    parameters.delete("size");
    parameters.delete("fields");
    parameters.set("format", format);
    parameters.set("columns", current.columns.join(","));
    if (memberId !== undefined) parameters.append("filter", `memberId:eq:${memberId}`);
    return `/api/v1/audit-entries/export?${parameters.toString()}`;
  };
  const detailHref = (entry: AuditEntryListItem) => {
    const path = memberId === undefined ? "/auditoria" : `/abonats/${memberId}/auditoria`;
    const parameters = universalListSearchParams(state);
    parameters.set("entry", entry.id);
    return `${path}?${parameters.toString()}`;
  };
  const closeDetail = () => {
    const parameters = new URLSearchParams(window.location.search);
    parameters.delete("entry");
    window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
    setSelectedId(undefined);
  };

  return (
    <>
      {exportError === undefined ? null : <Toast tone="danger">{exportError}</Toast>}
      <UniversalList<AuditEntryListItem>
        appliedFilters={applied}
        caption={memberId === undefined ? t("admin-audit:caption") : t("admin-audit:memberCaption")}
        columns={columns}
        {...(error === undefined
          ? {}
          : {
              error: isApiError(error, "INVALID_FILTER")
                ? t("errors:INVALID_FILTER")
                : t("admin-audit:genericError"),
            })}
        filterColumns={filterColumns}
        getExportHref={exportHref}
        labels={labels}
        listKey="audit-entries"
        loadFilterValues={loadFilterValues}
        loading={loading}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={(format, current) => void exportAudit(format, current)}
        onRenameView={savedViews.rename}
        onRetry={retry}
        onRowActivate={(entry) => {
          const parameters = new URLSearchParams(window.location.search);
          parameters.set("entry", entry.id);
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}?${parameters.toString()}`,
          );
          setSelectedId(entry.id);
        }}
        onStateChange={setState}
        rowHref={detailHref}
        rowKey={(entry) => entry.id}
        rows={data?.items ?? []}
        savedViews={savedViews.views}
        state={state}
        statusFilter={{
          field: "action",
          label: t("admin-audit:filters.action"),
          options: [
            { label: t("admin-audit:filters.allActions"), value: "" },
            ...FEATURED_ACTIONS.map((action) => ({ label: actionLabel(t, action), value: action })),
          ],
        }}
        totalPages={data?.totalPages ?? 0}
      />
      <DetailDrawer client={client} entryId={selectedId} onClose={closeDetail} />
    </>
  );
}

export function AuditPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation("admin-audit");
  return (
    <section className="audit-page">
      <header>
        <h1>{t("admin-audit:title")}</h1>
      </header>
      <AuditTrail client={client} />
    </section>
  );
}

export function MemberAuditPage({ client, id }: { client: ApiClient; id?: string }) {
  const { t } = useTranslation("admin-audit");
  const memberId =
    id ?? decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-2) ?? "");
  return (
    <section className="audit-page">
      <header>
        <h1>
          <a href={`/abonats/${memberId}`}>
            <Icon aria-hidden="true" name="chev" />
            {t("admin-audit:memberTitle")}
          </a>
        </h1>
      </header>
      <AuditTrail client={client} memberId={memberId} />
    </section>
  );
}
