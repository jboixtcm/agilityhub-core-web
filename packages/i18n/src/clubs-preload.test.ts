import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { preloadClubsI18n } from "./clubs";
import { clubsLoaders } from "./clubs-resources";
import caCommon from "./locales/ca/common.json";
import esShell from "./locales/es/shell.json";

afterEach(() => {
  vi.restoreAllMocks();
});

const storage = (locale: string | null) => ({ getItem: () => locale });

// E11-W02 step 6 (TTI): the boot starts the locale chunks it is going to need while `/branding`
// is still on its way, instead of after it; i18n's own loader then reads them from the module cache.
describe("E11-W02 step 6: preloadClubsI18n starts the boot's locale chunks early", () => {
  it("loads each namespace of the locale the boot will resolve (the stored one first)", () => {
    const common = vi.spyOn(clubsLoaders.es, "common");
    const auth = vi.spyOn(clubsLoaders.es, "auth");
    const catalan = vi.spyOn(clubsLoaders.ca, "common");
    preloadClubsI18n(["common", "auth"], {
      branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
      browserLanguages: ["en-GB"],
      storage: storage("es"),
    });
    expect(common).toHaveBeenCalledOnce();
    expect(auth).toHaveBeenCalledOnce();
    expect(catalan).not.toHaveBeenCalled();
  });

  it("without a club yet (first visit), the reader's language among the product's, else Catalan", () => {
    const english = vi.spyOn(clubsLoaders.en, "shell");
    preloadClubsI18n(["shell"], { browserLanguages: ["en-US"], storage: storage(null) });
    expect(english).toHaveBeenCalledOnce();
    const catalan = vi.spyOn(clubsLoaders.ca, "shell");
    preloadClubsI18n(["shell"], { browserLanguages: ["fr-FR"], storage: storage(null) });
    expect(catalan).toHaveBeenCalledOnce();
  });
});

// E11-W02 step 6 (TTI < 3 s): `common` and `shell` are in the students' first load already, every
// locale of them (`catalog.ts`, which `format.ts` reads). A dynamic import of the same files made
// the bundler emit them as six chunks of their own, preloaded by `index.html`: six more requests
// on the critical path (Lighthouse TTI 3.4 s). The loaders hand over the modules already there.
describe("E11-W02 step 6: the students' common and shell are never a chunk of their own", () => {
  const source = readFileSync(resolve(import.meta.dirname, "clubs-resources.ts"), "utf8");

  it.each(["ca", "es", "en"])("%s: no dynamic import of common.json nor shell.json", (locale) => {
    expect(source).not.toContain(`import("./locales/${locale}/common.json")`);
    expect(source).not.toContain(`import("./locales/${locale}/shell.json")`);
  });

  it("the loaders resolve to the very modules the static catalog holds", async () => {
    expect((await clubsLoaders.ca.common()).default).toBe(caCommon);
    expect((await clubsLoaders.es.shell()).default).toBe(esShell);
  });
});
