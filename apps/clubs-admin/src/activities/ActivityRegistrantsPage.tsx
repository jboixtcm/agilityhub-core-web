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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useListExport } from "../audit/useListExport";

import "./activities.css";
import { type Activity, type ActivityRegistrationListItem, useSavedViews } from "./shared";

interface ListData {
  appliedFilters: { field: string; op: UniversalFilterOperator; value?: unknown }[];
  items: ActivityRegistrationListItem[];
  totalPages: number;
}

type RegistrantMember = ActivityRegistrationListItem["member"];

const DEFAULT_COLUMNS = ["member", "state", "registeredAt", "origin", "contact"];
/** The response keys each column reads (`contact` is drawn from `member`). */
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  contact: ["member"],
  member: ["member"],
  origin: ["origin"],
  registeredAt: ["registeredAt"],
  state: ["state", "position", "cancelReason"],
};

/**
 * `fields` of the list request: response keys only. The core answers `400 INVALID_FILTER` to a
 * column key such as `contact`, and `null` in every key it was not asked for, so the row key
 * (`registrationId`) and the row link (`member`) are always requested (E4-W05, published core).
 */
export function registrantFields(columns: readonly string[]): string {
  const keys = columns.flatMap((column) => COLUMN_FIELDS[column] ?? []);
  return [...new Set(["registrationId", "member", ...keys])].join(",");
}
// The api's largest page (CONVENCIONS_API §4); an activity may have more registrations (no
// capacity limit, cancelled rows kept), so every page is read.
const MEMBER_VALUES_SIZE = 1000;

/**
 * Values of the `memberId` filter (S07 §6): the members registered to this activity, with their
 * number of registrations, read once from the list itself, page by page up to `totalPages` (there
 * is no filter-values endpoint for registrants). Loaded when the filter is offered or already
 * applied (URL, saved view).
 */
function useRegistrantMembers(client: ApiClient, activityId: string, needed: boolean) {
  type Values = { count: number; member: RegistrantMember }[];
  const [members, setMembers] = useState<{ activityId: string; values: Values }>();
  const request = useRef<{ activityId: string; promise: Promise<Values> } | undefined>(undefined);
  const load = useCallback(() => {
    if (request.current?.activityId === activityId) return request.current.promise;
    const readPages = async () => {
      const counted = new Map<string, { count: number; member: RegistrantMember }>();
      for (let page = 0, totalPages = 1; page < totalPages; page += 1) {
        const response = await client.GET("/activities/{id}/registrations", {
          params: {
            path: { id: activityId },
            // The registration date breaks ties, so the pages never overlap or skip a row.
            query: {
              page,
              size: MEMBER_VALUES_SIZE,
              sort: ["memberLastName,asc", "registeredAt,asc"],
            },
          },
        });
        for (const item of response.data?.items ?? []) {
          const known = counted.get(item.member.id);
          counted.set(item.member.id, {
            count: (known?.count ?? 0) + 1,
            member: item.member,
          });
        }
        totalPages = response.data?.totalPages ?? 0;
      }
      return [...counted.values()];
    };
    const promise = readPages().then(
      (values) => {
        setMembers({ activityId, values });
        return values;
      },
      (error: unknown) => {
        if (request.current?.promise === promise) request.current = undefined;
        throw error;
      },
    );
    request.current = { activityId, promise };
    return promise;
  }, [activityId, client]);
  useEffect(() => {
    if (needed) void load().catch(() => undefined);
  }, [load, needed]);
  // Another activity's late answer never names this one's members.
  return { load, members: members?.activityId === activityId ? members.values : undefined };
}

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
  const { load: loadMembers, members } = useRegistrantMembers(
    client,
    activityId,
    state.filters.some((filter) => filter.field === "memberId"),
  );

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
            fields: registrantFields(state.columns),
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
        return item.position === null
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
        // AGENTS rule 6: a long e-mail is clipped with an ellipsis so the table fits 1280 px; the
        // full value stays in the text (screen readers) and in the tooltip.
        render: (item: ActivityRegistrationListItem) => {
          const contact = [
            ...item.member.phones.map((phone) => `${phone.prefix} ${phone.number}`),
            ...item.member.emails,
          ].join(t("admin-activities:registrants.contactSeparator"));
          return (
            <span className="activity-registrants__contact" title={contact}>
              {contact}
            </span>
          );
        },
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

  const stateOptions = useMemo(
    () => [
      { label: t("admin-activities:registrants.statuses.all"), value: "" },
      { label: t("enums:activityRegistrationState.ACTIVE"), value: "ACTIVE" },
      { label: t("enums:activityRegistrationState.WAITLISTED"), value: "WAITLISTED" },
      { label: t("enums:activityRegistrationState.CANCELLED"), value: "CANCELLED" },
    ],
    [t],
  );
  const memberLabel = useCallback(
    (member: RegistrantMember) =>
      t("admin-activities:registrants.member", {
        name: member.fullName,
        number: member.memberNumber,
      }),
    [t],
  );

  // Stable, so the list does not reload the values (and reset the picked one) on every render.
  const loadFilterValues = useCallback(
    (field: string): Promise<{ count: number; label: string; value: string }[]> => {
      if (field === "memberId") {
        return loadMembers().then((values) =>
          values.map(({ count, member }) => ({
            count,
            label: memberLabel(member),
            value: member.id,
          })),
        );
      }
      return Promise.resolve(
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
      );
    },
    [loadMembers, memberLabel, stateOptions, t],
  );

  /** The chip of an applied filter: the member's name for `memberId`, the state's label. */
  const valueLabel = (field: string, value: string): string => {
    if (field === "memberId") {
      return value
        .split(",")
        .map((id) => {
          const member =
            members?.find((entry) => entry.member.id === id)?.member ??
            data?.items.find((item) => item.member.id === id)?.member;
          return member === undefined ? id : memberLabel(member);
        })
        .join(t("admin-activities:registrants.memberSeparator"));
    }
    return stateOptions.find((option) => option.value === value)?.label ?? value;
  };

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
        // The core echoes the path's own `activityId` among the applied filters: not the admin's.
        appliedFilters={(data?.appliedFilters ?? [])
          .filter((filter) => filter.field !== "activityId")
          .map((filter) => ({
            field: filter.field,
            fieldLabel: t(`admin-activities:registrants.filters.${filter.field}`, {
              defaultValue: filter.field,
            }),
            operator: filter.op,
            value: filterValue(filter.value),
            valueLabel: valueLabel(filter.field, filterValue(filter.value)),
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
          {
            key: "memberId",
            label: t("admin-activities:registrants.filters.memberId"),
            operators: ["eq", "ne"],
            type: "relation",
          },
        ]}
        labels={labels}
        listKey="activity-registrations"
        loadFilterValues={loadFilterValues}
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
