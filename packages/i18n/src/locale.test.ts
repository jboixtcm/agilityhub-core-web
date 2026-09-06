import { describe, expect, it } from "vitest";

import { readStoredLocale, resolveLocale } from "./locale";

describe("locale resolution", () => {
  it("T-02-17 uses account, stored, browser and club-default priority", () => {
    const common = {
      browserLanguages: ["en-US", "ca-ES"],
      clubLocales: ["ca", "es", "en"],
      defaultLocale: "ca",
    } as const;

    expect(resolveLocale({ ...common, storedLocale: "es", userLocale: "en" })).toBe("en");
    expect(resolveLocale({ ...common, storedLocale: "es" })).toBe("es");
    expect(resolveLocale(common)).toBe("en");
    expect(resolveLocale({ ...common, browserLanguages: ["fr-FR"] })).toBe("ca");
  });

  it("ignores preferences that the club does not enable", () => {
    expect(
      resolveLocale({
        browserLanguages: ["en"],
        clubLocales: ["ca", "es"],
        defaultLocale: "ca",
        storedLocale: "en",
        userLocale: "fr",
      }),
    ).toBe("ca");
  });

  it("reads anonymous locale storage without failing on unavailable storage", () => {
    expect(readStoredLocale({ getItem: () => "es" })).toBe("es");
    expect(
      readStoredLocale({
        getItem: () => {
          throw new Error("storage unavailable");
        },
      }),
    ).toBeUndefined();
  });
});
