import {
  apiFieldErrors,
  isApiError,
  type ApiClient,
  type components,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { useEffect, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import { clubToday } from "../billing/shared";

type Dog = components["schemas"]["MemberOverview"]["dogs"][number];
type Invoice = components["schemas"]["InvoiceListItem"];
type Pack = components["schemas"]["PackBalanceDetail"];
type Upfront = components["schemas"]["UpfrontPayment"];

const invoiceTones = {
  CANCELLED: "neutral",
  COLLECTING: "warning",
  FAILED: "danger",
  PAID: "success",
  PENDING: "warning",
} as const;

export function MemberBillingBlock({
  client,
  dogs,
  memberId,
  readOnly = false,
}: {
  client: ApiClient;
  dogs: readonly Dog[];
  memberId: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation(["admin-census", "enums", "errors"]);
  const branding = useBranding();
  const packsEnabled = branding.modules.includes("PACKS");
  const formats = useClubFormats();
  const keys = useSubmissionKeys();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Upfront[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [reload, setReload] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<Pack>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [dogId, setDogId] = useState("");
  const [concept, setConcept] = useState<components["schemas"]["UpfrontConcept"]>("ENTRY_FEE");
  const [amountDue, setAmountDue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [channel, setChannel] = useState<components["schemas"]["ManualChannel"]>("CASH");
  const [paidAt, setPaidAt] = useState(() => clubToday(branding.timeZone));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [expiresOn, setExpiresOn] = useState("");

  useEffect(() => {
    let active = true;
    const packRequest = packsEnabled
      ? client.GET("/pack-balances", { params: { query: { memberId } } })
      : Promise.resolve({ data: [] as Pack[] });
    void Promise.allSettled([
      client.GET("/invoices", {
        params: {
          query: {
            fields: "displayNumber,concept,issueDate,status,total,paymentMethodType",
            filter: [`memberId:eq:${memberId}`],
            page: 0,
            size: 20,
            sort: ["issueDate,desc"],
          },
        },
      }),
      client.GET("/upfront-payments", { params: { query: { memberId } } }),
      packRequest,
    ]).then(([invoiceResult, paymentResult, packResult]) => {
      if (!active) return;
      if (invoiceResult.status === "fulfilled")
        setInvoices((invoiceResult.value.data?.items ?? []).slice(0, 5));
      if (paymentResult.status === "fulfilled") setPayments(paymentResult.value.data?.items ?? []);
      if (packResult.status === "fulfilled") setPacks(packResult.value.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [client, memberId, packsEnabled, reload]);

  const dogName = (id: string) => dogs.find((dog) => dog.id === id)?.name ?? id;
  const adjustmentFields = apiFieldErrors(failure);
  const adjustmentFieldError = (field: string) =>
    adjustmentFields.some((entry) => entry.field === field)
      ? t("errors:VALIDATION_ERROR")
      : undefined;
  const hasKnownAdjustmentField = adjustmentFields.some((entry) =>
    ["delta", "expiresOn", "reason"].includes(entry.field),
  );
  const deltaError = adjustmentFieldError("delta");
  const reasonError = adjustmentFieldError("reason");
  const expiryError = adjustmentFieldError("expiresOn");

  const cents = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
  const savePayment = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFailure(undefined);
    const body = {
      amountDue: { amountMinor: cents(amountDue), currency: branding.currency },
      amountPaid: { amountMinor: cents(amountPaid), currency: branding.currency },
      channel,
      concept,
      memberId,
      paidAt,
      ...(dogId === "" ? {} : { dogId }),
      ...(reference.trim() === "" ? {} : { reference: reference.trim() }),
      ...(note.trim() === "" ? {} : { note: note.trim() }),
    };
    try {
      await keys.send(JSON.stringify(["upfront", body]), (key) =>
        client.POST("/upfront-payments", { body, params: { header: { "Idempotency-Key": key } } }),
      );
      setPaymentOpen(false);
      setReload((value) => value + 1);
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };
  const saveAdjustment = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (adjusting === undefined) return;
    setPending(true);
    setFailure(undefined);
    const body = {
      delta: Number(delta),
      reason: reason.trim(),
      ...(expiresOn === "" ? {} : { expiresOn }),
    };
    try {
      await keys.send(JSON.stringify(["pack-adjust", adjusting.id, body]), (key) =>
        client.POST("/pack-balances/{id}/adjustments", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: adjusting.id } },
        }),
      );
      setAdjusting(undefined);
      setReload((value) => value + 1);
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="member-billing">
      <h2>{t("admin-census:member.billing.title")}</h2>
      <section>
        <h3>{t("admin-census:member.billing.receipts")}</h3>
        <ul className="census-record__invoice-list">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <span>
                <strong>{invoice.displayNumber}</strong>
                <small>{invoice.concept}</small>
              </span>
              <span>
                {invoice.total === undefined
                  ? ""
                  : formats.formatMoney(invoice.total.amountMinor / 100)}
              </span>
              {invoice.status === undefined ? null : (
                <Badge tone={invoiceTones[invoice.status]}>
                  {t(`enums:invoiceStatus.${invoice.status}`)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
        <a href={`/facturacio?filter=${encodeURIComponent(`memberId:eq:${memberId}`)}`}>
          {t("admin-census:member.billing.allReceipts")}
        </a>
      </section>
      <section>
        <div className="member-billing__heading">
          <h3>{t("admin-census:member.billing.upfront")}</h3>
          {readOnly ? null : (
            <Button
              onClick={() => {
                setFailure(undefined);
                setPaymentOpen(true);
              }}
              variant="secondary"
            >
              {t("admin-census:member.billing.recordPayment")}
            </Button>
          )}
        </div>
        <ul className="census-record__plain-list">
          {payments.map((payment) => (
            <li key={payment.id}>
              <span>{t(`enums:upfrontConcept.${payment.concept}`)}</span>
              <span>
                {formats.formatMoney(payment.amountPaid.amountMinor / 100)} /{" "}
                {formats.formatMoney(payment.amountDue.amountMinor / 100)}
              </span>
              <Badge>{t(`enums:upfrontStatus.${payment.status}`)}</Badge>
            </li>
          ))}
        </ul>
      </section>
      {packsEnabled ? (
        <section>
          <h3>{t("admin-census:member.billing.packs")}</h3>
          {packs.map((pack) => (
            <div className="member-billing__pack" key={pack.id}>
              <span>
                <strong>
                  {dogName(pack.dogId)} · {pack.planName}
                </strong>{" "}
                —{" "}
                {pack.state === "EXPIRED"
                  ? t("admin-census:member.billing.packExpiredLine", {
                      consumed: pack.consumed,
                      date: formats.formatPlainDate(pack.expiresOn, "short"),
                    })
                  : t("admin-census:member.billing.packLine", {
                      consumed: pack.consumed,
                      remaining: pack.remaining,
                      date: formats.formatPlainDate(pack.expiresOn, "short"),
                    })}
              </span>
              {readOnly ? null : (
                <Button
                  onClick={() => {
                    setFailure(undefined);
                    setDelta("");
                    setReason("");
                    setExpiresOn("");
                    setAdjusting(pack);
                  }}
                  variant="ghost"
                >
                  {t("admin-census:member.billing.adjust")}
                </Button>
              )}
            </div>
          ))}
        </section>
      ) : null}
      <Modal
        closeLabel={t("admin-census:common.cancel")}
        onClose={() => {
          if (!pending) setPaymentOpen(false);
        }}
        open={paymentOpen}
        title={t("admin-census:member.billing.recordPayment")}
      >
        <form className="census-record__form" onSubmit={(event) => void savePayment(event)}>
          <FormField id="upfront-dog" label={t("admin-census:member.billing.dog")}>
            <Select
              id="upfront-dog"
              onChange={(event) => {
                setDogId(event.currentTarget.value);
              }}
              value={dogId}
            >
              <option value="">{t("admin-census:values.empty")}</option>
              {dogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  {dog.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            {...(isApiError(failure, "PLAN_NOT_PACK")
              ? { error: t("admin-census:member.billing.planNotPack") }
              : {})}
            id="upfront-concept"
            label={t("admin-census:member.billing.concept")}
          >
            <Select
              id="upfront-concept"
              onChange={(event) => {
                setConcept(event.currentTarget.value as components["schemas"]["UpfrontConcept"]);
              }}
              value={concept}
            >
              {(packsEnabled
                ? ([
                    "ENTRY_FEE",
                    "FIRST_MONTH",
                    "PACK",
                    "SINGLE_CLASS",
                    "ACTIVITY",
                    "OTHER",
                  ] as const)
                : (["ENTRY_FEE", "FIRST_MONTH", "SINGLE_CLASS", "ACTIVITY", "OTHER"] as const)
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`enums:upfrontConcept.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="upfront-due" label={t("admin-census:member.billing.amountDue")}>
            <Input
              id="upfront-due"
              min="0"
              onChange={(event) => {
                setAmountDue(event.currentTarget.value);
              }}
              required
              step="0.01"
              type="number"
              value={amountDue}
            />
          </FormField>
          <FormField
            {...(isApiError(failure, "AMOUNT_EXCEEDS_DUE")
              ? { error: t("admin-census:member.billing.amountExceeds") }
              : {})}
            id="upfront-paid"
            label={t("admin-census:member.billing.amountPaid")}
          >
            <Input
              id="upfront-paid"
              min="0"
              onChange={(event) => {
                setAmountPaid(event.currentTarget.value);
              }}
              required
              step="0.01"
              type="number"
              value={amountPaid}
            />
          </FormField>
          <FormField id="upfront-channel" label={t("admin-census:member.billing.channel")}>
            <Select
              id="upfront-channel"
              onChange={(event) => {
                setChannel(event.currentTarget.value as components["schemas"]["ManualChannel"]);
              }}
              value={channel}
            >
              {(["CASH", "TRANSFER", "BIZUM"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`enums:paymentChannel.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="upfront-date" label={t("admin-census:member.billing.paidAt")}>
            <Input
              id="upfront-date"
              onChange={(event) => {
                setPaidAt(event.currentTarget.value);
              }}
              required
              type="date"
              value={paidAt}
            />
          </FormField>
          <FormField id="upfront-reference" label={t("admin-census:member.billing.reference")}>
            <Input
              id="upfront-reference"
              onChange={(event) => {
                setReference(event.currentTarget.value);
              }}
              value={reference}
            />
          </FormField>
          <FormField id="upfront-note" label={t("admin-census:member.billing.note")}>
            <Textarea
              id="upfront-note"
              onChange={(event) => {
                setNote(event.currentTarget.value);
              }}
              value={note}
            />
          </FormField>
          {failure !== undefined &&
          !isApiError(failure, "AMOUNT_EXCEEDS_DUE") &&
          !isApiError(failure, "PLAN_NOT_PACK") ? (
            <p role="alert">{t("admin-census:common.genericError")}</p>
          ) : null}
          <Button disabled={pending} loading={pending} type="submit">
            {t("admin-census:common.save")}
          </Button>
        </form>
      </Modal>
      <Modal
        closeLabel={t("admin-census:common.cancel")}
        onClose={() => {
          if (!pending) setAdjusting(undefined);
        }}
        open={adjusting !== undefined}
        title={t("admin-census:member.billing.adjust")}
      >
        <form className="census-record__form" onSubmit={(event) => void saveAdjustment(event)}>
          {adjusting === undefined ? null : (
            <p>
              <strong>{t("admin-census:member.billing.dog")}:</strong> {dogName(adjusting.dogId)}
            </p>
          )}
          <FormField
            {...(isApiError(failure, "PACK_NEGATIVE")
              ? { error: t("admin-census:member.billing.packNegative") }
              : deltaError === undefined
                ? {}
                : { error: deltaError })}
            id="pack-delta"
            label={t("admin-census:member.billing.delta")}
          >
            <Input
              id="pack-delta"
              onChange={(event) => {
                setDelta(event.currentTarget.value);
              }}
              required
              type="number"
              value={delta}
            />
          </FormField>
          <FormField
            {...(reasonError === undefined ? {} : { error: reasonError })}
            id="pack-reason"
            label={t("admin-census:member.billing.reason")}
          >
            <Input
              id="pack-reason"
              onChange={(event) => {
                setReason(event.currentTarget.value);
              }}
              required
              value={reason}
            />
          </FormField>
          {adjusting?.state === "EXPIRED" ? (
            <FormField
              {...(expiryError === undefined ? {} : { error: expiryError })}
              id="pack-expiry"
              label={t("admin-census:member.billing.expiresOn")}
            >
              <Input
                id="pack-expiry"
                onChange={(event) => {
                  setExpiresOn(event.currentTarget.value);
                }}
                required
                type="date"
                value={expiresOn}
              />
            </FormField>
          ) : null}
          {failure !== undefined &&
          !isApiError(failure, "PACK_NEGATIVE") &&
          !hasKnownAdjustmentField ? (
            <p role="alert">{t("admin-census:common.genericError")}</p>
          ) : null}
          <Button disabled={pending} loading={pending} type="submit">
            {t("admin-census:common.save")}
          </Button>
        </form>
      </Modal>
    </Card>
  );
}
