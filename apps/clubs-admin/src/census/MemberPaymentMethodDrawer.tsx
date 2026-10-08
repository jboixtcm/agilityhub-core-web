import { isApiError, isInProgress, type ApiClient, type components, useSubmissionKeys } from "@agilityhub/api-client";
import { Badge, Button, Drawer, FormField, Input, Select } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Payment = components["schemas"]["PaymentMethodView"];
type PaymentType = components["schemas"]["PaymentMethodType"];

export function MemberPaymentMethodDrawer({
  client,
  memberId,
  onChanged,
  onClose,
  onErased,
  open,
  paymentMethod,
}: {
  client: ApiClient;
  memberId: string;
  onChanged: (paymentMethod: Payment) => void;
  onClose: () => void;
  onErased: () => void;
  open: boolean;
  paymentMethod?: Payment | null | undefined;
}) {
  const { t } = useTranslation(["admin-census", "common", "enums", "errors"]);
  const keys = useSubmissionKeys();
  const [type, setType] = useState<PaymentType>(paymentMethod?.type ?? "SEPA_DD");
  const [holderName, setHolderName] = useState(paymentMethod?.holderName ?? "");
  const [iban, setIban] = useState("");
  const [channel, setChannel] = useState(paymentMethod?.channel ?? "CASH");
  const [checkoutUrl, setCheckoutUrl] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [erased, setErased] = useState(false);

  useEffect(() => {
    if (!open) keys.drop(memberId);
  }, [keys, memberId, open]);

  const close = () => {
    setType(paymentMethod?.type ?? "SEPA_DD");
    setHolderName(paymentMethod?.holderName ?? "");
    setIban("");
    setChannel(paymentMethod?.channel ?? "CASH");
    setCheckoutUrl(undefined);
    setFailure(undefined);
    setErased(false);
    keys.drop(memberId);
    onClose();
  };
  const fail = (cause: unknown) => {
    setFailure(cause);
    if (isApiError(cause, "MEMBER_ERASED")) {
      setErased(true);
      onErased();
    }
  };

  const error = failure === undefined
    ? undefined
    : isInProgress(failure)
      ? t("common:inProgress")
      : isApiError(failure, "PAYMENT_PROVIDER_NOT_ENABLED")
      ? t("admin-census:paymentMethod.providerMissing")
      : isApiError(failure)
        ? t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") })
        : t("admin-census:common.genericError");

  return (
    <Drawer closeLabel={t("admin-census:common.close")} onClose={close} open={open} title={t("admin-census:member.payment.title")}>
      {paymentMethod === undefined || paymentMethod === null ? null : (
        <section className="census-record__fieldset">
          <h3>{t("admin-census:paymentMethod.current")}</h3>
          <p>
            {t(`enums:paymentMethodType.${paymentMethod.type}`)}
            {paymentMethod.maskedAccount == null ? null : ` · ${paymentMethod.maskedAccount}`}
            {paymentMethod.holderName == null ? null : ` · ${paymentMethod.holderName}`}
            {paymentMethod.channel == null
              ? null
              : ` · ${t(`enums:paymentChannel.${paymentMethod.channel}`, {
                  defaultValue: paymentMethod.channel,
                })}`}
          </p>
          {paymentMethod.type === "CARD" && paymentMethod.invalid === true ? (
            <Badge tone="danger">{t("admin-census:paymentMethod.invalidCard")}</Badge>
          ) : null}
        </section>
      )}
      {erased ? <><p role="alert">{t("errors:MEMBER_ERASED")}</p><Button onClick={close} variant="ghost">{t("admin-census:common.cancel")}</Button></> : <form className="census-record__form" onSubmit={(event) => {
        event.preventDefault();
        if (type === "CARD") return;
        const body: components["schemas"]["PaymentMethodPatch"] = type === "SEPA_DD"
          ? { type, sepa: { holderName, ...(iban === "" ? {} : { iban }) } }
          : { type, manual: { channel } };
        setPending(true);
        setFailure(undefined);
        void (async () => {
          try {
            const result = await client.PATCH("/members/{id}/payment-method", {
              body,
              params: { path: { id: memberId } },
            });
            if (result.data === undefined) throw new TypeError("Payment response did not contain data");
            onChanged(result.data);
          } catch (cause) {
            fail(cause);
          } finally {
            setPending(false);
          }
        })();
      }}>
        <FormField id="payment-method-type" label={t("admin-census:paymentMethod.type")}>
          <Select id="payment-method-type" onChange={(event) => { setType(event.currentTarget.value as PaymentType); setCheckoutUrl(undefined); }} value={type}>
            <option value="SEPA_DD">{t("enums:paymentMethodType.SEPA_DD")}</option>
            <option value="CARD">{t("enums:paymentMethodType.CARD")}</option>
            <option value="MANUAL">{t("enums:paymentMethodType.MANUAL")}</option>
          </Select>
        </FormField>
        {type === "SEPA_DD" ? (
          <>
            <FormField id="payment-holder" label={t("admin-census:member.payment.holder") }>
              <Input id="payment-holder" onChange={(event) => { setHolderName(event.currentTarget.value); }} required value={holderName} />
            </FormField>
            <FormField help={t("admin-census:member.payment.ibanHelp")} id="payment-iban" label={t("admin-census:member.payment.iban") }>
              <Input autoComplete="off" id="payment-iban" onChange={(event) => { setIban(event.currentTarget.value); }} placeholder={paymentMethod?.maskedAccount ?? ""} type="password" value={iban} />
            </FormField>
          </>
        ) : type === "MANUAL" ? (
          <FormField id="payment-channel" label={t("admin-census:paymentMethod.channel")}>
            <Select id="payment-channel" onChange={(event) => { setChannel(event.currentTarget.value); }} value={channel}>
              <option value="CASH">{t("enums:paymentChannel.CASH")}</option>
              <option value="TRANSFER">{t("enums:paymentChannel.TRANSFER")}</option>
              <option value="BIZUM">{t("enums:paymentChannel.BIZUM")}</option>
            </Select>
          </FormField>
        ) : (
          <Button disabled={pending} onClick={() => {
            const successUrl = `${window.location.origin}/abonats/${encodeURIComponent(memberId)}?calaix=pagament`;
            const body = { cancelUrl: successUrl, successUrl };
            setPending(true);
            setFailure(undefined);
            void keys.send(JSON.stringify({ memberId, ...body }), (key) =>
              client.POST("/members/{id}/card-setup-link", {
                body,
                params: { header: { "Idempotency-Key": key }, path: { id: memberId } },
              }), memberId,
            ).then((result) => {
              if (result.data === undefined) throw new TypeError("Card setup response did not contain data");
              setCheckoutUrl(result.data.checkoutUrl);
            }).catch(fail).finally(() => { setPending(false); });
          }} type="button">
            {t("admin-census:paymentMethod.sendCardLink")}
          </Button>
        )}
        {type === "CARD" ? null : <Button loading={pending} type="submit">{t("admin-census:common.save")}</Button>}
      </form>}
      {erased || checkoutUrl === undefined ? null : (
        <p>
          <a href={checkoutUrl} rel="noreferrer" target="_blank">{checkoutUrl}</a>{" "}
          <Button onClick={() => void navigator.clipboard.writeText(checkoutUrl)} variant="ghost">{t("admin-census:paymentMethod.copy")}</Button>
        </p>
      )}
      {erased || error === undefined ? null : <p role="alert">{error}</p>}
    </Drawer>
  );
}
