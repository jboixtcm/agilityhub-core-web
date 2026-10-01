import {
  type AccountingExportFormat,
  type ApiClient,
  type components,
  isApiError,
  requestAccountingExport,
  type SubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  FormField,
  Input,
  Modal,
  RadioGroup,
  Select,
  Skeleton,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { useListExport } from "../audit/useListExport";

import {
  clubToday,
  errorDetails,
  errorFields,
  formatMoney,
  MANUAL_CHANNELS,
  type ManualChannel,
  type Money,
  type RollbackBlocker,
  shiftPeriod,
  useBillingErrorMessage,
  useBillingLocale,
} from "./shared";

type BillingRunResult = components["schemas"]["BillingRunResult"];
type BulkPaymentResult = components["schemas"]["BulkPaymentResult"];
type CardChargesResult = components["schemas"]["CardChargesResult"];
type PeriodSimulation = components["schemas"]["PeriodSimulation"];
type RollbackResult = components["schemas"]["RollbackResult"];

/** The word the rollback asks to type, exactly as the api checks it (R-12-14), in every language. */
export const ROLLBACK_KEYWORD = "RETROCEDIR";

function Actions({ children }: { children: ReactNode }) {
  return <div className="billing-modal__actions">{children}</div>;
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="billing-modal__error" role="alert">
      {children}
    </div>
  );
}

/**
 * The strong confirmation of button 2 (S12 §2, R-12-11): «Es generaran {n} rebuts per un total de
 * {import}…» from the simulation's KPIs, then `POST /billing/runs` with one key per payload.
 */
/** `billing.nextInvoiceDayOfMonth` (CATALEG_PARAMETRES, default 1): R-12-06's day of month M+1. */
function useNextInvoiceDay(client: ApiClient): number | undefined {
  const [day, setDay] = useState<number>();
  useEffect(() => {
    let current = true;
    void client
      .GET("/parameters/{key}", { params: { path: { key: "billing.nextInvoiceDayOfMonth" } } })
      .then(
        (result) => {
          if (current) setDay(typeof result.data?.value === "number" ? result.data.value : 1);
        },
        () => {
          // The catalog's default when the club's value cannot be read.
          if (current) setDay(1);
        },
      );
    return () => {
      current = false;
    };
  }, [client]);
  return day;
}

export function GenerateModal({
  client,
  keys,
  monthTitle,
  onClose,
  onConflict,
  onGenerated,
  onNavigate,
  onSimulateAgain,
  period,
  simulation,
}: {
  client: ApiClient;
  keys: SubmissionKeys;
  monthTitle: string;
  onClose: () => void;
  /** `RUN_EXISTS` or `BILLING_BUSY`: the month changed under the admin, read it again. */
  onConflict: () => void;
  onGenerated: (result: BillingRunResult) => void;
  onNavigate: (path: string) => void;
  /** [Simula de nou]: the simulation's error text, `undefined` once it is done. */
  onSimulateAgain: () => Promise<string | undefined>;
  period: string;
  simulation: PeriodSimulation;
}) {
  const { t } = useTranslation(["admin-billing", "errors"]);
  const locale = useBillingLocale();
  const formats = useClubFormats();
  const errorMessage = useBillingErrorMessage();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [simulating, setSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState<string>();
  // R-12-06: the included members' next receipt moves to that day of the following month.
  const nextDay = useNextInvoiceDay(client);
  const nextPeriod = shiftPeriod(period, 1);
  const code = isApiError(failure) ? failure.code : undefined;

  /**
   * `collectionDate` only when the admin takes the api's `earliest` after `422
   * COLLECTION_DATE_TOO_SOON` (`BillingRunRequest.collectionDate`): another payload, another key.
   */
  const generate = async (collectionDate?: string) => {
    setPending(true);
    setFailure(undefined);
    const body = {
      ...(collectionDate === undefined ? {} : { collectionDate }),
      period,
      simulationId: simulation.id,
    };
    try {
      const result = await keys.send(JSON.stringify(["runs", body]), (key) =>
        client.POST("/billing/runs", {
          body,
          params: { header: { "Idempotency-Key": key } },
        }),
      );
      if (result.data !== undefined) onGenerated(result.data);
    } catch (error) {
      setFailure(error);
      if (isApiError(error, "RUN_EXISTS") || isApiError(error, "BILLING_BUSY")) onConflict();
    } finally {
      setPending(false);
    }
  };

  const simulateAgain = async () => {
    setSimulating(true);
    setSimulateError(undefined);
    try {
      setSimulateError(await onSimulateAgain());
    } finally {
      setSimulating(false);
    }
  };

  const details = errorDetails(failure);
  const dateOf = (value: unknown) =>
    typeof value === "string" ? formats.formatPlainDate(value) : "";
  const earliest =
    code === "COLLECTION_DATE_TOO_SOON" &&
    typeof details.earliest === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(details.earliest)
      ? details.earliest
      : undefined;

  return (
    <Modal
      closeLabel={t("admin-billing:actions.close")}
      dismissible={!pending && !simulating}
      onClose={onClose}
      open
      title={t("admin-billing:confirm.generateTitle", { month: monthTitle })}
    >
      {code === "SIMULATION_STALE" ? (
        <>
          <Alert>{simulateError ?? t("admin-billing:errors.simulationStale")}</Alert>
          <Actions>
            <Button
              loading={simulating}
              loadingLabel={t("admin-billing:actions.simulating")}
              onClick={() => void simulateAgain()}
            >
              {t("admin-billing:errors.simulateAgain")}
            </Button>
            <Button disabled={simulating} onClick={onClose} variant="ghost">
              {t("admin-billing:actions.cancel")}
            </Button>
          </Actions>
        </>
      ) : (
        <>
          {nextDay === undefined ? (
            <Skeleton label={t("admin-billing:confirm.generating")} />
          ) : (
            <p className="billing-modal__body">
              {t("admin-billing:confirm.generateBody", {
                count: simulation.kpis.count,
                nextDate: formats.formatPlainDate(
                  `${nextPeriod}-${String(nextDay).padStart(2, "0")}`,
                  "dayMonth",
                ),
                total: formatMoney(simulation.kpis.total, locale),
              })}
            </p>
          )}
          {failure === undefined ? null : (
            <Alert>
              {code === "BILLING_BUSY" ? (
                t("admin-billing:errors.billingBusy")
              ) : code === "COLLECTION_DATE_TOO_SOON" ? (
                t("admin-billing:errors.collectionDateTooSoon", {
                  earliest: dateOf(details.earliest),
                  requested: dateOf(details.requested),
                })
              ) : code === "SEPA_NOT_CONFIGURED" ? (
                <>
                  {t("admin-billing:errors.sepaNotConfigured")}{" "}
                  <a
                    href="/parametres"
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate("/parametres");
                    }}
                  >
                    {t("admin-billing:errors.openSettings")}
                  </a>
                </>
              ) : (
                errorMessage(failure)
              )}
            </Alert>
          )}
          <Actions>
            {earliest === undefined ? (
              <Button
                disabled={nextDay === undefined}
                loading={pending}
                loadingLabel={t("admin-billing:confirm.generating")}
                onClick={() => void generate()}
              >
                {t("admin-billing:confirm.generate")}
              </Button>
            ) : (
              // The default day is too soon: the admin may take the first day the api allows.
              <Button
                loading={pending}
                loadingLabel={t("admin-billing:confirm.generating")}
                onClick={() => void generate(earliest)}
              >
                {t("admin-billing:confirm.generateWithEarliest", {
                  date: formats.formatPlainDate(earliest),
                })}
              </Button>
            )}
            <Button disabled={pending} onClick={onClose} variant="ghost">
              {t("admin-billing:actions.cancel")}
            </Button>
          </Actions>
        </>
      )}
    </Modal>
  );
}

/**
 * [Retrocedeix la remesa] (R-12-14): what will be undone, the word «RETROCEDIR» typed exactly and a
 * reason; `409 RUN_NOT_ROLLBACKABLE` lists the api's reasons.
 */
export function RollbackModal({
  client,
  invoiceCount,
  keys,
  monthTitle,
  onBlocked,
  onClose,
  onRolledBack,
  runId,
}: {
  client: ApiClient;
  /** The run's receipts (`run.invoiceIds`), `undefined` until the run's detail is read. */
  invoiceCount: number | undefined;
  keys: SubmissionKeys;
  monthTitle: string;
  onBlocked: () => void;
  onClose: () => void;
  onRolledBack: (result: RollbackResult) => void;
  runId: string;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors"]);
  const errorMessage = useBillingErrorMessage();
  const [keyword, setKeyword] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const blocked = isApiError(failure, "RUN_NOT_ROLLBACKABLE");
  const reasons = (
    Array.isArray(errorDetails(failure).reasons) ? errorDetails(failure).reasons : []
  ) as RollbackBlocker[];
  const confirmed = keyword === ROLLBACK_KEYWORD;

  const rollback = async () => {
    if (!confirmed) return;
    setPending(true);
    setFailure(undefined);
    const body = { confirmation: ROLLBACK_KEYWORD, reason };
    try {
      const result = await keys.send(JSON.stringify(["rollback", runId, body]), (key) =>
        client.POST("/billing/runs/{id}/rollback", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: runId } },
        }),
      );
      if (result.data !== undefined) onRolledBack(result.data);
    } catch (error) {
      setFailure(error);
      if (isApiError(error, "RUN_NOT_ROLLBACKABLE")) onBlocked();
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
      title={t("admin-billing:confirm.rollbackTitle", { month: monthTitle })}
    >
      {blocked ? (
        <>
          <Alert>
            {reasons.length === 0 ? (
              t("errors:RUN_NOT_ROLLBACKABLE")
            ) : (
              <>
                <p>{t("admin-billing:errors.notRollbackable")}</p>
                <ul>
                  {reasons.map((item) => (
                    <li key={item}>{t(`enums:rollbackBlocker.${item}`)}</li>
                  ))}
                </ul>
              </>
            )}
          </Alert>
          <Actions>
            <Button onClick={onClose} variant="secondary">
              {t("admin-billing:actions.close")}
            </Button>
          </Actions>
        </>
      ) : (
        <>
          <p className="billing-modal__body">{t("admin-billing:confirm.rollbackIntro")}</p>
          <ul className="billing-modal__list">
            {invoiceCount === undefined ? null : (
              <li>{t("admin-billing:confirm.rollbackInvoices", { count: invoiceCount })}</li>
            )}
            <li>{t("admin-billing:confirm.rollbackNumbering")}</li>
            <li>{t("admin-billing:confirm.rollbackDates")}</li>
            <li>{t("admin-billing:confirm.rollbackRemittance")}</li>
          </ul>
          <FormField
            id="billing-rollback-keyword"
            label={t("admin-billing:confirm.rollbackKeywordLabel", { keyword: ROLLBACK_KEYWORD })}
            {...(errorFields(failure).includes("confirmation")
              ? { error: t("errors:VALIDATION_ERROR") }
              : {})}
          >
            <Input
              autoComplete="off"
              id="billing-rollback-keyword"
              onChange={(event) => {
                setKeyword(event.currentTarget.value);
              }}
              spellCheck={false}
              value={keyword}
            />
          </FormField>
          <FormField id="billing-rollback-reason" label={t("admin-billing:confirm.rollbackReason")}>
            <Textarea
              id="billing-rollback-reason"
              maxLength={500}
              onChange={(event) => {
                setReason(event.currentTarget.value);
              }}
              value={reason}
            />
          </FormField>
          {failure === undefined || errorFields(failure).includes("confirmation") ? null : (
            <Alert>{errorMessage(failure)}</Alert>
          )}
          <Actions>
            <Button
              disabled={!confirmed}
              loading={pending}
              loadingLabel={t("admin-billing:confirm.rollingBack")}
              onClick={() => void rollback()}
              variant="danger"
            >
              {t("admin-billing:confirm.rollback")}
            </Button>
            <Button disabled={pending} onClick={onClose} variant="ghost">
              {t("admin-billing:actions.cancel")}
            </Button>
          </Actions>
        </>
      )}
    </Modal>
  );
}

/** [COBRA LES TARGETES] (R-12-13): the count and total of `run.byProvider.STRIPE`, then `202`. */
export function ChargeCardsModal({
  client,
  keys,
  onCharged,
  onClose,
  runId,
  stripe,
}: {
  client: ApiClient;
  keys: SubmissionKeys;
  onCharged: (result: CardChargesResult) => void;
  onClose: () => void;
  runId: string;
  stripe: { count: number; total: Money };
}) {
  const { t } = useTranslation(["admin-billing", "errors"]);
  const locale = useBillingLocale();
  const errorMessage = useBillingErrorMessage();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();

  const charge = async () => {
    setPending(true);
    setFailure(undefined);
    try {
      const result = await keys.send(JSON.stringify(["card-charges", runId]), (key) =>
        client.POST("/billing/runs/{id}/card-charges", {
          params: { header: { "Idempotency-Key": key }, path: { id: runId } },
        }),
      );
      if (result.data !== undefined) onCharged(result.data);
    } catch (error) {
      setFailure(error);
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
      title={t("admin-billing:confirm.chargeTitle")}
    >
      <p className="billing-modal__body">
        {t("admin-billing:confirm.chargeBody", {
          count: stripe.count,
          total: formatMoney(stripe.total, locale),
        })}
      </p>
      {failure === undefined ? null : <Alert>{errorMessage(failure)}</Alert>}
      <Actions>
        <Button
          loading={pending}
          loadingLabel={t("admin-billing:confirm.charging")}
          onClick={() => void charge()}
        >
          {t("admin-billing:confirm.charge")}
        </Button>
        <Button disabled={pending} onClick={onClose} variant="ghost">
          {t("admin-billing:actions.cancel")}
        </Button>
      </Actions>
    </Modal>
  );
}

/** [Marcar cobrat (selecció)] (R-12-16): `paidAt` (club-local today) and the channel, all or none. */
export function MarkPaidModal({
  client,
  invoiceIds,
  keys,
  onClose,
  onConflict,
  onPaid,
}: {
  client: ApiClient;
  invoiceIds: readonly string[];
  keys: SubmissionKeys;
  onClose: () => void;
  /** `409 INVALID_STATE`: one of them changed (all or none): the list is read again. */
  onConflict: () => void;
  onPaid: (result: BulkPaymentResult) => void;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors"]);
  const branding = useBranding();
  const errorMessage = useBillingErrorMessage();
  const today = clubToday(branding.timeZone);
  const [paidAt, setPaidAt] = useState(today);
  const [channel, setChannel] = useState<ManualChannel>("CASH");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const fields = errorFields(failure);

  const markPaid = async () => {
    setPending(true);
    setFailure(undefined);
    const body = { channel, invoiceIds: [...invoiceIds], paidAt };
    try {
      const result = await keys.send(JSON.stringify(["payments", body]), (key) =>
        client.POST("/invoices/payments", {
          body,
          params: { header: { "Idempotency-Key": key } },
        }),
      );
      if (result.data !== undefined) onPaid(result.data);
    } catch (error) {
      setFailure(error);
      if (isApiError(error, "INVALID_STATE")) onConflict();
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
      title={t("admin-billing:confirm.markPaidTitle")}
    >
      <p className="billing-modal__body">
        {t("admin-billing:confirm.markPaidBody", { count: invoiceIds.length })}
      </p>
      <FormField
        id="billing-bulk-paid-at"
        label={t("admin-billing:confirm.paidAt")}
        {...(fields.includes("paidAt") ? { error: t("admin-billing:errors.dateAfterToday") } : {})}
      >
        <Input
          id="billing-bulk-paid-at"
          max={today}
          onChange={(event) => {
            setPaidAt(event.currentTarget.value);
          }}
          required
          type="date"
          value={paidAt}
        />
      </FormField>
      <FormField id="billing-bulk-channel" label={t("admin-billing:confirm.channel")}>
        <Select
          id="billing-bulk-channel"
          onChange={(event) => {
            setChannel(event.currentTarget.value as ManualChannel);
          }}
          value={channel}
        >
          {MANUAL_CHANNELS.map((option) => (
            <option key={option} value={option}>
              {t(`enums:paymentChannel.${option}`)}
            </option>
          ))}
        </Select>
      </FormField>
      {failure === undefined || fields.includes("paidAt") ? null : (
        <Alert>{errorMessage(failure)}</Alert>
      )}
      <Actions>
        <Button
          disabled={paidAt === ""}
          loading={pending}
          loadingLabel={t("admin-billing:confirm.markingPaid")}
          onClick={() => void markPaid()}
        >
          {t("admin-billing:confirm.markPaid")}
        </Button>
        <Button disabled={pending} onClick={onClose} variant="ghost">
          {t("admin-billing:actions.cancel")}
        </Button>
      </Actions>
    </Modal>
  );
}

/**
 * «Exporta per a comptabilitat» (R-12-26, `listKey = accounting`): the format (default
 * `billing.accountingExportFormat`) and the shared export path — a `200` file is saved, a `202`
 * job opens the exports drawer.
 */
export function AccountingExportModal({
  client,
  listExport,
  onClose,
  period,
}: {
  client: ApiClient;
  listExport: ReturnType<typeof useListExport>;
  onClose: () => void;
  period: string;
}) {
  const { t } = useTranslation(["admin-billing", "errors"]);
  const [format, setFormat] = useState<AccountingExportFormat>();

  useEffect(() => {
    let current = true;
    void client
      .GET("/parameters/{key}", { params: { path: { key: "billing.accountingExportFormat" } } })
      .then(
        (result) => {
          if (current)
            setFormat((chosen) => chosen ?? (result.data?.value === "XLSX" ? "xlsx" : "csv"));
        },
        () => {
          if (current) setFormat((chosen) => chosen ?? "csv");
        },
      );
    return () => {
      current = false;
    };
  }, [client]);

  const run = async () => {
    if (format === undefined) return;
    const done = await listExport.runWith(
      () => requestAccountingExport(client, { format, period }),
      "accounting",
    );
    if (done) onClose();
  };

  return (
    <Modal
      closeLabel={t("admin-billing:actions.close")}
      dismissible={!listExport.busy}
      onClose={onClose}
      open
      title={t("admin-billing:export.title")}
    >
      <RadioGroup
        label={t("admin-billing:export.format")}
        onValueChange={(value) => {
          setFormat(value === "xlsx" ? "xlsx" : "csv");
        }}
        options={[
          { label: t("admin-billing:export.csv"), value: "csv" },
          { label: t("admin-billing:export.xlsx"), value: "xlsx" },
        ]}
        value={format ?? ""}
      />
      <p className="billing-modal__footnote">{t("admin-billing:export.footnote")}</p>
      {listExport.error?.source === "accounting" ? <Alert>{listExport.error.message}</Alert> : null}
      <Actions>
        <Button
          disabled={format === undefined}
          loading={listExport.busy}
          loadingLabel={t("admin-billing:export.running")}
          onClick={() => void run()}
        >
          {t("admin-billing:export.run")}
        </Button>
        <Button disabled={listExport.busy} onClick={onClose} variant="ghost">
          {t("admin-billing:actions.cancel")}
        </Button>
      </Actions>
    </Modal>
  );
}
