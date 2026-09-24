import { describe, expect, it } from "vitest";

import caActivities from "./locales/ca/activities.json";
import caAdminActivities from "./locales/ca/admin-activities.json";
import caEnums from "./locales/ca/enums.json";
import enActivities from "./locales/en/activities.json";
import enAdminActivities from "./locales/en/admin-activities.json";
import enEnums from "./locales/en/enums.json";
import esActivities from "./locales/es/activities.json";
import esAdminActivities from "./locales/es/admin-activities.json";
import esEnums from "./locales/es/enums.json";

type Messages = Record<string, unknown>;

function flatten(value: unknown, prefix = "", result = new Map<string, string>()) {
  if (typeof value === "string") {
    result.set(prefix, value);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix === "" ? key : `${prefix}.${key}`, result);
    }
  }
  return result;
}

function activityEnums(enums: Messages): Messages {
  return Object.fromEntries(Object.entries(enums).filter(([key]) => key.startsWith("activity")));
}

const catalogs = {
  ca: {
    activities: caActivities,
    "admin-activities": caAdminActivities,
    enums: activityEnums(caEnums),
  },
  en: {
    activities: enActivities,
    "admin-activities": enAdminActivities,
    enums: activityEnums(enEnums),
  },
  es: {
    activities: esActivities,
    "admin-activities": esAdminActivities,
    enums: activityEnums(esEnums),
  },
} as const;

const forbidden = [
  /\bparell(?:a|es)?\b/iu,
  /\bpareja(?:s)?\b/iu,
  /\bamigable\b/iu,
  /\(paràmetre\)/iu,
  /\bF\d+\b/u,
  /\bRF-/u,
  /\bBR-/u,
  /\bPAR-/u,
];

describe("T-07-31 activities i18n (activities, admin-activities, enums)", () => {
  it.each(["activities", "admin-activities", "enums"] as const)(
    "has the same %s keys in ca, es and en, none empty",
    (namespace) => {
      const keys = (locale: keyof typeof catalogs) =>
        [...flatten(catalogs[locale][namespace]).keys()].sort();
      expect(keys("es")).toEqual(keys("ca"));
      expect(keys("en")).toEqual(keys("ca"));
      for (const locale of ["ca", "es", "en"] as const) {
        for (const [key, value] of flatten(catalogs[locale][namespace])) {
          expect(value.trim(), `${locale} ${namespace}:${key}`).not.toBe("");
        }
      }
    },
  );

  it("never uses the forbidden vocabulary (the registration is «per persona»)", () => {
    for (const locale of ["ca", "es", "en"] as const) {
      for (const namespace of ["activities", "admin-activities", "enums"] as const) {
        for (const [key, value] of flatten(catalogs[locale][namespace])) {
          for (const pattern of forbidden) {
            expect(pattern.test(value), `${locale} ${namespace}:${key} «${value}»`).toBe(false);
          }
        }
      }
    }
  });

  it("keeps the mockup and S07 §10 literals in ca", () => {
    const ca = flatten(caActivities);
    const admin = flatten(caAdminActivities);
    const enums = flatten(activityEnums(caEnums));
    expect(ca.get("list.freeSeats")).toBe("{count, plural, one {# plaça} other {# places}}");
    expect(ca.get("list.open")).toBe("Obertes");
    expect(ca.get("list.full")).toBe("Completa");
    expect(ca.get("list.fullWaitlist")).toBe("Completa · ⏳{waiting}");
    expect(ca.get("detail.registrationUntil")).toBe("Inscripció fins el {date}");
    expect(ca.get("detail.allRings")).toBe("totes les pistes");
    expect(ca.get("block.intro")).toBe("Seleccioneu l'activitat o classe que vulgueu reservar.");
    expect(admin.get("form.rings")).toBe("Pistes vinculades (es bloquegen):");
    expect(admin.get("form.publicUrl")).toBe("URL: {url} · surt a l'API de la web (mai noms)");
    expect(admin.get("list.allRings")).toBe("totes — bloquejades");
    expect(admin.get("list.registrationsOpen")).toBe("obertes · socis");
    expect([...enums.entries()].filter(([key]) => key.startsWith("activityState."))).toEqual([
      ["activityState.DRAFT", "esborrany"],
      ["activityState.PUBLISHED", "publicada"],
      ["activityState.FINISHED", "finalitzada"],
      ["activityState.CANCELLED", "cancel·lada"],
    ]);
    expect(enums.get("activityRegistrationState.CANCELLED_BY_CLUB")).toBe("cancel·lada pel club");
    expect(enums.get("activityRegistrationState.DONE")).toBe("feta");
  });
});
