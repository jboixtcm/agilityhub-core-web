export const productLocales = ["ca", "es", "en"] as const;

export type Locale = (typeof productLocales)[number];

export const namespaces = [
  "common",
  "auth",
  "admin-census",
  "census",
  "id",
  "shell",
  "errors",
] as const;

export type Namespace = (typeof namespaces)[number];
