import {
  type ApiClient,
  type components,
  isApiError,
  listFields,
  useClubRings,
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
  type UniversalFilterOperator,
  type UniversalFilterValue,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
  useBranding,
} from "@agilityhub/ui";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSavedViews } from "../activities/shared";
import { useListExport } from "../audit/useListExport";
import {
  apiFilters,
  useListData,
  universalListLabels,
  useUrlListState,
} from "../lists/list-helpers";
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
  // «dj 8 · 18:30–19:00»: the slot's end is the api's (E5-T29 `endsAtLocal`).
  date: ["date", "startsAtLocal", "endsAtLocal"],
  dogName: ["dogName"],
  // «{nom complet} · {número}» (E5-T29 `memberNumber`, null without one).
  memberName: ["memberId", "memberName", "memberNumber"],
  origin: ["origin"],
  ringName: ["ringId", "ringName"],
  state: ["state"],
};
const TRAINING_EXPORT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  ...TRAINING_COLUMN_FIELDS,
  memberName: ["memberName", "memberNumber"],
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
  // The row's own ring, a deactivated one's included (E5-T29 `ringName`, `ringColor`).
  ringId: ["ringId", "ringName", "ringColor"],
  state: ["state"],
};
const BLOCK_DEFAULT_COLUMNS = ["from", "ringId", "kind", "reason", "note", "createdByName"];

/** A single date of the list (`date:gte:2026-08-04`). */
const SINGLE_VALUE_DATE: readonly UniversalFilterOperator[] = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
];
/** One id of the list (`in`/`nin` with one id are a list of one). */
const SINGLE_VALUE_RELATION: readonly UniversalFilterOperator[] = ["eq", "ne", "in", "nin"];

const TRAINING_STATE_TONES: Readonly<Record<NonNullable<TrainingRow["state"]>, Tone>> = {
  ACTIVE: "success",
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "danger",
};

/**
 * A filter value as the list's state writes it. The api echoes a list (`in`, `nin`) and a range
 * (`between`) as JSON arrays (CONVENCIONS_API §4), the rest as the scalar it received.
 */
function filterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(filterValue).join(",");
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

/** The club-local week of today (Monday to Sunday), as the lists start (S09 §13-8). */
function currentWeek(timeZone: string): { end: string; start: string } {
  const start = mondayOf(clubToday(timeZone));
  return { end: addDays(start, 6), start };
}

/** `400 INVALID_FILTER` keeps the list's own message (T-08-47 / T-09-24); other codes theirs. */
function listError(t: Translate, error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return isApiError(error)
    ? t(`errors:${error.code}`, { defaultValue: t("admin-training:list.error") })
    : t("admin-training:list.error");
}

type FilterValues = components["schemas"]["FilterValues"];

/**
 * The universal filter's values (CONVENCIONS_API §4, api E5-T29): `GET /{list}/filter-values`
 * counts each value over the whole set the other filters select, never one page. `label` names a
 * value the api labels by its code (enums, dates); names keep the api's label. Dates read in
 * calendar order, the rest by label.
 */
function filterOptions(
  answer: FilterValues,
  label: (value: string, apiLabel: string) => string,
): UniversalFilterValue[] {
  const values = answer.values
    .map((item) => {
      const value = filterValue(item.value);
      return { count: item.count, label: label(value, item.label), value };
    })
    .filter((item) => item.value !== "");
  return /^\d{4}-\d{2}-\d{2}/u.test(values[0]?.value ?? "")
    ? values.sort((left, right) => left.value.localeCompare(right.value))
    : values.sort((left, right) => left.label.localeCompare(right.label));
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
  const rings = useClubRings(client, admin);
  const week = currentWeek(branding.timeZone);
  const [state, setState, applySavedView] = useUrlListState(
    {
      columns: TRAINING_DEFAULT_COLUMNS,
      filters: [{ field: "date", operator: "between", value: `${week.start},${week.end}` }],
      size: 50,
      sort: ["startsAt,desc"],
    },
    { [TAB_PARAMETER]: TAB_VALUES.bookings },
  );
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
          row.date === undefined || row.startsAtLocal === undefined || row.endsAtLocal === undefined
            ? empty
            : t("admin-training:list.when", {
                day: dayLabel(row.date, formats.formatPlainDate),
                from: timeLabel(row.startsAtLocal),
                to: timeLabel(row.endsAtLocal),
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
        render: (row) => {
          if (row.memberName === undefined) return empty;
          // «Laura Serra Vidal · 87»; without a number, the name alone.
          const member =
            row.memberNumber === null || row.memberNumber === undefined
              ? row.memberName
              : t("admin-training:bookings.memberWithNumber", {
                  name: row.memberName,
                  // An identifier, never grouped («1234», not «1.234»).
                  number: String(row.memberNumber),
                });
          return admin && row.memberId !== undefined ? (
            <a
              href={`/abonats/${row.memberId}`}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(`/abonats/${row.memberId ?? ""}`);
              }}
            >
              {member}
            </a>
          ) : (
            member
          );
        },
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

  // The value control offers one value of the list: only the operators that take one (never
  // `between`, which needs two dates, nor `exists`, which takes yes or no; CONVENCIONS_API §4).
  const filterColumns: UniversalListFilterColumn[] = [
    {
      key: "ringId",
      label: t("admin-training:bookings.columns.ring"),
      operators: SINGLE_VALUE_RELATION,
      type: "relation",
    },
    {
      key: "date",
      label: t("admin-training:bookings.columns.date"),
      operators: SINGLE_VALUE_DATE,
      type: "date",
    },
    {
      key: "memberId",
      label: t("admin-training:bookings.columns.member"),
      operators: SINGLE_VALUE_RELATION,
      type: "relation",
    },
    {
      key: "dogId",
      label: t("admin-training:bookings.columns.dog"),
      operators: SINGLE_VALUE_RELATION,
      type: "relation",
    },
    { key: "state", label: t("admin-training:bookings.columns.state"), type: "enum" },
    { key: "origin", label: t("admin-training:bookings.columns.origin"), type: "enum" },
  ];

  // The names the api gave each filter value (`filter-values` labels), for the applied chips.
  const [learned, setLearned] = useState<Readonly<Record<string, string>>>({});

  const valueLabel = (field: string, value: string) => {
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
    const row = (data?.items ?? []).find((item) =>
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
          : row?.dogName) ??
      learned[`${field}:${value}`] ??
      value
    );
  };

  const loadFilterValues = useCallback(
    async (field: string) => {
      const result = await client.GET("/training-bookings/filter-values", {
        params: {
          query: {
            field,
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
            ...(state.q === "" ? {} : { q: state.q }),
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Training values without data");
      const options = filterOptions(result.data, (value, apiLabel) =>
        ["date", "origin", "state"].includes(field) ? valueLabel(field, value) : apiLabel,
      );
      setLearned((current) => ({
        ...current,
        ...Object.fromEntries(options.map((option) => [`${field}:${option.value}`, option.label])),
      }));
      return options;
    },
    // `valueLabel` reads `t` and `formats` for these fields.
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
    ...universalListLabels(t, t("admin-training:list.emptyDescription")),
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
  const rings = useClubRings(client, admin);
  const week = currentWeek(branding.timeZone);
  const weekFilter = `${clubInstant(week.start, "00:00", branding.timeZone)},${clubInstant(addDays(week.end, 1), "00:00", branding.timeZone)}`;
  const [state, setState, applySavedView] = useUrlListState(
    {
      columns: admin ? [...BLOCK_DEFAULT_COLUMNS, "actions"] : BLOCK_DEFAULT_COLUMNS,
      filters: [{ field: "from", operator: "between", value: weekFilter }],
      size: 50,
      sort: ["from,desc"],
    },
    { [TAB_PARAMETER]: TAB_VALUES.blocks },
  );
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
      // The row's own ring (E5-T29), a deactivated one's included, for every role; never its id.
      render: (row) =>
        row.ringName === null || row.ringName === undefined ? (
          empty
        ) : (
          <RingName color={row.ringColor ?? undefined} name={row.ringName} />
        ),
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
    {
      key: "ringId",
      label: t("admin-training:blocks.columns.ring"),
      operators: SINGLE_VALUE_RELATION,
      type: "relation",
    },
    {
      // Each value is a whole day (its two club-local ends): only `between` takes it.
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

  // The names the api gave each filter value (`filter-values` labels), for the applied chips.
  const [learned, setLearned] = useState<Readonly<Record<string, string>>>({});

  const valueLabel = (field: string, value: string) => {
    if (field === "kind") return t(`enums:ringBlockKind.${value}`, { defaultValue: value });
    if (field === "reason") return t(`enums:ringBlockReason.${value}`, { defaultValue: value });
    if (field === "state") return t(`enums:ringBlockState.${value}`, { defaultValue: value });
    if (field === "ringId") {
      // The rows' own ring name, else the api's filter label, else the catalog; never the id.
      return (
        data?.items.find((row) => row.ringId === value)?.ringName ??
        learned[`${field}:${value}`] ??
        ring(value)?.name ??
        t("admin-training:blocks.inactiveRing")
      );
    }
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
      const result = await client.GET("/ring-blocks/filter-values", {
        params: {
          query: {
            field,
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
            ...(state.q === "" ? {} : { q: state.q }),
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Ring block values without data");
      if (field === "from") {
        // Each value is a block's start: the filter offers whole club-local days, each counted
        // with the api's counts of the starts it holds.
        const days = new Map<string, UniversalFilterValue>();
        for (const item of result.data.values) {
          const instant = filterValue(item.value);
          if (instant === "") continue;
          const date = clubToday(branding.timeZone, new Date(instant));
          const value = dayRange(date);
          days.set(value, {
            count: (days.get(value)?.count ?? 0) + item.count,
            label: dayLabel(date, formats.formatPlainDate),
            value,
          });
        }
        return [...days.values()].sort((left, right) => left.value.localeCompare(right.value));
      }
      const options = filterOptions(result.data, (value, apiLabel) =>
        field === "ringId" ? apiLabel : valueLabel(field, value),
      );
      setLearned((current) => ({
        ...current,
        ...Object.fromEntries(options.map((option) => [`${field}:${option.value}`, option.label])),
      }));
      return options;
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
    ...universalListLabels(t, t("admin-training:list.emptyDescription")),
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
