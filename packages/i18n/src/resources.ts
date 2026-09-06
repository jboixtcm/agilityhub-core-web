import type { BackendModule, ReadCallback } from "i18next";

import { namespaces, productLocales, type Locale, type Namespace } from "./types";

type Messages = Record<string, unknown>;
type ResourceLoader = () => Promise<{ default: Messages }>;

const loaders = {
  ca: {
    auth: () => import("./locales/ca/auth.json"),
    common: () => import("./locales/ca/common.json"),
    errors: () => import("./locales/ca/errors.json"),
    shell: () => import("./locales/ca/shell.json"),
  },
  en: {
    auth: () => import("./locales/en/auth.json"),
    common: () => import("./locales/en/common.json"),
    errors: () => import("./locales/en/errors.json"),
    shell: () => import("./locales/en/shell.json"),
  },
  es: {
    auth: () => import("./locales/es/auth.json"),
    common: () => import("./locales/es/common.json"),
    errors: () => import("./locales/es/errors.json"),
    shell: () => import("./locales/es/shell.json"),
  },
} as const satisfies Record<Locale, Record<Namespace, ResourceLoader>>;

function isLocale(value: string): value is Locale {
  return productLocales.includes(value as Locale);
}

function isNamespace(value: string): value is Namespace {
  return namespaces.includes(value as Namespace);
}

export async function loadNamespace(locale: Locale, namespace: Namespace): Promise<Messages> {
  return (await loaders[locale][namespace]()).default;
}

export const namespaceBackend: BackendModule = {
  type: "backend",
  init: () => undefined,
  read(language: string, namespace: string, callback: ReadCallback): void {
    const baseLanguage = language.toLowerCase().split("-")[0] ?? language;
    if (!isLocale(baseLanguage) || !isNamespace(namespace)) {
      callback(new Error(`Unsupported i18n resource: ${language}/${namespace}`), false);
      return;
    }

    void loadNamespace(baseLanguage, namespace).then(
      (messages) => {
        callback(null, messages);
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), false);
      },
    );
  },
};
