import { isApiError, type ApiClient, type components, useSubmissionKeys } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Drawer, FormField, Input, Select } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type Member = components["schemas"]["Member"];
type Plan = components["schemas"]["Plan"];
type Price = components["schemas"]["Price"];

export function MemberPlanDrawer({ client, member, onChanged, onClose, onErased, open }: {
  client: ApiClient;
  member: Member;
  onChanged: () => void;
  onClose: () => void;
  onErased: () => void;
  open: boolean;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const formats = useClubFormats();
  const keys = useSubmissionKeys();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [planId, setPlanId] = useState("");
  const [priceId, setPriceId] = useState("");
  const [effectiveMonth, setEffectiveMonth] = useState("");
  const [failure, setFailure] = useState<unknown>();
  const [loading, setLoading] = useState(open);
  const [pending, setPending] = useState(false);
  const [erased, setErased] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    void client.GET("/plans", { params: { query: { includeInactive: false } } }).then(
      (result) => {
        if (current) {
          setPlans((result.data?.items ?? []) as Plan[]);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (current) {
          setFailure(cause);
          setLoading(false);
        }
      },
    );
    return () => { current = false; };
  }, [client, open]);

  useEffect(() => {
    if (planId === "") return undefined;
    let current = true;
    void client.GET("/prices", { params: { query: { planId } } }).then(
      (result) => { if (current) setPrices(result.data?.items ?? []); },
      (cause: unknown) => { if (current) setFailure(cause); },
    );
    return () => { current = false; };
  }, [client, planId]);

  useEffect(() => {
    if (!open) keys.drop(member.id);
  }, [keys, member.id, open]);

  const current = plans.find((plan) => plan.id === member.planId);
  const selected = plans.find((plan) => plan.id === planId);
  const packToMonthly = current?.type === "PACK" && (current.pack?.sessions ?? 0) >= 10 && selected?.type === "MONTHLY";
  const error = useMemo(() => {
    if (failure === undefined) return undefined;
    return isApiError(failure)
      ? t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") })
      : t("admin-census:common.genericError");
  }, [failure, t]);
  const close = () => {
    keys.drop(member.id);
    setFailure(undefined);
    setErased(false);
    onClose();
  };

  return (
    <Drawer closeLabel={t("admin-census:common.close")} onClose={close} open={open} title={t("admin-census:plan.title")}>
      {loading ? <p role="status">{t("admin-census:common.loading")}</p> : null}
      {erased ? (
        <>
          <p role="alert">{t("errors:MEMBER_ERASED")}</p>
          <Button onClick={close} variant="ghost">{t("admin-census:common.cancel")}</Button>
        </>
      ) : (
        <>
          <section className="census-record__fieldset">
            <h3>{t("admin-census:plan.current")}</h3>
            <p>{current?.name ?? member.plan?.name ?? t("admin-census:values.empty")}</p>
            {current?.billingMode === undefined ? null : (
              <p>{current.billingMode === "MAINTENANCE" ? t("admin-census:plan.maintenance") : t("admin-census:plan.monthly")}</p>
            )}
          </section>
          <form className="census-record__form" onSubmit={(event) => {
            event.preventDefault();
            if (planId === "" || priceId === "") return;
            const body: components["schemas"]["MemberPlanChangeRequest"] = {
              planId,
              priceId,
              ...(effectiveMonth === "" ? {} : { effectiveMonth }),
            };
            setPending(true);
            setFailure(undefined);
            void keys.send(JSON.stringify(body), (key) => client.POST("/members/{id}/plan-change", {
              body,
              params: { header: { "Idempotency-Key": key }, path: { id: member.id } },
            }), member.id).then(() => { onChanged(); }).catch((cause: unknown) => {
              setFailure(cause);
              if (isApiError(cause, "MEMBER_ERASED")) {
                setErased(true);
                onErased();
              }
            }).finally(() => { setPending(false); });
          }}>
            <FormField id="member-plan" label={t("admin-census:plan.newPlan")}>
              <Select id="member-plan" onChange={(event) => { setPlanId(event.currentTarget.value); setPriceId(""); setPrices([]); setFailure(undefined); }} required value={planId}>
                <option value="">{t("admin-census:common.choose")}</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </Select>
            </FormField>
            <FormField id="member-price" label={t("admin-census:plan.price")}>
              <Select id="member-price" onChange={(event) => { setPriceId(event.currentTarget.value); }} required value={priceId}>
                <option value="">{t("admin-census:common.choose")}</option>
                {prices.map((price) => <option key={price.id} value={price.id}>{formats.formatMoney(price.amount.amountMinor / 100)}</option>)}
              </Select>
            </FormField>
            <FormField id="member-plan-effective-month" label={t("admin-census:plan.effectiveMonth")}>
              <Input id="member-plan-effective-month" onChange={(event) => { setEffectiveMonth(event.currentTarget.value); }} type="month" value={effectiveMonth} />
            </FormField>
            {packToMonthly ? <p>{t("admin-census:plan.packDiscountRule")}</p> : null}
            <Button disabled={planId === "" || priceId === ""} loading={pending} type="submit">{t("admin-census:common.save")}</Button>
          </form>
          <a href={`/abonats/${member.id}?accio=afegir-gos`}>{t("admin-census:plan.addDog")}</a>
          {error === undefined ? null : <p role="alert">{error}</p>}
        </>
      )}
    </Drawer>
  );
}
