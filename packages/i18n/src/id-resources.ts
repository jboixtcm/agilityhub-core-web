import type { BackendModule, ReadCallback } from "i18next";

import { productLocales, type Locale } from "./types";

type IdNamespace = "common" | "errors" | "id";
type Messages = Record<string, unknown>;
type ResourceLoader = () => Promise<{ default: Messages }>;

const idNamespaces: readonly IdNamespace[] = ["common", "errors", "id"];
const idLoaders = {
  ca: {
    common: () => import("./locales/ca/common.json"),
    errors: () => import("./locales/ca/errors.json"),
    id: () => import("./locales/ca/id.json"),
  },
  en: {
    common: () => import("./locales/en/common.json"),
    errors: () => import("./locales/en/errors.json"),
    id: () => import("./locales/en/id.json"),
  },
  es: {
    common: () => import("./locales/es/common.json"),
    errors: () => import("./locales/es/errors.json"),
    id: () => import("./locales/es/id.json"),
  },
} as const satisfies Record<Locale, Record<IdNamespace, ResourceLoader>>;

function isLocale(value: string): value is Locale {
  return productLocales.includes(value as Locale);
}

function isIdNamespace(value: string): value is IdNamespace {
  return idNamespaces.includes(value as IdNamespace);
}

export const idNamespaceBackend: BackendModule = {
  type: "backend",
  init: () => undefined,
  read(language: string, namespace: string, callback: ReadCallback): void {
    const baseLanguage = language.toLowerCase().split("-")[0] ?? language;
    if (!isLocale(baseLanguage) || !isIdNamespace(namespace)) {
      callback(new Error(`Unsupported ID i18n resource: ${language}/${namespace}`), false);
      return;
    }

    void idLoaders[baseLanguage][namespace]().then(
      ({ default: messages }) => {
        callback(null, messages);
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), false);
      },
    );
  },
};
