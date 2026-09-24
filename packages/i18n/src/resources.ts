import type { BackendModule, ReadCallback } from "i18next";

import { namespaces, productLocales, type Locale, type Namespace } from "./types";

type Messages = Record<string, unknown>;
type ResourceLoader = () => Promise<{ default: Messages }>;

const loaders = {
  ca: {
    activities: () => import("./locales/ca/activities.json"),
    "admin-activities": () => import("./locales/ca/admin-activities.json"),
    "admin-audit": () => import("./locales/ca/admin-audit.json"),
    "admin-catalogs": () => import("./locales/ca/admin-catalogs.json"),
    "admin-census": () => import("./locales/ca/admin-census.json"),
    "admin-dashboard": () => import("./locales/ca/admin-dashboard.json"),
    "admin-scheduling": () => import("./locales/ca/admin-scheduling.json"),
    "admin-settings": () => import("./locales/ca/admin-settings.json"),
    auth: () => import("./locales/ca/auth.json"),
    census: () => import("./locales/ca/census.json"),
    common: () => import("./locales/ca/common.json"),
    enums: () => import("./locales/ca/enums.json"),
    errors: () => import("./locales/ca/errors.json"),
    home: () => import("./locales/ca/home.json"),
    id: () => import("./locales/ca/id.json"),
    instructor: () => import("./locales/ca/instructor.json"),
    shell: () => import("./locales/ca/shell.json"),
    signup: () => import("./locales/ca/signup.json"),
  },
  en: {
    activities: () => import("./locales/en/activities.json"),
    "admin-activities": () => import("./locales/en/admin-activities.json"),
    "admin-audit": () => import("./locales/en/admin-audit.json"),
    "admin-catalogs": () => import("./locales/en/admin-catalogs.json"),
    "admin-census": () => import("./locales/en/admin-census.json"),
    "admin-dashboard": () => import("./locales/en/admin-dashboard.json"),
    "admin-scheduling": () => import("./locales/en/admin-scheduling.json"),
    "admin-settings": () => import("./locales/en/admin-settings.json"),
    auth: () => import("./locales/en/auth.json"),
    census: () => import("./locales/en/census.json"),
    common: () => import("./locales/en/common.json"),
    enums: () => import("./locales/en/enums.json"),
    errors: () => import("./locales/en/errors.json"),
    home: () => import("./locales/en/home.json"),
    id: () => import("./locales/en/id.json"),
    instructor: () => import("./locales/en/instructor.json"),
    shell: () => import("./locales/en/shell.json"),
    signup: () => import("./locales/en/signup.json"),
  },
  es: {
    activities: () => import("./locales/es/activities.json"),
    "admin-activities": () => import("./locales/es/admin-activities.json"),
    "admin-audit": () => import("./locales/es/admin-audit.json"),
    "admin-catalogs": () => import("./locales/es/admin-catalogs.json"),
    "admin-census": () => import("./locales/es/admin-census.json"),
    "admin-dashboard": () => import("./locales/es/admin-dashboard.json"),
    "admin-scheduling": () => import("./locales/es/admin-scheduling.json"),
    "admin-settings": () => import("./locales/es/admin-settings.json"),
    auth: () => import("./locales/es/auth.json"),
    census: () => import("./locales/es/census.json"),
    common: () => import("./locales/es/common.json"),
    enums: () => import("./locales/es/enums.json"),
    errors: () => import("./locales/es/errors.json"),
    home: () => import("./locales/es/home.json"),
    id: () => import("./locales/es/id.json"),
    instructor: () => import("./locales/es/instructor.json"),
    shell: () => import("./locales/es/shell.json"),
    signup: () => import("./locales/es/signup.json"),
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
