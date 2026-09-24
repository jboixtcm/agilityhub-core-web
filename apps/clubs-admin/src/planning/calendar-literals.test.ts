import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n } from "@agilityhub/i18n";
import type { Branding } from "@agilityhub/ui";
import { describe, expect, it } from "vitest";

const branding: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

async function catalan() {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-scheduling", "enums", "errors"],
    storage: undefined,
  });
  return i18n.t.bind(i18n);
}

describe("T-06-30 D4 / D4b / D4c literals (admin-scheduling, ca)", () => {
  it("keeps the exact mockup texts of the footers, the validation card and the D4c modal", async () => {
    const t = await catalan();

    expect(t("admin-scheduling:calendar.footer.active", { icon: "⊥" })).toBe(
      "n/n +e = inscrits/places + llista d'espera · ⊥ = pista bloquejada · Clica el nom d'un dia per veure'l per pista o per instructor",
    );
    expect(t("admin-scheduling:calendar.footer.draft")).toBe(
      "contorn discontinu = esborrany (els alumnes encara no la veuen) · Clica el nom d'un dia per veure'l per pista o per instructor",
    );
    expect(t("admin-scheduling:calendar.validation.help", { count: 28 })).toBe(
      "En validar, les 28 classes passen a actives alhora i els alumnes ja les poden reservar. No es pot validar una classe sola.",
    );
    expect(
      t("admin-scheduling:calendar.validation.summary", {
        draftCount: 28,
        range: "17 al 23 d’agost",
        weekLabel: "Setmana vinent",
      }),
    ).toBe("Setmana vinent · del 17 al 23 d’agost · 28 classes en esborrany · ");
    expect(t("admin-scheduling:cancelModal.intro", { count: 4 })).toBe(
      "Aquesta classe té 4 alumnes inscrits. Si l'anul·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota.",
    );
    expect(
      `${t("admin-scheduling:cancelModal.footer")}${t("admin-scheduling:cancelModal.footerWaitlist", { count: 2 })}`,
    ).toBe("S'envia amb la plantilla «Classe anul·lada pel club» · també a la llista d'espera (2)");
    expect(t("admin-scheduling:cancelModal.confirm", { count: 4 })).toBe(
      "ANUL·LA I AVISA ELS 4 ALUMNES",
    );
    expect(
      t("admin-scheduling:cancelModal.title", {
        day: "dc 12",
        description: "B+C",
        instructors: "Marc",
        ring: "Central",
        time: "18:50",
      }),
    ).toBe("Anul·lar la classe — dc 12 · 18:50 · B+C · Central · Marc");
    expect(t("admin-scheduling:cancelModal.smsPhones", { count: 2 })).toBe("SMS (2 telèfons)");
    expect(t("admin-scheduling:cancelModal.text")).toBe("Text de l'avís");
    expect(t("admin-scheduling:cancelModal.back")).toBe("Torna enrere");
  });

  it("keeps the D4 / D4b grid and card literals", async () => {
    const t = await catalan();

    expect(t("admin-scheduling:calendar.title")).toBe("Calendari de classes");
    expect([
      t("admin-scheduling:calendar.filter.actives"),
      t("admin-scheduling:calendar.filter.drafts"),
      t("admin-scheduling:calendar.filter.cancelled"),
    ]).toEqual(["Actives", "Esborrany", "Anul·lades"]);
    expect(t("admin-scheduling:calendar.week.current")).toBe("Setmana en curs");
    expect(t("admin-scheduling:calendar.week.next")).toBe("Setmana vinent");
    expect(t("admin-scheduling:calendar.week.range", { range: "10 al 16 d’agost" })).toBe(
      "del 10 al 16 d’agost",
    );
    expect(
      t("admin-scheduling:calendar.selected.title", {
        day: "dc 12",
        description: "B+C",
        instructors: "Marc",
        ring: "Central",
        time: "18:50",
      }),
    ).toBe("Classe seleccionada — dc 12 · 18:50 · B+C · Central · Marc");
    expect(t("admin-scheduling:calendar.cell.blocked", { ring: "Carretera" })).toBe(
      "Carretera bloquejada",
    );
    expect(
      t("admin-scheduling:calendar.cell.blockDetail", {
        from: "16:00",
        reason: t("enums:ringBlockReason.MAINTENANCE"),
        to: "18:00",
      }),
    ).toBe("manteniment 16:00–18:00");
    expect(
      t("admin-scheduling:calendar.cell.cancelled", {
        reason: t("enums:cancellationReason.RISK_REVIEW"),
      }),
    ).toBe("anul·lada · revisió de les 7:30");
    expect(t("admin-scheduling:calendar.warnings.title")).toBe(
      "Avisos d'incoherència de la setmana",
    );
    expect(t("admin-scheduling:calendar.validation.title")).toBe("Validació de la setmana");
    expect(t("admin-scheduling:calendar.validation.clean")).toBe("cap incoherència");
    expect(t("admin-scheduling:calendar.validation.submit")).toBe("VALIDAR LA SETMANA");
    expect([
      t("admin-scheduling:calendar.selected.accept"),
      t("admin-scheduling:calendar.selected.cancel"),
      t("admin-scheduling:calendar.selected.delete"),
      t("admin-scheduling:calendar.selected.deleteDraft"),
    ]).toEqual(["ACCEPTA", "ANUL·LA LA CLASSE", "ELIMINA", "Elimina"]);
    expect(
      ["ACTIVE", "DRAFT", "FINISHED", "CANCELLED"].map((state) => t(`enums:classState.${state}`)),
    ).toEqual(["activa", "esborrany", "finalitzada", "anul·lada"]);
    expect(t("errors:ADMIN_TEXT_REQUIRED")).toBe("Cal escriure el text de l'avís per als alumnes.");
  });
});
