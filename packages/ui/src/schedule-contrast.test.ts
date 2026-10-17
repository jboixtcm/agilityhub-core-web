import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import canic from "../../api-client/src/mocks/fixtures/branding-canic.json";
import minim from "../../api-client/src/mocks/fixtures/branding-minim.json";

import { contrastRatio } from "./branding";

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//gu, "");
const tokens = strip(readFileSync(resolve(import.meta.dirname, "tokens.css"), "utf8"));
const grid = strip(readFileSync(resolve(import.meta.dirname, "schedule-grid.css"), "utf8"));

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as Rgb;
const hex = (color: Rgb) =>
  `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
/** `color-mix(in srgb, a p%, b)`. */
const mix = (a: string, share: number, b: string) =>
  hex(rgb(a).map((channel, index) => channel * share + (rgb(b)[index] ?? 0) * (1 - share)) as Rgb);

/** The text share of a ring colour in a calendar cell, for the scheme the page paints. */
function textShare(scheme: "dark" | "light"): number {
  const selector =
    scheme === "light" ? /:root\[data-scheme="light"\]\s*\{([^{}]*)\}/u : /:root\s*\{([^{}]*)\}/u;
  const block = selector.exec(tokens)?.[1] ?? "";
  const value = /--ah-tint-text-share:\s*(\d+)%/u.exec(block)?.[1];
  if (value === undefined) throw new Error(`--ah-tint-text-share missing for ${scheme}`);
  return Number(value) / 100;
}

// E11-W02 step 5 (axe on D4, light theme: 2.93:1): a calendar cell writes its ring's colour mixed
// with the text colour on a 15 % tint of it; the share of the ring's colour depends on the scheme.
describe("E11-W02 step 5: calendar cells read at AA in both schemes", () => {
  it("the cell's text uses the scheme's share of the ring colour; a light scheme never dims the subtitle", () => {
    expect(grid).toMatch(/var\(--ah-tint-text-share, 72%\)/u);
    expect(grid).toMatch(
      /:root\[data-scheme="light"\] \.ah-schedule-cell__subtitle\s*\{\s*opacity:\s*1;\s*\}/u,
    );
  });

  it.each([
    ["dark", canic.theme],
    ["light", minim.theme],
  ] as const)(
    "%s club: every ring colour of its palette reads at 4.5:1 or more",
    (scheme, theme) => {
      const share = textShare(scheme);
      for (const ring of theme.ringPalette) {
        const text = mix(ring, share, theme.colors.text);
        const fill = mix(ring, 0.15, theme.colors.surface);
        expect(contrastRatio(text, fill), `${ring} (${scheme})`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
