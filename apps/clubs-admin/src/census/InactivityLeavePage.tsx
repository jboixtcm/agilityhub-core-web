import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { clubLocalInstant, fmtDateTime, fmtPlainDate, normalizeLocale, useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Tabs, UniversalList, type UniversalFilter, type UniversalFilterOperator, type UniversalFilterValue, type UniversalListColumn, type UniversalListFilterColumn, type UniversalListLabels, type UniversalListSavedView, type UniversalListState, useBranding } from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type InactivityRow = components["schemas"]["InactivityPeriodListItem"];
type LeaveRow = components["schemas"]["LeaveRequestListItem"];
type SavedView = components["schemas"]["SavedView"];
type SavedViewCreate = components["schemas"]["SavedViewCreate"];
type SavedViewUpdate = components["schemas"]["SavedViewUpdate"];

const INACTIVITY_DEFAULT: UniversalListState = {
  columns: ["member", "fromMonth", "toMonth", "state", "origin", "requestedAt"],
  filters: [{ field: "state", operator: "in", value: "REQUESTED,APPROVED,ACTIVE" }],
  page: 0,
  q: "",
  size: 50,
  sort: ["fromMonth,asc"],
};
const LEAVE_DEFAULT: UniversalListState = {
  columns: ["member", "requestedDate", "effectiveDate", "reasonKey", "source", "state", "nps"],
  filters: [{ field: "state", operator: "eq", value: "PENDING" }],
  page: 0,
  q: "",
  size: 50,
  sort: ["requestedAt,asc"],
};

function apiFilters(filters: readonly UniversalFilter[]) {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function savedViewFilters(filters: readonly UniversalFilter[]): components["schemas"]["Filter"][] {
  return filters.map((filter) => ({ field: filter.field, op: filter.operator, value: filter.value }));
}

function toSavedView(view: SavedView): UniversalListSavedView {
  return {
    columns: [...view.columns],
    filters: view.filters.map((filter) => ({ field: filter.field, operator: filter.op, value: filterValue(filter.value) })),
    id: view.id,
    name: view.name,
    shared: view.shared,
    sort: [...view.sort],
    system: view.system === true,
  };
}

function useSavedViews(client: ApiClient, listKey: string) {
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    let current = true;
    void client.GET("/saved-views", { params: { query: { listKey } } }).then((result) => {
      if (current && result.data !== undefined) setViews(result.data);
    });
    return () => { current = false; };
  }, [client, listKey]);
  const create = async (name: string, shared: boolean, state: UniversalListState) => {
    const body: SavedViewCreate = { columns: state.columns, filters: savedViewFilters(state.filters), listKey, name, shared, sort: state.sort };
    const result = await client.POST("/saved-views", { body });
    if (result.data === undefined) throw new TypeError("Saved view response did not contain data");
    setViews((current) => [...current, result.data]);
    return toSavedView(result.data);
  };
  const rename = async (view: UniversalListSavedView, name: string) => {
    const source = views.find((item) => item.id === view.id);
    if (source === undefined) throw new TypeError("Saved view version is unavailable");
    const body: SavedViewUpdate = { columns: view.columns, filters: savedViewFilters(view.filters), listKey, name, shared: view.shared, sort: view.sort, version: source.version };
    const result = await client.PUT("/saved-views/{id}", { body, params: { path: { id: view.id } } });
    if (result.data === undefined) throw new TypeError("Saved view response did not contain data");
    setViews((current) => current.map((item) => item.id === view.id ? result.data : item));
    return toSavedView(result.data);
  };
  const remove = async (id: string) => {
    await client.DELETE("/saved-views/{id}", { params: { path: { id } } });
    setViews((current) => current.filter((view) => view.id !== id));
  };
  return { create, remove, rename, views: views.map(toSavedView) };
}

// The row parameter preserves each UniversalList's exact generated projection.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function useQueue<Row extends InactivityRow | LeaveRow>(client: ApiClient, kind: "inactivity" | "leave", state: UniversalListState, enabled = true) {
  const [data, setData] = useState<{
    items: Row[];
    totalPages: number;
    appliedFilters: components["schemas"]["Filter"][];
  }>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    const query = {
      fields: Array.from(new Set(["member", ...state.columns])).join(","),
      filter: apiFilters(state.filters),
      page: state.page,
      ...(state.q === "" ? {} : { q: state.q }),
      size: state.size,
      sort: state.sort,
    };
    const result = kind === "inactivity" ? client.GET("/inactivity-periods", { params: { query } }) : client.GET("/leave-requests", { params: { query } });
    void result.then(
      (response) => {
        if (current) {
          setData(response.data as typeof data);
          setError(undefined);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (current) {
          setError(cause);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, enabled, kind, reload, state]);
  return {
    data,
    error,
    loading,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}

function useQueueFilterRows<Row extends InactivityRow | LeaveRow>(client: ApiClient, kind: "inactivity" | "leave", enabled = true) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!enabled) return undefined;
    const requestState = { current: true };
    const readPage = async (page: number) => {
      const query = kind === "inactivity"
        ? {
            fields: "member,fromMonth,toMonth,state,origin,requestedAt",
            page,
            size: 1000 as const,
            sort: ["fromMonth,asc"],
          }
        : {
            fields: "member,requestedDate,effectiveDate,reasonKey,source,state,nps,requestedAt",
            page,
            size: 1000 as const,
            sort: ["requestedAt,asc"],
          };
      const response = kind === "inactivity"
        ? await client.GET("/inactivity-periods", { params: { query } })
        : await client.GET("/leave-requests", { params: { query } });
      return {
        items: (response.data?.items ?? []) as Row[],
        totalPages: response.data?.totalPages ?? 0,
      };
    };
    void (async () => {
      try {
        const first = await readPage(0);
        const remaining = await Promise.all(
          Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => readPage(index + 1)),
        );
        if (requestState.current) setRows([first, ...remaining].flatMap((page) => page.items));
      } catch {
        if (requestState.current) setRows([]);
      }
    })();
    return () => { requestState.current = false; };
  }, [client, enabled, kind]);
  return rows;
}

function facet<Row>(rows: readonly Row[], valueOf: (row: Row) => string | number | null | undefined, labelOf: (value: string) => string = (value) => value): UniversalFilterValue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = valueOf(row);
    if (raw === null || raw === undefined || raw === "") continue;
    const value = String(raw);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([value, count]) => ({ count, label: labelOf(value), value }));
}

export function InactivityLeavePage({ client, onNavigate }: { client: ApiClient; onNavigate?: (path: string) => void }) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { i18n, t } = useTranslation(["admin-census", "enums", "errors"]);
  const inactivityEnabled = branding.modules.includes("INACTIVITY");
  const [tab, setTab] = useState(inactivityEnabled ? "inactivity" : "leave");
  const [inactivityState, setInactivityState] = useState(INACTIVITY_DEFAULT);
  const [leaveState, setLeaveState] = useState(LEAVE_DEFAULT);
  const inactivity = useQueue<InactivityRow>(client, "inactivity", inactivityState, inactivityEnabled);
  const leave = useQueue<LeaveRow>(client, "leave", leaveState);
  const inactivityFilterRows = useQueueFilterRows<InactivityRow>(client, "inactivity", inactivityEnabled);
  const leaveFilterRows = useQueueFilterRows<LeaveRow>(client, "leave");
  const inactivityViews = useSavedViews(client, "inactivity-periods");
  const leaveViews = useSavedViews(client, "leave-requests");
  const [leaveReasons, setLeaveReasons] = useState<Map<string, string>>(new Map());
  const locale = normalizeLocale(i18n.resolvedLanguage ?? branding.defaultLocale);
  const resolvedPeriod = useRef<string | undefined>(undefined);
  const [periodNavigationFailure, setPeriodNavigationFailure] = useState<unknown>();
  const [periodResolveAttempt, setPeriodResolveAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void client.GET("/parameters/{key}", { params: { path: { key: "leave.reasons" } } }).then((result) => {
      if (!current || !Array.isArray(result.data?.value)) return;
      const language = locale.slice(0, 2);
      const entries = result.data.value.flatMap((value): [string, string][] => {
        if (typeof value !== "object" || value === null) return [];
        const item = value as Record<string, unknown>;
        if (typeof item.key !== "string") return [];
        if (typeof item.label === "string") return [[item.key, item.label]];
        if (typeof item.label !== "object" || item.label === null) return [];
        const labels = item.label as Record<string, unknown>;
        const label = labels[language] ?? labels.ca;
        return typeof label === "string" ? [[item.key, label]] : [];
      });
      setLeaveReasons(new Map(entries));
    });
    return () => {
      current = false;
    };
  }, [client, locale]);

  useEffect(() => {
    const periodId = new URLSearchParams(window.location.search).get("period");
    if (periodId === null || resolvedPeriod.current === periodId) return undefined;
    let current = true;
    setPeriodNavigationFailure(undefined);
    void client.GET("/inactivity-periods/{id}", { params: { path: { id: periodId } } }).then(
      (result) => {
        if (!current || result.data === undefined) return;
        const path = `/abonats/${result.data.member.id}?calaix=inactivitat&period=${periodId}`;
        resolvedPeriod.current = periodId;
        if (onNavigate === undefined) window.location.assign(path);
        else onNavigate(path);
      },
      (cause: unknown) => {
        if (current) setPeriodNavigationFailure(cause);
      },
    );
    return () => { current = false; };
  }, [client, onNavigate, periodResolveAttempt]);

  // UniversalList's loader contract is asynchronous even though these values come from the page.
  // eslint-disable-next-line @typescript-eslint/require-await
  const loadInactivityFilterValues = useCallback(async (field: string) => {
    const rows = inactivityFilterRows;
    if (field === "memberId") {
      const members = new Map(rows.flatMap((row) => row.member === undefined ? [] : [[row.member.id, row.member.fullName] as const]));
      return [...members].map(([value, label]) => ({ count: rows.filter((row) => row.member?.id === value).length, label, value }));
    }
    if (field === "state") return (["REQUESTED", "APPROVED", "ACTIVE", "FINISHED", "DENIED", "CANCELLED"] as const).map((value) => ({ count: rows.filter((row) => row.state === value).length, label: t(`enums:inactivityState.${value}`), value }));
    if (field === "origin") return (["APP", "BACKOFFICE"] as const).map((value) => ({ count: rows.filter((row) => row.origin === value).length, label: t(`enums:origin.${value}`), value }));
    if (field === "fromMonth") return facet(rows, (row) => row.fromMonth, (value) => formats.formatMonthTitle(value));
    if (field === "toMonth") return facet(rows, (row) => row.toMonth, (value) => formats.formatMonthTitle(value));
    if (field === "requestedAt") return facet(rows, (row) => row.requestedAt, (value) => fmtDateTime(value, locale, branding.timeZone));
    return [];
  }, [branding.timeZone, formats, inactivityFilterRows, locale, t]);
  // eslint-disable-next-line @typescript-eslint/require-await
  const loadLeaveFilterValues = useCallback(async (field: string) => {
    const rows = leaveFilterRows;
    if (field === "memberId") {
      const members = new Map(rows.flatMap((row) => row.member === undefined ? [] : [[row.member.id, row.member.fullName] as const]));
      return [...members].map(([value, label]) => ({ count: rows.filter((row) => row.member?.id === value).length, label, value }));
    }
    if (field === "state") return (["PENDING", "APPROVED", "DENIED", "CANCELLED"] as const).map((value) => ({ count: rows.filter((row) => row.state === value).length, label: t(`enums:leaveRequestState.${value}`), value }));
    if (field === "source") return (["MEMBER", "ADMIN", "PACK_EXPIRED", "MIGRATED"] as const).map((value) => ({ count: rows.filter((row) => row.source === value).length, label: t(`enums:leaveSource.${value}`), value }));
    if (field === "reasonKey") return [...leaveReasons].map(([value, label]) => ({ count: rows.filter((row) => row.reasonKey === value).length, label, value }));
    if (field === "requestedDate") return facet(rows, (row) => row.requestedDate, (value) => fmtPlainDate(value, locale, "short"));
    if (field === "effectiveDate") return facet(rows, (row) => row.effectiveDate, (value) => fmtPlainDate(value, locale, "short"));
    if (field === "nps") return facet(rows, (row) => row.nps);
    return [];
  }, [leaveFilterRows, leaveReasons, locale, t]);

  const operators: Record<UniversalFilterOperator, string> = useMemo(
    () => ({
      between: t("admin-census:inactivityLeavePage.operators.between"),
      contains: t("admin-census:inactivityLeavePage.operators.contains"),
      eq: t("admin-census:inactivityLeavePage.operators.eq"),
      exists: t("admin-census:inactivityLeavePage.operators.exists"),
      gt: t("admin-census:inactivityLeavePage.operators.gt"),
      gte: t("admin-census:inactivityLeavePage.operators.gte"),
      in: t("admin-census:inactivityLeavePage.operators.in"),
      lt: t("admin-census:inactivityLeavePage.operators.lt"),
      lte: t("admin-census:inactivityLeavePage.operators.lte"),
      ne: t("admin-census:inactivityLeavePage.operators.ne"),
      nin: t("admin-census:inactivityLeavePage.operators.nin"),
      startsWith: t("admin-census:inactivityLeavePage.operators.startsWith"),
    }),
    [t],
  );
  const labels = <Row extends InactivityRow | LeaveRow>(name: string): UniversalListLabels<Row> => ({
    addFilter: t("admin-census:inactivityLeavePage.addFilter"),
    clearFilters: t("admin-census:inactivityLeavePage.clearFilters"),
    closeError: t("admin-census:common.close"),
    columns: t("admin-census:inactivityLeavePage.columns"),
    createView: t("admin-census:inactivityLeavePage.createView"),
    defaultView: t("admin-census:inactivityLeavePage.defaultView"),
    deleteView: t("admin-census:inactivityLeavePage.deleteView"),
    emptyDescription: t(`admin-census:inactivityLeavePage.${name}.emptyDescription`),
    emptyTitle: t(`admin-census:inactivityLeavePage.${name}.emptyTitle`),
    export: t("admin-census:inactivityLeavePage.export"),
    filter: t("admin-census:inactivityLeavePage.filter"),
    filterField: t("admin-census:inactivityLeavePage.filterField"),
    filterOperator: t("admin-census:inactivityLeavePage.filterOperator"),
    filterValue: t("admin-census:inactivityLeavePage.filterValue"),
    formatPdf: t("admin-census:inactivityLeavePage.formatPdf"),
    formatXlsx: t("admin-census:inactivityLeavePage.formatXlsx"),
    loading: t("admin-census:common.loading"),
    loadingFilterValues: t("admin-census:inactivityLeavePage.loadingFilterValues"),
    nextPage: t("admin-census:inactivityLeavePage.nextPage"),
    noSavedView: t("admin-census:inactivityLeavePage.noSavedView"),
    operators,
    page: (page, totalPages) => t("admin-census:inactivityLeavePage.page", { page, totalPages }),
    previousPage: t("admin-census:inactivityLeavePage.previousPage"),
    removeFilter: (field) => t("admin-census:inactivityLeavePage.removeFilter", { field }),
    renameView: t("admin-census:inactivityLeavePage.renameView"),
    retry: t("admin-census:common.retry"),
    rowsPerPage: t("admin-census:inactivityLeavePage.rowsPerPage"),
    saveError: t("admin-census:inactivityLeavePage.saveError"),
    saveViewName: t("admin-census:inactivityLeavePage.saveViewName"),
    search: t(`admin-census:inactivityLeavePage.${name}.search`),
    selectAll: t("admin-census:inactivityLeavePage.selectAll"),
    selectRow: (row) => t("admin-census:inactivityLeavePage.openMember", { name: row.member?.fullName ?? "" }),
    selected: (count) => t("admin-census:inactivityLeavePage.selected", { count }),
    sharedView: t("admin-census:inactivityLeavePage.sharedView"),
    sortAscending: (column) => t("admin-census:inactivityLeavePage.sortAscending", { column }),
    sortDescending: (column) => t("admin-census:inactivityLeavePage.sortDescending", { column }),
    view: (view) => t("admin-census:inactivityLeavePage.view", { name: view }),
    views: t("admin-census:inactivityLeavePage.views"),
  });
  const go = (path: string) => {
    if (onNavigate === undefined) window.location.assign(path);
    else onNavigate(path);
  };
  const errorText = (error: unknown) => (error === undefined ? undefined : isApiError(error) ? t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") }) : t("admin-census:common.genericError"));
  const inactivityError = errorText(inactivity.error);
  const leaveError = errorText(leave.error);
  const periodNavigationError = errorText(periodNavigationFailure);

  const inactivityColumns: UniversalListColumn<InactivityRow>[] = [
    {
      key: "member",
      label: t("admin-census:inactivityLeavePage.member"),
      render: (row) => row.member?.fullName ?? "—",
      sortKey: "memberLastName",
    },
    {
      key: "fromMonth",
      label: t("admin-census:inactivityLeavePage.from"),
      render: (row) => (row.fromMonth === undefined ? "—" : formats.formatMonthTitle(row.fromMonth)),
      sortKey: "fromMonth",
    },
    {
      key: "toMonth",
      label: t("admin-census:inactivityLeavePage.to"),
      render: (row) => (row.toMonth == null ? "—" : formats.formatMonthTitle(row.toMonth)),
    },
    {
      key: "state",
      label: t("admin-census:inactivityLeavePage.state"),
      render: (row) => (row.state === undefined ? "—" : <Badge>{t(`enums:inactivityState.${row.state}`)}</Badge>),
    },
    {
      key: "origin",
      label: t("admin-census:inactivityLeavePage.origin"),
      render: (row) => (row.origin === undefined ? "—" : t(`enums:origin.${row.origin}`)),
    },
    {
      key: "requestedAt",
      label: t("admin-census:inactivityLeavePage.requestedAt"),
      render: (row) => (row.requestedAt === undefined ? "—" : fmtDateTime(row.requestedAt, locale, branding.timeZone)),
      sortKey: "requestedAt",
    },
  ];
  const leaveColumns: UniversalListColumn<LeaveRow>[] = [
    {
      key: "member",
      label: t("admin-census:inactivityLeavePage.member"),
      render: (row) => row.member?.fullName ?? "—",
    },
    {
      key: "requestedDate",
      label: t("admin-census:inactivityLeavePage.requestedDate"),
      render: (row) => (row.requestedDate === undefined ? "—" : fmtPlainDate(row.requestedDate, locale, "short")),
      sortKey: "requestedDate",
    },
    {
      key: "effectiveDate",
      label: t("admin-census:inactivityLeavePage.effectiveDate"),
      render: (row) => (row.effectiveDate == null ? "—" : fmtPlainDate(row.effectiveDate, locale, "short")),
      sortKey: "effectiveDate",
    },
    {
      key: "reasonKey",
      label: t("admin-census:inactivityLeavePage.reason"),
      render: (row) => (row.reasonKey == null ? "—" : (leaveReasons.get(row.reasonKey) ?? "—")),
    },
    {
      key: "source",
      label: t("admin-census:inactivityLeavePage.origin"),
      render: (row) => (row.source === undefined ? "—" : t(`enums:leaveSource.${row.source}`)),
    },
    {
      key: "state",
      label: t("admin-census:inactivityLeavePage.state"),
      render: (row) => (row.state === undefined ? "—" : <Badge>{t(`enums:leaveRequestState.${row.state}`)}</Badge>),
    },
    {
      key: "nps",
      label: t("admin-census:inactivityLeavePage.nps"),
      render: (row) => row.nps ?? "—",
    },
  ];
  const plainRange = {
    endLabel: t("admin-census:inactivityLeavePage.to"),
    startLabel: t("admin-census:inactivityLeavePage.from"),
    toValue: (start: string, end: string) => `${start},${end}`,
  };
  const monthRange = { ...plainRange, inputType: "month" as const };
  const dateRange = { ...plainRange, inputType: "date" as const };
  const instantRange = {
    ...dateRange,
    toValue: (start: string, end: string) => {
      const startInstant = clubLocalInstant(`${start}T00:00`, branding.timeZone);
      const endInstant = clubLocalInstant(`${end}T23:59`, branding.timeZone) + 59_999;
      return `${new Date(startInstant).toISOString()},${new Date(endInstant).toISOString()}`;
    },
  };
  const numberRange = { ...plainRange, inputType: "number" as const };
  const inactivityFilters: UniversalListFilterColumn[] = [
    { key: "memberId", label: t("admin-census:inactivityLeavePage.member"), type: "relation" },
    { key: "state", label: t("admin-census:inactivityLeavePage.state"), type: "enum" },
    { key: "fromMonth", label: t("admin-census:inactivityLeavePage.from"), range: monthRange, type: "date" },
    { key: "toMonth", label: t("admin-census:inactivityLeavePage.to"), range: monthRange, type: "date" },
    { key: "origin", label: t("admin-census:inactivityLeavePage.origin"), type: "enum" },
    { key: "requestedAt", label: t("admin-census:inactivityLeavePage.requestedAt"), range: instantRange, type: "date" },
  ];
  const leaveFilters: UniversalListFilterColumn[] = [
    { key: "memberId", label: t("admin-census:inactivityLeavePage.member"), type: "relation" },
    { key: "state", label: t("admin-census:inactivityLeavePage.state"), type: "enum" },
    { key: "source", label: t("admin-census:inactivityLeavePage.origin"), type: "enum" },
    {
      key: "requestedDate",
      label: t("admin-census:inactivityLeavePage.requestedDate"),
      range: dateRange,
      type: "date",
    },
    {
      key: "effectiveDate",
      label: t("admin-census:inactivityLeavePage.effectiveDate"),
      range: dateRange,
      type: "date",
    },
    { key: "reasonKey", label: t("admin-census:inactivityLeavePage.reason"), type: "enum" },
    { key: "nps", label: t("admin-census:inactivityLeavePage.nps"), range: numberRange, type: "number" },
  ];
  const memberLabels = new Map(
    [...inactivityFilterRows, ...leaveFilterRows].flatMap((row) =>
      row.member === undefined ? [] : [[row.member.id, row.member.fullName] as const],
    ),
  );
  const formatAppliedValue = (
    filter: components["schemas"]["Filter"],
    kind: "inactivity" | "leave",
  ): string => {
    if (filter.op === "exists") return operators.exists;
    const raw = filterValue(filter.value);
    const formatOne = (value: string): string => {
      if (filter.field === "memberId") return memberLabels.get(value) ?? "—";
      if (filter.field === "state") {
        return kind === "inactivity"
          ? t(`enums:inactivityState.${value}`)
          : t(`enums:leaveRequestState.${value}`);
      }
      if (filter.field === "origin") return t(`enums:origin.${value}`);
      if (filter.field === "source") return t(`enums:leaveSource.${value}`);
      if (filter.field === "reasonKey") return leaveReasons.get(value) ?? "—";
      if (filter.field === "fromMonth" || filter.field === "toMonth") {
        return formats.formatMonthTitle(value);
      }
      if (filter.field === "requestedAt") {
        return value.includes("T")
          ? fmtDateTime(value, locale, branding.timeZone)
          : fmtPlainDate(value, locale, "short");
      }
      if (filter.field === "requestedDate" || filter.field === "effectiveDate") {
        return fmtPlainDate(value, locale, "short");
      }
      return value;
    };
    const values = raw.split(",");
    return values.map(formatOne).join(filter.op === "between" ? " – " : ", ");
  };
  const localizedAppliedFilters = (
    filters: readonly components["schemas"]["Filter"][],
    kind: "inactivity" | "leave",
    columns: readonly UniversalListFilterColumn[],
  ) => filters.map((filter) => ({
    field: filter.field,
    fieldLabel: columns.find((column) => column.key === filter.field)?.label ??
      t("admin-census:inactivityLeavePage.filterField"),
    operator: filter.op,
    value: filterValue(filter.value),
    valueLabel: formatAppliedValue(filter, kind),
  }));

  return (
    <section>
      <h1>{t("admin-census:inactivityLeavePage.title")}</h1>
      {periodNavigationError === undefined ? null : (
        <div role="alert">
          <p>{periodNavigationError}</p>
          <Button onClick={() => { setPeriodResolveAttempt((value) => value + 1); }}>{t("admin-census:common.retry")}</Button>
        </div>
      )}
      <Tabs
        items={[
          ...(inactivityEnabled
            ? [
                {
                  content: (
                    <UniversalList
                      appliedFilters={localizedAppliedFilters(
                        inactivity.data?.appliedFilters ?? [],
                        "inactivity",
                        inactivityFilters,
                      )}
                      caption={t("admin-census:inactivityLeavePage.inactivity.label")}
                      columns={inactivityColumns}
                      {...(inactivityError === undefined ? {} : { error: inactivityError })}
                      exportable={false}
                      filterColumns={inactivityFilters}
                      labels={labels<InactivityRow>("inactivity")}
                      listKey="inactivity-periods"
                      loadFilterValues={loadInactivityFilterValues}
                      loading={inactivity.loading}
                      onCreateView={inactivityViews.create}
                      onDeleteView={inactivityViews.remove}
                      onExport={() => undefined}
                      onRenameView={inactivityViews.rename}
                      onRetry={inactivity.retry}
                      onRowActivate={(row) => {
                        if (row.member !== undefined) go(`/abonats/${row.member.id}?calaix=inactivitat&period=${row.id}`);
                      }}
                      onStateChange={setInactivityState}
                      rowHref={(row) => (row.member === undefined ? "#" : `/abonats/${row.member.id}?calaix=inactivitat&period=${row.id}`)}
                      rowKey={(row) => row.id}
                      rows={inactivity.data?.items ?? []}
                      savedViews={inactivityViews.views}
                      state={inactivityState}
                      totalPages={inactivity.data?.totalPages ?? 0}
                    />
                  ),
                  label: t("admin-census:inactivityLeavePage.inactivity.label"),
                  value: "inactivity",
                },
              ]
            : []),
          {
            content: (
              <UniversalList
                appliedFilters={localizedAppliedFilters(
                  leave.data?.appliedFilters ?? [],
                  "leave",
                  leaveFilters,
                )}
                caption={t("admin-census:inactivityLeavePage.leave.label")}
                columns={leaveColumns}
                {...(leaveError === undefined ? {} : { error: leaveError })}
                exportable={false}
                filterColumns={leaveFilters}
                labels={labels<LeaveRow>("leave")}
                listKey="leave-requests"
                loadFilterValues={loadLeaveFilterValues}
                loading={leave.loading}
                onCreateView={leaveViews.create}
                onDeleteView={leaveViews.remove}
                onExport={() => undefined}
                onRenameView={leaveViews.rename}
                onRetry={leave.retry}
                onRowActivate={(row) => {
                  if (row.member !== undefined) go(`/abonats/${row.member.id}?calaix=baixa`);
                }}
                onStateChange={setLeaveState}
                rowHref={(row) => (row.member === undefined ? "#" : `/abonats/${row.member.id}?calaix=baixa`)}
                rowKey={(row) => row.id}
                rows={leave.data?.items ?? []}
                savedViews={leaveViews.views}
                state={leaveState}
                totalPages={leave.data?.totalPages ?? 0}
              />
            ),
            label: t("admin-census:inactivityLeavePage.leave.label"),
            value: "leave",
          },
        ]}
        label={t("admin-census:inactivityLeavePage.tabs")}
        onValueChange={setTab}
        value={tab}
      />
    </section>
  );
}
