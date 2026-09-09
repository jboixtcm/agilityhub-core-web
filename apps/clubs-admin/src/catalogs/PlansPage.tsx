import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  FormField,
  Icon,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CatalogFeedback,
  CatalogPageHeader,
  CatalogTable,
  LoadFailure,
  LocaleTabs,
  useCatalogData,
  useCatalogError,
  YesNoBadge,
} from "./shared";

type EntryFee = components["schemas"]["EntryFee"];
type LocalizedText = Record<string, string>;
type Plan = components["schemas"]["Plan"];
type PlanCreate = components["schemas"]["PlanCreate"];
type PlanPatch = components["schemas"]["PlanPatch"];
type Price = components["schemas"]["Price"];
type PriceCreate = components["schemas"]["PriceCreate"];

function localized(
  source: LocalizedText | undefined,
  fallback: string,
  locale: string,
): LocalizedText {
  return source === undefined ? { [locale]: fallback } : { ...source };
}

function nextMonthStart(): string {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

function compactMoney(value: string): string {
  return value.replace(/([,.]00)(?= )/u, "");
}

function priceConcept(type: Plan["type"], billingMode: Plan["billingMode"]): Price["concept"] {
  if (type === "PACK") {
    return "PACK";
  }
  if (type === "SINGLE_CLASS") {
    return "SINGLE_CLASS";
  }
  return billingMode === "MAINTENANCE" ? "MAINTENANCE_FEE" : "MONTHLY_FEE";
}

function currentPrice(plan: Plan): Price | undefined {
  return plan.currentPrices?.find((price) => price.status === "CURRENT") ?? plan.currentPrices?.[0];
}

function PlanType({ plan }: { plan: Plan }) {
  const { t } = useTranslation("admin-catalogs");
  if (plan.type === "PACK") {
    return <>{t("admin-catalogs:plans.types.pack", { count: plan.pack?.sessions ?? 0 })}</>;
  }
  if (plan.type === "SINGLE_CLASS") {
    return <>{t("admin-catalogs:plans.types.singleClass")}</>;
  }
  return <>{t("admin-catalogs:plans.types.monthly")}</>;
}

function PriceStatus({ status }: { status: Price["status"] }) {
  const { t } = useTranslation("admin-catalogs");
  if (status === "CURRENT") {
    return <Badge tone="success">{t("admin-catalogs:plans.priceStatus.current")}</Badge>;
  }
  if (status === "SCHEDULED") {
    return <Badge tone="info">{t("admin-catalogs:plans.priceStatus.scheduled")}</Badge>;
  }
  return <Badge tone="neutral">{t("admin-catalogs:plans.priceStatus.expired")}</Badge>;
}

function PlanPrice({ plan }: { plan: Plan }) {
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation("admin-catalogs");
  const price = currentPrice(plan);
  if (price === undefined) {
    return <>{plan.texts?.priceLabel ?? t("admin-catalogs:plans.noPrice")}</>;
  }
  const amount = compactMoney(formatMoney(price.amount.amountMinor / 100));
  if (plan.type === "MONTHLY") {
    return <strong>{t("admin-catalogs:plans.monthlyPrice", { amount })}</strong>;
  }
  if (plan.type === "SINGLE_CLASS") {
    return <strong>{t("admin-catalogs:plans.singleClassPrice", { amount })}</strong>;
  }
  return <strong>{amount}</strong>;
}

function PriceForm({
  client,
  onSaved,
  plan,
}: {
  client: ApiClient;
  onSaved: () => void;
  plan: Plan;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [amount, setAmount] = useState("");
  const [taxPercent, setTaxPercent] = useState("21");
  const [validFrom, setValidFrom] = useState(nextMonthStart());
  const [validTo, setValidTo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const body: PriceCreate = {
        amount: {
          amountMinor: Math.round(Number(amount.replace(",", ".")) * 100),
          currency: branding.currency,
        },
        concept: priceConcept(plan.type, plan.billingMode),
        planId: plan.id,
        taxPercent: Number(taxPercent.replace(",", ".")),
        validFrom,
        ...(validTo === "" ? {} : { validTo }),
      };
      await client.POST("/prices", { body });
      onSaved();
    } catch (reason) {
      setError(
        isApiError(reason, "PRICE_LOCKED")
          ? t("admin-catalogs:plans.priceLocked")
          : messageForError(reason),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="catalog-price-form" onSubmit={(event) => void submit(event)}>
      <h3>{t("admin-catalogs:plans.newPrice")}</h3>
      <div className="catalog-form__grid catalog-form__grid--four">
        <FormField id="price-amount" label={t("admin-catalogs:plans.fields.priceAmount")}>
          <Input
            id="price-amount"
            min="0"
            onChange={(event) => {
              setAmount(event.currentTarget.value);
            }}
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </FormField>
        <FormField id="price-tax" label={t("admin-catalogs:plans.fields.taxPercent")}>
          <Input
            id="price-tax"
            max="100"
            min="0"
            onChange={(event) => {
              setTaxPercent(event.currentTarget.value);
            }}
            required
            step="0.01"
            type="number"
            value={taxPercent}
          />
        </FormField>
        <FormField id="price-from" label={t("admin-catalogs:plans.fields.validFrom")}>
          <Input
            id="price-from"
            onChange={(event) => {
              setValidFrom(event.currentTarget.value);
            }}
            required
            type="date"
            value={validFrom}
          />
        </FormField>
        <FormField id="price-to" label={t("admin-catalogs:plans.fields.validTo")}>
          <Input
            id="price-to"
            min={validFrom}
            onChange={(event) => {
              setValidTo(event.currentTarget.value);
            }}
            type="date"
            value={validTo}
          />
        </FormField>
      </div>
      {error === undefined ? null : <p role="alert">{error}</p>}
      <Button loading={pending} loadingLabel={t("admin-catalogs:common.saving")} type="submit">
        {t("admin-catalogs:plans.addPrice")}
      </Button>
    </form>
  );
}

function PlanForm({
  client,
  entryFeeMinor,
  item,
  onClose,
  onPriceSaved,
  onSaved,
}: {
  client: ApiClient;
  entryFeeMinor: number;
  onClose: () => void;
  onPriceSaved: () => void;
  onSaved: () => void;
  item?: Plan | undefined;
}) {
  const branding = useBranding();
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [name, setName] = useState(
    localized(item?.nameI18n, item?.name ?? "", branding.defaultLocale),
  );
  const [conditions, setConditions] = useState(
    localized(item?.conditionsI18n, item?.conditions ?? "", branding.defaultLocale),
  );
  const [code, setCode] = useState(item?.code ?? "");
  const [type, setType] = useState<Plan["type"]>(item?.type ?? "MONTHLY");
  const [billingMode, setBillingMode] = useState<NonNullable<Plan["billingMode"]>>(
    item?.billingMode ?? "MONTHLY_FEE",
  );
  const [dogsIncluded, setDogsIncluded] = useState(item?.dogsIncluded ?? 1);
  const [entryMode, setEntryMode] = useState<EntryFee["mode"]>(item?.entryFee.mode ?? "STANDARD");
  const [entryAmount, setEntryAmount] = useState(
    item?.entryFee.amount === undefined ? "" : String(item.entryFee.amount.amountMinor / 100),
  );
  const [entryPercent, setEntryPercent] = useState(
    item?.entryFee.percent === undefined ? "" : String(item.entryFee.percent),
  );
  const [packSessions, setPackSessions] = useState(item?.pack?.sessions ?? 6);
  const [packValidity, setPackValidity] = useState(item?.pack?.validityMonths ?? 3);
  const [chargeMode, setChargeMode] = useState<
    components["schemas"]["SingleClassSettings"]["chargeMode"]
  >(item?.singleClass?.chargeMode ?? "CHARGE_ON_ATTENDANCE");
  const [cancelPolicy, setCancelPolicy] = useState<
    components["schemas"]["SingleClassSettings"]["cancelPolicy"]
  >(item?.singleClass?.cancelPolicy ?? "REFUND");
  const [showOnSignup, setShowOnSignup] = useState(item?.showOnSignup ?? true);
  const [showOnWeb, setShowOnWeb] = useState(item?.showOnWeb ?? true);
  const [active, setActive] = useState(item?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const billingEnabled = branding.modules.includes("BILLING");

  const entryFee = (): EntryFee => {
    if (entryMode === "AMOUNT") {
      return {
        amount: {
          amountMinor: Math.round(Number(entryAmount.replace(",", ".")) * 100),
          currency: branding.currency,
        },
        mode: entryMode,
      };
    }
    if (entryMode === "PERCENT") {
      return { mode: entryMode, percent: Number(entryPercent) };
    }
    return { mode: entryMode };
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const values = {
        active,
        code: code.toLocaleUpperCase(),
        conditions,
        dogsIncluded,
        entryFee: entryFee(),
        name,
        showOnSignup,
        showOnWeb,
        type,
        ...(type === "MONTHLY" ? { billingMode } : {}),
        ...(type === "PACK"
          ? { pack: { sessions: packSessions, validityMonths: packValidity } }
          : {}),
        ...(type === "SINGLE_CLASS" ? { singleClass: { cancelPolicy, chargeMode } } : {}),
      };
      if (item === undefined) {
        await client.POST("/plans", { body: values satisfies PlanCreate });
      } else {
        await client.PATCH("/plans/{id}", {
          body: { ...values, version: item.version } satisfies PlanPatch,
          params: { path: { id: item.id } },
        });
      }
      onSaved();
      onClose();
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="catalog-plan-form">
      <form className="catalog-form" onSubmit={(event) => void submit(event)}>
        <LocaleTabs locale={locale} locales={branding.locales} onChange={setLocale} />
        <div className="catalog-form__grid">
          <FormField id="plan-name" label={t("admin-catalogs:plans.fields.name")}>
            <Input
              id="plan-name"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setName((current) => ({ ...current, [locale]: value }));
              }}
              required={locale === branding.defaultLocale}
              value={name[locale] ?? ""}
            />
          </FormField>
          <FormField id="plan-code" label={t("admin-catalogs:plans.fields.code")}>
            <Input
              id="plan-code"
              maxLength={16}
              onChange={(event) => {
                setCode(event.currentTarget.value);
              }}
              pattern="[A-Za-z0-9_]+"
              required
              value={code}
            />
          </FormField>
          <FormField id="plan-type" label={t("admin-catalogs:plans.fields.type")}>
            <Select
              disabled={item !== undefined}
              id="plan-type"
              onChange={(event) => {
                setType(event.currentTarget.value as Plan["type"]);
              }}
              value={type}
            >
              <option value="MONTHLY">{t("admin-catalogs:plans.types.monthly")}</option>
              {branding.modules.includes("PACKS") ? (
                <option value="PACK">{t("admin-catalogs:plans.types.packOption")}</option>
              ) : null}
              {branding.modules.includes("SINGLE_CLASS") ? (
                <option value="SINGLE_CLASS">{t("admin-catalogs:plans.types.singleClass")}</option>
              ) : null}
            </Select>
          </FormField>
          <FormField id="plan-dogs-included" label={t("admin-catalogs:plans.fields.dogsIncluded")}>
            <Input
              id="plan-dogs-included"
              max={9}
              min={1}
              onChange={(event) => {
                setDogsIncluded(event.currentTarget.valueAsNumber);
              }}
              required
              type="number"
              value={dogsIncluded}
            />
          </FormField>
        </div>
        {type === "MONTHLY" ? (
          <FormField id="plan-billing-mode" label={t("admin-catalogs:plans.fields.billingMode")}>
            <Select
              id="plan-billing-mode"
              onChange={(event) => {
                setBillingMode(event.currentTarget.value as NonNullable<Plan["billingMode"]>);
              }}
              value={billingMode}
            >
              <option value="MONTHLY_FEE">
                {t("admin-catalogs:plans.billingMode.monthlyFee")}
              </option>
              <option value="MAINTENANCE">
                {t("admin-catalogs:plans.billingMode.maintenance")}
              </option>
            </Select>
          </FormField>
        ) : null}
        {billingEnabled ? (
          <div className="catalog-form__grid">
            <FormField id="plan-entry-mode" label={t("admin-catalogs:plans.fields.entryMode")}>
              <Select
                id="plan-entry-mode"
                onChange={(event) => {
                  setEntryMode(event.currentTarget.value as EntryFee["mode"]);
                }}
                value={entryMode}
              >
                <option value="STANDARD">
                  {t("admin-catalogs:plans.entryMode.standard", {
                    amount: compactMoney(formatMoney(entryFeeMinor / 100)),
                  })}
                </option>
                <option value="AMOUNT">{t("admin-catalogs:plans.entryMode.amount")}</option>
                <option value="PERCENT">{t("admin-catalogs:plans.entryMode.percent")}</option>
                <option value="NONE">{t("admin-catalogs:plans.entryMode.none")}</option>
              </Select>
            </FormField>
            {entryMode === "AMOUNT" ? (
              <FormField
                id="plan-entry-amount"
                label={t("admin-catalogs:plans.fields.entryAmount")}
              >
                <Input
                  id="plan-entry-amount"
                  min="0"
                  onChange={(event) => {
                    setEntryAmount(event.currentTarget.value);
                  }}
                  required
                  step="0.01"
                  type="number"
                  value={entryAmount}
                />
              </FormField>
            ) : null}
            {entryMode === "PERCENT" ? (
              <FormField
                id="plan-entry-percent"
                label={t("admin-catalogs:plans.fields.entryPercent")}
              >
                <Input
                  id="plan-entry-percent"
                  max="100"
                  min="1"
                  onChange={(event) => {
                    setEntryPercent(event.currentTarget.value);
                  }}
                  required
                  type="number"
                  value={entryPercent}
                />
              </FormField>
            ) : null}
          </div>
        ) : null}
        {type === "PACK" ? (
          <div className="catalog-form__grid">
            <FormField
              id="plan-pack-sessions"
              label={t("admin-catalogs:plans.fields.packSessions")}
            >
              <Input
                id="plan-pack-sessions"
                max={99}
                min={1}
                onChange={(event) => {
                  setPackSessions(event.currentTarget.valueAsNumber);
                }}
                required
                type="number"
                value={packSessions}
              />
            </FormField>
            <FormField
              id="plan-pack-validity"
              label={t("admin-catalogs:plans.fields.packValidity")}
            >
              <Input
                id="plan-pack-validity"
                max={24}
                min={1}
                onChange={(event) => {
                  setPackValidity(event.currentTarget.valueAsNumber);
                }}
                required
                type="number"
                value={packValidity}
              />
            </FormField>
          </div>
        ) : null}
        {type === "SINGLE_CLASS" ? (
          <div className="catalog-form__grid">
            <FormField id="plan-charge-mode" label={t("admin-catalogs:plans.fields.chargeMode")}>
              <Select
                id="plan-charge-mode"
                onChange={(event) => {
                  setChargeMode(
                    event.currentTarget
                      .value as components["schemas"]["SingleClassSettings"]["chargeMode"],
                  );
                }}
                value={chargeMode}
              >
                <option value="CHARGE_ON_ATTENDANCE">
                  {t("admin-catalogs:plans.chargeMode.attendance")}
                </option>
                <option value="PAY_TO_BOOK">{t("admin-catalogs:plans.chargeMode.booking")}</option>
              </Select>
            </FormField>
            <FormField
              id="plan-cancel-policy"
              label={t("admin-catalogs:plans.fields.cancelPolicy")}
            >
              <Select
                id="plan-cancel-policy"
                onChange={(event) => {
                  setCancelPolicy(
                    event.currentTarget
                      .value as components["schemas"]["SingleClassSettings"]["cancelPolicy"],
                  );
                }}
                value={cancelPolicy}
              >
                <option value="REFUND">{t("admin-catalogs:plans.cancelPolicy.refund")}</option>
                <option value="CREDIT">{t("admin-catalogs:plans.cancelPolicy.credit")}</option>
                <option value="NONE">{t("admin-catalogs:plans.cancelPolicy.none")}</option>
              </Select>
            </FormField>
          </div>
        ) : null}
        <FormField id="plan-conditions" label={t("admin-catalogs:plans.fields.conditions")}>
          <Textarea
            id="plan-conditions"
            maxLength={200}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setConditions((current) => ({ ...current, [locale]: value }));
            }}
            value={conditions[locale] ?? ""}
          />
        </FormField>
        <div className="catalog-form__switches">
          <label className="catalog-switch-row">
            <span>{t("admin-catalogs:plans.fields.showOnSignup")}</span>
            <Switch
              checked={showOnSignup}
              label={t("admin-catalogs:plans.fields.showOnSignup")}
              onCheckedChange={setShowOnSignup}
            />
          </label>
          <label className="catalog-switch-row">
            <span>{t("admin-catalogs:plans.fields.showOnWeb")}</span>
            <Switch
              checked={showOnWeb}
              label={t("admin-catalogs:plans.fields.showOnWeb")}
              onCheckedChange={setShowOnWeb}
            />
          </label>
          <label className="catalog-switch-row">
            <span>{t("admin-catalogs:common.active")}</span>
            <Switch
              checked={active}
              label={t("admin-catalogs:common.active")}
              onCheckedChange={setActive}
            />
          </label>
        </div>
        {error === undefined ? null : <p role="alert">{error}</p>}
        <div className="catalog-form__actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-catalogs:common.cancel")}
          </Button>
          <Button loading={pending} loadingLabel={t("admin-catalogs:common.saving")} type="submit">
            {t("admin-catalogs:common.save")}
          </Button>
        </div>
      </form>
      {billingEnabled && item !== undefined ? (
        <section className="catalog-prices">
          <h3>{t("admin-catalogs:plans.prices")}</h3>
          {(item.prices ?? []).length === 0 ? (
            <p>{t("admin-catalogs:plans.emptyPrices")}</p>
          ) : (
            <ul>
              {(item.prices ?? []).map((price) => (
                <li key={price.id}>
                  <PriceStatus status={price.status} />
                  <strong>{compactMoney(formatMoney(price.amount.amountMinor / 100))}</strong>
                  <span>
                    {price.validFrom}
                    {price.validTo === undefined
                      ? ""
                      : t("admin-catalogs:plans.priceUntil", { date: price.validTo })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <PriceForm client={client} onSaved={onPriceSaved} plan={item} />
        </section>
      ) : null}
    </div>
  );
}

function PlanCopyCards({
  billingEnabled,
  client,
  onFeedback,
  onSaved,
  plan,
}: {
  billingEnabled: boolean;
  client: ApiClient;
  onFeedback: (message: string) => void;
  onSaved: () => void;
  plan: Plan;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [textLocale, setTextLocale] = useState(branding.defaultLocale);
  const [description, setDescription] = useState<LocalizedText>(() =>
    localized(plan.texts?.descriptionI18n, plan.texts?.description ?? "", branding.defaultLocale),
  );
  const [offerLabel, setOfferLabel] = useState<LocalizedText>(() =>
    localized(plan.texts?.offerLabelI18n, plan.texts?.offerLabel ?? "", branding.defaultLocale),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await client.PATCH("/plans/{id}", {
        body: {
          texts: {
            description,
            offerLabel,
            priceLabel: plan.texts?.priceLabelI18n ?? {},
          },
          version: plan.version,
        },
        params: { path: { id: plan.id } },
      });
      onFeedback(t("admin-catalogs:plans.textsSaved"));
      onSaved();
    } catch (reason) {
      onFeedback(messageForError(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="catalog-plan-copy-grid">
      <Card>
        <h2>{t("admin-catalogs:plans.presentationTitle", { name: plan.name })}</h2>
        <LocaleTabs locale={textLocale} locales={branding.locales} onChange={setTextLocale} />
        <FormField id="plan-description" label={t("admin-catalogs:plans.fields.description")}>
          <Textarea
            id="plan-description"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDescription((current) => ({
                ...current,
                [textLocale]: value,
              }));
            }}
            value={description[textLocale] ?? ""}
          />
        </FormField>
        <div className="catalog-plan-copy-actions">
          <FormField id="plan-offer-label" label={t("admin-catalogs:plans.fields.offerLabel")}>
            <Input
              id="plan-offer-label"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setOfferLabel((current) => ({
                  ...current,
                  [textLocale]: value,
                }));
              }}
              value={offerLabel[textLocale] ?? ""}
            />
          </FormField>
          <Button
            loading={saving}
            loadingLabel={t("admin-catalogs:common.saving")}
            onClick={() => void save()}
          >
            {t("admin-catalogs:plans.saveTexts")}
          </Button>
        </div>
      </Card>
      <Card>
        <h2>{t("admin-catalogs:plans.previewTitle")}</h2>
        <div className="catalog-plan-preview">
          <div className="catalog-plan-preview__title">
            <strong>{plan.name}</strong>
            {billingEnabled ? <PlanPrice plan={plan} /> : null}
          </div>
          <p>{description[textLocale] ?? ""}</p>
          <p>{plan.conditions}</p>
          <p>{offerLabel[textLocale] ?? ""}</p>
        </div>
        <p className="catalog-plan-footnote">{t("admin-catalogs:plans.validityNote")}</p>
      </Card>
    </div>
  );
}

export function PlansPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation("admin-catalogs");
  const load = useCallback(async () => {
    const result = await client.GET("/plans", { params: { query: { includeInactive: true } } });
    if (result.data === undefined) {
      throw new TypeError("Plan response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const data = useCatalogData(load, client);
  const [entryFeeMinor, setEntryFeeMinor] = useState(0);
  const [editing, setEditing] = useState<{ item?: Plan }>();
  const [selectedId, setSelectedId] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const billingEnabled = branding.modules.includes("BILLING");
  const selectedPlan = useMemo(
    () => data.items.find((plan) => plan.id === selectedId) ?? data.items[0],
    [data.items, selectedId],
  );

  useEffect(() => {
    if (!billingEnabled) {
      return undefined;
    }
    let current = true;
    void client
      .GET("/parameters/{key}", {
        params: { path: { key: "billing.entryFeePerDog" } },
      })
      .then((result) => {
        const value = result.data?.value;
        if (
          current &&
          typeof value === "object" &&
          value !== null &&
          "amountMinor" in value &&
          typeof value.amountMinor === "number"
        ) {
          setEntryFeeMinor(value.amountMinor);
        }
      });
    return () => {
      current = false;
    };
  }, [billingEnabled, client]);

  if (data.error !== undefined) {
    return <LoadFailure onRetry={data.reload} />;
  }

  return (
    <section className="catalog-page catalog-page--plans">
      <CatalogPageHeader
        action={
          <div className="catalog-page__heading-actions">
            {billingEnabled ? (
              <a className="catalog-page__parameter-link" href="/parametres">
                {t("admin-catalogs:plans.entryFeeSummary", {
                  amount: compactMoney(formatMoney(entryFeeMinor / 100)),
                })}
              </a>
            ) : null}
            <Button
              onClick={() => {
                setEditing({});
              }}
            >
              <Icon aria-hidden="true" name="plus" />
              {t("admin-catalogs:plans.new")}
            </Button>
          </div>
        }
        title={t("admin-catalogs:plans.title")}
      />
      <CatalogFeedback
        message={feedback}
        onDismiss={() => {
          setFeedback(undefined);
        }}
        tone={feedback === t("admin-catalogs:plans.textsSaved") ? "success" : "danger"}
      />
      <CatalogTable
        caption={t("admin-catalogs:plans.caption")}
        columns={[
          {
            header: t("admin-catalogs:plans.columns.name"),
            key: "name",
            render: (plan) => <strong>{plan.name}</strong>,
          },
          {
            header: t("admin-catalogs:plans.columns.type"),
            key: "type",
            render: (plan) => <PlanType plan={plan} />,
          },
          ...(billingEnabled
            ? [
                {
                  header: t("admin-catalogs:plans.columns.price"),
                  key: "price",
                  render: (plan: Plan) => <PlanPrice plan={plan} />,
                },
              ]
            : []),
          {
            header: t("admin-catalogs:plans.columns.conditions"),
            key: "conditions",
            render: (plan) => plan.conditions ?? "",
          },
          {
            header: t("admin-catalogs:plans.columns.active"),
            key: "active",
            render: (plan) => <YesNoBadge value={plan.active} />,
          },
        ]}
        empty={t("admin-catalogs:plans.empty")}
        loading={data.loading}
        onActivate={(plan) => {
          setSelectedId(plan.id);
        }}
        onEdit={(plan) => {
          setEditing({ item: plan });
        }}
        rows={data.items}
      />
      {selectedPlan === undefined ? null : (
        <PlanCopyCards
          key={`${selectedPlan.id}:${String(selectedPlan.version)}`}
          billingEnabled={billingEnabled}
          client={client}
          onFeedback={setFeedback}
          onSaved={data.reload}
          plan={selectedPlan}
        />
      )}
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={
          editing?.item === undefined
            ? t("admin-catalogs:plans.createTitle")
            : t("admin-catalogs:plans.editTitle", { name: editing.item.name })
        }
      >
        {editing === undefined ? null : (
          <PlanForm
            client={client}
            entryFeeMinor={entryFeeMinor}
            item={editing.item}
            onClose={() => {
              setEditing(undefined);
            }}
            onPriceSaved={() => {
              setEditing(undefined);
              data.reload();
            }}
            onSaved={data.reload}
          />
        )}
      </Modal>
    </section>
  );
}
