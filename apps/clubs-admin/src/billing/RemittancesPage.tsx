import {
  type ApiClient,
  type components,
  isApiError,
  listFields,
  openDownloadUrl,
  type SubmissionKeys,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { fmtMaskedIban, useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Drawer,
  FormField,
  Icon,
  Input,
  Modal,
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
  readUniversalListState,
  universalListSearchParams,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSavedViews } from "../activities/shared";

import {
  clubToday,
  errorFields,
  formatMoney,
  type Remittance,
  type RemittanceListItem,
  useBillingErrorMessage,
  useBillingLocale,
} from "./shared";
import "./billing.css";

type ListFilter = components["schemas"]["Filter"];
type RemittanceStatus = components["schemas"]["RemittanceStatus"];

const DEFAULT_COLUMNS = [
  "period",
  "creationAt",
  "count",
  "total",
  "requestedCollectionDate",
  "status",
  "actions",
];
/**
 * Every row reads its month (its button), its status and file (its actions) and its creation (the
 * first day [Marca com a enviada al banc] accepts), whatever columns are shown.
 */
const ROW_FIELDS = ["period", "status", "fileAvailable", "creationAt"];
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = { actions: [] };
const STATUSES: readonly RemittanceStatus[] = ["GENERATED", "SUBMITTED", "ROLLED_BACK"];

function statusTone(status: RemittanceStatus | undefined): Tone {
  return status === "SUBMITTED" ? "success" : status === "ROLLED_BACK" ? "neutral" : "warning";
}

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : Array.isArray(value)
      ? value.map(String).join(",")
      : "";
}

/**
 * The remittances page (`/facturacio/remeses`, S12 §2 «D6 (remeses)», no mockup: design system,
 * §13-12): the universal list of `GET /remittances`, [Descarrega l'XML] through the api's signed
 * URL (never rendered here) and [Marca com a enviada al banc] behind a confirmation (R-15). A
 * rolled-back remittance is read-only.
 */
export function RemittancesPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors", "census"]);
  const formats = useClubFormats();
  const locale = useBillingLocale();
  const errorMessage = useBillingErrorMessage();
  const keys = useSubmissionKeys();
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
    data?: { appliedFilters: ListFilter[]; items: RemittanceListItem[]; totalPages: number };
    error?: unknown;
    key: string;
  }>();
  const [openId, setOpenId] = useState<string>();
  const [submitting, setSubmitting] = useState<RemittanceListItem>();
  const [downloading, setDownloading] = useState<string>();
  const [feedback, setFeedback] = useState<{ id: number; text: string; tone: Tone }[]>([]);
  const nextFeedback = useRef(1);
  const say = useCallback((text: string, tone: Tone = "success") => {
    const id = nextFeedback.current;
    nextFeedback.current += 1;
    setFeedback((current) => [...current, { id, text, tone }]);
  }, []);

  // The month D6 came from (`?mes=`) stays in the address and goes back with «‹ Facturació».
  const [month] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("mes");
    return value !== null && /^\d{4}-(0[1-9]|1[0-2])$/u.test(value) ? value : undefined;
  });
  const backPath = month === undefined ? "/facturacio" : `/facturacio?mes=${month}`;
  useEffect(() => {
    const parameters = universalListSearchParams(state);
    if (month !== undefined) parameters.set("mes", month);
    window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
  }, [month, state]);

  const key = JSON.stringify({ reload, state });
  useEffect(() => {
    let current = true;
    void client
      .GET("/remittances", {
        params: {
          query: {
            fields: listFields([
              ...ROW_FIELDS,
              ...state.columns.flatMap((column) => COLUMN_FIELDS[column] ?? [column]),
            ]),
            filter: state.filters.map(
              (filter) => `${filter.field}:${filter.operator}:${filter.value}`,
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
              ? { error: new TypeError("Remittance list without data"), key }
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

  const applyView = useCallback((view: UniversalListSavedView) => {
    setState((current) => ({
      ...current,
      columns: view.columns,
      filters: view.filters,
      page: 0,
      sort: view.sort,
    }));
  }, []);
  const savedViews = useSavedViews(client, "remittances", applyView);

  // The months that have remittances (no filter-values route for `GET /remittances`).
  const periods = useRef<Promise<string[]>>(undefined);
  const loadFilterValues = useCallback(
    async (field: string): Promise<UniversalFilterValue[]> => {
      if (field === "status") {
        return STATUSES.map((value) => ({
          count: 0,
          label: t(`enums:remittanceStatus.${value}`),
          value,
        }));
      }
      if (field !== "period") return [];
      periods.current ??= client
        .GET("/remittances", {
          params: { query: { fields: listFields(["period"]), page: 0, size: 1000, sort: [] } },
        })
        .then((response) =>
          (response.data?.items ?? []).flatMap((item) =>
            item.period === undefined ? [] : [item.period],
          ),
        );
      const counted = new Map<string, number>();
      for (const value of await periods.current) {
        counted.set(value, (counted.get(value) ?? 0) + 1);
      }
      return [...counted.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([value, count]) => ({ count, label: formats.formatMonthTitle(value), value }));
    },
    [client, formats, t],
  );

  const download = async (item: RemittanceListItem) => {
    setDownloading(item.id);
    try {
      const response = await client.GET("/remittances/{id}/file", {
        params: { path: { id: item.id } },
      });
      // The api's short-lived signed URL; its download answers `Content-Disposition: attachment`.
      if (response.data !== undefined) openDownloadUrl(response.data.downloadUrl);
    } catch (failure) {
      say(errorMessage(failure), "danger");
    } finally {
      setDownloading(undefined);
    }
  };

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
  const monthOf = (item: RemittanceListItem) =>
    item.period === undefined ? t("census:values.empty") : formats.formatMonthTitle(item.period);
  const labels: UniversalListLabels<RemittanceListItem> = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription: t("admin-billing:remittances.emptyDescription"),
    emptyTitle: t("admin-billing:remittances.emptyTitle"),
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
    search: t("admin-billing:remittances.caption"),
    selectAll: t("census:list.selectAll"),
    selectRow: (item) => t("admin-billing:remittances.open", { month: monthOf(item) }),
    selected: (count: number) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column: string) => t("census:list.sortAscending", { column }),
    sortDescending: (column: string) => t("census:list.sortDescending", { column }),
    view: (name: string) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };
  const empty = t("census:values.empty");
  const columns: UniversalListColumn<RemittanceListItem>[] = [
    {
      key: "period",
      label: t("admin-billing:remittances.columns.period"),
      render: (item) => (
        <button
          aria-label={t("admin-billing:remittances.open", { month: monthOf(item) })}
          className="billing-number"
          onClick={() => {
            setOpenId(item.id);
          }}
          type="button"
        >
          {monthOf(item)}
        </button>
      ),
      sortKey: "period",
    },
    {
      key: "creationAt",
      label: t("admin-billing:remittances.columns.creationAt"),
      render: (item) =>
        item.creationAt === undefined ? empty : formats.formatDateTime(item.creationAt),
      sortKey: "creationAt",
    },
    {
      key: "count",
      label: t("admin-billing:remittances.columns.count"),
      render: (item) => (item.count === undefined ? empty : String(item.count)),
    },
    {
      key: "total",
      label: t("admin-billing:remittances.columns.total"),
      render: (item) =>
        item.total === undefined ? empty : <strong>{formatMoney(item.total, locale)}</strong>,
    },
    {
      key: "requestedCollectionDate",
      label: t("admin-billing:remittances.columns.requestedCollectionDate"),
      render: (item) =>
        item.requestedCollectionDate === undefined
          ? empty
          : formats.formatPlainDate(item.requestedCollectionDate),
    },
    {
      key: "status",
      label: t("admin-billing:remittances.columns.status"),
      render: (item) =>
        item.status === undefined ? (
          empty
        ) : (
          <Badge tone={statusTone(item.status)}>{t(`enums:remittanceStatus.${item.status}`)}</Badge>
        ),
    },
    {
      key: "submittedAt",
      label: t("admin-billing:remittances.columns.submittedAt"),
      render: (item) =>
        item.submittedAt === undefined || item.submittedAt === null
          ? empty
          : formats.formatDate(item.submittedAt),
    },
    {
      key: "actions",
      label: t("admin-billing:remittances.columns.actions"),
      render: (item) => (
        <span className="billing-remittance-actions">
          {item.fileAvailable === true ? (
            <Button
              loading={downloading === item.id}
              loadingLabel={t("admin-billing:remittances.downloading")}
              onClick={() => void download(item)}
              variant="ghost"
            >
              <Icon aria-hidden="true" name="export" />
              {t("admin-billing:remittances.download")}
            </Button>
          ) : null}
          {item.status === "GENERATED" ? (
            <Button
              onClick={() => {
                setSubmitting(item);
              }}
              variant="secondary"
            >
              {t("admin-billing:remittances.markSubmitted")}
            </Button>
          ) : null}
        </span>
      ),
    },
  ];
  const filterColumns: UniversalListFilterColumn[] = [
    { key: "period", label: t("admin-billing:remittances.filters.period"), type: "relation" },
    { key: "status", label: t("admin-billing:remittances.filters.status"), type: "enum" },
  ];
  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = filterValue(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel:
        filter.field === "status" && STATUSES.includes(value as RemittanceStatus)
          ? t(`enums:remittanceStatus.${value}`)
          : filter.field === "period" && /^\d{4}-\d{2}$/u.test(value)
            ? formats.formatMonthTitle(value)
            : value,
    };
  });

  return (
    <div className="billing-page">
      <header className="billing-header">
        <a
          className="billing-header__back"
          href={backPath}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(backPath);
          }}
        >
          {t("admin-billing:remittances.back")}
        </a>
        <h1>{t("admin-billing:remittances.title")}</h1>
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
      </div>
      <UniversalList<RemittanceListItem>
        appliedFilters={applied}
        caption={t("admin-billing:remittances.caption")}
        columns={columns}
        {...(error === undefined
          ? {}
          : {
              error: isApiError(error, "INVALID_FILTER")
                ? t("errors:INVALID_FILTER")
                : t("admin-billing:remittances.loadError"),
            })}
        exportable={false}
        filterColumns={filterColumns}
        labels={labels}
        listKey="remittances"
        loadFilterValues={loadFilterValues}
        loading={data === undefined && error === undefined}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={() => undefined}
        onRenameView={savedViews.rename}
        onRetry={() => {
          setReload((value) => value + 1);
        }}
        onStateChange={setState}
        rowAttributes={(item) => ({ "data-remittance-status": item.status ?? "" })}
        rowKey={(item) => item.id}
        rows={data?.items ?? []}
        savedViews={savedViews.views}
        searchable={false}
        state={state}
        totalPages={data?.totalPages ?? 0}
      />
      {submitting === undefined ? null : (
        <SubmissionModal
          client={client}
          createdAt={submitting.creationAt}
          keys={keys}
          month={monthOf(submitting)}
          onClose={() => {
            setSubmitting(undefined);
          }}
          onConflict={() => {
            // Another admin sent it already (409 INVALID_STATE): the list reads what it is now.
            setReload((value) => value + 1);
          }}
          onSubmitted={() => {
            setSubmitting(undefined);
            say(t("admin-billing:remittances.submitted"));
            setReload((value) => value + 1);
          }}
          remittanceId={submitting.id}
        />
      )}
      {openId === undefined ? null : (
        <RemittanceDrawer
          client={client}
          key={openId}
          onClose={() => {
            setOpenId(undefined);
          }}
          remittanceId={openId}
        />
      )}
    </div>
  );
}

/**
 * [Marca com a enviada al banc] (R-12-15): the club-local day it went to the bank, from the
 * remittance's day to today (the api answers `400 VALIDATION_ERROR {submittedAt}` otherwise); then
 * no rollback.
 */
function SubmissionModal({
  client,
  createdAt,
  keys,
  month,
  onClose,
  onConflict,
  onSubmitted,
  remittanceId,
}: {
  client: ApiClient;
  createdAt: string | undefined;
  keys: SubmissionKeys;
  month: string;
  onClose: () => void;
  onConflict: () => void;
  onSubmitted: () => void;
  remittanceId: string;
}) {
  const { t } = useTranslation(["admin-billing", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const errorMessage = useBillingErrorMessage();
  const today = clubToday(branding.timeZone);
  const earliest =
    createdAt === undefined ? undefined : clubToday(branding.timeZone, new Date(createdAt));
  const [submittedAt, setSubmittedAt] = useState(today);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const outOfRange =
    submittedAt !== "" &&
    (submittedAt > today || (earliest !== undefined && submittedAt < earliest));
  const dateError = outOfRange || errorFields(failure).includes("submittedAt");

  const submit = async () => {
    setPending(true);
    setFailure(undefined);
    const body = { submittedAt };
    try {
      await keys.send(JSON.stringify(["submission", remittanceId, body]), (key) =>
        client.POST("/remittances/{id}/submission", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: remittanceId } },
        }),
      );
      onSubmitted();
    } catch (error) {
      setFailure(error);
      // Another admin sent or rolled it back meanwhile: the list reads what it is now.
      if (isApiError(error, "INVALID_STATE") || isApiError(error, "STALE_VERSION")) onConflict();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-billing:actions.close")}
      dismissible={!pending}
      onClose={onClose}
      open
      title={t("admin-billing:confirm.submissionTitle", { month })}
    >
      <p className="billing-modal__body">{t("admin-billing:confirm.submissionBody")}</p>
      <FormField
        {...(dateError
          ? {
              error:
                earliest === undefined
                  ? t("admin-billing:errors.dateAfterToday")
                  : t("admin-billing:errors.submittedAtRange", {
                      earliest: formats.formatPlainDate(earliest),
                    }),
            }
          : {})}
        id="billing-submitted-at"
        label={t("admin-billing:confirm.submittedAt")}
      >
        <Input
          id="billing-submitted-at"
          max={today}
          {...(earliest === undefined ? {} : { min: earliest })}
          onChange={(event) => {
            setSubmittedAt(event.currentTarget.value);
            setFailure(undefined);
          }}
          required
          type="date"
          value={submittedAt}
        />
      </FormField>
      {failure === undefined || dateError ? null : (
        <div className="billing-modal__error" role="alert">
          {errorMessage(failure)}
        </div>
      )}
      <div className="billing-modal__actions">
        <Button
          disabled={submittedAt === "" || outOfRange}
          loading={pending}
          loadingLabel={t("admin-billing:confirm.submitting")}
          onClick={() => void submit()}
        >
          {t("admin-billing:confirm.submit")}
        </Button>
        <Button disabled={pending} onClick={onClose} variant="ghost">
          {t("admin-billing:actions.cancel")}
        </Button>
      </div>
    </Modal>
  );
}

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="billing-drawer__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** `GET /remittances/{id}`: the message, its sequences, the XSD check and the creditor, masked. */
function RemittanceDrawer({
  client,
  onClose,
  remittanceId,
}: {
  client: ApiClient;
  onClose: () => void;
  remittanceId: string;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "census"]);
  const formats = useClubFormats();
  const locale = useBillingLocale();
  const [remittance, setRemittance] = useState<Remittance>();
  const [failed, setFailed] = useState(false);

  // Keyed by the remittance: another one is a fresh drawer, so nothing is reset here.
  useEffect(() => {
    let current = true;
    void client.GET("/remittances/{id}", { params: { path: { id: remittanceId } } }).then(
      (response) => {
        if (current && response.data !== undefined) setRemittance(response.data);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, remittanceId]);

  return (
    <Drawer
      closeLabel={t("admin-billing:remittances.close")}
      onClose={onClose}
      open
      title={
        remittance === undefined
          ? t("admin-billing:remittances.loading")
          : t("admin-billing:remittances.drawerTitle", {
              month: formats.formatMonthTitle(remittance.period),
            })
      }
    >
      {remittance === undefined ? (
        failed ? (
          <p role="alert">{t("admin-billing:remittances.loadOneError")}</p>
        ) : (
          <Skeleton label={t("admin-billing:remittances.loading")} />
        )
      ) : (
        <dl className="billing-drawer__facts">
          <Fact label={t("admin-billing:remittances.columns.status")}>
            <Badge tone={statusTone(remittance.status)}>
              {t(`enums:remittanceStatus.${remittance.status}`)}
            </Badge>
          </Fact>
          <Fact label={t("admin-billing:remittances.messageId")}>{remittance.messageId}</Fact>
          <Fact label={t("admin-billing:remittances.columns.creationAt")}>
            {formats.formatDateTime(remittance.creationAt)}
          </Fact>
          <Fact label={t("admin-billing:remittances.columns.requestedCollectionDate")}>
            {formats.formatPlainDate(remittance.requestedCollectionDate)}
          </Fact>
          <Fact label={t("admin-billing:remittances.columns.count")}>
            {String(remittance.count)}
          </Fact>
          <Fact label={t("admin-billing:remittances.columns.total")}>
            {formatMoney(remittance.total, locale)}
          </Fact>
          <Fact label={t("admin-billing:remittances.sequence")}>
            {t("admin-billing:remittances.sequenceValue", {
              first: remittance.sequenceBreakdown.FRST,
              recurrent: remittance.sequenceBreakdown.RCUR,
            })}
          </Fact>
          <Fact label={t("admin-billing:remittances.xsd")}>
            {remittance.xsdValidatedAt === null || remittance.xsdValidatedAt === undefined
              ? t("admin-billing:remittances.xsdNotValidated")
              : formats.formatDateTime(remittance.xsdValidatedAt)}
          </Fact>
          {remittance.submittedAt === null || remittance.submittedAt === undefined ? null : (
            <Fact label={t("admin-billing:remittances.columns.submittedAt")}>
              {formats.formatDate(remittance.submittedAt)}
            </Fact>
          )}
          <Fact label={t("admin-billing:remittances.creditor")}>{remittance.creditor.name}</Fact>
          <Fact label={t("admin-billing:remittances.creditorId")}>{remittance.creditor.id}</Fact>
          <Fact label={t("admin-billing:remittances.creditorIban")}>
            {fmtMaskedIban(remittance.creditor.maskedIban) ?? t("census:values.empty")}
          </Fact>
          {remittance.creditor.bic === null || remittance.creditor.bic === undefined ? null : (
            <Fact label={t("admin-billing:remittances.creditorBic")}>
              {remittance.creditor.bic}
            </Fact>
          )}
        </dl>
      )}
    </Drawer>
  );
}
