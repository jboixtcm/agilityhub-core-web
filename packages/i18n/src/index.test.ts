import { describe, expect, it } from "vitest";

import { createI18n, t } from "./index";

describe("@agilityhub/i18n", () => {
  it("reads the statically available compatibility catalog in every locale", () => {
    expect(t("common:gallery.save", "ca")).toBe("Desa");
    expect(t("common:gallery.save", "es")).toBe("Guardar");
    expect(t("common:gallery.save", "en")).toBe("Save");
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
