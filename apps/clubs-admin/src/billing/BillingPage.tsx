import {
  type ApiClient,
  type components,
  isApiError,
  itemsWith,
  listFields,
  type ListItemWith,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Skeleton,
  Toast,
  type Tone,
  UniversalList,
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
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSavedViews } from "../activities/shared";
import { useListExport } from "../audit/useListExport";

import {
  AccountingExportModal,
  ChargeCardsModal,
  GenerateModal,
  MarkPaidModal,
  RollbackModal,
} from "./BillingModals";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { ManualInvoiceModal } from "./ManualInvoiceModal";
import {
  type BillingPeriod,
  type BillingProvider,
  type BillingRun,
  errorFields,
  clubToday,
  formatMoney,
  generateLabel,
  type InvoiceListItem,
  invoiceStatusView,
  isPayable,
  isPeriod,
  periodOf,
  shiftPeriod,
  useBillingErrorMessage,
  useBillingLocale,
  useClubProviders,
} from "./shared";
import "./billing.css";

type BillingIncident = components["schemas"]["BillingIncident"];
type ListFilter = components["schemas"]["Filter"];
type PeriodSimulation = components["schemas"]["PeriodSimulation"];
/** A row of D6's list: the keys of its visible columns, and always those the row reads. */
type InvoiceRow = ListItemWith<
  InvoiceListItem,
  "displayNumber" | "member" | "paymentMethodType" | "status"
>;

interface ListData {
  appliedFilters: ListFilter[];
  items: InvoiceRow[];
  totalPages: number;
}

const ROW_FIELDS = ["displayNumber", "member", "paymentMethodType", "status"] as const;
/** The «Estat» label reads the amounts and the rollback flag too (S12 §2, «reemborsat»). */
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  status: ["status", "paymentMethodType", "total", "refundedTotal", "rolledBack"],
};
const DEFAULT_COLUMNS = [
  "displayNumber",
  "member",
  "concept",
  "total",
  "paymentMethodType",
  "status",
];
/** The mockup's order (2026-0912, 0913…); the api's default is the newest number first. */
const DEFAULT_SORT = ["number,asc"];
const POLL_MS = 5_000;
const POLL_LIMIT_MS = 120_000;
const STATUS_CHIPS = [
  { key: "all", status: "" },
  { key: "pending", status: "PENDING" },
  { key: "remitted", status: "COLLECTING" },
  { key: "paid", status: "PAID" },
  { key: "failed", status: "FAILED" },
] as const;

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : Array.isArray(value)
      ? value.map(String).join(",")
      : "";
}

/** The month of the URL (`?mes=`, or a `period` filter of a link), else the club-local month. */
function readPeriod(search: string, timeZone: string): string {
  const parameters = new URLSearchParams(search);
  const month = parameters.get("mes");
  if (isPeriod(month)) return month;
  const filtered = parameters
    .getAll("filter")
    .map((value) => /^period:eq:(\d{4}-\d{2})$/u.exec(value)?.[1])
    .find((value) => isPeriod(value));
  return filtered ?? periodOf(clubToday(timeZone));
}

/** The list's own state: the month is the header's, never one of its filters. */
function readListState(search: string): UniversalListState {
  const state = readUniversalListState(search, {
    columns: DEFAULT_COLUMNS,
    filters: [],
    size: 50,
    sort: DEFAULT_SORT,
  });
  return { ...state, filters: state.filters.filter((filter) => filter.field !== "period") };
}

/** A D10 member link has no month: it asks for that member's receipts across every period. */
function readsMemberHistory(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return (
    parameters.get("mes") === null &&
    parameters.getAll("filter").some((filter) => filter.startsWith("memberId:eq:"))
  );
}

function writeUrl(
  period: string,
  state: UniversalListState,
  invoiceId: string | undefined,
  memberHistory: boolean,
) {
  const parameters = new URLSearchParams(memberHistory ? undefined : { mes: period });
  universalListSearchParams(state).forEach((value, key) => {
    parameters.append(key, value);
  });
  if (invoiceId !== undefined) parameters.set("rebut", invoiceId);
  window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
}

function apiFilters(state: UniversalListState): string[] {
  return state.filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function invoiceFilters(
  period: string,
  state: UniversalListState,
  memberHistory: boolean,
): string[] {
  return [...(memberHistory ? [] : [`period:eq:${period}`]), ...apiFilters(state)];
}

interface Feedback {
  id: number;
  text: ReactNode;
  tone: Tone;
}

type ModalState = "charge" | "export" | "generate" | "manual" | "markPaid" | "rollback" | undefined;

/**
 * D6 «Facturació» (S12 §2, `/facturacio?mes=YYYY-MM`, ADMIN, module BILLING): the month's
 * simulation with its incidents and cash members, the KPIs, the strong confirmations of the
 * generation and the rollback, the card charges, and the month's receipts as a universal list with
 * the mockup's chips. Everything is the api's: the front never recomputes a total, a number, a
 * status or whether a run can be rolled back.
 */
export function BillingPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors", "census", "common"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const locale = useBillingLocale();
  const errorMessage = useBillingErrorMessage();
  const providers = useClubProviders(client);
  const listExport = useListExport(client);
  // One Idempotency-Key per payload for every write of the page and its drawer (E79, E85).
  const keys = useSubmissionKeys();
  const [period, setPeriod] = useState(() => readPeriod(window.location.search, branding.timeZone));
  const [state, setState] = useState(() => readListState(window.location.search));
  const [memberHistory, setMemberHistory] = useState(() =>
    readsMemberHistory(window.location.search),
  );
  const [invoiceId, setInvoiceId] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("rebut") ?? undefined,
  );
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState<ModalState>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextFeedback = useRef(1);
  const [simulating, setSimulating] = useState(false);
  // The receipts [Marcar cobrat (selecció)] was opened with: one payload, one key, until it closes.
  const [markPaidIds, setMarkPaidIds] = useState<string[]>([]);

  // The month, the list and the open receipt live in the address (a reload keeps them). A bare
  // `/facturacio` is left bare until something changes, so a saved default view can still apply.
  const urlWritten = useRef(window.location.search !== "");
  useEffect(() => {
    if (!urlWritten.current) {
      urlWritten.current = true;
      return;
    }
    writeUrl(period, state, invoiceId, memberHistory);
  }, [invoiceId, memberHistory, period, state]);

  const say = useCallback((text: ReactNode, tone: Tone = "success") => {
    const id = nextFeedback.current;
    nextFeedback.current += 1;
    setFeedback((current) => [...current, { id, text, tone }]);
  }, []);
  const refreshAll = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  // `GET /billing/periods/{period}`: the one read that drives the header, the cards and the chips.
  const [periodResult, setPeriodResult] = useState<{
    data?: BillingPeriod | undefined;
    error?: unknown;
    key: string;
  }>();
  const periodKey = `${memberHistory ? "all" : period}#${String(reload)}`;
  useEffect(() => {
    if (memberHistory) return undefined;
    let current = true;
    void client.GET("/billing/periods/{period}", { params: { path: { period } } }).then(
      (result) => {
        if (current) setPeriodResult({ data: result.data, key: periodKey });
      },
      (error: unknown) => {
        if (current) setPeriodResult({ error, key: periodKey });
      },
    );
    return () => {
      current = false;
    };
  }, [client, memberHistory, period, periodKey]);
  // The month shown is always the header's: another month's late answer is never drawn.
  const month = periodResult?.data?.period === period ? periodResult.data : undefined;
  const periodError = periodResult?.key === periodKey ? periodResult.error : undefined;
  const simulation = month?.simulation ?? undefined;
  const run = month?.run ?? undefined;
  const liveRun = run !== undefined && run.status !== "ROLLED_BACK" ? run : undefined;
  // The club's providers (`GET /club`); if that read failed, the ones the month itself bills
  // (`simulation.kpis.byProvider`, the api's own figures) — never a guess.
  const clubProviders =
    providers === null
      ? (Object.keys(simulation?.kpis.byProvider ?? {}) as BillingProvider[])
      : providers;

  // The run's detail: its collection date, the members it skipped, and its CHARGING progress.
  const [runDetail, setRunDetail] = useState<BillingRun>();
  const [runReadError, setRunReadError] = useState<{ error: unknown; id: string }>();
  const [pollTick, setPollTick] = useState(0);
  const pollStart = useRef<number | undefined>(undefined);
  const lastRunStatus = useRef<{ id: string; status: BillingRun["status"] } | undefined>(undefined);
  const [pollStopped, setPollStopped] = useState(false);
  const runId = run?.id;
  const runStatus = run?.status;
  useEffect(() => {
    if (runId === undefined) return undefined;
    let current = true;
    void client.GET("/billing/runs/{id}", { params: { path: { id: runId } } }).then(
      (result) => {
        if (!current || result.data === undefined) return;
        const next = result.data;
        const previousStatus =
          lastRunStatus.current?.id === next.id
            ? lastRunStatus.current.status
            : runId === next.id
              ? runStatus
              : undefined;
        // The cards settled (R-12-13): the month's chips and the receipts are read again.
        const settled = previousStatus === "CHARGING" && next.status !== "CHARGING";
        lastRunStatus.current = { id: next.id, status: next.status };
        setRunDetail(next);
        setRunReadError(undefined);
        if (settled) refreshAll();
      },
      (error: unknown) => {
        if (current) setRunReadError({ error, id: runId });
      },
    );
    return () => {
      current = false;
    };
  }, [client, pollTick, refreshAll, reload, runId, runStatus]);
  const detail = runDetail?.id === runId ? runDetail : undefined;
  const detailError =
    runReadError !== undefined && runReadError.id === runId ? runReadError.error : undefined;
  // The period is enough to start monitoring. A failed first detail read must not stop the loop.
  const charging = runStatus === "CHARGING" || detail?.status === "CHARGING";

  // R-12-13: every 5 s while the cards are charging, for two minutes at most (then [Actualitza]).
  useEffect(() => {
    if (!charging) {
      pollStart.current = undefined;
      return undefined;
    }
    if (pollStopped) return undefined;
    pollStart.current ??= Date.now();
    const started = pollStart.current;
    const timeout = window.setTimeout(() => {
      if (Date.now() - started >= POLL_LIMIT_MS) setPollStopped(true);
      else setPollTick((value) => value + 1);
    }, POLL_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [charging, pollStopped, pollTick]);

  // The receipts of the month (`GET /invoices`, universal list, `listKey = invoices`).
  const [listResult, setListResult] = useState<{ data?: ListData; error?: unknown; key: string }>();
  const listKey = JSON.stringify({ memberHistory, period, reload, state });
  useEffect(() => {
    let current = true;
    const query = {
      fields: listFields([
        ...ROW_FIELDS,
        ...state.columns.flatMap((column) => COLUMN_FIELDS[column] ?? [column]),
      ]),
      filter: invoiceFilters(period, state, memberHistory),
      page: state.page,
      ...(state.q === "" ? {} : { q: state.q }),
      size: state.size,
      sort: state.sort,
    };
    void client.GET("/invoices", { params: { query } }).then(
      (result) => {
        if (!current) return;
        try {
          if (result.data === undefined) throw new TypeError("Invoice list without data");
          const items = itemsWith(result.data.items, ROW_FIELDS);
          // Persist the removal in the controlled selection. Otherwise navigating to another page
          // can resurrect a receipt this fresh response just made non-payable.
          setSelected((selectedIds) => {
            const stale = items.filter((row) => selectedIds.has(row.id) && !isPayable(row));
            if (stale.length === 0) return selectedIds;
            const next = new Set(selectedIds);
            stale.forEach((row) => next.delete(row.id));
            return next;
          });
          setListResult({
            data: {
              appliedFilters: result.data.appliedFilters,
              items,
              totalPages: result.data.totalPages,
            },
            key: listKey,
          });
        } catch (error) {
          setListResult({ error, key: listKey });
        }
      },
      (error: unknown) => {
        if (current) setListResult({ error, key: listKey });
      },
    );
    return () => {
      current = false;
    };
  }, [client, listKey, memberHistory, period, state]);
  const list = listResult?.key === listKey ? listResult.data : undefined;
  const listError = listResult?.key === listKey ? listResult.error : undefined;
  const rows = useMemo(() => list?.items ?? [], [list]);
  const selection = selected;

  // Another filter or search shows other receipts: a selection the admin can no longer see would be
  // marked paid unseen, so it goes (a new page keeps it, as the universal list does).
  const changeState = useCallback(
    (next: UniversalListState) => {
      if (JSON.stringify(state.filters) !== JSON.stringify(next.filters) || state.q !== next.q) {
        setSelected(new Set());
      }
      if (memberHistory && !next.filters.some((filter) => filter.field === "memberId")) {
        setMemberHistory(false);
      }
      setState(next);
    },
    [memberHistory, state],
  );
  const applySavedView = useCallback((view: UniversalListSavedView) => {
    setMemberHistory(
      (current) => current && view.filters.some((filter) => filter.field === "memberId"),
    );
    setState((current) => ({
      ...current,
      columns: view.columns,
      filters: view.filters.filter((filter) => filter.field !== "period"),
      page: 0,
      sort: view.sort,
    }));
  }, []);
  const savedViews = useSavedViews(client, "invoices", applySavedView);

  const changePeriod = (next: string) => {
    setPeriod(next);
    setMemberHistory(false);
    setSelected(new Set());
    setState((current) => ({ ...current, page: 0 }));
    setPollStopped(false);
  };

  /**
   * `POST /billing/simulations` for the month shown (no key: the contract declares none). The month
   * steppers wait for it, so its answer is always this month's. `undefined` = done, else the text.
   */
  const runSimulation = async (): Promise<string | undefined> => {
    setSimulating(true);
    try {
      await client.POST("/billing/simulations", { body: { period } });
      refreshAll();
      return undefined;
    } catch (error) {
      return isApiError(error, "BILLING_BUSY")
        ? t("admin-billing:errors.billingBusy")
        : isApiError(error, "VALIDATION_ERROR") && errorFields(error).includes("period")
          ? t("admin-billing:errors.periodTooFar")
          : errorMessage(error);
    } finally {
      setSimulating(false);
    }
  };
  const simulate = async () => {
    const failed = await runSimulation();
    say(failed ?? t("admin-billing:toasts.simulated"), failed === undefined ? "success" : "danger");
  };

  // The month's receipts by member and amount, for the universal filter's values (no
  // filter-values route for `GET /invoices`): read once per month, page by page.
  // Keyed by the month and its reads: a write (a generation, a rollback) makes them read again.
  const valuesKey = `${memberHistory ? "all" : period}#${String(reload)}`;
  const monthValues = useRef<{ key: string; promise: Promise<InvoiceListItem[]> }>(undefined);
  const monthItems = useCallback(() => {
    if (monthValues.current?.key === valuesKey) return monthValues.current.promise;
    const read = async () => {
      const items: InvoiceListItem[] = [];
      for (let page = 0, totalPages = 1; page < totalPages; page += 1) {
        const result = await client.GET("/invoices", {
          params: {
            query: {
              fields: listFields(["member", "total"]),
              filter: memberHistory ? [] : [`period:eq:${period}`],
              page,
              size: 1000,
              sort: ["number,asc"],
            },
          },
        });
        items.push(...(result.data?.items ?? []));
        totalPages = result.data?.totalPages ?? 0;
      }
      return items;
    };
    const promise = read();
    promise.catch(() => {
      if (monthValues.current?.promise === promise) monthValues.current = undefined;
    });
    monthValues.current = { key: valuesKey, promise };
    return promise;
  }, [client, memberHistory, period, valuesKey]);

  const statusOptions = useMemo(
    () =>
      (["PENDING", "COLLECTING", "PAID", "FAILED", "CANCELLED"] as const).map((value) => ({
        label: t(`enums:invoiceStatus.${value}`),
        value,
      })),
    [t],
  );
  const methodOptions = useMemo(
    () =>
      (["SEPA_DD", "CARD", "MANUAL"] as const).map((value) => ({
        label: t(`enums:paymentMethodType.${value}`),
        value,
      })),
    [t],
  );
  const kindOptions = useMemo(
    () =>
      (["PERIODIC", "MANUAL", "MIGRATED"] as const).map((value) => ({
        label: t(`enums:invoiceKind.${value}`),
        value,
      })),
    [t],
  );
  const monthTitle = memberHistory
    ? t("admin-billing:header.allMonths")
    : formats.formatMonthTitle(period);
  // By id, so a re-read of the month (every write) does not reload the filter's values.
  const remittanceId = month?.remittance?.id;
  const loadFilterValues = useCallback(
    async (field: string): Promise<UniversalFilterValue[]> => {
      const counted = (values: { label: string; value: string }[]) =>
        values.map((value) => ({ count: 0, ...value }));
      if (field === "status") return counted(statusOptions);
      if (field === "paymentMethodType") return counted(methodOptions);
      if (field === "kind") return counted(kindOptions);
      if (field === "runId") {
        return runId === undefined ? [] : counted([{ label: monthTitle, value: runId }]);
      }
      if (field === "remittanceId") {
        return remittanceId === undefined
          ? []
          : counted([{ label: monthTitle, value: remittanceId }]);
      }
      const items = await monthItems();
      const values = new Map<string, UniversalFilterValue>();
      for (const item of items) {
        const entry =
          field === "memberId" && item.member !== undefined
            ? { label: item.member.fullName, value: item.member.id }
            : field === "total" && item.total !== undefined
              ? { label: formatMoney(item.total, locale), value: String(item.total.amountMinor) }
              : undefined;
        if (entry === undefined) continue;
        const known = values.get(entry.value);
        values.set(entry.value, { ...entry, count: (known?.count ?? 0) + 1 });
      }
      return [...values.values()].sort((left, right) => right.count - left.count);
    },
    [
      kindOptions,
      locale,
      methodOptions,
      monthItems,
      monthTitle,
      remittanceId,
      runId,
      statusOptions,
    ],
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
  const labels: UniversalListLabels<InvoiceRow> = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription: t("admin-billing:list.emptyDescription"),
    emptyTitle: t("admin-billing:list.emptyTitle"),
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
    page: (page: number, totalPages: number) => t("census:list.page", { page, totalPages }),
    previousPage: t("census:list.previousPage"),
    removeFilter: (field: string) => t("census:list.removeFilter", { field }),
    renameView: t("census:list.renameView"),
    retry: t("census:list.retry"),
    rowsPerPage: t("census:list.rowsPerPage"),
    saveError: t("census:list.saveError"),
    saveViewName: t("census:list.saveViewName"),
    search: t("admin-billing:list.search"),
    selectAll: t("census:list.selectAll"),
    selectCheckbox: (row) => t("admin-billing:list.selectInvoice", { number: row.displayNumber }),
    selectRow: (row) => t("admin-billing:list.openInvoice", { number: row.displayNumber }),
    selected: (count: number) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column: string) => t("census:list.sortAscending", { column }),
    sortDescending: (column: string) => t("census:list.sortDescending", { column }),
    view: (name: string) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };

  const empty = t("census:values.empty");
  const columns: UniversalListColumn<InvoiceRow>[] = [
    {
      key: "displayNumber",
      label: t("admin-billing:list.columns.displayNumber"),
      render: (row) => (
        <button
          aria-label={t("admin-billing:list.openInvoice", { number: row.displayNumber })}
          className="billing-number"
          onClick={() => {
            setInvoiceId(row.id);
          }}
          type="button"
        >
          {row.displayNumber}
        </button>
      ),
      sortKey: "number",
    },
    {
      key: "member",
      label: t("admin-billing:list.columns.member"),
      render: (row) => (
        <a
          className="billing-member"
          href={`/abonats/${row.member.id}`}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
            event.preventDefault();
            onNavigate(`/abonats/${row.member.id}`);
          }}
        >
          {row.member.fullName}
        </a>
      ),
      sortKey: "memberLastName",
    },
    {
      key: "concept",
      label: t("admin-billing:list.columns.concept"),
      // The first line's frozen description, as the api composes it (R-12-30): never rebuilt.
      render: (row) => row.concept ?? empty,
    },
    {
      key: "total",
      label: t("admin-billing:list.columns.total"),
      render: (row) =>
        row.total === undefined ? empty : <strong>{formatMoney(row.total, locale)}</strong>,
      sortKey: "total",
    },
    {
      key: "paymentMethodType",
      label: t("admin-billing:list.columns.paymentMethodType"),
      render: (row) => t(`enums:paymentMethodType.${row.paymentMethodType}`),
    },
    {
      key: "status",
      label: t("admin-billing:list.columns.status"),
      render: (row) => {
        const view = invoiceStatusView(row);
        return <Badge tone={view.tone}>{t(view.key)}</Badge>;
      },
    },
    {
      key: "issueDate",
      label: t("admin-billing:list.columns.issueDate"),
      render: (row) =>
        row.issueDate === undefined ? empty : formats.formatPlainDate(row.issueDate),
      sortKey: "issueDate",
    },
    {
      key: "period",
      label: t("admin-billing:list.columns.period"),
      render: (row) => (row.period === undefined ? empty : formats.formatMonthTitle(row.period)),
    },
    {
      key: "kind",
      label: t("admin-billing:list.columns.kind"),
      render: (row) => (row.kind === undefined ? empty : t(`enums:invoiceKind.${row.kind}`)),
    },
    {
      key: "paidAt",
      label: t("admin-billing:list.columns.paidAt"),
      render: (row) =>
        row.paidAt === undefined || row.paidAt === null ? empty : formats.formatDate(row.paidAt),
    },
    {
      key: "remittanceId",
      label: t("admin-billing:list.columns.remittanceId"),
      render: (row) =>
        row.remittanceId === undefined || row.remittanceId === null ? (
          empty
        ) : (
          <a
            href={`/facturacio/remeses?mes=${period}`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(`/facturacio/remeses?mes=${period}`);
            }}
          >
            {t("admin-billing:list.remittanceLink")}
          </a>
        ),
    },
  ];
  const filterColumns: UniversalListFilterColumn[] = [
    { key: "status", label: t("admin-billing:list.filters.status"), type: "enum" },
    { key: "memberId", label: t("admin-billing:list.filters.memberId"), type: "relation" },
    {
      key: "paymentMethodType",
      label: t("admin-billing:list.filters.paymentMethodType"),
      type: "enum",
    },
    { key: "runId", label: t("admin-billing:list.filters.runId"), type: "relation" },
    { key: "remittanceId", label: t("admin-billing:list.filters.remittanceId"), type: "relation" },
    {
      key: "issueDate",
      label: t("admin-billing:list.filters.issueDate"),
      operators: ["between"],
      range: {
        endLabel: t("admin-billing:list.filters.to"),
        startLabel: t("admin-billing:list.filters.from"),
        toValue: (start, end) => `${start},${end}`,
      },
      type: "date",
    },
    { key: "total", label: t("admin-billing:list.filters.total"), type: "number" },
    { key: "kind", label: t("admin-billing:list.filters.kind"), type: "enum" },
  ];
  const fieldLabel = (field: string) =>
    filterColumns.find((column) => column.key === field)?.label ?? field;
  const valueLabel = (field: string, value: string): string => {
    if (field === "status")
      return statusOptions.find((item) => item.value === value)?.label ?? value;
    if (field === "paymentMethodType") {
      return methodOptions.find((item) => item.value === value)?.label ?? value;
    }
    if (field === "kind") return kindOptions.find((item) => item.value === value)?.label ?? value;
    if (field === "memberId") {
      return rows.find((row) => row.member.id === value)?.member.fullName ?? value;
    }
    if (field === "total" && /^-?\d+$/u.test(value)) {
      return formatMoney({ amountMinor: Number(value), currency: branding.currency }, locale);
    }
    if (field === "issueDate") {
      return value
        .split(",")
        .map((date) => formats.formatPlainDate(date))
        .join(" – ");
    }
    if (field === "runId" || field === "remittanceId") return monthTitle;
    return value;
  };
  const applied = (list?.appliedFilters ?? [])
    .filter((filter) => filter.field !== "period")
    .map((filter) => {
      const value = filterValue(filter.value);
      return {
        field: filter.field,
        fieldLabel: fieldLabel(filter.field),
        operator: filter.op,
        value,
        valueLabel: valueLabel(filter.field, value),
      };
    });

  const statusFilter = state.filters.find((filter) => filter.field === "status");
  const activeChip =
    statusFilter === undefined
      ? "all"
      : statusFilter.operator === "eq"
        ? (STATUS_CHIPS.find((chip) => chip.status === statusFilter.value)?.key ?? "")
        : "";
  const counts = month?.counts;
  const chipLabel = (key: (typeof STATUS_CHIPS)[number]["key"]) => {
    switch (key) {
      case "all":
        return t("admin-billing:list.chipAll", { count: counts?.all ?? 0 });
      case "pending":
        return t("admin-billing:list.chipPending", { count: counts?.pending ?? 0 });
      case "remitted":
        return t("admin-billing:list.chipRemitted", { count: counts?.remitted ?? 0 });
      case "paid":
        return t("admin-billing:list.chipPaid");
      case "failed":
        return t("admin-billing:list.chipFailed", { count: counts?.failed ?? 0 });
    }
  };

  const generateBlocked =
    simulation === undefined
      ? t("admin-billing:actions.generateNeedsSimulation")
      : liveRun !== undefined
        ? t("admin-billing:actions.generateRunExists")
        : undefined;
  const stripe = liveRun?.byProvider.STRIPE;
  const canCharge =
    clubProviders?.includes("STRIPE") === true &&
    liveRun?.status === "GENERATED" &&
    stripe !== undefined;
  const modules = branding.modules;
  const skipped = detail?.status === "ROLLED_BACK" ? [] : (detail?.skipped ?? []);

  return (
    <div className="billing-page">
      <header className="billing-header">
        <h1>{monthTitle}</h1>
        <div aria-label={t("admin-billing:header.months")} className="billing-stepper" role="group">
          <button
            aria-label={t("admin-billing:header.previousMonth")}
            // A simulation in flight is this month's: the month waits for its answer.
            disabled={simulating}
            onClick={() => {
              changePeriod(shiftPeriod(period, -1));
            }}
            type="button"
          >
            {t("admin-billing:header.previous")}
          </button>
          <span aria-hidden="true">·</span>
          <button
            aria-label={t("admin-billing:header.nextMonth")}
            disabled={simulating}
            onClick={() => {
              changePeriod(shiftPeriod(period, 1));
            }}
            type="button"
          >
            {t("admin-billing:header.next")}
          </button>
        </div>
        <span className="billing-header__spacer" />
        {memberHistory ? null : (
          <>
            <Button
              className="billing-action"
              loading={simulating}
              loadingLabel={t("admin-billing:actions.simulating")}
              onClick={() => void simulate()}
              variant="secondary"
            >
              {t("admin-billing:actions.simulate")}
            </Button>
            {clubProviders === undefined ? null : (
              <span title={generateBlocked}>
                <Button
                  aria-describedby={
                    generateBlocked === undefined ? undefined : "billing-generate-why"
                  }
                  className="billing-action"
                  disabled={generateBlocked !== undefined || month === undefined}
                  onClick={() => {
                    setModal("generate");
                  }}
                >
                  {generateLabel(t, clubProviders)}
                </Button>
                {generateBlocked === undefined ? null : (
                  <span className="ah-sr-only" id="billing-generate-why">
                    {generateBlocked}
                  </span>
                )}
              </span>
            )}
            {canCharge ? (
              <Button
                className="billing-action"
                onClick={() => {
                  setModal("charge");
                }}
              >
                {t("admin-billing:actions.chargeCards")}
              </Button>
            ) : null}
            {run?.rollbackable === true ? (
              <Button
                className="billing-action"
                onClick={() => {
                  setModal("rollback");
                }}
                variant="ghost"
              >
                <Icon aria-hidden="true" name="undo" />
                {t("admin-billing:actions.rollback")}
              </Button>
            ) : null}
          </>
        )}
        {/* The discreet [＋ Rebut manual] of step 6 (not in the mockup): its name is its label. It
            sits with the month's actions: the receipts toolbar fills the 1280 px row already. */}
        <IconButton
          icon="plus"
          label={t("admin-billing:actions.manualInvoice")}
          onClick={() => {
            setModal("manual");
          }}
          title={t("admin-billing:actions.manualInvoice")}
        />
      </header>

      <div className="billing-feedback">
        {feedback.map((item) => (
          <Toast
            dismissLabel={t("admin-billing:toasts.dismiss")}
            key={item.id}
            onDismiss={() => {
              setFeedback((current) => current.filter((entry) => entry.id !== item.id));
            }}
            tone={item.tone}
          >
            {item.text}
          </Toast>
        ))}
        {charging ? (
          <Toast tone="info">
            <span>
              {pollStopped
                ? t("admin-billing:errors.chargingSlow")
                : t("admin-billing:toasts.charging")}
            </span>
            {pollStopped ? (
              <Button
                onClick={() => {
                  pollStart.current = undefined;
                  setPollStopped(false);
                  setPollTick((value) => value + 1);
                }}
                variant="ghost"
              >
                {t("admin-billing:actions.refresh")}
              </Button>
            ) : null}
          </Toast>
        ) : null}
        {detailError === undefined ? null : (
          <Toast tone="danger">
            <span>{t("admin-billing:errors.loadRun")}</span>
            <Button
              onClick={() => {
                setRunReadError(undefined);
                setPollTick((value) => value + 1);
              }}
              variant="ghost"
            >
              {t("admin-billing:actions.retry")}
            </Button>
          </Toast>
        )}
      </div>

      {memberHistory ? null : month === undefined ? (
        periodError === undefined ? (
          <Skeleton height="14rem" label={t("admin-billing:list.loading")} />
        ) : isApiError(periodError, "MODULE_DISABLED") ? (
          <EmptyState
            description={t("errors:MODULE_DISABLED")}
            title={t("common:unavailable.title")}
          />
        ) : (
          <Card className="billing-error" role="alert">
            <p>{t("admin-billing:errors.loadPeriod")}</p>
            {isApiError(periodError) && periodError.traceId !== undefined ? (
              <p className="billing-error__trace">
                {t("admin-billing:errors.trace", { traceId: periodError.traceId })}
              </p>
            ) : null}
            <Button onClick={refreshAll} variant="secondary">
              {t("admin-billing:actions.retry")}
            </Button>
          </Card>
        )
      ) : simulation === undefined ? (
        <EmptyState
          action={
            <Button loading={simulating} onClick={() => void simulate()} variant="secondary">
              {t("admin-billing:actions.simulate")}
            </Button>
          }
          description={t("admin-billing:empty.noSimulationHelp")}
          icon="doc"
          title={t("admin-billing:empty.noSimulation")}
        />
      ) : (
        <div className="billing-grid">
          <SimulationCard onNavigate={onNavigate} simulation={simulation} skipped={skipped} />
          <div className="billing-kpis">
            <Kpi
              detail={t("admin-billing:kpi.simulatedAt", {
                date: formats.formatDate(simulation.at, "dayMonthNumeric"),
              })}
              label={t("admin-billing:kpi.invoices")}
              value={String(simulation.kpis.count)}
            />
            <Kpi
              detail={
                detail?.collectionDate === null || detail?.collectionDate === undefined
                  ? undefined
                  : t("admin-billing:kpi.collectionDate", {
                      date: formats.formatPlainDate(detail.collectionDate, "dayMonthNumeric"),
                    })
              }
              label={t("admin-billing:kpi.amount")}
              link={
                // The remittances page (no mockup, no sidebar entry): reached from the amount, and
                // only by a club that remits (a cash-only club has no remittance to list).
                clubProviders?.includes("SEPA_XML") === true ? (
                  <a
                    className="billing-kpi__link"
                    href={`/facturacio/remeses?mes=${period}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(`/facturacio/remeses?mes=${period}`);
                    }}
                  >
                    {t("admin-billing:header.remittances")}
                  </a>
                ) : undefined
              }
              value={formatMoney(simulation.kpis.total, locale, true)}
            />
            <Kpi
              detail={t("admin-billing:kpi.cashPending")}
              label={t("admin-billing:kpi.cash")}
              value={String(simulation.kpis.cashPending)}
            />
            {modules.includes("INACTIVITY") ? (
              <Kpi
                detail={t("admin-billing:kpi.inactivityFees", {
                  first: formatMoney(simulation.kpis.inactivityFees.firstMonth, locale, true),
                  following: formatMoney(simulation.kpis.inactivityFees.following, locale, true),
                })}
                label={t("admin-billing:kpi.inactivity")}
                value={String(simulation.kpis.inactivityFees.count)}
              />
            ) : null}
            {clubProviders?.includes("STRIPE") === true &&
            simulation.kpis.byProvider.STRIPE !== undefined ? (
              <Kpi
                detail={formatMoney(simulation.kpis.byProvider.STRIPE.total, locale)}
                label={t("admin-billing:kpi.card")}
                value={String(simulation.kpis.byProvider.STRIPE.count)}
              />
            ) : null}
          </div>
        </div>
      )}

      <div className="billing-toolbar">
        {memberHistory ? null : (
          <div aria-label={t("admin-billing:list.chips")} className="billing-chips" role="group">
            {STATUS_CHIPS.map((chip) => (
              <button
                aria-pressed={activeChip === chip.key}
                className="billing-chip"
                key={chip.key}
                onClick={() => {
                  const others = state.filters.filter((filter) => filter.field !== "status");
                  changeState({
                    ...state,
                    filters:
                      chip.status === ""
                        ? others
                        : [...others, { field: "status", operator: "eq", value: chip.status }],
                    page: 0,
                  });
                }}
                type="button"
              >
                {chipLabel(chip.key)}
              </button>
            ))}
          </div>
        )}
        <span className="billing-toolbar__spacer" />
        {/* A selection may span pages: how many receipts the action takes is always in sight. */}
        {selection.size === 0 ? null : (
          <span className="billing-toolbar__count" role="status">
            {t("admin-billing:list.selectedCount", { count: selection.size })}
          </span>
        )}
        <button
          className="billing-chip"
          disabled={selection.size === 0}
          onClick={() => {
            setMarkPaidIds([...selection]);
            setModal("markPaid");
          }}
          type="button"
        >
          {t("admin-billing:actions.markPaidSelection")}
        </button>
        {memberHistory ? null : (
          <Button
            onClick={() => {
              setModal("export");
            }}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="export" />
            {t("admin-billing:actions.accountingExport")}
          </Button>
        )}
      </div>

      <UniversalList<InvoiceRow>
        appliedFilters={applied}
        caption={t("admin-billing:list.caption", { month: monthTitle })}
        columns={columns}
        {...(listError === undefined
          ? {}
          : {
              error: isApiError(listError, "INVALID_FILTER")
                ? t("errors:INVALID_FILTER")
                : t("admin-billing:list.loadError"),
            })}
        exportBusy={listExport.busy}
        {...(listExport.error?.source === "list" ? { exportError: listExport.error.message } : {})}
        filterColumns={filterColumns}
        isRowSelectable={isPayable}
        labels={labels}
        listKey="invoices"
        loadFilterValues={loadFilterValues}
        loading={list === undefined && listError === undefined}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={(format, current) => {
          void listExport.run("/invoices/export", {
            columns: current.columns.join(","),
            filter: invoiceFilters(period, current, memberHistory),
            format,
            ...(current.q === "" ? {} : { q: current.q }),
            sort: current.sort,
          });
        }}
        onRenameView={savedViews.rename}
        onRetry={refreshAll}
        onSelectedChange={setSelected}
        onStateChange={changeState}
        rowAttributes={(row) => ({ "data-invoice-number": row.displayNumber })}
        rowKey={(row) => row.id}
        rows={rows}
        savedViews={savedViews.views}
        selectable
        selected={selection}
        state={state}
        totalPages={list?.totalPages ?? 0}
      />

      {modal === "generate" && simulation !== undefined ? (
        <GenerateModal
          client={client}
          keys={keys}
          monthTitle={monthTitle}
          onClose={() => {
            setModal(undefined);
          }}
          onGenerated={(result) => {
            setModal(undefined);
            say(t("admin-billing:toasts.generated", { count: result.run.invoiceIds.length }));
            setSelected(new Set());
            refreshAll();
          }}
          onConflict={refreshAll}
          onNavigate={onNavigate}
          onSimulateAgain={async () => {
            const failed = await runSimulation();
            if (failed === undefined) {
              setModal(undefined);
              say(t("admin-billing:toasts.simulated"));
            }
            return failed;
          }}
          period={period}
          simulation={simulation}
        />
      ) : null}
      {modal === "rollback" && run !== undefined ? (
        <RollbackModal
          client={client}
          invoiceCount={detail?.invoiceIds.length}
          keys={keys}
          monthTitle={monthTitle}
          onBlocked={refreshAll}
          onClose={() => {
            setModal(undefined);
          }}
          onRolledBack={(result) => {
            setModal(undefined);
            say(t("admin-billing:toasts.rolledBack", { count: result.cancelledInvoices }));
            setSelected(new Set());
            refreshAll();
          }}
          runId={run.id}
        />
      ) : null}
      {modal === "charge" && liveRun !== undefined && stripe !== undefined ? (
        <ChargeCardsModal
          client={client}
          keys={keys}
          onCharged={(result) => {
            setModal(undefined);
            say(t("admin-billing:toasts.chargesSubmitted", { count: result.submitted }));
            if (result.skipped.length > 0) {
              const reasons = [...new Set(result.skipped.map((item) => item.reason))]
                .map((reason) => t(`errors:${reason}`, { defaultValue: reason }))
                .join(", ");
              say(
                t("admin-billing:toasts.chargesSkipped", {
                  count: result.skipped.length,
                  reasons,
                }),
                "warning",
              );
            }
            pollStart.current = undefined;
            setPollStopped(false);
            refreshAll();
          }}
          onClose={() => {
            setModal(undefined);
          }}
          runId={liveRun.id}
          stripe={stripe}
        />
      ) : null}
      {modal === "markPaid" ? (
        <MarkPaidModal
          client={client}
          invoiceIds={markPaidIds}
          keys={keys}
          onClose={() => {
            setModal(undefined);
          }}
          onConflict={refreshAll}
          onPaid={(result) => {
            setModal(undefined);
            say(t("admin-billing:toasts.markedPaid", { count: result.paid }));
            setSelected(new Set());
            refreshAll();
          }}
        />
      ) : null}
      {modal === "export" ? (
        <AccountingExportModal
          client={client}
          listExport={listExport}
          onClose={() => {
            setModal(undefined);
          }}
          period={period}
        />
      ) : null}
      {modal === "manual" ? (
        <ManualInvoiceModal
          client={client}
          keys={keys}
          onClose={() => {
            setModal(undefined);
          }}
          onCreated={(invoice) => {
            setModal(undefined);
            say(t("admin-billing:manual.created", { number: invoice.displayNumber }));
            refreshAll();
          }}
        />
      ) : null}
      {invoiceId === undefined ? null : (
        <InvoiceDrawer
          client={client}
          invoiceId={invoiceId}
          // Another receipt is another drawer: nothing of the previous one (state, late answers).
          key={invoiceId}
          keys={keys}
          onChanged={refreshAll}
          onClose={() => {
            setInvoiceId(undefined);
          }}
          onNavigate={onNavigate}
          // `Invoice` has no `rolledBack` (E89: a receipt is rolled back by its run, whatever its
          // reason): the list row's flag, when the receipt is on the page.
          rolledBack={rows.find((row) => row.id === invoiceId)?.rolledBack === true}
        />
      )}
    </div>
  );
}

function Kpi({
  detail,
  label,
  link,
  value,
}: {
  detail?: string | undefined;
  label: string;
  link?: ReactNode;
  value: string;
}) {
  return (
    <Card className="billing-kpi">
      <strong className="billing-kpi__value">{value}</strong>
      <span className="billing-kpi__label">{label}</span>
      {detail === undefined ? null : <span className="billing-kpi__detail">{detail}</span>}
      {link}
    </Card>
  );
}

function MemberRows({
  items,
  onNavigate,
  text,
}: {
  items: readonly { memberId: string; memberName: string }[];
  onNavigate: (path: string) => void;
  text: (index: number) => ReactNode;
}) {
  const { t } = useTranslation("admin-billing");
  return (
    <table className="billing-members">
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.memberId}-${String(index)}`}>
            <th scope="row">{item.memberName}</th>
            <td>{text(index)}</td>
            <td className="billing-members__action">
              <a
                aria-label={t("admin-billing:simulation.openRecordOf", { name: item.memberName })}
                className="ah-button ah-button--ghost billing-open"
                href={`/abonats/${item.memberId}`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
                  event.preventDefault();
                  onNavigate(`/abonats/${item.memberId}`);
                }}
              >
                {t("admin-billing:simulation.openRecord")}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Pas 1 — Simulació: incidències primer» (R-12-07): the incidents first, with the red count, then
 * the cash members with their planned leave and, after a run, the members it skipped that the
 * incidents do not list already. Incidents never block the generation.
 */
function SimulationCard({
  onNavigate,
  simulation,
  skipped,
}: {
  onNavigate: (path: string) => void;
  simulation: PeriodSimulation;
  skipped: readonly BillingIncident[];
}) {
  const { t } = useTranslation(["admin-billing", "enums"]);
  const formats = useClubFormats();
  const incidentLabel = (incident: BillingIncident) => t(`enums:billingIncident.${incident.code}`);
  // The incidents above are skipped already («s'ometen de la generació»): only the others are new.
  const others = skipped.filter(
    (item) =>
      !simulation.incidents.some(
        (incident) => incident.memberId === item.memberId && incident.code === item.code,
      ),
  );
  return (
    <Card className="billing-simulation">
      <div className="billing-simulation__head">
        <h2>{t("admin-billing:simulation.incidentsTitle")}</h2>
        {/* The red count of the mockup, read out as «2 incidències» (an aria-label on a span is not). */}
        <Badge tone="danger">
          <span aria-hidden="true">{String(simulation.incidents.length)}</span>
          <span className="ah-sr-only">
            {t("admin-billing:simulation.incidentsCount", { count: simulation.incidents.length })}
          </span>
        </Badge>
      </div>
      {simulation.incidents.length === 0 ? (
        <p className="billing-simulation__none">{t("admin-billing:simulation.noIncidents")}</p>
      ) : (
        <MemberRows
          items={simulation.incidents}
          onNavigate={onNavigate}
          text={(index) => {
            const incident = simulation.incidents[index];
            return incident === undefined ? null : incidentLabel(incident);
          }}
        />
      )}
      <p className="billing-simulation__footnote">
        {t("admin-billing:simulation.incidentsFootnote")}
      </p>
      {simulation.cashMembers.length === 0 ? null : (
        <>
          <h3 className="billing-simulation__subtitle">
            {t("admin-billing:simulation.cashTitle")}
          </h3>
          <MemberRows
            items={simulation.cashMembers}
            onNavigate={onNavigate}
            text={(index) => {
              const date = simulation.cashMembers[index]?.plannedLeaveDate;
              return date === null || date === undefined ? null : (
                <>
                  {t("admin-billing:simulation.plannedLeave")}{" "}
                  <strong>{formats.formatPlainDate(date)}</strong>
                </>
              );
            }}
          />
        </>
      )}
      {others.length === 0 ? null : (
        <>
          <h3 className="billing-simulation__subtitle">
            {t("admin-billing:simulation.skippedTitle")}
          </h3>
          <MemberRows
            items={others}
            onNavigate={onNavigate}
            text={(index) => {
              const incident = others[index];
              return incident === undefined ? null : incidentLabel(incident);
            }}
          />
        </>
      )}
    </Card>
  );
}
