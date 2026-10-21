import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { flaggedActions, readCatalog } from "../../../scripts/check-es-actions.mjs";

import { createI18n, t } from "./index";

describe("@agilityhub/i18n", () => {
  it("reads the statically available compatibility catalog in every locale", () => {
    expect(t("common:gallery.save", "ca")).toBe("Desa");
    expect(t("common:gallery.save", "es")).toBe("Guardar");
    expect(t("common:gallery.save", "en")).toBe("Save");
  });

  it("E4-W18 step 4 / E11-W02 step 7: the es retry of the access pages reads like the rest of auth and every other es retry («Volver a intentarlo»)", async () => {
    const es = (await import("./locales/es/auth.json")).default;
    const common = (await import("./locales/es/common.json")).default;
    // E11-W02 step 7: an es button names its action in the infinitive.
    expect(es.activation.retry).toBe("Volver a intentarlo");
    expect(es.activation.retry).toBe(es.onboarding.retry);
    expect(es.activation.retry).toBe(es.profile.retry);
    expect(es.activation.retry).toBe(common.boot.retry);
    // The message shown right above that button on 01 (E4-W16's retry after a handoff) is a
    // sentence to the reader: it keeps the imperative.
    expect(es.access.genericError).toMatch(/Vuelve a intentarlo\.$/u);
  });

  it("E11-W04 (E137): the es action labels are infinitives", async () => {
    // The guard of `pnpm i18n:check` (scripts/check-es-actions.mjs) on the real es catalog.
    const catalog = await readCatalog(resolve(import.meta.dirname, "locales"));
    expect(Object.keys(catalog).length).toBeGreaterThan(30);
    expect(flaggedActions(catalog)).toEqual([]);
  });

  it("loads namespaces on demand", async () => {
    const instance = await createI18n({
      branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
      browserLanguages: ["ca"],
      initialNamespaces: ["common"],
      storage: undefined,
    });

    expect(instance.hasResourceBundle("ca", "errors")).toBe(false);
    await instance.loadNamespaces("errors");
    expect(instance.t("errors:INVALID_CREDENTIALS")).toBe(
      "El correu electrònic o la contrasenya són incorrectes.",
    );
  });

  it("formats ICU plural and gender messages", async () => {
    const instance = await createI18n({
      branding: { defaultLocale: "ca", locales: ["ca"] },
      browserLanguages: ["ca"],
      storage: undefined,
    });
    const pluralKey = "test.plural";
    const genderKey = "test.gender";
    instance.addResource(
      "ca",
      "common",
      pluralKey,
      "{count, plural, =0 {cap plaça} one {# plaça} other {# places}}",
    );
    instance.addResource(
      "ca",
      "common",
      genderKey,
      "{gender, select, female {Benvinguda} other {Benvingut}}",
    );

    expect(instance.t(pluralKey, { count: 0 })).toBe("cap plaça");
    expect(instance.t(pluralKey, { count: 2 })).toBe("2 places");
    expect(instance.t(genderKey, { gender: "female" })).toBe("Benvinguda");
    expect(instance.t(genderKey, { gender: "other" })).toBe("Benvingut");
  });
});
