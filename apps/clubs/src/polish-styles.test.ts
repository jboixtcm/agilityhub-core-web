import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(import.meta.dirname, name), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
const css = read("styles.css");

/** The declarations every top-level rule listing `selector` gives it, the later ones winning. */
function declarations(selector: string, source = css): Map<string, string> {
  const result = new Map<string, string>();
  for (const [, selectors = "", block = ""] of source.matchAll(
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

describe("WEB-11: the back arrows of 07, the course viewer and the self-service pages", () => {
  it("keep their 32 px look and take taps on a 44 px area around it", () => {
    for (const [selector, source] of [
      [".booking-screen__back", read("booking/booking.css")],
      [".self-page__header a", css],
    ] as const) {
      const link = declarations(selector, source);
      expect(link.get("position")).toBe("relative");
      expect(link.get("min-width")).toBe("2rem");
      expect(link.get("min-height")).toBe("2rem");
      const area = declarations(`${selector}::before`, source);
      expect(area.get("position")).toBe("absolute");
      expect(area.get("content")).toBe('""');
      // 2rem + 2 × 0.375rem = 2.75rem (44 px at the default 16 px).
      expect(area.get("inset")).toBe("-0.375rem");
    }
  });
});

describe("WEB-11: the switches of 12 take taps on 44 px without reaching their neighbours", () => {
  const ui = (name: string) => read(`../../../packages/ui/src/${name}`);
  const tokens = declarations(":root", ui("tokens.css"));
  /** A length in rem: `1.25rem` or a `var(--ah-space-N)` token of tokens.css. */
  const rem = (value: string | undefined): number => {
    const token = /^var\((--ah-[a-z0-9-]+)\)$/u.exec(value ?? "")?.[1];
    const length = token === undefined ? value : tokens.get(token);
    const match = /^(-?\d*\.?\d+)rem$/u.exec(length ?? "");
    if (match?.[1] === undefined) throw new TypeError(`Not a rem length: ${String(value)}`);
    return Number(match[1]);
  };

  it("each switch's area is 44 × 44 px (2.75rem) around its 36 × 20 px look", () => {
    const look = declarations(".ah-switch", ui("components.css"));
    expect(declarations(".profile-notices__switch").get("position")).toBe("relative");
    const area = declarations(".profile-notices__switch::before");
    expect(area.get("position")).toBe("absolute");
    expect(area.get("content")).toBe('""');
    const [block = "", inline = ""] = (area.get("inset") ?? "").split(" ");
    expect(rem(look.get("height")) - 2 * rem(block)).toBe(2.75);
    expect(rem(look.get("width")) - 2 * rem(inline)).toBe(2.75);
    // As wide as the e-mail column it sits in, so it never reaches the «App» tick beside it.
    expect(declarations(".profile-notices__row").get("grid-template-columns")).toBe(
      "minmax(0, 1fr) 2.75rem 2.75rem",
    );
  });

  it("the rows are tall and far enough apart that two areas, or an area and the next control, never overlap", () => {
    // How far a 2.75rem area centred in a row of the least height reaches beyond the row.
    const reach = (row: string) => (2.75 - rem(declarations(row).get("min-height"))) / 2;
    // The e-mail rows: 0.375rem reaches into the 0.75rem gap from each side.
    const rowReach = reach(".profile-notices__row");
    expect(rowReach).toBe(0.375);
    expect(2 * rowReach).toBeLessThanOrEqual(rem(declarations(".profile-notices").get("gap")));
    // The push row: the next control (WEB-02's button) starts after the push block's gap.
    const pushReach = reach(".profile-notices__mobile-row");
    expect(pushReach).toBeLessThan(rem(declarations(".profile-notices__mobile").get("gap")));
  });
});
