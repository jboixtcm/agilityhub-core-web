import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createClubFormats, createI18n, loadNamespace, productLocales } from "@agilityhub/i18n";
import { screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderApp } from "../booking/test-utils";

import { shortTime } from "./shared";
import { setupTrainingWorld } from "./test-utils";

setupTrainingWorld();

/** `CONVENCIONS_I18N.md` §1 (same list as `scripts/i18n-check.mjs`). */
const forbidden = [
  /\bparell(?:a|es)?\b/iu,
  /\bamigable\b/iu,
  /\(paràmetre\)/iu,
  /\bF\d+\b/u,
  /\bRF-/u,
  /\bBR-/u,
  /\bPAR-/u,
];

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (typeof value === "string") {
    result.set(prefix, value);
    return result;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, text] of flatten(child, prefix === "" ? key : `${prefix}.${key}`)) {
        result.set(path, text);
      }
    }
  }
  return result;
}

describe("T-09-41 training and instructor vocabulary, locales and club time zone", () => {
  const viewerZone = process.env.TZ;

  beforeAll(() => {
    // The viewer is in Bogotá; the club is in Europe/Madrid (branding `timeZone`).
    process.env.TZ = "America/Bogota";
  });
  afterAll(() => {
    if (viewerZone === undefined) delete process.env.TZ;
    else process.env.TZ = viewerZone;
  });

  it("has no forbidden term nor requirement code in training, instructor and enums (ca/es/en)", async () => {
    for (const locale of productLocales) {
      for (const namespace of ["training", "instructor", "enums"] as const) {
        const texts = [...flatten(await loadNamespace(locale, namespace)).values()];
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
          for (const rule of forbidden) {
            expect(rule.test(text), `${locale}/${namespace}: ${text}`).toBe(false);
          }
        }
      }
    }
  });

  it("the three locales carry the same training and instructor keys, none empty", async () => {
    for (const namespace of ["training", "instructor"] as const) {
      const catalogs = await Promise.all(
        productLocales.map(async (locale) => flatten(await loadNamespace(locale, namespace))),
      );
      const [ca, ...others] = catalogs;
      for (const other of others)
        expect([...other.keys()].sort()).toEqual([...(ca?.keys() ?? [])].sort());
      for (const catalog of catalogs) {
        for (const [key, text] of catalog) expect(text.trim(), `${namespace}:${key}`).not.toBe("");
      }
    }
  });

  it("keeps the exact ca literals of mockups 08 and 24 and the S09 §10 keys", async () => {
    const i18n = await createI18n({
      branding: brandingCanicFixture,
      browserLanguages: ["ca"],
      initialNamespaces: ["training", "instructor", "enums"],
      storage: undefined,
    });
    const t = i18n.getFixedT("ca");
    expect(t("training:title")).toBe("Entrenaments");
    expect(t("training:days.today", { day: "dl 3" })).toBe("Avui dl 3");
    expect(t("training:rings.any")).toBe("Qualsevol");
    expect(t("training:grid.morning")).toBe("Matí");
    expect(t("training:grid.afternoon")).toBe("Tarda");
    expect(t("training:grid.classLabel", { time: "18:30" })).toBe("18:30 classe");
    expect(t("training:anyRing.choose", { time: "8:30" })).toBe(
      "A les 8:30 hi ha més d'una pista lliure — tria quina vols:",
    );
    expect(t("training:counter.title", { limit: 3, used: 2 })).toBe(
      "Portes 2/3 entrenaments aquesta setmana",
    );
    expect(t("training:counter.reset", { weekOpensAt: "dg 20:00" })).toBe("reinici dg 20:00");
    expect(
      t("training:confirm.button", {
        day: "Dilluns 3",
        from: "8:30",
        ring: "Muntanya",
        to: "9:00",
      }),
    ).toBe("Confirma Dilluns 3 · 8:30–9:00 · Muntanya");
    expect(t("training:confirm.done")).toBe("Entrenament reservat");
    expect(t("training:limit.withCancellable", { limit: 3 })).toBe(
      "Has arribat al límit de 3 reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra.",
    );
    expect(t("training:limit.none", { limit: 3 })).toBe(
      "Has arribat al límit de 3 reserves per aquesta setmana.",
    );
    expect(t("instructor:ringBlock.kind.RESERVATION")).toBe("Reserva de pista");
    expect(t("instructor:ringBlock.kind.BLOCK")).toBe("Bloqueig");
    expect(t("instructor:ringBlock.note.placeholder")).toBe("Nota (opcional)");
    expect(t("instructor:ringBlock.summary", { from: "18:10", ring: "Petita", to: "19:10" })).toBe(
      "Ocupa la pista Petita de 18:10 a 19:10, surt al quadre global i al registre d'ús de pistes. No es vincula a cap alumne.",
    );
    expect(t("instructor:ringBlock.submit.RESERVATION")).toBe("Reserva la pista");
    expect(t("instructor:ringBlock.submit.BLOCK")).toBe("Bloqueja la pista");
    expect(t("instructor:ringBlock.card.title")).toBe("Reservar o bloquejar pista (sense alumne)");
    expect(t("enums:trainingBookingState.CONFIRMED")).toBe("confirmada");
    expect(t("enums:trainingBookingState.DONE")).toBe("fet");
    expect(t("enums:trainingBookingState.CANCELLED")).toBe("anul·lada");
    expect(t("enums:trainingBookingState.CANCELLED_BY_CLUB")).toBe("cancel·lada pel club");
  });

  it("formats in the club's zone, never the viewer's: an October 06:30Z slot reads «8:30»", async () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Bogota");
    const formats = createClubFormats("ca", brandingCanicFixture.timeZone, "EUR");
    expect(brandingCanicFixture.timeZone).toBe("Europe/Madrid");
    expect(shortTime(formats.formatTime("2026-10-05T06:30:00Z"))).toBe("8:30");
    // The same instant read in the viewer's zone would be 1:30.
    expect(new Date("2026-10-05T06:30:00Z").getHours()).toBe(1);
    // On screen 08: the limit links are instants of the api, read in the club's zone.
    await renderApp("/entrenaments", { scenario: "trainingAtLimit" });
    expect(await screen.findByRole("link", { name: "dt 4 · 8:00 · Muntanya" })).toBeVisible();
    // The grid draws the api's club-local `startsAtLocal`.
    expect(screen.getByRole("button", { name: "8:30, lliure" })).toBeVisible();
  });
});
