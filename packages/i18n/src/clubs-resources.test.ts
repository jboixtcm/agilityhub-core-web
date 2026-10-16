import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createClubsI18n } from "./clubs";
import { clubsLoaders, clubsNamespaces } from "./clubs-resources";
import { loadNamespace } from "./resources";
import { namespaces, productLocales } from "./types";

const adminOnly = (ns: string) => ns.startsWith("admin-") || ns === "console" || ns === "id";

describe("E9-W03 point 12: the students' app's i18n backend", () => {
  it("has a loader for exactly its namespaces in every locale, none admin-*, console or id", () => {
    expect(clubsNamespaces.filter(adminOnly)).toEqual([]);
    for (const locale of productLocales) {
      const loaded = Object.keys(clubsLoaders[locale]);
      expect(loaded.filter(adminOnly)).toEqual([]);
      expect([...loaded].sort()).toEqual([...clubsNamespaces].sort());
    }
    // The full table (clubs-admin) still has every namespace, the backoffice ones included.
    expect(namespaces.filter(adminOnly).length).toBeGreaterThan(10);
  });

  it("never reaches the full table (resources.ts), which holds the admin imports", () => {
    for (const file of ["clubs.ts", "clubs-resources.ts", "backend.ts", "setup-base.ts"]) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      expect(source, file).not.toMatch(/from "\.\/(?:resources|setup|index)"/u);
      expect(source, file).not.toMatch(/locales\/(?:ca|es|en)\/(?:admin-[a-z]+|console|id)\.json/u);
    }
  });

  it("loads the students' namespaces and refuses an admin one", async () => {
    const instance = await createClubsI18n({
      branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
      browserLanguages: ["ca"],
      initialNamespaces: ["common", "instructor"],
      storage: undefined,
    });
    expect(instance.t("instructor:overview.registrants.title", { booked: 5, capacity: 5 })).toBe(
      "Inscrits (5/5)",
    );
    await instance.loadNamespaces("admin-courses");
    expect(instance.hasResourceBundle("ca", "admin-courses")).toBe(false);
  });

  it("mirrors D4's read-only registrants copy (admin-scheduling) in every locale", async () => {
    for (const locale of productLocales) {
      const admin = (await loadNamespace(locale, "admin-scheduling")) as {
        registrants: Record<string, unknown>;
      };
      const students = (await loadNamespace(locale, "instructor")) as {
        overview: { registrants: Record<string, string> };
      };
      for (const [key, text] of Object.entries(students.overview.registrants)) {
        expect(text, `${locale}/${key}`).toBe(admin.registrants[key]);
      }
    }
  });
});
