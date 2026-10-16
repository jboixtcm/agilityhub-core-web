import { createLoaderBackend, type LoaderTable } from "./backend";

type IdNamespace = "common" | "errors" | "id";

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
} as const satisfies LoaderTable<IdNamespace>;

export const idNamespaceBackend = /* @__PURE__ */ createLoaderBackend(
  idNamespaces,
  (locale, namespace) => idLoaders[locale][namespace](),
  "ID i18n",
);
