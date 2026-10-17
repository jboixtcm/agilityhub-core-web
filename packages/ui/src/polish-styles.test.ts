import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(import.meta.dirname, name), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");

/** The declarations every top-level rule of `css` listing `selector` gives it, the later winning. */
function declarations(css: string, selector: string): Map<string, string> {
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
describe("E11-W02 (INC-11, screen 10 at 375 px): a day-grid title wraps between its words", () => {
  it("two lines at most, never cut inside a word («Obed. utilitat», not «Obed. u…»)", () => {
    const title = declarations(read("day-grid.css"), ".ah-day-grid .ah-schedule-cell__title");
    expect(title.get("white-space")).toBe("normal");
    expect(title.get("-webkit-line-clamp")).toBe("2");
    expect(title.get("line-clamp")).toBe("2");
    expect(title.get("word-break")).toBe("normal");
    expect(title.get("overflow-wrap")).toBe("normal");
  });
});

describe("E11-W02 step 5: a tone's chip and badge read at AA on their own tinted fill", () => {
  it("the label leans a fifth towards the text colour (axe: 4.26:1 with the bare tone)", () => {
    for (const selector of [".ah-chip", ".ah-badge"]) {
      expect(declarations(read("components.css"), selector).get("color")).toMatch(
        /^color-mix\(\s*in srgb,\s*var\(--ah-tone-color, var\(--ah-color-text-muted\)\) 80%,\s*var\(--ah-color-text\)\s*\)$/u,
      );
    }
  });
});
