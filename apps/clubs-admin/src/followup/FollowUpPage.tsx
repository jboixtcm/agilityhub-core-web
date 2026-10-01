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
import { FollowUpReadFailureNotice, useUnreadFollowUp, useUnreadFollowUpContext } from "./unread";

type FollowupItem = components["schemas"]["FollowupItem"];
type Translate = ReturnType<typeof useTranslation>["t"];

const FOLLOWUP_LIST_KEY = "followup";
/** `FollowupItem.kind`'s values in the contract, in the chips' order («Tasques», «Notes d'alumnes»). */
const FOLLOWUP_KINDS = ["TASK", "MEMBER_NOTE"] as const satisfies readonly NonNullable<
  FollowupItem["kind"]
>[];
/** `unread`'s values («no llegit», «llegit»): a boolean of the contract. */
const UNREAD_VALUES = ["true", "false"] as const;
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
/** The filters whose values the api names (`GET /followup/filter-values`, E6-W04 step 0c). */
const RELATION_FIELDS: readonly string[] = ["memberId", "dogId", "authorAccountId"];

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

/**
 * Adds the api's labels of one field's values to `current`, or keeps `current` when none changed:
 * a new object at every answer re-renders the list, which asks for the values again (the
 * register's pattern, E5-W05 round 2 #1).
 */
function withLearned(
  current: Readonly<Record<string, string>>,
  field: string,
  options: readonly UniversalFilterValue[],
): Readonly<Record<string, string>> {
  const changed = options.filter((option) => current[`${field}:${option.value}`] !== option.label);
  return changed.length === 0
    ? current
    : {
        ...current,
        ...Object.fromEntries(changed.map((option) => [`${field}:${option.value}`, option.label])),
      };
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

  // A read the shell's retry got through (R-10-13): this list showed the row before it, so the row
  // loses its highlight at once and the list is read again (an older read on its way is dropped).
  const { onRetried } = unread;
  useEffect(
    () =>
      onRetried((id) => {
        setReadIds((current) => new Set([...current, id]));
        setReload((value) => value + 1);
      }),
    [onRetried],
  );

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
    // E6-W04 step 0c (E75): «Creador», whoever wrote the task or the note (`authorAccountId`).
    {
      key: "authorAccountId",
      label: t("admin-census:followup.columns.author"),
      operators: RELATION_OPERATORS,
      type: "relation",
    },
  ];

  // The names the api gave each relation value (`filter-values` labels), for the applied chips:
  // the rows carry no `authorAccountId`, and a member or dog may be on no row of this page.
  const [learned, setLearned] = useState<Readonly<Record<string, string>>>({});

  const valueLabel = (field: string, value: string): string => {
    if (field === "kind") return kindLabel(t, value);
    if (field === "unread") {
      return value === "true"
        ? t("admin-census:followup.unreadValue.yes")
        : t("admin-census:followup.unreadValue.no");
    }
    const row =
      field === "memberId"
        ? rows.find((item) => item.memberId === value)
        : field === "dogId"
          ? rows.find((item) => item.dogId === value)
          : undefined;
    return (
      (field === "memberId" ? row?.memberName : row?.dogName) ??
      learned[`${field}:${value}`] ??
      value
    );
  };

  const loadFilterValues = useCallback(
    async (field: string): Promise<UniversalFilterValue[]> => {
      const others = apiFilters(state.filters.filter((filter) => filter.field !== field));
      const search = state.q === "" ? {} : { q: state.q };
      if (field === "kind" || field === "unread") {
        // Round 2 #5 (review #1): the contract's values, whatever the first page holds, each
        // counted by the api (`totalItems` of the list with that value and the other filters).
        const values: readonly string[] = field === "kind" ? FOLLOWUP_KINDS : UNREAD_VALUES;
        return Promise.all(
          values.map(async (value) => {
            const { data } = await client.GET("/followup", {
              params: {
                query: {
                  filter: [...others, `${field}:eq:${value}`],
                  page: 0,
                  ...search,
                  size: 20,
                },
              },
            });
            return { count: data?.totalItems ?? 0, label: valueLabel(field, value), value };
          }),
        );
      }
      // E6-W04 step 0c (api E6-T06, E75): the member, dog and creator values and their counts over
      // the whole set the other filters and `q` select, never the rows on screen.
      const result = await client.GET("/followup/filter-values", {
        params: { query: { field, filter: others, ...search } },
      });
      if (result.data === undefined) throw new TypeError("Follow-up values without data");
      const options = result.data.values
        .map((item) => ({ count: item.count, label: item.label, value: filterValue(item.value) }))
        .filter((item) => item.value !== "")
        .sort((left, right) => left.label.localeCompare(right.label));
      setLearned((current) => withLearned(current, field, options));
      return options;
    },
    // `valueLabel` reads `t` only for these fields; `learned` is written here, never read (a new
    // callback per answer would ask for the values again).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, state.filters, state.q, t],
  );

  // A relation filter that came with the address or a saved view: the rows may not carry its
  // value's name (`authorAccountId` never does), so the api's labels are read once for that field
  // (E6-W04 step 0c's review). A value beyond the api's top 50 keeps its id; nothing loops, as the
  // fields only change with the filters.
  const unnamedFields = [
    ...new Set(
      state.filters
        .filter(
          (filter) =>
            RELATION_FIELDS.includes(filter.field) &&
            filter.value
              .split(",")
              .some(
                (value) =>
                  learned[`${filter.field}:${value}`] === undefined &&
                  valueLabel(filter.field, value) === value,
              ),
        )
        .map((filter) => filter.field),
    ),
  ].join(",");
  useEffect(() => {
    if (unnamedFields === "") return undefined;
    let current = true;
    const search = state.q === "" ? {} : { q: state.q };
    void Promise.all(
      unnamedFields.split(",").map(async (field) => {
        const { data } = await client.GET("/followup/filter-values", {
          params: {
            query: {
              field,
              filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
              ...search,
            },
          },
        });
        return {
          field,
          options: (data?.values ?? []).map((item) => ({
            count: item.count,
            label: item.label,
            value: filterValue(item.value),
          })),
        };
      }),
    ).then(
      (answers) => {
        if (!current) return;
        setLearned((known) =>
          answers.reduce(
            (merged, answer) => withLearned(merged, answer.field, answer.options),
            known,
          ),
        );
      },
      // A failed read leaves the id; the list's own error says what went wrong.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [client, state.filters, state.q, unnamedFields]);

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
    // R-10-13: `readItemIds += id` for the caller. Every activation sends it, also on a row shown
    // «llegit» (a note may have changed since this list was read; round 2 #3); a row shown unread
    // loses its highlight and one off the counter at once. The read is the shell's: if it fails,
    // the row is unread again and the failure is said wherever the user is (round 2 #1).
    setReadIds((current) => new Set([...current, row.id]));
    void unread
      .read({ dogName: row.dogName, id: row.id, unread: row.unread === true })
      .then((accepted) => {
        if (accepted) return;
        setReadIds((current) => new Set([...current].filter((id) => id !== row.id)));
      });
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
      {/* In the back office the shell says a failed read on every page; alone, D14 says it. */}
      {shell === undefined ? <FollowUpReadFailureNotice unread={own} /> : null}
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
