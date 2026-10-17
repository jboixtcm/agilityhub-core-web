import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  "",
);

/** The declarations every top-level rule listing `selector` gives it, the later ones winning. */
function declarations(selector: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [, selectors = "", block = ""] of css.matchAll(
    /(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/gu,
  )) {
    if (!selectors.split(",").some((one) => one.trim() === selector)) continue;
    for (const line of block.split(";")) {
      const colon = line.indexOf(":");
      if (colon > 0) result.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  return result;
}

// jsdom has no layout: the stylesheet itself is the test (as `universal-list-layout.test.ts`).
describe("E11-W02 (INC-11): screens 01 and 16 as their mockups draw them", () => {
  it("01: «Encara no hi ets?» stays grey and only its action reads as a link, underlined on hover and focus", () => {
    expect(declarations(".auth-signup a").get("color")).toBe("var(--ah-color-text-muted)");
    expect(declarations(".auth-signup a").get("font-weight")).toBeUndefined();
    expect(declarations(".auth-link").get("color")).toBe("var(--ah-color-primary)");
    for (const state of [
      ".auth-text-action:hover .auth-link",
      ".auth-text-action:focus-visible .auth-link",
      ".auth-signup a:hover .auth-link",
      ".auth-signup a:focus-visible .auth-link",
    ]) {
      expect(declarations(state).get("text-decoration")).toBe("underline");
    }
  });

  it("16: the DNI/NIE and passport inputs share a line whatever their labels' length (one subgrid)", () => {
    for (const grid of [".signup-grid--identity", ".signup-grid--phone"]) {
      expect(declarations(grid).get("grid-template-rows")).toBe("auto auto auto");
      const field = declarations(`${grid} > .ah-form-field`);
      expect(field.get("grid-row")).toBe("span 3");
      expect(field.get("grid-template-rows")).toBe("subgrid");
    }
  });
});

describe("E11-W02 step 5: the dog's level reads at AA on its tinted fill", () => {
  it("13: the level's text leans towards the text colour (axe: 4.46:1 with the bare primary)", () => {
    expect(declarations(".dog-card__level").get("color")).toBe(
      "color-mix(in srgb, var(--ah-color-primary) 80%, var(--ah-color-text))",
    );
  });
});
