import type { i18n } from "i18next";

import { clubsLoaders, clubsNamespaceBackend, type ClubsNamespace } from "./clubs-resources";
import { readStoredLocale, resolveLocale } from "./locale";
import { createI18nWithBackend, type CreateI18nOptions } from "./setup-base";
import { productLocales } from "./types";

export { clubsNamespaces, type ClubsNamespace } from "./clubs-resources";

/** The students' app's i18n: only its own namespaces load (no `admin-*`, `console`, `id`). */
export function createClubsI18n(
  options: Omit<CreateI18nOptions, "initialNamespaces"> & {
    initialNamespaces?: readonly ClubsNamespace[] | undefined;
  },
): Promise<i18n> {
  return createI18nWithBackend(options, clubsNamespaceBackend);
}

/**
 * E11-W02 step 6 (TTI): starts loading the boot's namespaces in the locale the boot is going to
 * resolve — with the cached branding when there is one, else the product's locales with Catalan —
 * while `/branding` is still on its way; `createClubsI18n`'s loader then finds them in the module
 * cache. A wrong guess only costs those few kilobytes.
 */
export function preloadClubsI18n(
  namespaces: readonly ClubsNamespace[],
  {
    branding = { defaultLocale: "ca", locales: [...productLocales] },
    browserLanguages = typeof navigator === "undefined" ? [] : navigator.languages,
    storage = typeof localStorage === "undefined" ? undefined : localStorage,
  }: Partial<Pick<CreateI18nOptions, "branding" | "browserLanguages" | "storage">> = {},
): void {
  const locale = resolveLocale({
    browserLanguages,
    clubLocales: branding.locales,
    defaultLocale: branding.defaultLocale,
    storedLocale: readStoredLocale(storage),
  });
  for (const namespace of namespaces) {
    void clubsLoaders[locale][namespace]().catch(() => undefined);
  }
}
