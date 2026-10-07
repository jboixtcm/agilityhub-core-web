import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { fmtDateTime, fmtPlainDate, normalizeLocale, useClubFormats } from "@agilityhub/i18n";
import { Badge, Tabs, UniversalList, type UniversalFilter, type UniversalFilterOperator, type UniversalListColumn, type UniversalListFilterColumn, type UniversalListLabels, type UniversalListState, useBranding } from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type InactivityRow = components["schemas"]["InactivityPeriodListItem"];
type LeaveRow = components["schemas"]["LeaveRequestListItem"];

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
      fields: state.columns.join(","),
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
  const [leaveReasons, setLeaveReasons] = useState<Map<string, string>>(new Map());
  const locale = normalizeLocale(i18n.resolvedLanguage ?? branding.defaultLocale);

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
  const noValues = useCallback(() => Promise.resolve([]), []);
  const noCreate = useCallback(() => Promise.reject(new TypeError("Saved views are unavailable")), []);
  const noDelete = useCallback(() => Promise.reject(new TypeError("Saved views are unavailable")), []);
  const noRename = useCallback(() => Promise.reject(new TypeError("Saved views are unavailable")), []);
  const go = (path: string) => {
    if (onNavigate === undefined) window.location.assign(path);
    else onNavigate(path);
  };
  const errorText = (error: unknown) => (error === undefined ? undefined : isApiError(error) ? t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") }) : t("admin-census:common.genericError"));
  const inactivityError = errorText(inactivity.error);
  const leaveError = errorText(leave.error);

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
  const inactivityFilters: UniversalListFilterColumn[] = [
    { key: "memberId", label: t("admin-census:inactivityLeavePage.member"), type: "relation" },
    { key: "state", label: t("admin-census:inactivityLeavePage.state"), type: "enum" },
    { key: "fromMonth", label: t("admin-census:inactivityLeavePage.from"), type: "date" },
    { key: "toMonth", label: t("admin-census:inactivityLeavePage.to"), type: "date" },
    { key: "origin", label: t("admin-census:inactivityLeavePage.origin"), type: "enum" },
    { key: "requestedAt", label: t("admin-census:inactivityLeavePage.requestedAt"), type: "date" },
  ];
  const leaveFilters: UniversalListFilterColumn[] = [
    { key: "memberId", label: t("admin-census:inactivityLeavePage.member"), type: "relation" },
    { key: "state", label: t("admin-census:inactivityLeavePage.state"), type: "enum" },
    { key: "source", label: t("admin-census:inactivityLeavePage.origin"), type: "enum" },
    {
      key: "requestedDate",
      label: t("admin-census:inactivityLeavePage.requestedDate"),
      type: "date",
    },
    {
      key: "effectiveDate",
      label: t("admin-census:inactivityLeavePage.effectiveDate"),
      type: "date",
    },
    { key: "reasonKey", label: t("admin-census:inactivityLeavePage.reason"), type: "enum" },
    { key: "nps", label: t("admin-census:inactivityLeavePage.nps"), type: "number" },
  ];

  return (
    <section>
      <h1>{t("admin-census:inactivityLeavePage.title")}</h1>
      <Tabs
        items={[
          ...(inactivityEnabled
            ? [
                {
                  content: (
                    <UniversalList
                      appliedFilters={(inactivity.data?.appliedFilters ?? []).map((filter) => ({
                        field: filter.field,
                        fieldLabel: t(`admin-census:inactivityLeavePage.${filter.field}`, {
                          defaultValue: filter.field,
                        }),
                        operator: filter.op,
                      value: filterValue(filter.value),
                      valueLabel: filterValue(filter.value),
                      }))}
                      caption={t("admin-census:inactivityLeavePage.inactivity.label")}
                      columns={inactivityColumns}
                      {...(inactivityError === undefined ? {} : { error: inactivityError })}
                      exportable={false}
                      filterColumns={inactivityFilters}
                      labels={labels<InactivityRow>("inactivity")}
                      listKey="inactivity-periods"
                      loadFilterValues={noValues}
                      loading={inactivity.loading}
                      onCreateView={noCreate}
                      onDeleteView={noDelete}
                      onExport={() => undefined}
                      onRenameView={noRename}
                      onRetry={inactivity.retry}
                      onRowActivate={(row) => {
                        if (row.member !== undefined) go(`/abonats/${row.member.id}?calaix=inactivitat`);
                      }}
                      onStateChange={setInactivityState}
                      rowHref={(row) => (row.member === undefined ? "#" : `/abonats/${row.member.id}?calaix=inactivitat`)}
                      rowKey={(row) => row.id}
                      rows={inactivity.data?.items ?? []}
                      savedViews={[]}
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
                appliedFilters={(leave.data?.appliedFilters ?? []).map((filter) => ({
                  field: filter.field,
                  fieldLabel: t(`admin-census:inactivityLeavePage.${filter.field}`, {
                    defaultValue: filter.field,
                  }),
                  operator: filter.op,
                  value: filterValue(filter.value),
                  valueLabel: filterValue(filter.value),
                }))}
                caption={t("admin-census:inactivityLeavePage.leave.label")}
                columns={leaveColumns}
                {...(leaveError === undefined ? {} : { error: leaveError })}
                exportable={false}
                filterColumns={leaveFilters}
                labels={labels<LeaveRow>("leave")}
                listKey="leave-requests"
                loadFilterValues={noValues}
                loading={leave.loading}
                onCreateView={noCreate}
                onDeleteView={noDelete}
                onExport={() => undefined}
                onRenameView={noRename}
                onRetry={leave.retry}
                onRowActivate={(row) => {
                  if (row.member !== undefined) go(`/abonats/${row.member.id}?calaix=baixa`);
                }}
                onStateChange={setLeaveState}
                rowHref={(row) => (row.member === undefined ? "#" : `/abonats/${row.member.id}?calaix=baixa`)}
                rowKey={(row) => row.id}
                rows={leave.data?.items ?? []}
                savedViews={[]}
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
