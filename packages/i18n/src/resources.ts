import { createLoaderBackend, type LoaderTable, type Messages } from "./backend";
import { clubsLoaders } from "./clubs-resources";
import { namespaces, type Locale, type Namespace } from "./types";

type BackofficeNamespace = Exclude<Namespace, keyof (typeof clubsLoaders)["ca"]>;

/**
 * The namespaces only the backoffice (`apps/clubs-admin`) and the ID pages read; the full table is
 * the students' one plus these. `apps/clubs` boots with `@agilityhub/i18n/clubs`, which never
 * imports this module, so none of these locale chunks reaches its build.
 */
const backofficeLoaders = {
  ca: {
    "admin-activities": () => import("./locales/ca/admin-activities.json"),
    "admin-audit": () => import("./locales/ca/admin-audit.json"),
    "admin-billing": () => import("./locales/ca/admin-billing.json"),
    "admin-catalogs": () => import("./locales/ca/admin-catalogs.json"),
    "admin-census": () => import("./locales/ca/admin-census.json"),
    "admin-courses": () => import("./locales/ca/admin-courses.json"),
    "admin-dashboard": () => import("./locales/ca/admin-dashboard.json"),
    "admin-messaging": () => import("./locales/ca/admin-messaging.json"),
    "admin-scheduling": () => import("./locales/ca/admin-scheduling.json"),
    "admin-settings": () => import("./locales/ca/admin-settings.json"),
    "admin-training": () => import("./locales/ca/admin-training.json"),
    console: () => import("./locales/ca/console.json"),
    id: () => import("./locales/ca/id.json"),
  },
  en: {
    "admin-activities": () => import("./locales/en/admin-activities.json"),
    "admin-audit": () => import("./locales/en/admin-audit.json"),
    "admin-billing": () => import("./locales/en/admin-billing.json"),
    "admin-catalogs": () => import("./locales/en/admin-catalogs.json"),
    "admin-census": () => import("./locales/en/admin-census.json"),
    "admin-courses": () => import("./locales/en/admin-courses.json"),
    "admin-dashboard": () => import("./locales/en/admin-dashboard.json"),
    "admin-messaging": () => import("./locales/en/admin-messaging.json"),
    "admin-scheduling": () => import("./locales/en/admin-scheduling.json"),
    "admin-settings": () => import("./locales/en/admin-settings.json"),
    "admin-training": () => import("./locales/en/admin-training.json"),
    console: () => import("./locales/en/console.json"),
    id: () => import("./locales/en/id.json"),
  },
  es: {
    "admin-activities": () => import("./locales/es/admin-activities.json"),
    "admin-audit": () => import("./locales/es/admin-audit.json"),
    "admin-billing": () => import("./locales/es/admin-billing.json"),
    "admin-catalogs": () => import("./locales/es/admin-catalogs.json"),
    "admin-census": () => import("./locales/es/admin-census.json"),
    "admin-courses": () => import("./locales/es/admin-courses.json"),
    "admin-dashboard": () => import("./locales/es/admin-dashboard.json"),
    "admin-messaging": () => import("./locales/es/admin-messaging.json"),
    "admin-scheduling": () => import("./locales/es/admin-scheduling.json"),
    "admin-settings": () => import("./locales/es/admin-settings.json"),
    "admin-training": () => import("./locales/es/admin-training.json"),
    console: () => import("./locales/es/console.json"),
    id: () => import("./locales/es/id.json"),
  },
} as const satisfies LoaderTable<BackofficeNamespace>;

function isBackofficeNamespace(namespace: Namespace): namespace is BackofficeNamespace {
  return namespace in backofficeLoaders.ca;
}

/** The full table, looked up per call (no module-level merge: see `createLoaderBackend`). */
function loadModule(locale: Locale, namespace: Namespace): Promise<{ default: Messages }> {
  return isBackofficeNamespace(namespace)
    ? backofficeLoaders[locale][namespace]()
    : clubsLoaders[locale][namespace]();
}

export async function loadNamespace(locale: Locale, namespace: Namespace): Promise<Messages> {
  return (await loadModule(locale, namespace)).default;
}

export const namespaceBackend = /* @__PURE__ */ createLoaderBackend(namespaces, loadModule);
