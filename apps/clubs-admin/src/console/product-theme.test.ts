import tokensCss from "@agilityhub/ui/tokens.css?raw";
import { describe, expect, it } from "vitest";

import { productTheme, productTokens } from "./product-theme";
import { contrastFailures } from "./tabs/ThemeTab";

describe("E10-W01 round 2 #2 · «preset AgilityHub» from packages/ui's tokens (S17 §5)", () => {
  it("reads the light and dark presets from tokens.css, every colour as the api's #rrggbb", () => {
    for (const mode of ["light", "dark"] as const) {
      const theme = productTheme(mode);
      expect(Object.keys(theme.colors).sort()).toEqual(
        [
          "background",
          "border",
          "danger",
          "info",
          "onPrimary",
          "primary",
          "success",
          "surface",
          "surfaceAlt",
          "text",
          "textMuted",
          "warning",
        ].sort(),
      );
      for (const color of Object.values(theme.colors)) expect(color).toMatch(/^#[0-9a-f]{6}$/u);
      expect(theme.radius).toMatch(/^\d+(\.\d+)?px$/u);
      expect(theme.fontFamily).not.toBe("");
      expect(theme.mode).toBe(mode);
      // The product's own pairs pass the AA checks the console applies to any club.
      expect(contrastFailures(theme.colors)).toEqual([]);
    }
    expect(productTheme("dark").colors.background).not.toBe(
      productTheme("light").colors.background,
    );
    // `auto` follows the light palette.
    expect(productTheme("auto").colors).toEqual(productTheme("light").colors);
  });

  it("fails loudly when a token is missing, never with a club's colour", () => {
    expect(productTokens(":root { --ah-product-radius: 8px; }").get("radius")).toBe("8px");
    expect(() =>
      productTheme("light", productTokens(":root { --ah-product-radius: 8px; }")),
    ).toThrow(/--ah-product-light-/u);
  });
});

/** `--ah-product-*` token → the default `--ah-color-*` token it copies (light `:root`, dark block). */
const DEFAULT_TOKEN: Readonly<Record<string, string>> = {
  background: "background",
  border: "border",
  danger: "danger",
  info: "info",
  "on-primary": "primary-fg",
  primary: "primary",
  success: "success",
  surface: "surface",
  "surface-alt": "surface-2",
  text: "text",
  "text-muted": "text-muted",
  warning: "warning",
};

function hex(value: string): number[] {
  const digits = /^#([0-9a-f]{6})$/iu.exec(value.trim())?.[1];
  if (digits === undefined) throw new TypeError(`Not a #rrggbb colour: ${value}`);
  return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
}

/** `#rrggbb`, or `color-mix(in srgb, A p%, B)` resolved the way the browser does (rounded). */
function resolveColor(value: string): string {
  const mix =
    /^color-mix\(in srgb,\s*(#[0-9a-f]{6})\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-f]{6})\)$/iu.exec(
      value.trim(),
    );
  const channels =
    mix === null
      ? hex(value)
      : (() => {
          const [, first = "", share = "0", second = ""] = mix;
          const weight = Number(share) / 100;
          const left = hex(first);
          const right = hex(second);
          return left.map((channel, index) =>
            Math.round(channel * weight + (right[index] ?? 0) * (1 - weight)),
          );
        })();
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The `--ah-color-*` declarations of the first block that starts with `opening`. */
function declarations(css: string, opening: RegExp): Map<string, string> {
  const start = css.search(opening);
  if (start < 0) throw new TypeError(`No block ${String(opening)}`);
  const block = css.slice(start, css.indexOf("}", css.indexOf("{", start)));
  return new Map(
    [...block.matchAll(/--ah-color-([a-z0-9-]+):\s*([^;]+);/gu)].map(
      ([, name = "", value = ""]) => [name, value.trim()] as const,
    ),
  );
}

/** Every product token that does not equal the default it copies (empty: in step). */
function productDrift(css: string): string[] {
  const light = declarations(css, /^:root \{/mu);
  const dark = declarations(css, /:root\[data-theme="auto"\] \{\n\s+--ah-color-primary/u);
  const product = productTokens(css);
  return Object.entries(DEFAULT_TOKEN).flatMap(([token, base]) =>
    (["light", "dark"] as const).flatMap((mode) => {
      // The dark block overrides the surfaces and text; the status colours stay the light ones.
      const source = mode === "dark" ? (dark.get(base) ?? light.get(base)) : light.get(base);
      const value = product.get(`${mode}-${token}`);
      if (source === undefined || value === undefined) return [`${mode}-${token}: missing`];
      const expected = resolveColor(source);
      return value.toLowerCase() === expected ? [] : [`${mode}-${token}: ${value} ≠ ${expected}`];
    }),
  );
}

describe("E10-W03 #6 (E10-W01 review #1) · the product preset follows the default tokens", () => {
  it("each --ah-product-light-* is its default --ah-color-* (color-mix resolved), each dark one the dark block", () => {
    expect(productDrift(tokensCss)).toEqual([]);
  });

  it("reports a default token changed without its product copy", () => {
    // The light primary moved to another token's colour (the dark background), its product copy
    // left as it was: the drift names exactly that token.
    const primary = declarations(tokensCss, /^:root \{/mu).get("primary") ?? "";
    const other = productTokens(tokensCss).get("dark-background") ?? "";
    expect(primary).not.toBe(other);
    const drifted = tokensCss.replace(
      `--ah-color-primary: ${primary};`,
      `--ah-color-primary: ${other};`,
    );
    expect(drifted).not.toBe(tokensCss);
    expect(productDrift(drifted)).toEqual([`light-primary: ${primary} ≠ ${other}`]);
  });
});
