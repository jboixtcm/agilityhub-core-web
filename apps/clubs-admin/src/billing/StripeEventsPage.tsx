import { type ApiClient, type components, isApiError, listFields } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  EmptyState,
  type UniversalFilterOperator,
  UniversalList,
  type UniversalListColumn,
  type UniversalListLabels,
  readUniversalListState,
  universalListSearchParams,
} from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./billing.css";

type StripeEvent = components["schemas"]["StripeEventListItem"];

const DEFAULT_COLUMNS = ["id", "type", "receivedAt", "attempts", "state"];
/** The «Estat» column reads when it runs again or when it stopped. */
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  state: ["nextAttemptAt", "processedAt"],
};
/** The list's contract: no filter (`x-filterable` is empty) and no `q`. */
const NO_FILTER_VALUES = () => Promise.resolve([]);

/**
 * «Esdeveniments Stripe fallits» (`/facturacio/esdeveniments-stripe`, S12 §2, PAY-02; no mockup:
 * design system): the club's Stripe events whose processing failed, `GET /billing/stripe-events`
 * as a universal list, newest first. Read only: an event still retried runs again by itself; a
 * stopped one is processed again by resending it from the Stripe dashboard (R-12-21).
 */
export function StripeEventsPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-billing", "errors", "census", "common"]);
  const formats = useClubFormats();
  const [state, setState] = useState(() =>
    readUniversalListState(window.location.search, {
      columns: DEFAULT_COLUMNS,
      filters: [],
      size: 50,
      sort: [],
    }),
  );
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{
    data?: { items: StripeEvent[]; totalPages: number };
    error?: unknown;
    key: string;
  }>();
  const [copied, setCopied] = useState<string>();

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${universalListSearchParams(state).toString()}`,
    );
  }, [state]);

  const key = JSON.stringify({ reload, state });
  useEffect(() => {
    let current = true;
    void client
      .GET("/billing/stripe-events", {
        params: {
          query: {
            fields: listFields(
              state.columns.flatMap((column) => COLUMN_FIELDS[column] ?? [column]),
            ),
            page: state.page,
            size: state.size,
            sort: state.sort,
          },
        },
      })
      .then(
        (response) => {
          if (!current) return;
          setResult(
            response.data === undefined
              ? { error: new TypeError("Stripe event list without data"), key }
              : { data: response.data, key },
          );
        },
        (error: unknown) => {
          if (current) setResult({ error, key });
        },
      );
    return () => {
      current = false;
    };
  }, [client, key, state]);
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;

  const copy = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
    } catch {
      setCopied(undefined);
    }
  }, []);

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
  const labels: UniversalListLabels<StripeEvent> = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription: t("admin-billing:stripeEvents.emptyDescription"),
    emptyTitle: t("admin-billing:stripeEvents.emptyTitle"),
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
    // No search box (`searchable={false}`: the contract has no `q`); the label is never shown.
    search: t("admin-billing:stripeEvents.caption"),
    selectAll: t("census:list.selectAll"),
    selectRow: (item) => item.id,
    selected: (count: number) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column: string) => t("census:list.sortAscending", { column }),
    sortDescending: (column: string) => t("census:list.sortDescending", { column }),
    view: (name: string) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };
  const empty = t("census:values.empty");
  const columns: UniversalListColumn<StripeEvent>[] = [
    {
      key: "id",
      label: t("admin-billing:stripeEvents.columns.id"),
      render: (item) => (
        <span className="billing-stripe-event">
          <code>{item.id}</code>
          <Button
            aria-label={
              copied === item.id
                ? t("admin-billing:stripeEvents.copiedId", { id: item.id })
                : t("admin-billing:stripeEvents.copyId", { id: item.id })
            }
            onClick={() => void copy(item.id)}
            variant="ghost"
          >
            {copied === item.id
              ? t("admin-billing:stripeEvents.copied")
              : t("admin-billing:stripeEvents.copy")}
          </Button>
        </span>
      ),
    },
    {
      key: "type",
      label: t("admin-billing:stripeEvents.columns.type"),
      render: (item) => (item.type === undefined ? empty : <code>{item.type}</code>),
    },
    {
      key: "receivedAt",
      label: t("admin-billing:stripeEvents.columns.receivedAt"),
      render: (item) =>
        item.receivedAt === undefined ? empty : formats.formatDateTime(item.receivedAt),
      sortKey: "receivedAt",
    },
    {
      key: "attempts",
      label: t("admin-billing:stripeEvents.columns.attempts"),
      render: (item) => (item.attempts === undefined ? empty : String(item.attempts)),
    },
    {
      key: "state",
      label: t("admin-billing:stripeEvents.columns.state"),
      render: (item) =>
        item.processedAt !== undefined ? (
          <Badge tone="danger">
            {t("admin-billing:stripeEvents.stopped", {
              date: formats.formatDateTime(item.processedAt),
            })}
          </Badge>
        ) : item.nextAttemptAt !== undefined ? (
          <Badge tone="warning">
            {t("admin-billing:stripeEvents.retrying", {
              date: formats.formatDateTime(item.nextAttemptAt),
            })}
          </Badge>
        ) : (
          empty
        ),
    },
  ];

  return (
    <div className="billing-page">
      <header className="billing-header">
        <a
          className="billing-header__back"
          href="/facturacio"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/facturacio");
          }}
        >
          {t("admin-billing:remittances.back")}
        </a>
        <h1>{t("admin-billing:stripeEvents.title")}</h1>
      </header>
      <p className="billing-stripe-events__help">{t("admin-billing:stripeEvents.help")}</p>
      {isApiError(error, "MODULE_DISABLED") ? (
        <EmptyState
          description={t("errors:MODULE_DISABLED")}
          title={t("common:unavailable.title")}
        />
      ) : (
        <UniversalList<StripeEvent>
          appliedFilters={[]}
          caption={t("admin-billing:stripeEvents.caption")}
          columns={columns}
          {...(error === undefined ? {} : { error: t("admin-billing:stripeEvents.loadError") })}
          exportable={false}
          filterColumns={[]}
          labels={labels}
          listKey="stripe-events"
          loadFilterValues={NO_FILTER_VALUES}
          loading={data === undefined && error === undefined}
          onExport={() => undefined}
          onRetry={() => {
            setReload((value) => value + 1);
          }}
          onStateChange={setState}
          rowAttributes={(item) => ({ "data-stripe-event": item.id })}
          rowKey={(item) => item.id}
          rows={data?.items ?? []}
          searchable={false}
          state={state}
          totalPages={data?.totalPages ?? 0}
        />
      )}
    </div>
  );
}
