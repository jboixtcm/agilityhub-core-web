import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n, loadNamespace, productLocales } from "@agilityhub/i18n";
import { describe, expect, it } from "vitest";

/** `CONVENCIONS_I18N.md` §1 (same list as `scripts/i18n-check.mjs`) + the mockup 10 annotation. */
const forbidden = [
  /\bparell(?:a|es)?\b/iu,
  /\bamigable\b/iu,
  /\(paràmetre\)/iu,
  /\bF\d+\b/u,
  /\bRF-/u,
  /\bBR-/u,
  /\bPAR-/u,
  /s'avisarà/iu,
];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

describe("T-06-30 screens 10 / 23 vocabulary and ca literals", () => {
  it("has no forbidden term nor internal code in home, instructor and enums (ca/es/en)", async () => {
    for (const locale of productLocales) {
      for (const namespace of ["home", "instructor", "enums"] as const) {
        const texts = strings(await loadNamespace(locale, namespace));
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
          for (const rule of forbidden) {
            expect(rule.test(text), `${locale}/${namespace}: ${text}`).toBe(false);
          }
        }
      }
    }
  });

  it("keeps the exact ca literals of mockups 10 and 23", async () => {
    const i18n = await createI18n({
      branding: brandingCanicFixture,
      browserLanguages: ["ca"],
      initialNamespaces: ["home", "instructor", "enums", "shell"],
      storage: undefined,
    });
    const t = i18n.getFixedT("ca");
    expect(t("home:today.title")).toBe("Classes del dia");
    expect(t("home:today.footer")).toBe("Ocupada = pista reservada per a entrenament o bloquejada");
    expect(t("home:today.empty")).toBe("Cap classe aquest dia");
    expect(t("home:today.occupied")).toBe("Ocupada");
    expect(t("home:today.atRisk")).toBe("en risc ⚠");
    expect(t("instructor:overview.title")).toBe("Visió global");
    expect(t("instructor:overview.footer")).toBe(
      "n/n +e = inscrits/places + llista d'espera · l'instructor previst es mostra sempre",
    );
    expect(t("instructor:overview.training")).toBe("Entren.");
    expect(t("instructor:overview.block")).toBe("Bloq.");
    expect(t("enums:occupiedReason.TRAINING")).toBe("entren.");
    expect(t("enums:occupiedReason.MAINTENANCE")).toBe("manteniment");
    expect(t("enums:classState.CANCELLED")).toBe("anul·lada");
    expect(t("shell:nav.today")).toBe("Avui");
    expect(t("shell:nav.globalView")).toBe("Visió global");
  });
});
