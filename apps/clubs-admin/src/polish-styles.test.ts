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
describe("E11-W02 (INC-11): D1 and D2 as their mockups draw them", () => {
  it("D1: a KPI's label is one regular line under its figure, not a bold title", () => {
    const label = declarations(".dashboard-kpi > span");
    expect(label.get("font-weight")).toBe("400");
    expect(label.get("font-size")).toBe("0.875rem");
  });

  it("D2: «Modalitat i tarifa» is the brand's pill, the width of its plan", () => {
    const select = declarations(".signup-review-plan .ah-select");
    expect(select.get("width")).toBe("fit-content");
    expect(select.get("border-radius")).toBe("var(--ah-radius-full)");
    expect(select.get("background-color")).toBe("var(--ah-color-primary)");
    expect(select.get("color")).toBe("var(--ah-color-primary-fg)");
  });

  it("D2: the WhatsApp chip stays on the contact's line, and the contact wraps instead", () => {
    expect(
      declarations(".signup-review-data dd:has(> .signup-review-whatsapp)").get("flex-wrap"),
    ).toBe("nowrap");
    expect(declarations(".signup-review-whatsapp").get("flex")).toBe("none");
  });

  it("D2: the image warning's ⚠ sits beside its text's first line", () => {
    expect(declarations(".signup-review-warning--image").get("display")).toBe("flex");
    expect(declarations(".signup-review-warning--image .ah-icon").get("flex")).toBe("none");
  });

  it("D2: the amount collected is the width of an amount, its badge on the same line", () => {
    expect(declarations(".signup-review-upfront > label .ah-input").get("width")).toBe("8rem");
    expect(declarations(".signup-review-upfront > label .ah-badge").get("flex")).toBe("none");
  });
});

describe("E11-W02 step 5 (axe color-contrast): D2's WhatsApp chip reads at AA on its fill", () => {
  it("the chip's text leans a fifth towards the text colour, as every badge's (axe: 4.2:1 in primary)", () => {
    expect(declarations(".signup-review-data a.signup-review-whatsapp").get("color")).toBe(
      "color-mix(in srgb, var(--ah-color-primary) 80%, var(--ah-color-text))",
    );
  });
});

describe("E11-W02 step 5 (axe link-in-text-block): a link inside a sentence is underlined", () => {
  it("D11's last change («amb històric») is told apart by its underline, not by colour alone", () => {
    expect(declarations(".audit-last-change a").get("text-decoration")).toBe("underline");
  });
});
