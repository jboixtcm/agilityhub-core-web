import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createI18n } from "./setup";
import type { Namespace } from "./types";

type Locale = "ca" | "en" | "es";
type Catalog = Record<string, unknown>;

const localesDir = resolve(import.meta.dirname, "locales");

function readNamespace(locale: Locale, namespace: string): Catalog {
  return JSON.parse(
    readFileSync(resolve(localesDir, locale, `${namespace}.json`), "utf8"),
  ) as Catalog;
}

/** Every string of a catalog as `key → text`, keys joined by dots. */
function flatten(catalog: Catalog, prefix = ""): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : typeof value === "object" && value !== null
        ? flatten(value as Catalog, `${prefix}${key}.`)
        : [],
  );
}

async function translator(locale: Locale, namespaces: Namespace[]) {
  const instance = await createI18n({
    branding: { defaultLocale: locale, locales: [locale] },
    browserLanguages: [locale],
    initialNamespaces: namespaces,
    storage: undefined,
  });
  return (key: string, values: Record<string, unknown>) => instance.t(key, values);
}

describe("E11-W05 step 4 (A40.3, E142/E153): the api's gender reaches every gendered string, OTHER reads the slash form", () => {
  /** key · values · FEMALE · OTHER · MALE (= `other`, also a missing gender). */
  const rows: Record<"ca" | "es", [string, Record<string, unknown>, string, string, string][]> = {
    ca: [
      [
        "auth:activation.welcome",
        { name: "Àlex" },
        "Benvinguda, Àlex!",
        "Hola, Àlex!",
        "Benvingut, Àlex!",
      ],
      ["auth:profileChoice.member", {}, "Com a alumna", "Com a alumne/a", "Com a alumne"],
      [
        "auth:profileChoice.instructor",
        {},
        "Com a instructora",
        "Com a instructor/a",
        "Com a instructor",
      ],
      [
        "auth:profileChoice.admin",
        {},
        "Com a administradora",
        "Com a administrador/a",
        "Com a administrador",
      ],
      ["auth:profile.memberProfile", {}, "alumna", "alumne/a", "alumne"],
      ["auth:profile.instructorProfile", {}, "instructora", "instructor/a", "instructor"],
      ["auth:profile.adminProfile", {}, "administradora", "administrador/a", "administrador"],
      [
        "admin-census:member.imageNotice",
        {},
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti ella.",
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti aquesta persona.",
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti ell.",
      ],
      [
        "admin-census:signupReview.warning.NO_IMAGE_CONSENT",
        {},
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti ella.",
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti aquesta persona.",
        "No autoritza l'ús de la seva imatge: no publiquis fotos on surti ell.",
      ],
      [
        "admin-census:followup.author.member",
        { name: "Àlex" },
        "Àlex (alumna)",
        "Àlex (alumne/a)",
        "Àlex (alumne)",
      ],
      ["instructor:card.memberStatus", {}, "Abonada", "Abonat/ada", "Abonat"],
    ],
    es: [
      [
        "auth:activation.welcome",
        { name: "Àlex" },
        "¡Bienvenida, Àlex!",
        "¡Hola, Àlex!",
        "¡Bienvenido, Àlex!",
      ],
      ["auth:profileChoice.member", {}, "Como alumna", "Como alumno/a", "Como alumno"],
      [
        "auth:profileChoice.instructor",
        {},
        "Como instructora",
        "Como instructor/a",
        "Como instructor",
      ],
      [
        "auth:profileChoice.admin",
        {},
        "Como administradora",
        "Como administrador/a",
        "Como administrador",
      ],
      ["auth:profile.memberProfile", {}, "alumna", "alumno/a", "alumno"],
      ["auth:profile.instructorProfile", {}, "instructora", "instructor/a", "instructor"],
      ["auth:profile.adminProfile", {}, "administradora", "administrador/a", "administrador"],
      [
        "admin-census:member.imageNotice",
        {},
        "No autoriza el uso de su imagen: no publiques fotos en las que aparezca ella.",
        "No autoriza el uso de su imagen: no publiques fotos en las que aparezca esta persona.",
        "No autoriza el uso de su imagen: no publiques fotos en las que aparezca él.",
      ],
      [
        "admin-census:signupReview.warning.NO_IMAGE_CONSENT",
        {},
        "No autoriza el uso de su imagen: no publiques fotos en las que aparezca ella.",
        "No autoriza el uso de su imagen: no publiques fotos en las que aparezca esta persona.",
        "No autoriza el uso de su imagen: no publiques fotos en las que aparezca él.",
      ],
      [
        "admin-census:followup.author.member",
        { name: "Àlex" },
        "Àlex (alumna)",
        "Àlex (alumno/a)",
        "Àlex (alumno)",
      ],
      ["instructor:card.memberStatus", {}, "Abonada", "Abonado/a", "Abonado"],
    ],
  };

  it.each(["ca", "es"] as const)("%s: FEMALE, OTHER, MALE and a missing gender", async (locale) => {
    const t = await translator(locale, ["auth", "admin-census", "instructor"]);
    for (const [key, values, female, other, male] of rows[locale]) {
      expect(t(key, { ...values, gender: "FEMALE" }), `${key} FEMALE`).toBe(female);
      expect(t(key, { ...values, gender: "OTHER" }), `${key} OTHER`).toBe(other);
      expect(t(key, { ...values, gender: "MALE" }), `${key} MALE`).toBe(male);
      expect(t(key, { ...values, gender: "other" }), `${key} missing`).toBe(male);
    }
  });

  it("en has no gendered word but the image notice, whose OTHER reads «them» as NO_IMAGE_CONSENT does", async () => {
    const t = await translator("en", ["admin-census", "instructor"]);
    expect(t("admin-census:member.imageNotice", { gender: "OTHER" })).toBe(
      "Does not authorise use of their image: do not publish photos showing them.",
    );
    expect(t("admin-census:signupReview.warning.NO_IMAGE_CONSENT", { gender: "OTHER" })).toBe(
      "Image use was not authorized: do not publish photos showing them.",
    );
    expect(t("instructor:card.memberStatus", { gender: "FEMALE" })).toBe("Member");
  });
});

describe("E11-W05 step 4 (A40.4, E142/E153): the errors namespace speaks tu/tú, as every other namespace", () => {
  /** The «vosaltres» (ca) and «usted» (es) markers of the register (A40.4's table and the step's list). */
  const markers: Record<"ca" | "es", RegExp> = {
    ca: /\b(?:vostr[ea]s?|podeu|teniu|Torneu|torneu|Seleccioneu|Trieu|indiqueu|Introduïu|Inicieu|Completeu|Accepteu|Activeu|Confirmeu|Reviseu|Actualitzeu|Escriviu|Feu|Poseu-vos|Contacteu|Espereu|Comproveu|Afegiu|Canvieu|Esborreu|Utilitzeu|Demaneu|Elimineu|Desactiveu|Torneu-ho|Tanqueu|Obriu|Proveu|Envieu|Marqueu|Aneu)\b/u,
    es: /\b(?:Vuelva|vuelva|Seleccione|Elija|indique|Indique|[Ss]u cuenta|Introduzca|Complete|Acepte|Active|Confirme|Revise|Inicie|Actualícelo|No puede|No tiene|[Ss]u propio|Pruebe|Póngase|Espere|Compruebe|Añada|Cambie|Elimine|Utilice|Use|Solicite|Contacte|Escriba|Desactive|Cierre|Abra|Envíe|Marque|Vaya|usted)\b/u,
  };

  it.each(["ca", "es"] as const)(
    "%s: no errors string addresses the reader as «vosaltres» or «usted»",
    (locale) => {
      const formal = flatten(readNamespace(locale, "errors")).filter(([, text]) =>
        markers[locale].test(text),
      );
      expect(formal).toEqual([]);
    },
  );
});

/** The value at `namespace:dotted.key` of a locale, `undefined` when the key does not exist. */
function text(locale: Locale, key: string): string | undefined {
  const [namespace = "", path = ""] = key.split(":");
  const value = path
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null ? (node as Catalog)[part] : undefined,
      readNamespace(locale, namespace),
    );
  return typeof value === "string" ? value : undefined;
}

describe("E11-W05 step 6 (E153, DECISIONS_COPY A39–A41): the approved literals", () => {
  it("A39's corrections: «En configuració», es «ya tiene contenido», no adminHostsNote, en «Guide level», es «no-go»", () => {
    expect(
      ["ca", "es", "en"].map((locale) => text(locale as Locale, "console:status.ONBOARDING")),
    ).toEqual(["En configuració", "En configuración", "Being set up"]);
    expect(text("ca", "console:statusTab.meaning.ONBOARDING")).toBe(
      "El club ja funciona i els administradors veuen un bàner de configuració.",
    );
    expect(text("es", "console:errors.catalogNotEmpty")).toBe(
      "{part}: el club ya tiene contenido. Solo se copian las partes vacías.",
    );
    for (const locale of ["ca", "es", "en"] as const) {
      expect(text(locale, "console:domains.adminHostsNote"), locale).toBeUndefined();
    }
    expect(text("en", "admin-courses:fields.agilityhubLevel")).toBe("Guide level");
    expect(text("en", "courses:register.level")).toBe("Guide level");
    expect(text("es", "admin-courses:warnings.courseNoGo")).toBe(
      "{obstacle} toca una zona no-go del recorrido.",
    );
  });

  it("A40.5: es «revertir / reversión» for the remittance rollback, ca keeps «retrocedir» (also RUN_NOT_ROLLBACKABLE)", () => {
    const es: Record<string, string> = {
      "admin-billing:actions.rollback": "Revertir la remesa",
      "admin-billing:confirm.rollbackTitle": "Revertir la remesa · {month}",
      "admin-billing:confirm.rollback": "Revertir",
      "admin-billing:confirm.rollingBack": "Revirtiendo la remesa…",
      "admin-billing:confirm.rollbackRemittance":
        "la remesa quedará revertida (el fichero XML se conserva).",
      "admin-billing:confirm.submissionBody":
        "La remesa quedará marcada como enviada al banco. A partir de ahí ya no se podrá revertir.",
      "admin-billing:status.rolledBack": "anulado · reversión",
      "admin-billing:drawer.cancelReasonRollback": "reversión de la remesa",
      "admin-billing:errors.notRollbackable": "No se puede revertir la remesa:",
      "admin-audit:actions.REMITTANCE_ROLLED_BACK": "Remesa revertida",
      "enums:remittanceStatus.ROLLED_BACK": "revertida",
      "enums:collectionFailure.ROLLBACK": "reversión de la remesa",
      "errors:RUN_NOT_ROLLBACKABLE": "Esta remesa no se puede revertir.",
    };
    for (const [key, expected] of Object.entries(es)) expect(text("es", key), key).toBe(expected);
    const esStrings = readdirSync(resolve(localesDir, "es")).flatMap((file) =>
      flatten(readNamespace("es", file.replace(/\.json$/u, ""))).map(([, value]) => value),
    );
    expect(esStrings.filter((value) => /retroce/iu.test(value))).toEqual([]);
    expect(text("ca", "errors:RUN_NOT_ROLLBACKABLE")).toBe("Aquesta remesa no es pot retrocedir.");
  });

  it("A41: es says «bono» for the session pack everywhere; ca and en keep «pack»", () => {
    const esPack = readdirSync(resolve(localesDir, "es")).flatMap((file) => {
      const namespace = file.replace(/\.json$/u, "");
      return flatten(readNamespace("es", namespace))
        .filter(([, value]) => /\bpacks?\b/iu.test(value))
        .map(([key, value]) => `${namespace}:${key} · ${value}`);
    });
    expect(esPack).toEqual([]);
    expect(text("es", "enums:upfrontConcept.PACK")).toBe("Bono");
    expect(text("es", "enums:invoiceLineOrigin.PACK")).toBe("Bono");
    expect(text("ca", "enums:upfrontConcept.PACK")).toBe("Pack");
    expect(text("en", "enums:upfrontConcept.PACK")).toBe("Pack");
  });
});

describe("E11-W05 (snapshot a7c85d50): every value of BillingIncidentCode and RollbackBlocker has a label", () => {
  const openapi = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../api-client/openapi/openapi.json"), "utf8"),
  ) as { components: { schemas: Record<string, { enum?: string[] }> } };

  it.each([
    ["BillingIncidentCode", "billingIncident"],
    ["RollbackBlocker", "rollbackBlocker"],
  ] as const)("%s → enums:%s in ca, es and en", (schema, group) => {
    const values = openapi.components.schemas[schema]?.enum ?? [];
    expect(values.length).toBeGreaterThan(0);
    for (const locale of ["ca", "es", "en"] as const) {
      const missing = values.filter(
        (value) => text(locale, `enums:${group}.${value}`) === undefined,
      );
      expect(missing, locale).toEqual([]);
    }
  });
});

describe("E11-W05 step 4 (A40.2, E142/E153): «DNI» names only the ES profile's document types", () => {
  /** The signup's type choices name the types `countryProfile.idDocumentTypes` offers (CONVENCIONS_I18N §4). */
  const typeChoices = new Set(["signup:person.idDniNie", "signup:person.passport"]);

  it.each(["ca", "es", "en"] as const)(
    "%s: every other label says «document d'identitat»",
    (locale) => {
      const offenders = readdirSync(resolve(localesDir, locale))
        .filter((file) => file.endsWith(".json"))
        .flatMap((file) => {
          const namespace = file.replace(/\.json$/u, "");
          return flatten(readNamespace(locale, namespace)).map(
            ([key, text]) => [`${namespace}:${key}`, text] as const,
          );
        })
        .filter(([key, text]) => /\bDNI\b/u.test(text) && !typeChoices.has(key));
      expect(offenders).toEqual([]);
    },
  );
});
