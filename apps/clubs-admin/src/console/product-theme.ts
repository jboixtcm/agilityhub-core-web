import tokens from "@agilityhub/ui/tokens.css?raw";

import type { ProductTheme } from "./club-definition";

type ThemeColors = ProductTheme["colors"];

/** `--ah-product-{mode}-{token}` of `tokens.css` → the `Colors` key it fills. */
const colorByToken = {
  background: "background",
  border: "border",
  danger: "danger",
  info: "info",
  "on-primary": "onPrimary",
  primary: "primary",
  success: "success",
  surface: "surface",
  "surface-alt": "surfaceAlt",
  text: "text",
  "text-muted": "textMuted",
  warning: "warning",
} as const satisfies Record<string, keyof ThemeColors>;

/** `--ah-product-*: value;` of a stylesheet, by name without the prefix. */
export function productTokens(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/--ah-product-([a-z-]+):\s*([^;]+);/gu)].map(
      ([, name = "", value = ""]) => [name, value.trim()] as const,
    ),
  );
}

let declared: Map<string, string> | undefined;

/** `tokens.css`'s product tokens, parsed once (the stylesheet is referenced only here). */
function declaredTokens(): Map<string, string> {
  declared ??= productTokens(tokens);
  return declared;
}

/**
 * «Preset AgilityHub» (S17 §5, light or dark): the product's theme, read from the design tokens of
 * `packages/ui` and never from the host's branding, so a club created from another club's admin
 * host never inherits that club's colours or typeface (AGENTS rule 2). `auto` takes the light
 * colours. The product has no ring palette: the club sets one in its «Tema» tab.
 */
export function productTheme(
  mode: ProductTheme["mode"],
  values: ReadonlyMap<string, string> = declaredTokens(),
): ProductTheme {
  const palette = mode === "dark" ? "dark" : "light";
  const read = (name: string) => {
    const value = values.get(name);
    if (value === undefined) throw new TypeError(`tokens.css lacks --ah-product-${name}`);
    return value;
  };
  const colors = Object.fromEntries(
    Object.entries(colorByToken).map(([token, key]) => [key, read(`${palette}-${token}`)]),
  ) as unknown as ThemeColors;
  return {
    colors,
    fontFamily: read("font-family"),
    mode,
    radius: read("radius"),
    ringPalette: [],
  };
}
