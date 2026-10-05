import {
  type ApiClient,
  contentDispositionFileName,
  isApiError,
  saveFile,
  type SubmissionKeys,
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
  Select,
  Skeleton,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clubToday,
  errorDetails,
  errorFields,
  formatMoney,
  type Invoice,
  invoiceStatusView,
  MANUAL_CHANNELS,
  type ManualChannel,
  minorUnits,
  useBillingErrorMessage,
  useBillingLocale,
} from "./shared";

type InvoiceAction = "cancel" | "fail" | "pay" | "refund" | "retry";

/** The state actions of a receipt (R-12-16…R-12-20, E87): what its status and method allow. */
export function invoiceActions(invoice: Invoice): InvoiceAction[] {
  const { collections, paymentMethod, status } = invoice;
  const actions: InvoiceAction[] = [];
  const sepaCollected = collections.some(
    (entry) => entry.provider === "SEPA_XML" && entry.status === "SUCCEEDED",
  );
  const cardCollected = collections.some(
    (entry) => entry.provider === "STRIPE" && entry.status === "SUCCEEDED",
  );
  if ((status === "PENDING" || status === "FAILED") && paymentMethod.type !== "CARD") {
    actions.push("pay");
  }
  if (
    (status === "COLLECTING" && paymentMethod.type === "SEPA_DD") ||
    (status === "PAID" && sepaCollected)
  ) {
    actions.push("fail");
  }
  if (status === "FAILED" && paymentMethod.type === "CARD") actions.push("retry");
  // «reemborsat» (S12 §5, the contract's rule): `refundedTotal` equals `total`; no sum on the front.
  if (
    status === "PAID" &&
    cardCollected &&
    invoice.refundedTotal.amountMinor !== invoice.total.amountMinor
  ) {
    actions.push("refund");
  }
  if (status === "PENDING" || status === "FAILED") actions.push("cancel");
  return actions;
}

type Translate = ReturnType<typeof useTranslation>["t"];

/** The failure codes the api and the card provider send that the club reads in its language. */
const KNOWN_FAILURES = new Set([
  "BANK_RETURN",
  "NO_PAYMENT_METHOD",
  "ROLLBACK",
  "card_declined",
  "expired_card",
  "insufficient_funds",
]);

/**
 * A collection's or a receipt's failure: a known code in the reader's language, else the provider's
 * own message, else what the api sent (an admin's free reason reads as written).
 */
export function failureText(
  t: Translate,
  code: string | null | undefined,
  message?: string | null,
): string {
  if (code !== null && code !== undefined && KNOWN_FAILURES.has(code)) {
    return t(`enums:collectionFailure.${code}`);
  }
  return message ?? code ?? "";
}

function actionLabel(t: Translate, action: InvoiceAction): string {
  switch (action) {
    case "cancel":
      return t("admin-billing:drawer.cancel");
    case "fail":
      return t("admin-billing:drawer.markFailed");
    case "pay":
      return t("admin-billing:drawer.markPaid");
    case "refund":
      return t("admin-billing:drawer.refund");
    case "retry":
      return t("admin-billing:drawer.retry");
  }
}

function actionDone(t: Translate, action: InvoiceAction): string {
  switch (action) {
    case "cancel":
      return t("admin-billing:drawer.done.cancelled");
    case "fail":
      return t("admin-billing:drawer.done.failed");
    case "pay":
      return t("admin-billing:drawer.done.paid");
    case "refund":
      return t("admin-billing:drawer.done.refunded");
    case "retry":
      return t("admin-billing:drawer.done.retried");
  }
}

function actionTitle(t: Translate, action: InvoiceAction): string {
  switch (action) {
    case "cancel":
      return t("admin-billing:drawer.cancelTitle");
    case "fail":
      return t("admin-billing:drawer.failTitle");
    case "pay":
      return t("admin-billing:drawer.payTitle");
    case "refund":
      return t("admin-billing:drawer.refundTitle");
    case "retry":
      return t("admin-billing:drawer.retryTitle");
  }
}

function Row({ label, children }: { children: ReactNode; label: string }) {
  return (
    <div className="billing-drawer__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The receipt drawer (S12 §2 D6, step 7): `GET /invoices/{id}`, its frozen lines, its collections
 * and refunds, the masked payment method, and the actions its state allows, each confirmed and
 * sent with the receipt's `version`. No edit affordance anywhere (R-12-10).
 */
export function InvoiceDrawer({
  client,
  invoiceId,
  keys,
  onChanged,
  onClose,
  onNavigate,
  rolledBack: listedRolledBack = false,
}: {
  client: ApiClient;
  invoiceId: string;
  keys: SubmissionKeys;
  onChanged: () => void;
  onClose: () => void;
  onNavigate: (path: string) => void;
  /** The list row's `rolledBack` (R-12-14): an admin-cancelled receipt a rollback reached too. */
  rolledBack?: boolean;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors", "census"]);
  const locale = useBillingLocale();
  const formats = useClubFormats();
  // The page keys the drawer by receipt: another receipt is a fresh drawer, and an answer for the
  // previous one never lands here.
  const errorMessage = useBillingErrorMessage();
  const [invoice, setInvoice] = useState<Invoice>();
  const [reload, setReload] = useState(0);
  // The read the drawer shows: until the current one answers, the actions wait.
  const [loaded, setLoaded] = useState(-1);
  const [loadError, setLoadError] = useState<{ error: unknown; reload: number }>();
  const [action, setAction] = useState<InvoiceAction>();
  const [notice, setNotice] = useState<{ text: string; tone: "danger" | "success" }>();
  const [documentPending, setDocumentPending] = useState(false);

  useEffect(() => {
    let current = true;
    void client.GET("/invoices/{id}", { params: { path: { id: invoiceId } } }).then(
      (result) => {
        if (!current || result.data === undefined) return;
        setInvoice(result.data);
        setLoaded(reload);
        setLoadError(undefined);
      },
      (error: unknown) => {
        if (current) setLoadError({ error, reload });
      },
    );
    return () => {
      current = false;
    };
  }, [client, invoiceId, reload]);

  const refresh = useCallback(() => {
    setReload((value) => value + 1);
  }, []);
  // A failed refresh keeps the cached receipt usable: only an unanswered current read locks it.
  const currentLoadError = loadError?.reload === reload ? loadError.error : undefined;
  const reading = loaded !== reload && currentLoadError === undefined;

  const openDocument = async (current: Invoice) => {
    // Opened by the click itself, so no pop-up blocker stops it; the PDF is never parsed here.
    const tab = window.open("", "_blank");
    setDocumentPending(true);
    try {
      const { data, response } = await client.GET("/invoices/{id}/document", {
        params: { path: { id: current.id } },
        parseAs: "blob",
      });
      if (data === undefined) throw new TypeError("The receipt document has no file");
      const blob =
        data.type === "application/pdf" ? data : new Blob([data], { type: "application/pdf" });
      if (tab === null) {
        saveFile(
          blob,
          contentDispositionFileName(response.headers.get("Content-Disposition")) ??
            `${current.displayNumber}.pdf`,
        );
      } else {
        const url = URL.createObjectURL(blob);
        tab.location.href = url;
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 60_000);
      }
    } catch (error) {
      tab?.close();
      setNotice({
        text: isApiError(error)
          ? t(`errors:${error.code}`, { defaultValue: t("admin-billing:errors.generic") })
          : t("admin-billing:errors.generic"),
        tone: "danger",
      });
    } finally {
      setDocumentPending(false);
    }
  };

  const title =
    invoice === undefined
      ? t("admin-billing:drawer.loading")
      : t("admin-billing:drawer.title", { number: invoice.displayNumber });
  const showTax = invoice?.lines.some((line) => line.taxPercent !== 0) ?? false;
  const rolledBack =
    invoice?.status === "CANCELLED" && (listedRolledBack || invoice.cancelReason === "ROLLBACK");
  const status =
    invoice === undefined
      ? undefined
      : invoiceStatusView({
          paymentMethodType: invoice.paymentMethod.type,
          refundedTotal: invoice.refundedTotal,
          rolledBack,
          status: invoice.status,
          total: invoice.total,
        });
  // An admin's own reason reads as written, also on a receipt a rollback reached afterwards.
  const ownReason =
    invoice?.cancelReason === null ||
    invoice?.cancelReason === undefined ||
    invoice.cancelReason === "ADMIN" ||
    invoice.cancelReason === "ROLLBACK"
      ? undefined
      : invoice.cancelReason;
  const method = invoice?.paymentMethod;

  return (
    <Drawer closeLabel={t("admin-billing:drawer.close")} onClose={onClose} open title={title}>
      <div className="billing-drawer">
        {notice === undefined ? null : (
          <p
            className={`billing-drawer__notice billing-drawer__notice--${notice.tone}`}
            role={notice.tone === "danger" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
        {invoice === undefined || currentLoadError === undefined ? null : (
          <div className="billing-drawer__notice billing-drawer__notice--danger" role="alert">
            <p>{t("admin-billing:drawer.loadError")}</p>
            <p>{errorMessage(currentLoadError)}</p>
            <Button onClick={refresh} variant="secondary">
              {t("admin-billing:actions.retry")}
            </Button>
          </div>
        )}
        {invoice === undefined ? (
          loadError?.reload !== reload ? (
            <Skeleton label={t("admin-billing:drawer.loading")} />
          ) : (
            <div role="alert">
              <p>{t("admin-billing:drawer.loadError")}</p>
              <Button onClick={refresh} variant="secondary">
                {t("admin-billing:actions.retry")}
              </Button>
            </div>
          )
        ) : (
          <>
            <div className="billing-drawer__head">
              {status === undefined ? null : <Badge tone={status.tone}>{t(status.key)}</Badge>}
              <a
                href={`/abonats/${invoice.memberId}`}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(`/abonats/${invoice.memberId}`);
                }}
              >
                {invoice.memberSnapshot.fullName}
              </a>
            </div>
            <dl className="billing-drawer__facts">
              <Row label={t("admin-billing:drawer.period")}>
                {formats.formatMonthTitle(invoice.period)}
              </Row>
              <Row label={t("admin-billing:drawer.issueDate")}>
                {formats.formatPlainDate(invoice.issueDate)}
              </Row>
              {invoice.paidAt === null || invoice.paidAt === undefined ? null : (
                <Row label={t("admin-billing:drawer.paidAt")}>
                  {formats.formatDate(invoice.paidAt)}
                </Row>
              )}
              {invoice.failedAt === null || invoice.failedAt === undefined ? null : (
                <Row label={t("admin-billing:drawer.failedAt")}>
                  {formats.formatDate(invoice.failedAt)}
                  {invoice.failureReason === null || invoice.failureReason === undefined
                    ? null
                    : ` · ${failureText(t, invoice.failureReason)}`}
                </Row>
              )}
              {invoice.cancelledAt === null || invoice.cancelledAt === undefined ? null : (
                <Row label={t("admin-billing:drawer.cancelledAt")}>
                  {formats.formatDate(invoice.cancelledAt)}
                  {rolledBack ? ` · ${t("admin-billing:drawer.cancelReasonRollback")}` : null}
                  {ownReason === undefined ? null : ` · ${ownReason}`}
                </Row>
              )}
              {invoice.refundedTotal.amountMinor === 0 ? null : (
                <Row label={t("admin-billing:drawer.refundedTotal")}>
                  {formatMoney(invoice.refundedTotal, locale)}
                </Row>
              )}
              {invoice.note === null || invoice.note === undefined ? null : (
                <Row label={t("admin-billing:drawer.note")}>{invoice.note}</Row>
              )}
              {invoice.includeInNextRun ? (
                <Row label={t("admin-billing:drawer.collection")}>
                  {t("admin-billing:drawer.includeInNextRun")}
                </Row>
              ) : null}
            </dl>

            <section aria-labelledby="billing-drawer-lines">
              <h3 id="billing-drawer-lines">{t("admin-billing:drawer.lines")}</h3>
              <table className="billing-drawer__lines">
                <thead>
                  <tr>
                    <th scope="col">{t("admin-billing:drawer.description")}</th>
                    {showTax ? (
                      <>
                        <th scope="col">{t("admin-billing:drawer.base")}</th>
                        <th scope="col">{t("admin-billing:drawer.taxPercent")}</th>
                        <th scope="col">{t("admin-billing:drawer.tax")}</th>
                      </>
                    ) : null}
                    <th scope="col">{t("admin-billing:drawer.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.lineNo}>
                      <td>
                        {line.description}
                        <small>{t(`enums:invoiceLineOrigin.${line.origin}`)}</small>
                      </td>
                      {showTax ? (
                        <>
                          <td>{formatMoney(line.base, locale)}</td>
                          <td>{`${String(line.taxPercent)} %`}</td>
                          <td>{formatMoney(line.tax, locale)}</td>
                        </>
                      ) : null}
                      <td>{formatMoney(line.total, locale)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={showTax ? 4 : 1} scope="row">
                      {t("admin-billing:drawer.total")}
                    </th>
                    <td>
                      <strong>{formatMoney(invoice.total, locale)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section aria-labelledby="billing-drawer-method">
              <h3 id="billing-drawer-method">{t("admin-billing:drawer.paymentMethod")}</h3>
              {method === undefined ? null : (
                <dl className="billing-drawer__facts">
                  <Row label={t("admin-billing:drawer.methodType")}>
                    {t(`enums:paymentMethodType.${method.type}`)}
                  </Row>
                  {fmtMaskedIban(method.maskedAccount) === null ? null : (
                    <Row label={t("admin-billing:drawer.account")}>
                      {fmtMaskedIban(method.maskedAccount)}
                    </Row>
                  )}
                  {method.last4 === null || method.last4 === undefined ? null : (
                    <Row label={t("admin-billing:drawer.card")}>{`···· ${method.last4}`}</Row>
                  )}
                  {method.holderName === null || method.holderName === undefined ? null : (
                    <Row label={t("admin-billing:drawer.holder")}>{method.holderName}</Row>
                  )}
                  {method.mandateRef === null || method.mandateRef === undefined ? null : (
                    <Row label={t("admin-billing:drawer.mandate")}>{method.mandateRef}</Row>
                  )}
                  {method.channel === null || method.channel === undefined ? null : (
                    <Row label={t("admin-billing:drawer.channel")}>
                      {t(`enums:paymentChannel.${method.channel}`)}
                    </Row>
                  )}
                </dl>
              )}
            </section>

            <section aria-labelledby="billing-drawer-collections">
              <h3 id="billing-drawer-collections">{t("admin-billing:drawer.collections")}</h3>
              {invoice.collections.length === 0 ? (
                <p>{t("admin-billing:drawer.noCollections")}</p>
              ) : (
                <ol className="billing-drawer__timeline">
                  {invoice.collections.map((entry) => (
                    <li key={entry.id}>
                      <strong>
                        {t("admin-billing:drawer.collectionLine", {
                          attempt: entry.attempt,
                          provider: t(`enums:collectionProvider.${entry.provider}`),
                          status: t(`enums:collectionStatus.${entry.status}`),
                        })}
                      </strong>
                      <span>{formats.formatDateTime(entry.resolvedAt ?? entry.createdAt)}</span>
                      {entry.providerRef === null || entry.providerRef === undefined ? null : (
                        <span>
                          {t("admin-billing:drawer.providerRef", { reference: entry.providerRef })}
                        </span>
                      )}
                      {entry.failureCode === null || entry.failureCode === undefined ? null : (
                        <span>
                          {t("admin-billing:drawer.failure", {
                            reason: failureText(t, entry.failureCode, entry.failureMessage),
                          })}
                        </span>
                      )}
                      {entry.refunds.map((refund) => (
                        <span key={`${refund.at}-${String(refund.amount.amountMinor)}`}>
                          {t("admin-billing:drawer.refundLine", {
                            amount: formatMoney(refund.amount, locale),
                            date: formats.formatDate(refund.at),
                            reason: refund.reason,
                          })}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div
              aria-label={t("admin-billing:drawer.actions")}
              className="billing-drawer__actions"
              role="group"
            >
              {invoiceActions(invoice).map((item) => (
                <Button
                  // While the receipt is read again (after a conflict), no action takes its old version.
                  disabled={reading}
                  key={item}
                  onClick={() => {
                    setNotice(undefined);
                    setAction(item);
                  }}
                  variant={item === "cancel" ? "danger" : "secondary"}
                >
                  {actionLabel(t, item)}
                </Button>
              ))}
              <Button
                loading={documentPending}
                loadingLabel={t("admin-billing:drawer.documentLoading")}
                onClick={() => void openDocument(invoice)}
                variant="ghost"
              >
                <Icon aria-hidden="true" name="doc" />
                {t("admin-billing:drawer.document")}
              </Button>
            </div>
          </>
        )}
      </div>
      {invoice === undefined || action === undefined ? null : (
        <InvoiceActionModal
          action={action}
          client={client}
          invoice={invoice}
          keys={keys}
          onClose={() => {
            setAction(undefined);
          }}
          onDone={(next) => {
            setAction(undefined);
            if (next === undefined) refresh();
            else setInvoice(next);
            setNotice({ text: actionDone(t, action), tone: "success" });
            onChanged();
          }}
          onConflict={(error) => {
            // The receipt changed (STALE_VERSION) or is in another state (INVALID_STATE): the
            // confirmation closes, the drawer says why and reads the receipt (and the list) again.
            setAction(undefined);
            setNotice({
              text: isApiError(error, "STALE_VERSION")
                ? t("admin-billing:errors.staleInvoice")
                : errorMessage(error),
              tone: "danger",
            });
            refresh();
            onChanged();
          }}
        />
      )}
    </Drawer>
  );
}

/**
 * One action's confirmation (step 7): its fields, the receipt's `version` where S12 §6 asks for it,
 * one Idempotency-Key per payload, and its errors where the admin is (this modal).
 */
function InvoiceActionModal({
  action,
  client,
  invoice,
  keys,
  onClose,
  onConflict,
  onDone,
}: {
  action: InvoiceAction;
  client: ApiClient;
  invoice: Invoice;
  keys: SubmissionKeys;
  onClose: () => void;
  /** `409 STALE_VERSION` or `409 INVALID_STATE`: the receipt is not the one the admin saw. */
  onConflict: (error: unknown) => void;
  onDone: (invoice: Invoice | undefined) => void;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors"]);
  const branding = useBranding();
  const locale = useBillingLocale();
  const errorMessage = useBillingErrorMessage();
  const today = clubToday(branding.timeZone);
  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState<ManualChannel>("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const fields = errorFields(failure);
  const refundMinor = amount.trim() === "" ? undefined : minorUnits(amount, invoice.total.currency);
  const invalidAmount = amount.trim() !== "" && (refundMinor === undefined || refundMinor <= 0);
  const id = invoice.id;
  const version = invoice.version;

  const submit = async () => {
    setPending(true);
    setFailure(undefined);
    try {
      const params = (key: string) => ({ header: { "Idempotency-Key": key }, path: { id } });
      let next: Invoice | undefined;
      if (action === "pay") {
        const body = {
          channel,
          paidAt: date,
          ...(reference.trim() === "" ? {} : { reference: reference.trim() }),
          version,
        };
        next = (
          await keys.send(JSON.stringify(["payment", id, body]), (key) =>
            client.POST("/invoices/{id}/payment", { body, params: params(key) }),
          )
        ).data;
      } else if (action === "fail") {
        const body = { at: date, reason, version };
        next = (
          await keys.send(JSON.stringify(["failure", id, body]), (key) =>
            client.POST("/invoices/{id}/failure", { body, params: params(key) }),
          )
        ).data;
      } else if (action === "retry") {
        const body = { version };
        next = (
          await keys.send(JSON.stringify(["retry", id, body]), (key) =>
            client.POST("/invoices/{id}/retry", { body, params: params(key) }),
          )
        ).data;
      } else if (action === "refund") {
        const body = {
          ...(refundMinor === undefined
            ? {}
            : { amount: { amountMinor: refundMinor, currency: invoice.total.currency } }),
          reason,
        };
        await keys.send(JSON.stringify(["refund", id, body]), (key) =>
          client.POST("/invoices/{id}/refund", { body, params: params(key) }),
        );
        // `202`: the refund is accepted; the receipt is read again for its refunds.
        next = undefined;
      } else {
        const body = { reason, version };
        next = (
          await keys.send(JSON.stringify(["cancellation", id, body]), (key) =>
            client.POST("/invoices/{id}/cancellation", { body, params: params(key) }),
          )
        ).data;
      }
      onDone(next);
    } catch (error) {
      if (isApiError(error, "STALE_VERSION") || isApiError(error, "INVALID_STATE")) {
        onConflict(error);
        return;
      }
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  const details = errorDetails(failure);
  const message = isApiError(failure, "MAX_ATTEMPTS")
    ? t("admin-billing:errors.maxAttempts", {
        attempts: typeof details.attempts === "number" ? details.attempts : 0,
        max: typeof details.max === "number" ? details.max : 0,
      })
    : errorMessage(failure);
  const dateField = action === "pay" ? "paidAt" : "at";

  return (
    <Modal
      closeLabel={t("admin-billing:actions.close")}
      dismissible={!pending}
      onClose={onClose}
      open
      title={actionTitle(t, action)}
    >
      {action === "retry" ? (
        <p className="billing-modal__body">
          {t("admin-billing:drawer.retryBody", {
            last4: invoice.paymentMethod.last4 ?? "",
            total: formatMoney(invoice.total, locale),
          })}
        </p>
      ) : null}
      {action === "cancel" ? (
        <p className="billing-modal__body">
          {t("admin-billing:drawer.cancelBody", { number: invoice.displayNumber })}
        </p>
      ) : null}
      {action === "pay" || action === "fail" ? (
        <FormField
          id="billing-action-date"
          label={
            action === "pay" ? t("admin-billing:confirm.paidAt") : t("admin-billing:drawer.failAt")
          }
          {...(fields.includes(dateField)
            ? { error: t("admin-billing:errors.dateAfterToday") }
            : {})}
        >
          <Input
            id="billing-action-date"
            max={today}
            onChange={(event) => {
              setDate(event.currentTarget.value);
            }}
            required
            type="date"
            value={date}
          />
        </FormField>
      ) : null}
      {action === "pay" ? (
        <>
          <FormField id="billing-action-channel" label={t("admin-billing:confirm.channel")}>
            <Select
              id="billing-action-channel"
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
          <FormField id="billing-action-reference" label={t("admin-billing:confirm.reference")}>
            <Input
              id="billing-action-reference"
              maxLength={140}
              onChange={(event) => {
                setReference(event.currentTarget.value);
              }}
              value={reference}
            />
          </FormField>
        </>
      ) : null}
      {action === "refund" ? (
        <FormField
          {...(invalidAmount ? { error: t("admin-billing:drawer.refundAmountInvalid") } : {})}
          // Blank = what is left to refund, as the api counts it (RefundRequest.amount).
          help={t("admin-billing:drawer.refundAmountHelp")}
          id="billing-action-amount"
          label={t("admin-billing:drawer.refundAmount")}
        >
          <Input
            id="billing-action-amount"
            inputMode="decimal"
            onChange={(event) => {
              setAmount(event.currentTarget.value);
            }}
            value={amount}
          />
        </FormField>
      ) : null}
      {action === "fail" || action === "refund" || action === "cancel" ? (
        <FormField id="billing-action-reason" label={t("admin-billing:drawer.reason")}>
          <Textarea
            id="billing-action-reason"
            maxLength={500}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            value={reason}
          />
        </FormField>
      ) : null}
      {failure === undefined || fields.includes(dateField) ? null : (
        <div className="billing-modal__error" role="alert">
          {message}
        </div>
      )}
      <div className="billing-modal__actions">
        <Button
          disabled={((action === "pay" || action === "fail") && date === "") || invalidAmount}
          loading={pending}
          loadingLabel={t("admin-billing:drawer.saving")}
          onClick={() => void submit()}
          variant={action === "cancel" ? "danger" : "primary"}
        >
          {actionLabel(t, action)}
        </Button>
        <Button disabled={pending} onClick={onClose} variant="ghost">
          {t("admin-billing:actions.cancel")}
        </Button>
      </div>
    </Modal>
  );
}
