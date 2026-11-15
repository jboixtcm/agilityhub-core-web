import {
  apiFieldErrors,
  isApiError,
  isInProgress,
  type ApiClient,
  type components,
  type SubmissionKeys,
} from "@agilityhub/api-client";
import { minorUnits, useClubFormats } from "@agilityhub/i18n";
import { Button, FormField, Input, Modal, Textarea } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Upfront = components["schemas"]["UpfrontPayment"];
type Money = components["schemas"]["Money"];

/** PAY-05 (S12 R-12-20): what is left to refund of a payment, as the api counts it. */
export function refundableMinor(payment: Upfront): number {
  return (
    payment.amountPaid.amountMinor -
    payment.refunds.reduce((sum, refund) => sum + refund.amount.amountMinor, 0)
  );
}

/** A card payment collected by Stripe Checkout that still has something to refund. */
export function isRefundable(payment: Upfront): boolean {
  return (
    payment.provider?.type === "STRIPE" && payment.status === "PAID" && refundableMinor(payment) > 0
  );
}

/**
 * PAY-05 (decision of 13 Nov 2026): D10's refund of a card payment (a signup's, a pack's or a
 * single class's). The amount (blank = what is left, as D6's receipt refund) and the reason, then a
 * confirmation naming the member, the concept and the amount; only that step sends
 * `POST /upfront-payments/{id}/refund` with its key and that amount. Stripe confirms the refund
 * later (webhook), which writes its audit entry.
 */
export function UpfrontRefundModal({
  client,
  keys,
  memberName,
  onClose,
  onRefunded,
  onStale,
  payment,
}: {
  client: ApiClient;
  keys: SubmissionKeys;
  memberName: string;
  onClose: () => void;
  onRefunded: (amount: Money) => void;
  /** `409 INVALID_STATE`: the payment changed meanwhile; the list is read again. */
  onStale: () => void;
  payment: Upfront;
}) {
  const { t } = useTranslation(["admin-census", "common", "enums", "errors"]);
  const formats = useClubFormats();
  const currency = payment.amountPaid.currency;
  const left = refundableMinor(payment);
  const money = (amountMinor: number) => formats.formatMoneyMinor({ amountMinor, currency });
  const concept = t(`enums:upfrontConcept.${payment.concept}`);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirming) confirmHeading.current?.focus();
  }, [confirming]);

  const typed = amount.trim() === "" ? undefined : minorUnits(amount, currency);
  const invalidAmount = amount.trim() !== "" && (typed === undefined || typed <= 0 || typed > left);
  const refundMinor = typed ?? left;
  const fields = apiFieldErrors(failure).map((entry) => entry.field);
  const amountRefused =
    isApiError(failure, "REFUND_EXCEEDS_PAID") || isApiError(failure, "CURRENCY_MISMATCH");
  const reasonRefused = fields.includes("reason");
  const stale = isApiError(failure, "INVALID_STATE");
  const message = isInProgress(failure)
    ? t("common:inProgress")
    : stale
      ? t("admin-census:member.billing.refund.stale")
      : isApiError(failure) && failure.status !== 0 && failure.code !== "NETWORK"
        ? t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") })
        : t("admin-census:common.genericError");

  const submit = async () => {
    setPending(true);
    setFailure(undefined);
    // The amount the confirmation named, also for «what is left»: the refund is that amount or
    // none (a refund still in flight makes it `422 REFUND_EXCEEDS_PAID`), never a smaller one.
    const body = { amount: { amountMinor: refundMinor, currency }, reason: reason.trim() };
    try {
      const result = await keys.send(JSON.stringify(["upfront-refund", payment.id, body]), (key) =>
        client.POST("/upfront-payments/{id}/refund", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: payment.id } },
        }),
      );
      onRefunded(result.data?.amount ?? body.amount);
    } catch (error) {
      setFailure(error);
      // The amount and the reason are the form's: their refusal goes back to it, on its field.
      if (
        isApiError(error, "REFUND_EXCEEDS_PAID") ||
        isApiError(error, "CURRENCY_MISMATCH") ||
        apiFieldErrors(error).some((entry) => entry.field === "reason")
      ) {
        setConfirming(false);
      }
      if (isApiError(error, "INVALID_STATE")) onStale();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-census:common.close")}
      dismissible={!pending}
      onClose={onClose}
      open
      title={t("admin-census:member.billing.refund.title")}
    >
      {confirming ? (
        <div className="census-record__form">
          <h3 className="member-billing__step" ref={confirmHeading} tabIndex={-1}>
            {t("admin-census:member.billing.refund.confirmTitle")}
          </h3>
          <p>
            {t("admin-census:member.billing.refund.confirmBody", {
              amount: money(refundMinor),
              concept,
              member: memberName,
            })}
          </p>
          <p>{t("admin-census:member.billing.refund.confirmReason", { reason: reason.trim() })}</p>
          {failure === undefined ? null : <p role="alert">{message}</p>}
          <div className="member-billing__actions">
            <Button
              disabled={stale}
              loading={pending}
              loadingLabel={t("admin-census:common.saving")}
              onClick={() => void submit()}
              variant="danger"
            >
              {t("admin-census:member.billing.refund.confirm", { amount: money(refundMinor) })}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setFailure(undefined);
                setConfirming(false);
              }}
              variant="ghost"
            >
              {t("admin-census:member.billing.refund.back")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="census-record__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (invalidAmount || reason.trim() === "") return;
            setFailure(undefined);
            setConfirming(true);
          }}
        >
          <p>
            {t("admin-census:member.billing.refund.summary", {
              concept,
              left: money(left),
              paid: formats.formatMoneyMinor(payment.amountPaid),
            })}
          </p>
          <FormField
            {...(invalidAmount
              ? {
                  error: t("admin-census:member.billing.refund.amountInvalid", {
                    left: money(left),
                  }),
                }
              : amountRefused
                ? { error: t(`errors:${isApiError(failure) ? failure.code : "VALIDATION_ERROR"}`) }
                : {})}
            help={t("admin-census:member.billing.refund.amountHelp", { left: money(left) })}
            id="upfront-refund-amount"
            label={t("admin-census:member.billing.refund.amount")}
          >
            <Input
              id="upfront-refund-amount"
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.currentTarget.value);
                if (amountRefused) setFailure(undefined);
              }}
              value={amount}
            />
          </FormField>
          <FormField
            {...(reasonRefused
              ? { error: t("admin-census:member.billing.refund.reasonRequired") }
              : {})}
            id="upfront-refund-reason"
            label={t("admin-census:member.billing.reason")}
          >
            <Textarea
              id="upfront-refund-reason"
              maxLength={500}
              onChange={(event) => {
                setReason(event.currentTarget.value);
                if (reasonRefused) setFailure(undefined);
              }}
              required
              value={reason}
            />
          </FormField>
          {failure === undefined || amountRefused || reasonRefused ? null : (
            <p role="alert">{message}</p>
          )}
          <div className="member-billing__actions">
            <Button disabled={invalidAmount || reason.trim() === ""} type="submit">
              {t("admin-census:member.billing.refund.continue")}
            </Button>
            <Button onClick={onClose} variant="ghost">
              {t("admin-census:common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
