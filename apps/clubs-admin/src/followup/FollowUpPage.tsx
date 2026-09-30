import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Icon,
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
} from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSavedViews } from "../activities/shared";

import "./followup.css";
import { useUnreadFollowUp, useUnreadFollowUpContext } from "./unread";

type FollowupItem = components["schemas"]["FollowupItem"];
type Translate = ReturnType<typeof useTranslation>["t"];

const FOLLOWUP_LIST_KEY = "followup";
/** `GET /followup` pages hold at most 50 rows (S10 §3; api E6-T02 accepts 20 or 50). */
const FOLLOWUP_PAGE_SIZES = [20, 50] as const;
const DEFAULT_COLUMNS = [
  "memberName",
  "dogName",
  "levelCode",
  "activityAt",
  "authorName",
  "textExcerpt",
  "createdAt",
  "completedAt",
];
const RELATION_OPERATORS: readonly UniversalFilterOperator[] = ["eq", "ne", "in", "nin"];

type Kind = "" | "MEMBER_NOTE" | "TASK";

function kindOf(state: UniversalListState): Kind {
  const value = state.filters.find(
    (filter) => filter.field === "kind" && filter.operator === "eq",
  )?.value;
  return value === "TASK" || value === "MEMBER_NOTE" ? value : "";
}

function withKind(state: UniversalListState, kind: Kind): UniversalListState {
  const others = state.filters.filter((filter) => filter.field !== "kind");
  return {
    ...state,
    filters: kind === "" ? others : [...others, { field: "kind", operator: "eq", value: kind }],
    page: 0,
  };
}

function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

/** The list's state in the URL; a page size the list does not take becomes 50. */
function useUrlListState() {
  const [state, setState] = useState(() => {
    const read = readUniversalListState(window.location.search, {
      columns: DEFAULT_COLUMNS,
      size: 50,
      sort: ["activityAt,desc"],
    });
    return (FOLLOWUP_PAGE_SIZES as readonly number[]).includes(read.size)
      ? read
      : { ...read, size: 50 as const };
  });
  const update = useCallback((next: UniversalListState) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${universalListSearchParams(next).toString()}`,
    );
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
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${universalListSearchParams(next).toString()}`,
      );
      return next;
    });
  }, []);
  return [state, update, applySavedView] as const;
}

/** The labels every universal list shares (D5's, `census:list.*`). */
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

/** A failure by its code; `400 INVALID_FILTER` keeps the list's own message (T-08-47). */
function errorText(t: Translate, error: unknown, fallback: string): string {
  return isApiError(error) && error.status !== 0
    ? t(`errors:${error.code}`, { defaultValue: fallback })
    : fallback;
}

function kindLabel(t: Translate, kind: string): string {
  return kind === "TASK"
    ? t("enums:followupKind.TASK")
    : kind === "MEMBER_NOTE"
      ? t("enums:followupKind.MEMBER_NOTE")
      : kind;
}

/** «Laura (alumna)» by the note's author gender, «Estel (tasca)» for a task (S10 §10). */
function authorLabel(t: Translate, row: FollowupItem): string {
  const name = row.authorName ?? "";
  return row.kind === "MEMBER_NOTE"
    ? t("admin-census:followup.author.member", {
        gender: row.authorGender === "FEMALE" ? "female" : "other",
        name,
      })
    : t("admin-census:followup.author.task", { name });
}

interface ListData {
  appliedFilters: components["schemas"]["Filter"][];
  items: FollowupItem[];
  totalPages: number;
}

/**
 * D14 «Seguiment alumnes» (`/seguiment`, S10 §2 row D14, R-10-13): the universal list of
 * `GET /followup` in the api's order (unread first, then `activityAt`), the unread rows
 * highlighted, the three chips on `kind`, «Marcar-ho tot com a llegit» and, on a row, its read
 * (optimistic: the highlight and the counter drop) and the dog's record D13 (§13-10).
 */
export function FollowUpPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-census", "census", "enums", "errors"]);
  const formats = useClubFormats();
  const shell = useUnreadFollowUpContext();
  const own = useUnreadFollowUp(client, shell === undefined);
  const unread = shell ?? own;
  const [state, setState, applySavedView] = useUrlListState();
  const savedViews = useSavedViews(client, FOLLOWUP_LIST_KEY, applySavedView);
  const [reload, setReload] = useState(0);
  const requestKey = `${JSON.stringify(state)}|${String(reload)}`;
  const [list, setList] = useState<{ data?: ListData; error?: unknown; key: string }>({ key: "" });
  // Rows read on this screen: they lose the highlight before the list is read again.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [readingAll, setReadingAll] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  // «Marcar-ho tot com a llegit»'s key: kept only while the api has not answered (CONVENCIONS_API §7).
  const readAllKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    let current = true;
    client
      .GET("/followup", {
        params: {
          query: {
            filter: apiFilters(state.filters),
            page: state.page,
            ...(state.q === "" ? {} : { q: state.q }),
            // The state holds 20 or 50 only (`useUrlListState`), the contract's two sizes.
            size: state.size === 20 ? 20 : 50,
            sort: state.sort,
          },
        },
      })
      .then(
        ({ data }) => {
          if (!current) return;
          if (data === undefined) {
            setList({ error: new TypeError("The follow-up had no data"), key: requestKey });
          } else {
            setList({ data, key: requestKey });
            setReadIds(new Set());
          }
        },
        (error: unknown) => {
          if (current) setList((previous) => ({ ...previous, error, key: requestKey }));
        },
      );
    return () => {
      current = false;
    };
    // The request identity is `requestKey` (the state and the retries).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, requestKey]);

  const loading = list.key !== requestKey;
  const error = loading ? undefined : list.error;
  const rows = useMemo(
    () =>
      (list.data?.items ?? []).map((row) =>
        readIds.has(row.id) ? { ...row, unread: false } : row,
      ),
    [list.data, readIds],
  );
  const retry = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  // S10 §9 / R-10-16: `levelCode` is null on every row with `levels.enabled = false` (the api's
  // answer is all an INSTRUCTOR can read of the parameter): no «Nivell» column then.
  const levels = rows.length === 0 || rows.some((row) => row.levelCode != null);
  const empty = t("admin-census:followup.none");
  const day = useCallback(
    (instant: string | null | undefined) =>
      instant == null ? empty : formats.formatDate(instant, "dayMonthNumeric").replaceAll("/", "-"),
    [empty, formats],
  );

  const columns = useMemo<UniversalListColumn<FollowupItem>[]>(
    () => [
      {
        key: "memberName",
        label: t("admin-census:followup.columns.member"),
        render: (row) => (
          <span className="followup__member">
            {row.memberName ?? empty}
            {row.unread === true ? (
              <span className="ah-sr-only">{` · ${t("admin-census:followup.unreadMark")}`}</span>
            ) : null}
          </span>
        ),
      },
      {
        key: "dogName",
        label: t("admin-census:followup.columns.dog"),
        render: (row) => row.dogName ?? empty,
      },
      ...(levels
        ? [
            {
              key: "levelCode",
              label: t("admin-census:followup.columns.level"),
              render: (row: FollowupItem) =>
                row.levelCode == null ? null : (
                  <Badge className="followup__level" tone="warning">
                    {row.levelCode}
                  </Badge>
                ),
            },
          ]
        : []),
      {
        key: "activityAt",
        label: t("admin-census:followup.columns.date"),
        render: (row) => day(row.activityAt),
        sortKey: "activityAt",
      },
      {
        key: "authorName",
        label: t("admin-census:followup.columns.author"),
        render: (row) => authorLabel(t, row),
      },
      {
        key: "textExcerpt",
        label: t("admin-census:followup.columns.text"),
        render: (row) => (
          <span
            className={
              row.completedAt == null ? "followup__text" : "followup__text followup__text--done"
            }
          >
            {row.textExcerpt ?? empty}
          </span>
        ),
      },
      {
        key: "createdAt",
        label: t("admin-census:followup.columns.createdAt"),
        render: (row) => day(row.createdAt),
      },
      {
        key: "completedAt",
        label: t("admin-census:followup.columns.completedAt"),
        render: (row) =>
          row.completedAt == null ? empty : <Badge tone="success">{day(row.completedAt)}</Badge>,
      },
    ],
    [day, empty, levels, t],
  );

  const filterColumns: UniversalListFilterColumn[] = [
    { key: "kind", label: t("admin-census:followup.columns.kind"), type: "enum" },
    {
      key: "unread",
      label: t("admin-census:followup.columns.unread"),
      operators: ["eq"],
      type: "boolean",
    },
    {
      key: "memberId",
      label: t("admin-census:followup.columns.member"),
      operators: RELATION_OPERATORS,
      type: "relation",
    },
    {
      key: "dogId",
      label: t("admin-census:followup.columns.dog"),
      operators: RELATION_OPERATORS,
      type: "relation",
    },
  ];

  const valueLabel = (
    field: string,
    value: string,
    source: readonly FollowupItem[] = rows,
  ): string => {
    if (field === "kind") return kindLabel(t, value);
    if (field === "unread") {
      return value === "true"
        ? t("admin-census:followup.unreadValue.yes")
        : t("admin-census:followup.unreadValue.no");
    }
    const row = source.find((item) =>
      field === "memberId" ? item.memberId === value : item.dogId === value,
    );
    return (field === "memberId" ? row?.memberName : row?.dogName) ?? value;
  };

  const loadFilterValues = useCallback(
    async (field: string): Promise<UniversalFilterValue[]> => {
      const { data } = await client.GET("/followup", {
        params: {
          query: {
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
            page: 0,
            ...(state.q === "" ? {} : { q: state.q }),
            size: 50,
            sort: ["activityAt,desc"],
          },
        },
      });
      const items = data?.items ?? [];
      const counted = new Map<string, UniversalFilterValue>();
      for (const item of items) {
        const value = filterValue((item as Record<string, unknown>)[field]);
        if (value === "") continue;
        const known = counted.get(value);
        counted.set(value, {
          count: (known?.count ?? 0) + 1,
          label: known?.label ?? valueLabel(field, value, items),
          value,
        });
      }
      return [...counted.values()].sort((left, right) => left.label.localeCompare(right.label));
    },
    // `valueLabel` reads `t` and the rows only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, state.filters, state.q, t],
  );

  const applied = (list.data?.appliedFilters ?? []).map((filter) => {
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

  const labels: UniversalListLabels<FollowupItem> = {
    ...commonLabels(t),
    emptyDescription: t("admin-census:followup.emptyDescription"),
    emptyTitle: t("admin-census:followup.emptyTitle"),
    search: t("admin-census:followup.search"),
    selectRow: (row) => t("admin-census:followup.selectRow", { name: row.dogName ?? "" }),
  };

  const open = (row: FollowupItem) => {
    if (row.dogId === undefined) return;
    if (row.unread === true) {
      // R-10-13: `readItemIds += id` for the caller; the row and the counter drop at once.
      setReadIds((current) => new Set([...current, row.id]));
      unread.markOneRead();
      client
        .POST("/followup/{id}/read", {
          params: { header: { "Idempotency-Key": crypto.randomUUID() }, path: { id: row.id } },
        })
        .then(unread.refresh, unread.refresh);
    }
    onNavigate(`/alumnes/${encodeURIComponent(row.dogId)}`);
  };

  const readAll = async () => {
    if (readingAll) return;
    setReadingAll(true);
    setFeedback(undefined);
    readAllKey.current ??= crypto.randomUUID();
    try {
      await client.POST("/followup/read-all", {
        params: { header: { "Idempotency-Key": readAllKey.current } },
      });
      readAllKey.current = undefined;
      unread.markAllRead();
      unread.refresh();
      retry();
    } catch (cause) {
      // Answered: the next attempt is a new request; unanswered (offline): the same one again.
      if (!isApiError(cause) || cause.status !== 0) readAllKey.current = undefined;
      setFeedback(errorText(t, cause, t("errors:INTERNAL_ERROR")));
    } finally {
      setReadingAll(false);
    }
  };

  const kind = kindOf(state);
  const chips: { label: string; value: Kind }[] = [
    { label: t("admin-census:followup.filter.all"), value: "" },
    { label: t("admin-census:followup.filter.tasks"), value: "TASK" },
    { label: t("admin-census:followup.filter.notes"), value: "MEMBER_NOTE" },
  ];
  const listError =
    error === undefined ? undefined : errorText(t, error, t("admin-census:followup.error"));

  return (
    <section className="followup">
      <header className="followup__header">
        <div className="followup__title">
          <h1>{t("admin-census:followup.title")}</h1>
          {unread.count === undefined ? null : (
            <Badge tone="warning">
              {t("admin-census:followup.unread", { count: unread.count })}
            </Badge>
          )}
        </div>
        <div className="followup__actions">
          <div
            aria-label={t("admin-census:followup.kinds")}
            className="followup__chips"
            role="group"
          >
            {chips.map((chip) => (
              <button
                aria-pressed={kind === chip.value}
                className="followup__chip"
                key={chip.value}
                onClick={() => {
                  setState(withKind(state, chip.value));
                }}
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>
          <Button
            loading={readingAll}
            loadingLabel={t("admin-census:followup.readingAll")}
            onClick={() => void readAll()}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="check" />
            {t("admin-census:followup.readAll")}
          </Button>
        </div>
      </header>
      {feedback === undefined ? null : (
        <Toast
          dismissLabel={t("admin-census:followup.dismiss")}
          onDismiss={() => {
            setFeedback(undefined);
          }}
          tone="danger"
        >
          {feedback}
        </Toast>
      )}
      <UniversalList<FollowupItem>
        appliedFilters={applied}
        caption={t("admin-census:followup.caption")}
        columns={columns}
        {...(listError === undefined ? {} : { error: listError })}
        // `GET /followup` publishes no export (`x-exportable: false`).
        exportable={false}
        filterColumns={filterColumns}
        labels={labels}
        listKey={FOLLOWUP_LIST_KEY}
        loadFilterValues={loadFilterValues}
        loading={loading}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={() => undefined}
        onRenameView={savedViews.rename}
        onRetry={retry}
        onRowActivate={open}
        onStateChange={setState}
        pageSizes={FOLLOWUP_PAGE_SIZES}
        rowClassName={(row) => (row.unread === true ? "followup__row--unread" : undefined)}
        rowHref={(row) => `/alumnes/${encodeURIComponent(row.dogId ?? "")}`}
        rowKey={(row) => row.id}
        rows={rows}
        savedViews={savedViews.views}
        state={state}
        totalPages={list.data?.totalPages ?? 0}
      />
    </section>
  );
}
