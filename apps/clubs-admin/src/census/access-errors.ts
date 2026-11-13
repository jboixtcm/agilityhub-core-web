import { isApiError } from "@agilityhub/api-client";
import type { useTranslation } from "react-i18next";

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

/**
 * The seconds a `429 RATE_LIMITED` asks to wait: the `Retry-After` header, else the api's
 * `details.retryAfter` (the magic-link buckets of D10's welcome and login e-mail change).
 */
function retryAfterSeconds(error: unknown): number | undefined {
  if (!isApiError(error, "RATE_LIMITED")) return undefined;
  if (error.retryAfter !== undefined && error.retryAfter > 0) return error.retryAfter;
  const details = error.details;
  if (typeof details !== "object" || details === null) return undefined;
  const value: unknown = Reflect.get(details, "retryAfter");
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The failure of a D10 request that mails the member a link (the welcome, the login e-mail
 * change): a refused rate says in how many minutes to try again; anything else reads its code.
 */
export function accessRequestError(error: unknown, t: TranslationFunction): string {
  const seconds = retryAfterSeconds(error);
  if (seconds !== undefined) {
    return t("admin-census:member.rateLimited", { minutes: Math.ceil(seconds / 60) });
  }
  return isApiError(error)
    ? t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") })
    : t("admin-census:common.genericError");
}
