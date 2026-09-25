import { isApiError, type ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Icon,
  type Tone,
  UniversalList,
  type UniversalFilter,
  type UniversalFilterOperator,
  type UniversalListLabels,
  type UniversalListSavedView,
  type UniversalListState,
  readUniversalListState,
  universalListSearchParams,
} from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useListExport } from "../audit/useListExport";

import "./activities.css";
import { type Activity, type ActivityRegistrationListItem, useSavedViews } from "./shared";

interface ListData {
  appliedFilters: { field: string; op: UniversalFilterOperator; value?: unknown }[];
  items: ActivityRegistrationListItem[];
  totalPages: number;
}

const DEFAULT_COLUMNS = ["member", "state", "registeredAt", "origin", "contact"];

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function stateTone(item: ActivityRegistrationListItem): Tone {
  if (item.state === "ACTIVE") return "success";
  if (item.state === "WAITLISTED") return "warning";
  return item.cancelReason === "ACTIVITY_CANCELLED" ? "danger" : "neutral";
}

/**
 * Registrants of an activity (`/activitats/:id/inscrits`, S07 §2, no mockup): universal list of
 * `GET /activities/{id}/registrations` with the FIFO waitlist positions; «Excel · PDF» = the
 * published `GET /activity-registrations/export?filter=activityId:eq:{id}` (ADMIN).
 */
export function ActivityRegistrantsPage({
  activityId,
  client,
  onNavigate,
  readOnly,
}: {
  activityId: string;
  client: ApiClient;
  onNavigate: (path: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation(["admin-activities", "census", "enums", "errors"]);
  const formats = useClubFormats();
  const listExport = useListExport(client);
  const [activity, setActivity] = useState<Activity>();
  const [state, setState] = useState(() =>
    readUniversalListState(window.location.search, {
      columns: DEFAULT_COLUMNS,
      filters: [],
      size: 50,
      sort: ["registeredAt,asc"],
    }),
  );
  const [data, setData] = useState<ListData>();
  const [result, setResult] = useState<{ error?: unknown; key: string }>({ key: "" });
  const [reload, setReload] = useState(0);
  const key = JSON.stringify({ reload, state });
  const applyView = useCallback((view: UniversalListSavedView) => {
    setState((current) => ({
      ...current,
      columns: view.columns,
      filters: view.filters,
      page: 0,
      sort: view.sort,
    }));
  }, []);
  const savedViews = useSavedViews(client, "activity-registrations", applyView);

  useEffect(() => {
    let current = true;
    void client.GET("/activities/{id}", { params: { path: { id: activityId } } }).then(
      (response) => {
        if (current && response.data !== undefined) setActivity(response.data);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [activityId, client]);

  useEffect(() => {
    let current = true;
    void client
      .GET("/activities/{id}/registrations", {
        params: {
          path: { id: activityId },
          query: {
            fields: state.columns.join(","),
            filter: apiFilters(state.filters),
            page: state.page,
            ...(state.q === "" ? {} : { q: state.q }),
            size: state.size,
            sort: state.sort,
          },
        },
      })
      .then(
        (response) => {
          if (!current) return;
          if (response.data !== undefined) setData(response.data);
          setResult({ key });
        },
        (error: unknown) => {
          if (current) setResult({ error, key });
        },
      );
    return () => {
      current = false;
    };
  }, [activityId, client, key, state]);

  const update = useCallback((next: UniversalListState) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${universalListSearchParams(next).toString()}`,
    );
    setState(next);
  }, []);

  const stateLabel = useCallback(
    (item: ActivityRegistrationListItem) => {
      if (item.state === "WAITLISTED") {
        return item.position === null || item.position === undefined
          ? t("enums:activityRegistrationState.WAITLISTED")
          : t("admin-activities:registrants.waitlisted", { position: item.position });
      }
      if (item.state === "CANCELLED" && item.cancelReason === "ACTIVITY_CANCELLED") {
        return t("enums:activityRegistrationState.CANCELLED_BY_CLUB");
      }
      return t(`enums:activityRegistrationState.${item.state}`);
    },
    [t],
  );

  const columns = useMemo(
    () => [
      {
        key: "member",
        label: t("admin-activities:registrants.columns.member"),
        render: (item: ActivityRegistrationListItem) =>
          t("admin-activities:registrants.member", {
            name: item.member.fullName,
            number: item.member.memberNumber,
          }),
        sortKey: "memberLastName",
      },
      {
        key: "state",
        label: t("admin-activities:registrants.columns.state"),
        render: (item: ActivityRegistrationListItem) => (
          <Badge tone={stateTone(item)}>{stateLabel(item)}</Badge>
        ),
        sortKey: "position",
      },
      {
        key: "registeredAt",
        label: t("admin-activities:registrants.columns.registeredAt"),
        render: (item: ActivityRegistrationListItem) => formats.formatDateTime(item.registeredAt),
        sortKey: "registeredAt",
      },
      {
        key: "origin",
        label: t("admin-activities:registrants.columns.origin"),
        render: (item: ActivityRegistrationListItem) => t(`enums:activityOrigin.${item.origin}`),
      },
      {
        key: "contact",
        label: t("admin-activities:registrants.columns.contact"),
        render: (item: ActivityRegistrationListItem) =>
          [
            ...item.member.phones.map((phone) => `${phone.prefix} ${phone.number}`),
            ...item.member.emails,
          ].join(t("admin-activities:registrants.contactSeparator")),
      },
    ],
    [formats, stateLabel, t],
  );

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

  const labels: UniversalListLabels<ActivityRegistrationListItem> = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription: t("admin-activities:registrants.emptyDescription"),
    emptyTitle: t("admin-activities:registrants.emptyTitle"),
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
    page: (page, totalPages) => t("census:list.page", { page, totalPages }),
    previousPage: t("census:list.previousPage"),
    removeFilter: (field) => t("census:list.removeFilter", { field }),
    renameView: t("census:list.renameView"),
    retry: t("admin-activities:common.retry"),
    rowsPerPage: t("census:list.rowsPerPage"),
    saveError: t("census:list.saveError"),
    saveViewName: t("census:list.saveViewName"),
    search: t("admin-activities:registrants.search"),
    selectAll: t("census:list.selectAll"),
    selectRow: (item) => t("admin-activities:registrants.open", { name: item.member.fullName }),
    selected: (count) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column) => t("census:list.sortAscending", { column }),
    sortDescending: (column) => t("census:list.sortDescending", { column }),
    view: (name) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };

  const stateOptions = [
    { label: t("admin-activities:registrants.statuses.all"), value: "" },
    { label: t("enums:activityRegistrationState.ACTIVE"), value: "ACTIVE" },
    { label: t("enums:activityRegistrationState.WAITLISTED"), value: "WAITLISTED" },
    { label: t("enums:activityRegistrationState.CANCELLED"), value: "CANCELLED" },
  ];

  // The list's `q`, filters and sort (CONVENCIONS_API §4) within this activity; `contact` is not an
  // export column of `activity-registrations`.
  const runExport = (format: "pdf" | "xlsx", current: UniversalListState) => {
    void listExport.run("/activity-registrations/export", {
      columns: current.columns.filter((column) => column !== "contact").join(","),
      filter: [`activityId:eq:${activityId}`, ...apiFilters(current.filters)],
      format,
      ...(current.q === "" ? {} : { q: current.q }),
      sort: current.sort,
    });
  };

  const error = result.key === key ? result.error : undefined;
  const errorMessage =
    error === undefined
      ? undefined
      : isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-activities:registrants.error") })
        : t("admin-activities:registrants.error");
  const title = activity?.title ?? "";

  return (
    <div className="activities-page">
      <a
        className="activity-back"
        href={`/activitats/${activityId}`}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(`/activitats/${activityId}`);
        }}
      >
        <Icon aria-hidden="true" name="chev" />
        {t("admin-activities:registrants.back")}
      </a>
      <header className="activities-page__header">
        <h1>{t("admin-activities:registrants.title", { title })}</h1>
      </header>
      <UniversalList<ActivityRegistrationListItem>
        appliedFilters={(data?.appliedFilters ?? []).map((filter) => ({
          field: filter.field,
          fieldLabel: t(`admin-activities:registrants.filters.${filter.field}`, {
            defaultValue: filter.field,
          }),
          operator: filter.op,
          value: filterValue(filter.value),
          valueLabel:
            stateOptions.find((option) => option.value === filterValue(filter.value))?.label ??
            filterValue(filter.value),
        }))}
        caption={t("admin-activities:registrants.caption")}
        columns={columns}
        {...(errorMessage === undefined ? {} : { error: errorMessage })}
        exportable={!readOnly}
        exportBusy={listExport.busy}
        {...(listExport.error === undefined ? {} : { exportError: listExport.error.message })}
        filterColumns={[
          { key: "state", label: t("admin-activities:registrants.filters.state"), type: "enum" },
          { key: "origin", label: t("admin-activities:registrants.filters.origin"), type: "enum" },
          {
            key: "registeredAt",
            label: t("admin-activities:registrants.filters.registeredAt"),
            type: "date",
          },
        ]}
        labels={labels}
        listKey="activity-registrations"
        loadFilterValues={(field) =>
          Promise.resolve(
            field === "state"
              ? stateOptions
                  .filter((option) => option.value !== "")
                  .map((option) => ({ count: 0, ...option }))
              : field === "origin"
                ? (["APP", "BACKOFFICE"] as const).map((value) => ({
                    count: 0,
                    label: t(`enums:activityOrigin.${value}`),
                    value,
                  }))
                : [],
          )
        }
        loading={result.key !== key}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={runExport}
        onRenameView={savedViews.rename}
        onRetry={() => {
          setReload((value) => value + 1);
        }}
        // The member record is ADMIN-only: an INSTRUCTOR reads the rows as plain text.
        {...(readOnly
          ? {}
          : {
              onRowActivate: (item: ActivityRegistrationListItem) => {
                onNavigate(`/abonats/${item.member.id}`);
              },
              rowHref: (item: ActivityRegistrationListItem) => `/abonats/${item.member.id}`,
            })}
        onStateChange={update}
        rowKey={(item) => item.registrationId}
        rows={data?.items ?? []}
        savedViews={savedViews.views}
        state={state}
        statusFilter={{
          field: "state",
          label: t("admin-activities:registrants.columns.state"),
          options: stateOptions,
        }}
        totalPages={data?.totalPages ?? 0}
      />
    </div>
  );
}
