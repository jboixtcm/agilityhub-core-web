export const productLocales = ["ca", "es", "en"] as const;

export type Locale = (typeof productLocales)[number];

export const namespaces = [
  "common",
  "auth",
  "admin-audit",
  "admin-catalogs",
  "admin-census",
  "admin-settings",
  "census",
  "id",
  "shell",
  "errors",
] as const;

export type Namespace = (typeof namespaces)[number];
