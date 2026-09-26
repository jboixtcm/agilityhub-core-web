export const productLocales = ["ca", "es", "en"] as const;

export type Locale = (typeof productLocales)[number];

export const namespaces = [
  "common",
  "auth",
  "activities",
  "admin-activities",
  "admin-audit",
  "admin-catalogs",
  "admin-census",
  "admin-dashboard",
  "admin-scheduling",
  "admin-settings",
  "booking",
  "census",
  "enums",
  "home",
  "id",
  "instructor",
  "shell",
  "signup",
  "errors",
] as const;

export type Namespace = (typeof namespaces)[number];
