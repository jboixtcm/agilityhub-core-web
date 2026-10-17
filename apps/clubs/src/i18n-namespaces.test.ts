import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { namespaces } from "@agilityhub/i18n";
import { clubsNamespaces } from "@agilityhub/i18n/clubs";
import { describe, expect, it } from "vitest";

const srcRoot = import.meta.dirname;

/** The app's shipped sources: no test, no test helper. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const known = new Set<string>(namespaces);

/** Every namespace a source names: `"ns:key"`, `` `ns:${…}` ``, `useTranslation(…)`. */
function referencedNamespaces(source: string): Set<string> {
  const found = new Set<string>();
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  for (const [, ns = ""] of code.matchAll(/["'`]([a-z]+(?:-[a-z]+)*):[A-Za-z_$]/gu)) {
    if (known.has(ns)) found.add(ns);
  }
  for (const [, args = ""] of code.matchAll(
    /(?:useTranslation\(|initialNamespaces:)\s*(\[[^\]]*\]|"[^"]*")/gu,
  )) {
    for (const [, ns = ""] of args.matchAll(/"([^"]+)"/gu)) found.add(ns);
  }
  return found;
}

const isAdminOnly = (ns: string) => ns.startsWith("admin-") || ns === "console" || ns === "id";

describe("point 12 (E9-W03): the students' app ships no admin namespace", () => {
  const files = sourceFiles(srcRoot);

  it("no shipped source of apps/clubs reads an admin-*, console or id namespace", () => {
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      [...referencedNamespaces(readFileSync(file, "utf8"))]
        .filter(isAdminOnly)
        .map((ns) => `${relative(srcRoot, file)}: ${ns}`),
    );
    expect(offenders).toEqual([]);
  });

  it("every namespace the sources read is in the students' loader table (no admin one)", () => {
    const loadable = new Set<string>(clubsNamespaces);
    const used = new Set(
      files.flatMap((file) => [...referencedNamespaces(readFileSync(file, "utf8"))]),
    );
    expect([...used].filter((ns) => !loadable.has(ns))).toEqual([]);
    expect(clubsNamespaces.filter(isAdminOnly)).toEqual([]);
  });

  it("boots with the students' backend (`@agilityhub/i18n/clubs`), never the full table", () => {
    const main = readFileSync(resolve(srcRoot, "main.tsx"), "utf8");
    expect(main).toMatch(
      /import \{[^}]*\bcreateClubsI18n\b[^}]*\} from "@agilityhub\/i18n\/clubs";/u,
    );
    expect(main).not.toMatch(/\bcreateI18n\b/u);
  });
});
