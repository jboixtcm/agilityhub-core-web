import type { Branding } from "@agilityhub/ui";
import { createInstance, type i18n } from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";

import { readStoredLocale, resolveLocale } from "./locale";
import { namespaceBackend } from "./resources";
import { productLocales, type Namespace } from "./types";

export interface CreateI18nOptions {
  branding: Pick<Branding, "defaultLocale" | "locales">;
  browserLanguages?: readonly string[] | undefined;
  initialNamespaces?: readonly Namespace[] | undefined;
  storage?: Pick<Storage, "getItem"> | undefined;
  storedLocale?: null | string | undefined;
  userLocale?: null | string | undefined;
}

export async function createI18n({
  branding,
  browserLanguages = typeof navigator === "undefined" ? [] : navigator.languages,
  initialNamespaces = ["common"],
  storage = typeof localStorage === "undefined" ? undefined : localStorage,
  storedLocale,
  userLocale,
}: CreateI18nOptions): Promise<i18n> {
  const locale = resolveLocale({
    browserLanguages,
    clubLocales: branding.locales,
    defaultLocale: branding.defaultLocale,
    storedLocale: storedLocale ?? readStoredLocale(storage),
    userLocale,
  });
  const instance = createInstance();

  await instance
    .use(ICU)
    .use(namespaceBackend)
    .use(initReactI18next)
    .init({
      defaultNS: "common",
      fallbackLng: locale,
      interpolation: { escapeValue: false },
      load: "languageOnly",
      lng: locale,
      ns: [...initialNamespaces],
      supportedLngs: [...productLocales],
    });

  return instance;
}
