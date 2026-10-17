import { createLoaderBackend, type LoaderTable } from "./backend";
import caCommon from "./locales/ca/common.json";
import caShell from "./locales/ca/shell.json";
import enCommon from "./locales/en/common.json";
import enShell from "./locales/en/shell.json";
import esCommon from "./locales/es/common.json";
import esShell from "./locales/es/shell.json";
import type { Namespace } from "./types";

/**
 * The namespaces the students' app (`apps/clubs`) renders. No `admin-*`, `console` nor `id`: those
 * are the backoffice's and the ID pages', and a loader here would make Vite emit their locale
 * chunks into the students' build (point 12 of E9-W03: «clubs all JavaScript» stays at 420 kB).
 */
export const clubsNamespaces = [
  "common",
  "auth",
  "activities",
  "booking",
  "billing",
  "census",
  "courses",
  "enums",
  "errors",
  "history",
  "home",
  "inactivity",
  "instructor",
  "leave",
  "notifications",
  "shell",
  "signup",
  "training",
] as const satisfies readonly Namespace[];

export type ClubsNamespace = (typeof clubsNamespaces)[number];

/**
 * `common` and `shell` are in the first load already, every locale of them (`catalog.ts`, read by
 * `format.ts`): their loaders hand over those modules. A dynamic import of the same files made the
 * bundler emit six chunks that `index.html` preloads (E11-W02 step 6, TTI).
 */
export const clubsLoaders = {
  ca: {
    activities: () => import("./locales/ca/activities.json"),
    auth: () => import("./locales/ca/auth.json"),
    billing: () => import("./locales/ca/billing.json"),
    booking: () => import("./locales/ca/booking.json"),
    census: () => import("./locales/ca/census.json"),
    common: () => Promise.resolve({ default: caCommon }),
    courses: () => import("./locales/ca/courses.json"),
    enums: () => import("./locales/ca/enums.json"),
    errors: () => import("./locales/ca/errors.json"),
    history: () => import("./locales/ca/history.json"),
    home: () => import("./locales/ca/home.json"),
    inactivity: () => import("./locales/ca/inactivity.json"),
    instructor: () => import("./locales/ca/instructor.json"),
    leave: () => import("./locales/ca/leave.json"),
    notifications: () => import("./locales/ca/notifications.json"),
    shell: () => Promise.resolve({ default: caShell }),
    signup: () => import("./locales/ca/signup.json"),
    training: () => import("./locales/ca/training.json"),
  },
  en: {
    activities: () => import("./locales/en/activities.json"),
    auth: () => import("./locales/en/auth.json"),
    billing: () => import("./locales/en/billing.json"),
    booking: () => import("./locales/en/booking.json"),
    census: () => import("./locales/en/census.json"),
    common: () => Promise.resolve({ default: enCommon }),
    courses: () => import("./locales/en/courses.json"),
    enums: () => import("./locales/en/enums.json"),
    errors: () => import("./locales/en/errors.json"),
    history: () => import("./locales/en/history.json"),
    home: () => import("./locales/en/home.json"),
    inactivity: () => import("./locales/en/inactivity.json"),
    instructor: () => import("./locales/en/instructor.json"),
    leave: () => import("./locales/en/leave.json"),
    notifications: () => import("./locales/en/notifications.json"),
    shell: () => Promise.resolve({ default: enShell }),
    signup: () => import("./locales/en/signup.json"),
    training: () => import("./locales/en/training.json"),
  },
  es: {
    activities: () => import("./locales/es/activities.json"),
    auth: () => import("./locales/es/auth.json"),
    billing: () => import("./locales/es/billing.json"),
    booking: () => import("./locales/es/booking.json"),
    census: () => import("./locales/es/census.json"),
    common: () => Promise.resolve({ default: esCommon }),
    courses: () => import("./locales/es/courses.json"),
    enums: () => import("./locales/es/enums.json"),
    errors: () => import("./locales/es/errors.json"),
    history: () => import("./locales/es/history.json"),
    home: () => import("./locales/es/home.json"),
    inactivity: () => import("./locales/es/inactivity.json"),
    instructor: () => import("./locales/es/instructor.json"),
    leave: () => import("./locales/es/leave.json"),
    notifications: () => import("./locales/es/notifications.json"),
    shell: () => Promise.resolve({ default: esShell }),
    signup: () => import("./locales/es/signup.json"),
    training: () => import("./locales/es/training.json"),
  },
} as const satisfies LoaderTable<ClubsNamespace>;

export const clubsNamespaceBackend = /* @__PURE__ */ createLoaderBackend(
  clubsNamespaces,
  (locale, namespace) => clubsLoaders[locale][namespace](),
  "students' app i18n",
);
