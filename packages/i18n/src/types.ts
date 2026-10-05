export const productLocales = ["ca", "es", "en"] as const;

export type Locale = (typeof productLocales)[number];

export const namespaces = [
  "common",
  "auth",
  "activities",
  "admin-activities",
  "admin-audit",
  "admin-billing",
  "admin-catalogs",
  "admin-census",
  "admin-dashboard",
  "admin-messaging",
  "admin-scheduling",
  "admin-settings",
  "admin-training",
  "booking",
  "billing",
  "census",
  "enums",
  "history",
  "home",
  "inactivity",
  "id",
  "instructor",
  "notifications",
  "leave",
  "shell",
  "signup",
  "training",
  "errors",
] as const;

export type Namespace = (typeof namespaces)[number];
