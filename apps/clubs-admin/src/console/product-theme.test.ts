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
    expect(productTheme("dark").colors.background).not.toBe(productTheme("light").colors.background);
    // `auto` follows the light palette.
    expect(productTheme("auto").colors).toEqual(productTheme("light").colors);
  });

  it("fails loudly when a token is missing, never with a club's colour", () => {
    expect(productTokens(":root { --ah-product-radius: 8px; }").get("radius")).toBe("8px");
    expect(() =>
      productTheme("light", productTokens(":root { --ah-product-radius: 8px; }")),
    ).toThrow(
      /--ah-product-light-/u,
    );
  });
});
