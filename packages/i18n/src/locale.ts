import { productLocales, type Locale } from "./types";

export const LOCALE_STORAGE_KEY = "agilityhub.locale";

export interface LocaleResolutionOptions {
  browserLanguages?: readonly string[] | undefined;
  clubLocales: readonly string[];
  defaultLocale: string;
  storedLocale?: null | string | undefined;
  userLocale?: null | string | undefined;
}

function productLocale(value: null | string | undefined): Locale | undefined {
  const base = value?.trim().toLowerCase().split("-")[0];
  return productLocales.find((locale) => locale === base);
}

export function normalizeLocale(value: null | string | undefined, fallback: Locale = "ca"): Locale {
  return productLocale(value) ?? fallback;
}

export function resolveLocale({
  browserLanguages = [],
  clubLocales,
  defaultLocale,
  storedLocale,
  userLocale,
}: LocaleResolutionOptions): Locale {
  const enabled = new Set(clubLocales.map((locale) => productLocale(locale)).filter(Boolean));
  const enabledCandidate = (value: null | string | undefined): Locale | undefined => {
    const locale = productLocale(value);
    return locale !== undefined && enabled.has(locale) ? locale : undefined;
  };

  return (
    enabledCandidate(userLocale) ??
    enabledCandidate(storedLocale) ??
    browserLanguages.map((locale) => enabledCandidate(locale)).find(Boolean) ??
    productLocale(defaultLocale) ??
    enabled.values().next().value ??
    "ca"
  );
}

export function readStoredLocale(storage?: Pick<Storage, "getItem">): string | undefined {
  if (storage === undefined) {
    return undefined;
  }
  try {
    return storage.getItem(LOCALE_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
