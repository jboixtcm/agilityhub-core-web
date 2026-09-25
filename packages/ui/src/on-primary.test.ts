import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

// Primary-coloured shapes that carry no text (bars, tracks, switches): no text colour to set.
const TEXTLESS = new Set([
  ".ah-bar-chart__bar--highlighted",
  ".ah-switch--checked",
  ".dog-pack__track span",
  ".profile-notices__toggle--on",
  ".signup-progress__track .signup-progress__done",
]);

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ["node_modules", "dist"].includes(entry.name) ? [] : cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

function sourceRoots(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(join(repositoryRoot, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repositoryRoot, group, entry.name, "src")),
  );
}

describe("A32 (Jordi 24-09): text on the primary colour reads the club's onPrimary", () => {
  it("every rule that paints the primary colour behind text sets color: var(--ah-color-primary-fg)", () => {
    const offending: string[] = [];
    let checked = 0;
    for (const root of sourceRoots()) {
      let files: string[];
      try {
        files = cssFiles(root);
      } catch {
        continue;
      }
      for (const file of files) {
        const css = readFileSync(file, "utf8").replaceAll(/\/\*[\s\S]*?\*\//gu, "");
        for (const [, selector = "", declarations = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
          if (!/(?:^|;)\s*background(?:-color)?:\s*var\(--ah-color-primary\)\s*(?:;|$)/u.test(declarations)) {
            continue;
          }
          const selectors = selector.trim().split(/\s*,\s*/u);
          if (selectors.every((item) => TEXTLESS.has(item))) continue;
          checked += 1;
          if (!/(?:^|;)\s*color:\s*var\(--ah-color-primary-fg\)\s*(?:;|$)/u.test(declarations)) {
            offending.push(`${relative(repositoryRoot, file)}: ${selector.trim()}`);
          }
        }
      }
    }
    // The primary button, the signup segments and chips, the shells' marks… (never a vacuous pass).
    expect(checked).toBeGreaterThan(15);
    expect(offending).toEqual([]);
  });
});
