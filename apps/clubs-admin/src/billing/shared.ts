import {
  apiFieldErrors,
  isApiError,
  isInProgress,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";
import { fmtMoney, isPlainDate, normalizeLocale, type Locale } from "@agilityhub/i18n";
import type { Tone } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type BillingPeriod = components["schemas"]["BillingPeriod"];
export type BillingRun = components["schemas"]["BillingRun"];
export type Invoice = components["schemas"]["Invoice"];
export type InvoiceListItem = components["schemas"]["InvoiceListItem"];
export type InvoiceStatus = components["schemas"]["InvoiceStatus"];
export type ManualChannel = components["schemas"]["ManualChannel"];
export type Money = components["schemas"]["Money"];
export type PaymentMethodType = components["schemas"]["PaymentMethodType"];
export type Remittance = components["schemas"]["Remittance"];
export type RemittanceListItem = components["schemas"]["RemittanceListItem"];
export type RollbackBlocker = components["schemas"]["RollbackBlocker"];

export type BillingProvider = "MANUAL" | "SEPA_XML" | "STRIPE";

export const MANUAL_CHANNELS: readonly ManualChannel[] = ["CASH", "TRANSFER", "BIZUM"];

/** `YYYY-MM` of a club-local `YYYY-MM-DD`. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function isPeriod(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/u.test(value);
}

/** The month `months` after `period` (a calendar step, never a time-zone shift). */
export function shiftPeriod(period: string, months: number): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The fraction digits of a currency (EUR 2): `Money.amountMinor` is in those units. */
function fractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { currency, style: "currency" }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/**
 * A `Money` as the api sends it, through `fmtMoney(locale, currency)` (R-12-09, R-12-30): the front
 * never adds, rounds or converts an amount. `compact` drops zero cents, as the mockup's KPIs
 * («6.480 €», «20 € el 1r mes»).
 */
export function formatMoney(money: Money, locale: Locale, compact = false): string {
  const value = money.amountMinor / 10 ** fractionDigits(money.currency);
  const text = fmtMoney(value, locale, money.currency);
  return compact ? text.replace(/([,.]0+)(?=\s|$)/u, "") : text;
}

/** An amount the admin typed («-30,5») in the currency's minor units, or `undefined`. */
export function minorUnits(text: string, currency: string): number | undefined {
  const normalized = text.trim().replace(/\s/gu, "").replace(",", ".");
  if (normalized === "" || !/^-?\d+(\.\d+)?$/u.test(normalized)) return undefined;
  const digits = fractionDigits(currency);
  const [whole = "0", fraction = ""] = normalized.replace("-", "").split(".");
  if (fraction.length > digits) return undefined;
  const value = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  return normalized.startsWith("-") ? -value : value;
}

export function useBillingLocale(): Locale {
  const { i18n } = useTranslation();
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language, "ca");
}

/** The club-local day (`YYYY-MM-DD`), never the device's (default `paidAt`, `at`, `submittedAt`). */
export function clubToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}

/**
 * D6's «Estat» (S12 §2): the label and tone of a receipt, from the api's `status`, method and
 * `refundedTotal` — never a status of its own.
 */
export function invoiceStatusView(
  item: Pick<
    InvoiceListItem,
    "paymentMethodType" | "refundedTotal" | "rolledBack" | "status" | "total"
  >,
): { key: string; tone: Tone } {
  switch (item.status) {
    case "PENDING":
      return item.paymentMethodType === "MANUAL"
        ? { key: "admin-billing:status.pendingManual", tone: "warning" }
        : { key: "enums:invoiceStatus.PENDING", tone: "warning" };
    case "COLLECTING":
      return { key: "enums:invoiceStatus.COLLECTING", tone: "neutral" };
    case "PAID":
      return item.refundedTotal !== undefined &&
        item.total !== undefined &&
        item.refundedTotal.amountMinor > 0 &&
        item.refundedTotal.amountMinor === item.total.amountMinor
        ? { key: "admin-billing:status.refunded", tone: "neutral" }
        : { key: "enums:invoiceStatus.PAID", tone: "success" };
    case "FAILED":
      return item.paymentMethodType === "CARD"
        ? { key: "admin-billing:status.failedCard", tone: "danger" }
        : { key: "admin-billing:status.failedManual", tone: "danger" };
    case "CANCELLED":
      return item.rolledBack === true
        ? { key: "admin-billing:status.rolledBack", tone: "neutral" }
        : { key: "enums:invoiceStatus.CANCELLED", tone: "neutral" };
    default:
      return { key: "enums:invoiceStatus.PENDING", tone: "neutral" };
  }
}

/** R-12-16 and E87: «Marca cobrat» applies to PENDING and FAILED receipts paid by hand or SEPA. */
export function isPayable(item: Pick<InvoiceListItem, "paymentMethodType" | "status">): boolean {
  return (
    (item.status === "PENDING" || item.status === "FAILED") && item.paymentMethodType !== "CARD"
  );
}

export function errorDetails(error: unknown): Record<string, unknown> {
  return isApiError(error) && typeof error.details === "object" && error.details !== null
    ? (error.details as Record<string, unknown>)
    : {};
}

export function errorFields(error: unknown): string[] {
  return apiFieldErrors(error).map((entry) => entry.field);
}

/**
 * An api error's text by its `code` (CATALEG_ERRORS, never the api's `message`); a keyed write still
 * running reads `common:inProgress` (CONVENCIONS_API §7, E80).
 */
export function useBillingErrorMessage() {
  const { t } = useTranslation(["admin-billing", "errors", "common"]);
  return useCallback(
    (error: unknown) =>
      isInProgress(error)
        ? t("common:inProgress")
        : isApiError(error) && error.status !== 0 && error.code !== "NETWORK"
          ? t(`errors:${error.code}`, { defaultValue: t("admin-billing:errors.generic") })
          : t("admin-billing:errors.generic"),
    [t],
  );
}

/**
 * The payment providers the club has enabled (`GET /club`, `paymentProviders`, as E2 reads it):
 * `undefined` while it is read, `null` when the read failed.
 */
export function useClubProviders(client: ApiClient): readonly BillingProvider[] | null | undefined {
  const [providers, setProviders] = useState<readonly BillingProvider[] | null>();
  useEffect(() => {
    let current = true;
    void client.GET("/club", {}).then(
      (result) => {
        if (!current) return;
        const configured = result.data?.paymentProviders ?? {};
        setProviders(
          (["SEPA_XML", "STRIPE", "MANUAL"] as const).filter(
            (provider) => configured[provider]?.enabled === true,
          ),
        );
      },
      () => {
        if (current) setProviders(null);
      },
    );
    return () => {
      current = false;
    };
  }, [client]);
  return providers;
}

/**
 * S12 §2 + §13-13: button 2's label by the club's providers — the mockup's with SEPA_XML, «… I COBRA
 * LES TARGETES» with cards and no SEPA, «2 · GENERA ELS REBUTS» with cash only.
 */
export function generateLabel(
  t: ReturnType<typeof useTranslation>["t"],
  providers: readonly BillingProvider[],
): string {
  if (providers.includes("SEPA_XML")) return t("admin-billing:actions.generateSepa");
  if (providers.includes("STRIPE")) return t("admin-billing:actions.generateCards");
  return t("admin-billing:actions.generateOnly");
}

/** A plain date the api sent, formatted (or the raw text when it is not one). */
export function plainDateOr(value: string, format: (value: string) => string): string {
  return isPlainDate(value) ? format(value) : value;
}
