import { type ApiClient, type components } from "@agilityhub/api-client";
import { Button, Drawer, FormField, Input, Select } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Member = components["schemas"]["Member"];
type Plan = components["schemas"]["Plan"];
type Price = components["schemas"]["Price"];

export function MemberPlanDrawer({
  client,
  member,
  onClose,
  open,
}: {
  client: ApiClient;
  member: Member;
  onClose: () => void;
  open: boolean;
}) {
  const { t } = useTranslation("admin-census");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [planId, setPlanId] = useState("");
  const [priceId, setPriceId] = useState("");
  const [nextInvoiceDate, setNextInvoiceDate] = useState(member.nextInvoiceDate ?? "");
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    void client.GET("/plans", { params: { query: { includeInactive: false } } }).then(
      (result) => {
        if (current) setPlans((result.data?.items ?? []) as Plan[]);
      },
      () => {
        if (current) setFailure(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, open]);

  useEffect(() => {
    if (planId === "") {
      return undefined;
    }
    let current = true;
    void client.GET("/prices", { params: { query: { planId } } }).then((result) => {
      if (current) setPrices((result.data?.items ?? []));
    });
    return () => {
      current = false;
    };
  }, [client, planId]);

  const current = plans.find((plan) => plan.id === member.planId);
  const selected = plans.find((plan) => plan.id === planId);
  const packToMonthly = current?.type === "PACK" && selected?.type === "MONTHLY";

  return (
    <Drawer closeLabel={t("admin-census:common.close")} onClose={onClose} open={open} title={t("admin-census:plan.title")}>
      <section className="census-record__fieldset">
        <h3>{t("admin-census:plan.current")}</h3>
        <p>{current?.name ?? member.plan?.name ?? t("admin-census:values.empty")}</p>
        {current?.billingMode === undefined ? null : (
          <p>
            {current.billingMode === "MAINTENANCE"
              ? t("admin-census:plan.maintenance")
              : t("admin-census:plan.monthly")}
          </p>
        )}
      </section>
      <form className="census-record__form">
        <FormField id="member-plan" label={t("admin-census:plan.newPlan")}>
          <Select id="member-plan" onChange={(event) => { setPlanId(event.currentTarget.value); setPriceId(""); setPrices([]); }} value={planId}>
            <option value="">{t("admin-census:common.choose")}</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </Select>
        </FormField>
        <FormField id="member-price" label={t("admin-census:plan.price")}>
          <Select id="member-price" onChange={(event) => { setPriceId(event.currentTarget.value); }} value={priceId}>
            <option value="">{t("admin-census:common.choose")}</option>
            {prices.map((price) => (
              <option key={price.id} value={price.id}>
                {t("admin-census:plan.priceAmount", {
                  amount: price.amount.amountMinor / 100,
                  currency: price.amount.currency,
                })}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="member-plan-invoice-date" label={t("admin-census:plan.nextInvoiceDate")}>
          <Input id="member-plan-invoice-date" onChange={(event) => { setNextInvoiceDate(event.currentTarget.value); }} type="date" value={nextInvoiceDate} />
        </FormField>
        {packToMonthly ? <p>{t("admin-census:plan.packDiscountRule")}</p> : null}
        <p className="census-record__warning">{t("admin-census:plan.contractUnavailable")}</p>
        <Button disabled type="button">{t("admin-census:common.save")}</Button>
      </form>
      <a href={`/abonats/${member.id}?accio=afegir-gos`}>{t("admin-census:plan.addDog")}</a>
      {failure ? <p role="alert">{t("admin-census:common.genericError")}</p> : null}
    </Drawer>
  );
}
