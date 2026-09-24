import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n, type Locale } from "@agilityhub/i18n";
import type { Branding } from "@agilityhub/ui";
import { describe, expect, it } from "vitest";

import { automaticDescription, type DescriptionLevel } from "./description";

const branding: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

async function translator(locale: Locale) {
  const i18n = await createI18n({
    branding,
    browserLanguages: [locale],
    initialNamespaces: ["admin-scheduling"],
    storage: undefined,
  });
  return i18n.t.bind(i18n);
}

// Catalog of the R-06-03 examples: Cadells · A · B · C · D · E · F · G · Teràpia, with Teràpia
// outside the progression (E29, `Level.progression = false`).
const levels: DescriptionLevel[] = ["Cadells", "A", "B", "C", "D", "E", "F", "G", "Teràpia"].map(
  (name, index) => ({
    active: true,
    id: `level-${name}`,
    name,
    order: index * 10,
    progression: name !== "Teràpia",
  }),
);
const ids = (...names: string[]) => names.map((name) => `level-${name}`);

describe("T-06-02 R-06-03 automatic description preview (D3 class card)", () => {
  it("builds «B+C», «D i sup.», «A+C» and «Cadells» from the catalog order", async () => {
    const t = await translator("ca");

    expect(automaticDescription(levels, ids("B", "C"), t)).toBe("B+C");
    expect(automaticDescription(levels, ids("C", "D", "E"), t)).toBe("C+D+E");
    expect(automaticDescription(levels, ids("G", "E", "D", "F"), t)).toBe("D i sup.");
    expect(automaticDescription(levels, ids("A", "C"), t)).toBe("A+C");
    expect(automaticDescription(levels, ids("Cadells"), t)).toBe("Cadells");
    expect(automaticDescription(levels, [], t)).toBe("");
  });

  it("E29: a level outside the progression joins with «+» and never ends a «… i sup.» run", async () => {
    const t = await translator("ca");

    expect(automaticDescription(levels, ids("G", "Teràpia"), t)).toBe("G+Teràpia");
    expect(automaticDescription(levels, ids("D", "E", "F", "G", "Teràpia"), t)).toBe(
      "D+E+F+G+Teràpia",
    );
    expect(automaticDescription(levels, ids("Teràpia"), t)).toBe("Teràpia");
    // With every level in the progression (the default), «Teràpia» is the last active level and
    // {D,E,F,G} stays «D+E+F+G» (the question behind E29).
    const allInProgression = levels.map((level) => ({ ...level, progression: undefined }));
    expect(automaticDescription(allInProgression, ids("D", "E", "F", "G"), t)).toBe("D+E+F+G");
  });

  it("ignores inactive levels when deciding the last active level", async () => {
    const t = await translator("ca");
    const withInactiveG = levels.map((level) =>
      level.name === "G" ? { ...level, active: false } : level,
    );

    expect(automaticDescription(withInactiveG, ids("E", "F"), t)).toBe("E i sup.");
  });

  it.each([
    ["es", "D y sup."],
    ["en", "D and up"],
  ] as const)("uses the %s form of «i sup.»", async (locale, expected) => {
    const t = await translator(locale);

    expect(automaticDescription(levels, ids("D", "E", "F", "G"), t)).toBe(expected);
  });
});

describe("T-06-30 D3 literals and vocabulary (admin-scheduling, ca)", () => {
  it("keeps the exact mockup literals", async () => {
    const t = await translator("ca");

    expect(t("admin-scheduling:templates.gridFooter")).toBe(
      "Clica el nom d'un dia per veure'l per pista o per instructor · color = pista · gris = sense pista",
    );
    expect(
      t("admin-scheduling:templates.inconsistencyNote", {
        message: "dimecres 20:00 — pista Central amb dues classes alhora",
      }),
    ).toBe(
      "Incoherència: dimecres 20:00 — pista Central amb dues classes alhora. Mentre hi hagi incoherències no es poden generar classes d'aquesta plantilla.",
    );
    expect(t("admin-scheduling:templates.generation.confirm", { date: "24/08/2026" })).toBe(
      "Es generaran com a esborrany les classes de la setmana del 24/08/2026",
    );
    expect(t("admin-scheduling:templates.generation.blocked", { count: 1 })).toBe(
      "bloquejat: 1 incoherència a la plantilla",
    );
    expect(t("admin-scheduling:templates.generation.blocked", { count: 2 })).toBe(
      "bloquejat: 2 incoherències a la plantilla",
    );
    expect(t("admin-scheduling:templates.addAnotherInBand")).toBe(
      "Vols afegir-ne una altra a la mateixa franja?",
    );
    expect(t("admin-scheduling:coverage.title")).toBe(
      "Cobertura per nivell (places de la setmana)",
    );
    expect(t("admin-scheduling:templates.generation.title")).toBe("Generar classes — per setmanes");
  });

  it("uses no forbidden vocabulary or requirement codes in the three locales", async () => {
    for (const locale of ["ca", "es", "en"] as const) {
      const i18n = await createI18n({
        branding,
        browserLanguages: [locale],
        initialNamespaces: ["admin-scheduling", "enums"],
        storage: undefined,
      });
      const text = JSON.stringify([
        i18n.getResourceBundle(locale, "admin-scheduling"),
        i18n.getResourceBundle(locale, "enums"),
      ]);
      expect(text).not.toMatch(
        /\bparell(?:a|es)?\b|\bamigable\b|\(paràmetre\)|\bF\d+\b|\bRF-|\bBR-|\bR-\d{2}-\d{2}/iu,
      );
    }
  });
});
