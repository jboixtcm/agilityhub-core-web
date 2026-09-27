import {
  type ApiClient,
  type components,
  isApiError,
  listFields,
  useActiveRings,
} from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Tabs,
  type Tone,
  Toast,
  UniversalList,
  type UniversalFilter,
  type UniversalFilterOperator,
  type UniversalFilterValue,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
  type UniversalListSavedView,
  type UniversalListState,
  readUniversalListState,
  universalListSearchParams,
  useBranding,
} from "@agilityhub/ui";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSavedViews } from "../activities/shared";
import { useListExport } from "../audit/useListExport";
import { addDays, clubInstant, dayLabel, timeLabel } from "../planning/calendar-shared";
import { clubToday, mondayOf } from "../planning/shared";

import "./training.css";

type TrainingRow = components["schemas"]["TrainingBookingListItem"];
type BlockRow = components["schemas"]["RingBlockListItem"];
type Translate = ReturnType<typeof useTranslation>["t"];

type Tab = "blocks" | "bookings";
const TAB_PARAMETER = "vista";
const TAB_VALUES: Readonly<Record<Tab, string>> = { blocks: "bloquejos", bookings: "reserves" };

const TRAINING_LIST_KEY = "training-bookings";
const BLOCK_LIST_KEY = "ring-blocks";

/** The keys each column asks for (`fields`, CONVENCIONS_API §4); the export takes the same. */
const TRAINING_COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  createdAt: ["createdAt"],
  date: ["date", "startsAtLocal"],
  dogName: ["dogName"],
  memberName: ["memberId", "memberName"],
  origin: ["origin"],
  ringName: ["ringId", "ringName"],
  state: ["state"],
};
const TRAINING_EXPORT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  ...TRAINING_COLUMN_FIELDS,
  memberName: ["memberName"],
  ringName: ["ringName"],
};
const TRAINING_DEFAULT_COLUMNS = ["date", "ringName", "memberName", "dogName", "state", "origin"];

const BLOCK_COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  actions: ["state", "activityId", "version"],
  createdByName: ["createdByName"],
  from: ["date", "fromLocal", "toLocal"],
  kind: ["kind"],
  note: ["note"],
  reason: ["reason", "activityTitle"],
  ringId: ["ringId"],
  state: ["state"],
};
const BLOCK_DEFAULT_COLUMNS = ["from", "ringId", "kind", "reason", "note", "createdByName"];

const TRAINING_STATE_TONES: Readonly<Record<NonNullable<TrainingRow["state"]>, Tone>> = {
  ACTIVE: "success",
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "danger",
};

function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

/** The club-local week of today (Monday to Sunday), as the lists start (S09 §13-8). */
function currentWeek(timeZone: string): { end: string; start: string } {
  const start = mondayOf(clubToday(timeZone));
  return { end: addDays(start, 6), start };
}

interface ListData<Row> {
  appliedFilters: components["schemas"]["Filter"][];
  items: Row[];
  totalPages: number;
}

/** A list's rows for its state; an answer for an older state is dropped. */
function useListData<Row>(load: () => Promise<ListData<Row>>, key: string) {
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

/** The list's state in the URL, next to the tab (`?vista=…&page=…&filter=…`). */
function useUrlListState(tab: Tab, defaults: Parameters<typeof readUniversalListState>[1]) {
  const [state, setState] = useState(() =>
    readUniversalListState(window.location.search, defaults),
  );
  const write = useCallback(
    (next: UniversalListState) => {
      const parameters = universalListSearchParams(next);
      parameters.set(TAB_PARAMETER, TAB_VALUES[tab]);
      window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
    },
    [tab],
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

/** The labels every universal list of the page shares (D5's, `census:list.*`). */
function commonLabels(t: Translate) {
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
    emptyDescription: t("admin-training:list.emptyDescription"),
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

/** `400 INVALID_FILTER` keeps the list's own message (T-08-47 / T-09-24); other codes theirs. */
function listError(t: Translate, error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return isApiError(error)
    ? t(`errors:${error.code}`, { defaultValue: t("admin-training:list.error") })
    : t("admin-training:list.error");
}

/**
 * The values of a field with their counts, counted over the rows of the other filters (the api
 * publishes no `filter-values` for these lists): up to the 1000 rows of one page.
 */
function countValues<Row>(
  rows: readonly Row[],
  value: (row: Row) => string | undefined,
  label: (row: Row, value: string) => string,
): UniversalFilterValue[] {
  const counted = new Map<string, UniversalFilterValue>();
  for (const row of rows) {
    const key = value(row);
    if (key === undefined || key === "") continue;
    const current = counted.get(key);
    counted.set(key, {
      count: (current?.count ?? 0) + 1,
      label: current?.label ?? label(row, key),
      value: key,
    });
  }
  return [...counted.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function RingName({ color, name }: { color: string | undefined; name: string }) {
  return (
    <span className="training-register__ring">
      <span
        aria-hidden="true"
        className="training-register__dot"
        style={{ "--ah-ring-color": color } as CSSProperties}
      />
      {name}
    </span>
  );
}

/** Tab 1 — `GET /training-bookings` (S09 §6, `listKey = training-bookings`). */
function TrainingBookingsList({
  admin,
  client,
  onNavigate,
}: {
  admin: boolean;
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { t } = useTranslation(["admin-training", "census", "enums", "errors"]);
  const rings = useActiveRings(client);
  const week = currentWeek(branding.timeZone);
  const [state, setState, applySavedView] = useUrlListState("bookings", {
    columns: TRAINING_DEFAULT_COLUMNS,
    filters: [{ field: "date", operator: "between", value: `${week.start},${week.end}` }],
    size: 50,
    sort: ["startsAt,desc"],
  });
  const savedViews = useSavedViews(client, TRAINING_LIST_KEY, applySavedView);
  const listExport = useListExport(client);
  const { data, error, loading, retry } = useListData<TrainingRow>(async () => {
    const result = await client.GET("/training-bookings", {
      params: {
        query: {
          fields: listFields(
            state.columns.flatMap((column) => TRAINING_COLUMN_FIELDS[column] ?? []),
          ),
          filter: apiFilters(state.filters),
          page: state.page,
          ...(state.q === "" ? {} : { q: state.q }),
          size: state.size,
          sort: state.sort,
        },
      },
    });
    if (result.data === undefined) throw new TypeError("Training list without data");
    return result.data;
  }, JSON.stringify(state));

  const ringColor = (ringId: string | undefined) =>
    rings.status === "ready" ? rings.data.find((ring) => ring.id === ringId)?.color : undefined;
  const empty = t("admin-training:list.none");

  const columns = useMemo<UniversalListColumn<TrainingRow>[]>(
    () => [
      {
        key: "date",
        label: t("admin-training:bookings.columns.date"),
        render: (row) =>
          row.date === undefined || row.startsAtLocal === undefined
            ? empty
            : t("admin-training:list.when", {
                day: dayLabel(row.date, formats.formatPlainDate),
                time: timeLabel(row.startsAtLocal),
              }),
        sortKey: "startsAt",
      },
      {
        key: "ringName",
        label: t("admin-training:bookings.columns.ring"),
        render: (row) =>
          row.ringName === undefined ? (
            empty
          ) : (
            <RingName color={ringColor(row.ringId)} name={row.ringName} />
          ),
      },
      {
        key: "memberName",
        label: t("admin-training:bookings.columns.member"),
        // D10 is ADMIN's: an INSTRUCTOR reads the name only.
        render: (row) =>
          row.memberName === undefined ? (
            empty
          ) : admin && row.memberId !== undefined ? (
            <a
              href={`/abonats/${row.memberId}`}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(`/abonats/${row.memberId ?? ""}`);
              }}
            >
              {row.memberName}
            </a>
          ) : (
            row.memberName
          ),
      },
      {
        key: "dogName",
        label: t("admin-training:bookings.columns.dog"),
        render: (row) => row.dogName ?? empty,
      },
      {
        key: "state",
        label: t("admin-training:bookings.columns.state"),
        render: (row) =>
          row.state === undefined ? (
            empty
          ) : (
            <Badge tone={TRAINING_STATE_TONES[row.state]}>
              {t(`enums:trainingBookingState.${row.state}`)}
            </Badge>
          ),
      },
      {
        key: "origin",
        label: t("admin-training:bookings.columns.origin"),
        render: (row) =>
          row.origin === undefined ? empty : t(`enums:trainingOrigin.${row.origin}`),
      },
      {
        key: "createdAt",
        label: t("admin-training:bookings.columns.createdAt"),
        render: (row) =>
          row.createdAt === undefined ? empty : formats.formatDateTime(row.createdAt),
      },
    ],
    // `ringColor` reads `rings`, the only other input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admin, empty, formats, onNavigate, rings, t],
  );

  const filterColumns: UniversalListFilterColumn[] = [
    { key: "ringId", label: t("admin-training:bookings.columns.ring"), type: "relation" },
    { key: "date", label: t("admin-training:bookings.columns.date"), type: "date" },
    { key: "memberId", label: t("admin-training:bookings.columns.member"), type: "relation" },
    { key: "dogId", label: t("admin-training:bookings.columns.dog"), type: "relation" },
    { key: "state", label: t("admin-training:bookings.columns.state"), type: "enum" },
    { key: "origin", label: t("admin-training:bookings.columns.origin"), type: "enum" },
  ];

  const valueLabel = (
    field: string,
    value: string,
    rows: readonly TrainingRow[] = data?.items ?? [],
  ) => {
    if (field === "state") return t(`enums:trainingBookingState.${value}`, { defaultValue: value });
    if (field === "origin") return t(`enums:trainingOrigin.${value}`, { defaultValue: value });
    if (field === "date" && /^\d{4}-\d{2}-\d{2}$/u.test(value))
      return dayLabel(value, formats.formatPlainDate);
    if (field === "date") {
      const [start = "", end = ""] = value.split(",");
      return /^\d{4}-\d{2}-\d{2}$/u.test(start) && /^\d{4}-\d{2}-\d{2}$/u.test(end)
        ? formats.formatWeekRange(start, end)
        : value;
    }
    const row = rows.find((item) =>
      field === "ringId"
        ? item.ringId === value
        : field === "memberId"
          ? item.memberId === value
          : item.dogId === value,
    );
    return (
      (field === "ringId"
        ? row?.ringName
        : field === "memberId"
          ? row?.memberName
          : row?.dogName) ?? value
    );
  };

  const loadFilterValues = useCallback(
    async (field: string) => {
      const label: Readonly<Record<string, string>> = {
        dogId: "dogName",
        memberId: "memberName",
        ringId: "ringName",
      };
      const result = await client.GET("/training-bookings", {
        params: {
          query: {
            fields: listFields([field, ...(label[field] === undefined ? [] : [label[field]])]),
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
            page: 0,
            ...(state.q === "" ? {} : { q: state.q }),
            size: 1000,
            sort: [],
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Training values without data");
      const rows = result.data.items;
      return countValues(
        rows,
        (row) => filterValue((row as Record<string, unknown>)[field]),
        (_row, value) => valueLabel(field, value, rows),
      );
    },
    // `valueLabel` only reads `t` and `formats`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, formats, state.filters, state.q, t],
  );

  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = filterValue(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel: valueLabel(filter.field, value),
    };
  });

  const labels: UniversalListLabels<TrainingRow> = {
    ...commonLabels(t),
    emptyTitle: t("admin-training:bookings.emptyTitle"),
    search: t("admin-training:bookings.search"),
    selectRow: (row) => t("admin-training:bookings.selectRow", { name: row.memberName ?? "" }),
  };

  return (
    <UniversalList<TrainingRow>
      appliedFilters={applied}
      caption={t("admin-training:bookings.caption")}
      columns={columns}
      {...(listError(t, error) === undefined ? {} : { error: listError(t, error) ?? "" })}
      // S14 R-14-12: list exports are ADMIN's.
      exportable={admin}
      exportBusy={listExport.busy}
      {...(listExport.error === undefined ? {} : { exportError: listExport.error.message })}
      filterColumns={filterColumns}
      labels={labels}
      listKey={TRAINING_LIST_KEY}
      loadFilterValues={loadFilterValues}
      loading={loading}
      onCreateView={savedViews.create}
      onDeleteView={savedViews.remove}
      onExport={(format, current) => {
        void listExport.run("/training-bookings/export", {
          columns: [
            ...new Set(current.columns.flatMap((column) => TRAINING_EXPORT_COLUMNS[column] ?? [])),
          ].join(","),
          filter: apiFilters(current.filters),
          format,
          ...(current.q === "" ? {} : { q: current.q }),
          sort: current.sort,
        });
      }}
      onRenameView={savedViews.rename}
      onRetry={retry}
      onStateChange={setState}
      rowKey={(row) => row.id}
      rows={data?.items ?? []}
      savedViews={savedViews.views}
      state={state}
      statusFilter={{
        field: "state",
        label: t("admin-training:bookings.statusLabel"),
        options: [
          { label: t("admin-training:bookings.statuses.all"), value: "" },
          { label: t("enums:trainingBookingState.ACTIVE"), value: "ACTIVE" },
          { label: t("enums:trainingBookingState.CANCELLED"), value: "CANCELLED" },
          { label: t("enums:trainingBookingState.CANCELLED_BY_CLUB"), value: "CANCELLED_BY_CLUB" },
        ],
      }}
      totalPages={data?.totalPages ?? 0}
    />
  );
}

/** Tab 2 — `GET /ring-blocks` (S06/S09 §6): blocks and ring reservations, the register's other half. */
function RingBlocksList({ admin, client }: { admin: boolean; client: ApiClient }) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { t } = useTranslation(["admin-training", "census", "enums", "errors"]);
  const rings = useActiveRings(client);
  const week = currentWeek(branding.timeZone);
  const weekFilter = `${clubInstant(week.start, "00:00", branding.timeZone)},${clubInstant(addDays(week.end, 1), "00:00", branding.timeZone)}`;
  const [state, setState, applySavedView] = useUrlListState("blocks", {
    columns: admin ? [...BLOCK_DEFAULT_COLUMNS, "actions"] : BLOCK_DEFAULT_COLUMNS,
    filters: [{ field: "from", operator: "between", value: weekFilter }],
    size: 50,
    sort: ["from,desc"],
  });
  const savedViews = useSavedViews(client, BLOCK_LIST_KEY, applySavedView);
  const [pendingId, setPendingId] = useState<string>();
  const [feedback, setFeedback] = useState<{ message: string; tone: Tone }>();
  const { data, error, loading, retry } = useListData<BlockRow>(async () => {
    const result = await client.GET("/ring-blocks", {
      params: {
        query: {
          fields: listFields(state.columns.flatMap((column) => BLOCK_COLUMN_FIELDS[column] ?? [])),
          filter: apiFilters(state.filters),
          page: state.page,
          ...(state.q === "" ? {} : { q: state.q }),
          size: state.size,
          sort: state.sort,
        },
      },
    });
    if (result.data === undefined) throw new TypeError("Ring block list without data");
    return result.data;
  }, JSON.stringify(state));

  const ring = (ringId: string | undefined) =>
    rings.status === "ready" ? rings.data.find((item) => item.id === ringId) : undefined;
  const empty = t("admin-training:list.none");

  const cancel = async (row: BlockRow) => {
    setPendingId(row.id);
    setFeedback(undefined);
    try {
      await client.POST("/ring-blocks/{id}/cancellation", {
        body: {},
        params: { path: { id: row.id } },
      });
      setFeedback({ message: t("admin-training:blocks.cancelled"), tone: "success" });
      retry();
    } catch (cause) {
      if (isApiError(cause, "INVALID_STATE")) {
        // Already cancelled elsewhere: show why and read the list again.
        setFeedback({ message: t("errors:INVALID_STATE"), tone: "danger" });
        retry();
      } else {
        setFeedback({
          message: isApiError(cause)
            ? t(`errors:${cause.code}`, { defaultValue: t("errors:INTERNAL_ERROR") })
            : t("errors:INTERNAL_ERROR"),
          tone: "danger",
        });
      }
    } finally {
      setPendingId(undefined);
    }
  };

  const dayOf = (row: BlockRow) =>
    row.date === undefined
      ? empty
      : t("admin-training:blocks.when", {
          day: dayLabel(row.date, formats.formatPlainDate),
          from: timeLabel(row.fromLocal ?? ""),
          to: timeLabel(row.toLocal ?? ""),
        });

  const columns: UniversalListColumn<BlockRow>[] = [
    { key: "from", label: t("admin-training:blocks.columns.from"), render: dayOf, sortKey: "from" },
    {
      key: "ringId",
      label: t("admin-training:blocks.columns.ring"),
      render: (row) => {
        const found = ring(row.ringId);
        return found === undefined ? (
          (row.ringId ?? empty)
        ) : (
          <RingName color={found.color} name={found.name} />
        );
      },
    },
    {
      key: "kind",
      label: t("admin-training:blocks.columns.kind"),
      render: (row) => (row.kind === undefined ? empty : t(`enums:ringBlockKind.${row.kind}`)),
    },
    {
      key: "reason",
      label: t("admin-training:blocks.columns.reason"),
      render: (row) =>
        row.reason === undefined
          ? empty
          : row.activityTitle === null || row.activityTitle === undefined
            ? t(`enums:ringBlockReason.${row.reason}`)
            : t("admin-training:blocks.activityReason", {
                reason: t(`enums:ringBlockReason.${row.reason}`),
                title: row.activityTitle,
              }),
    },
    {
      key: "note",
      label: t("admin-training:blocks.columns.note"),
      render: (row) =>
        row.note === null || row.note === undefined || row.note === "" ? empty : row.note,
    },
    {
      key: "createdByName",
      label: t("admin-training:blocks.columns.createdBy"),
      render: (row) => row.createdByName ?? empty,
    },
    {
      key: "state",
      label: t("admin-training:blocks.columns.state"),
      render: (row) =>
        row.state === undefined ? (
          empty
        ) : (
          <Badge tone={row.state === "ACTIVE" ? "success" : "neutral"}>
            {t(`enums:ringBlockState.${row.state}`)}
          </Badge>
        ),
    },
    ...(admin
      ? [
          {
            key: "actions",
            label: t("admin-training:blocks.columns.actions"),
            // R-07-11: an activity's block is managed from the activity; a cancelled one is history.
            render: (row: BlockRow) =>
              row.state !== "ACTIVE" ||
              (row.activityId !== null && row.activityId !== undefined) ? null : (
                <Button
                  aria-label={t("admin-training:blocks.cancelLabel", { when: dayOf(row) })}
                  disabled={pendingId !== undefined}
                  loading={pendingId === row.id}
                  loadingLabel={t("admin-training:blocks.cancelling")}
                  onClick={() => void cancel(row)}
                  variant="ghost"
                >
                  {t("admin-training:blocks.cancel")}
                </Button>
              ),
          },
        ]
      : []),
  ];

  const filterColumns: UniversalListFilterColumn[] = [
    { key: "ringId", label: t("admin-training:blocks.columns.ring"), type: "relation" },
    {
      key: "from",
      label: t("admin-training:blocks.columns.from"),
      operators: ["between"],
      type: "date",
    },
    { key: "kind", label: t("admin-training:blocks.columns.kind"), type: "enum" },
    { key: "reason", label: t("admin-training:blocks.columns.reason"), type: "enum" },
    { key: "state", label: t("admin-training:blocks.columns.state"), type: "enum" },
  ];

  /** A day's filter value: its club-local start and the next day's (`from:between:…`). */
  const dayRange = (date: string) =>
    `${clubInstant(date, "00:00", branding.timeZone)},${clubInstant(addDays(date, 1), "00:00", branding.timeZone)}`;

  const valueLabel = (field: string, value: string) => {
    if (field === "kind") return t(`enums:ringBlockKind.${value}`, { defaultValue: value });
    if (field === "reason") return t(`enums:ringBlockReason.${value}`, { defaultValue: value });
    if (field === "state") return t(`enums:ringBlockState.${value}`, { defaultValue: value });
    if (field === "ringId") return ring(value)?.name ?? value;
    if (field === "from") {
      const [start = "", end = ""] = value.split(",");
      if (start === "" || end === "") return value;
      const last = new Date(Date.parse(end) - 1).toISOString();
      return formats.formatDate(start, "dayMonth") === formats.formatDate(last, "dayMonth")
        ? formats.formatDate(start, "dayMonth")
        : formats.formatWeekRange(start, last);
    }
    return value;
  };

  const loadFilterValues = useCallback(
    async (field: string) => {
      const result = await client.GET("/ring-blocks", {
        params: {
          query: {
            fields: listFields(field === "from" ? ["date"] : [field]),
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
            page: 0,
            ...(state.q === "" ? {} : { q: state.q }),
            size: 1000,
            sort: [],
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Ring block values without data");
      return countValues(
        result.data.items,
        (row) =>
          field === "from"
            ? row.date === undefined
              ? undefined
              : dayRange(row.date)
            : filterValue((row as Record<string, unknown>)[field]),
        (row, value) =>
          field === "from" && row.date !== undefined
            ? dayLabel(row.date, formats.formatPlainDate)
            : valueLabel(field, value),
      );
    },
    // `dayRange` and `valueLabel` read the zone, `formats`, `rings` and `t` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, formats, rings, state.filters, state.q, t],
  );

  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = filterValue(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel: valueLabel(filter.field, value),
    };
  });

  const labels: UniversalListLabels<BlockRow> = {
    ...commonLabels(t),
    emptyTitle: t("admin-training:blocks.emptyTitle"),
    search: t("admin-training:blocks.search"),
    selectRow: (row) => t("admin-training:blocks.selectRow", { when: dayOf(row) }),
  };

  return (
    <>
      {feedback === undefined ? null : (
        <Toast
          dismissLabel={t("admin-training:list.dismiss")}
          onDismiss={() => {
            setFeedback(undefined);
          }}
          tone={feedback.tone}
        >
          {feedback.message}
        </Toast>
      )}
      <UniversalList<BlockRow>
        appliedFilters={applied}
        caption={t("admin-training:blocks.caption")}
        columns={columns}
        {...(listError(t, error) === undefined ? {} : { error: listError(t, error) ?? "" })}
        // `GET /ring-blocks` publishes no export (`x-exportable: false`).
        exportable={false}
        filterColumns={filterColumns}
        labels={labels}
        listKey={BLOCK_LIST_KEY}
        loadFilterValues={loadFilterValues}
        loading={loading}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={() => undefined}
        onRenameView={savedViews.rename}
        onRetry={retry}
        onStateChange={setState}
        rowKey={(row) => row.id}
        rows={data?.items ?? []}
        savedViews={savedViews.views}
        state={state}
        statusFilter={{
          field: "state",
          label: t("admin-training:blocks.statusLabel"),
          options: [
            { label: t("admin-training:blocks.statuses.all"), value: "" },
            { label: t("enums:ringBlockState.ACTIVE"), value: "ACTIVE" },
            { label: t("enums:ringBlockState.CANCELLED"), value: "CANCELLED" },
          ],
        }}
        totalPages={data?.totalPages ?? 0}
      />
    </>
  );
}

/**
 * «Entrenaments» (menú Camp) — the ring-usage register (S09 §2 and §13-8, no mockup: the D5 list
 * pattern over `GET /training-bookings` and `GET /ring-blocks`). INSTRUCTOR and ADMIN read it; the
 * exports and the block cancellation are ADMIN's.
 */
export function TrainingRegisterPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const session = useSession();
  const { t } = useTranslation("admin-training");
  const admin = session.roles.includes("ADMIN");
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get(TAB_PARAMETER) === TAB_VALUES.blocks
      ? "blocks"
      : "bookings",
  );
  return (
    <section className="training-register">
      <h1>{t("admin-training:title")}</h1>
      <Tabs
        items={[
          {
            content: <TrainingBookingsList admin={admin} client={client} onNavigate={onNavigate} />,
            label: t("admin-training:tab.bookings"),
            value: "bookings",
          },
          {
            content: <RingBlocksList admin={admin} client={client} />,
            label: t("admin-training:tab.blocks"),
            value: "blocks",
          },
        ]}
        label={t("admin-training:tab.label")}
        onValueChange={(value) => {
          const next: Tab = value === "blocks" ? "blocks" : "bookings";
          // Each tab starts from its own defaults: the other list's query does not apply to it.
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}?${TAB_PARAMETER}=${TAB_VALUES[next]}`,
          );
          setTab(next);
        }}
        value={tab}
      />
    </section>
  );
}
