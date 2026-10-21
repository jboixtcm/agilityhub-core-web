import type { Branding } from "@agilityhub/ui";
import { createInstance, type BackendModule, type i18n } from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";

import { readStoredLocale, resolveLocale } from "./locale";
import { productLocales, type Namespace } from "./types";

export interface CreateI18nOptions {
  branding: Pick<Branding, "defaultLocale" | "locales">;
  browserLanguages?: readonly string[] | undefined;
  initialNamespaces?: readonly Namespace[] | undefined;
  storage?: Pick<Storage, "getItem"> | undefined;
  storedLocale?: null | string | undefined;
  userLocale?: null | string | undefined;
}

export async function createI18nWithBackend(
  {
    branding,
    browserLanguages = typeof navigator === "undefined" ? [] : navigator.languages,
    initialNamespaces = ["common"],
    storage = typeof localStorage === "undefined" ? undefined : localStorage,
    storedLocale,
    userLocale,
  }: CreateI18nOptions,
  backend: BackendModule,
): Promise<i18n> {
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
    .use(backend)
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
  followDocumentLanguage(instance);

  return instance;
}

/**
 * AGENTS rule 6, CONVENCIONS_I18N §1 (E11-W06 W6): `<html lang>` is the language the app shows,
 * from the start and after every change (the bootstraps' `lang="ca"` is only the first paint).
 */
function followDocumentLanguage(instance: i18n): void {
  if (typeof document === "undefined") {
    return;
  }
  const apply = (language: string | undefined) => {
    if (language !== undefined && language !== "") {
      document.documentElement.lang = language;
    }
  };
  apply(instance.resolvedLanguage ?? instance.language);
  instance.on("languageChanged", (language: string) => {
    apply(instance.resolvedLanguage ?? language);
  });
}
