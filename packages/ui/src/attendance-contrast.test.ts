import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./branding";

type Rgb = [number, number, number];
type Variables = ReadonlyMap<string, string>;

const attendanceCss = readFileSync(resolve(import.meta.dirname, "attendance.css"), "utf8");
const tokensCss = readFileSync(resolve(import.meta.dirname, "tokens.css"), "utf8");

/** Every rule `selector { declarations }` of a stylesheet (those inside `@media` too). */
function rules(css: string): { declarations: string; selectors: string[] }[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(
    ([, selector = "", declarations = ""]) => ({
      declarations,
      selectors: selector.split(",").map((part) => part.trim()),
    }),
  );
}

function declarations(block: string): Map<string, string> {
  return new Map(
    block
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );
}

function rule(css: string, selector: string, declares?: string): Map<string, string> {
  const found = rules(css).find(
    ({ declarations: block, selectors }) =>
      selectors.includes(selector) && (declares === undefined || block.includes(declares)),
  );
  return declarations(found?.declarations ?? "");
}

function hexChannels(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as Rgb;
}

/** A CSS colour of these tokens: a hex, a `var(--token)` or an sRGB `color-mix` of those. */
function color(value: string, variables: Variables): Rgb | undefined {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/iu.test(text)) return hexChannels(text);
  const variable = /^var\((--[\w-]+)\)$/u.exec(text)?.[1];
  if (variable !== undefined) {
    const next = variables.get(variable);
    return next === undefined ? undefined : color(next, variables);
  }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/u.exec(text);
  if (mix === null) return undefined;
  const [, first = "", share = "0", second = ""] = mix;
  const a = color(first, variables);
  const b = color(second, variables);
  if (a === undefined || b === undefined) return undefined;
  const weight = Number(share) / 100;
  return a.map((channel, index) => channel * weight + (b[index] ?? 0) * (1 - weight)) as Rgb;
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function ratio(foreground: Rgb | undefined, background: Rgb | undefined): number {
  if (foreground === undefined || background === undefined) return 0;
  return contrastRatio(hex(foreground), hex(background)) ?? 0;
}

// The product's light default (`:root`) and its dark palette (the `auto` theme in a dark
// scheme, the same surface, text and muted text as the Cànic's dark fixture theme).
const light = rule(tokensCss, ":root");
const PALETTES = [
  { name: "light", variables: light },
  {
    name: "dark",
    variables: new Map([
      ...light,
      ...rule(tokensCss, ':root[data-theme="auto"]', "--ah-color-surface"),
    ]),
  },
];

const base = rule(attendanceCss, ".ah-attendance__circle");
/** The custom properties of one circle: the base rule's, then its state's (and a chosen one's). */
function circle(palette: Variables, state: string, chosen = false): Map<string, string> {
  return new Map([
    ...palette,
    ...base,
    ...rule(attendanceCss, `.ah-attendance__circle--${state}`),
    ...(chosen ? rule(attendanceCss, `.ah-attendance__circle--${state}[aria-checked="true"]`) : []),
  ]);
}
/** The colour the circle's ring is drawn with (`border: <width> solid <colour>`). */
function ring(variables: Variables): Rgb | undefined {
  const border = variables.get("border") ?? "";
  return color(border.replace(/^\S+\s+solid\s+/u, ""), variables);
}

const CASES = PALETTES.flatMap((palette) =>
  ["pending", "present", "notified", "no-show"].map((state) => ({ ...palette, state })),
);

describe("E6-W01 round 2 #6 (review #7, AGENTS rule 6): the attendance circles keep their contrast", () => {
  it("nothing that can be chosen is faded: the only opacity is on a circle the api does not allow (never one locked by a save) that is not the state", () => {
    const faded = rules(attendanceCss)
      .filter(({ selectors }) =>
        selectors.some((selector) => selector.startsWith(".ah-attendance__circle")),
      )
      .filter(({ declarations: block }) => /(?:^|;)\s*opacity\s*:/u.test(block))
      .flatMap(({ selectors }) => selectors);
    expect(faded).toEqual(['.ah-attendance__circle--unavailable:not([aria-checked="true"])']);
  });

  it.each(CASES)(
    "$name theme: the $state circle, not chosen, draws its ring at 3:1 or more on the surface",
    ({ state, variables }) => {
      const surface = color("var(--ah-color-surface)", variables);
      expect(ratio(ring(circle(variables, state)), surface)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(CASES.filter(({ state }) => state !== "pending"))(
    "$name theme: the chosen $state circle keeps its ring and its mark at 3:1 or more",
    ({ state, variables }) => {
      const chosen = circle(variables, state, true);
      const surface = color("var(--ah-color-surface)", variables);
      const fill = color(chosen.get("--ah-attendance-color") ?? "", chosen);
      const mark = color(chosen.get("--ah-attendance-mark") ?? "", chosen);
      expect(
        rule(attendanceCss, '.ah-attendance__circle[aria-checked="true"]').get("background"),
      ).toBe("var(--ah-attendance-color)");
      expect(ratio(ring(chosen), surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(mark, fill)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(PALETTES)(
    "$name theme: the chosen «pendent» draws its ring and its dot in the text colour, at 3:1 or more",
    ({ variables }) => {
      const chosen = circle(variables, "pending", true);
      const surface = color("var(--ah-color-surface)", variables);
      const dot = /radial-gradient\(circle,\s*(var\([^)]+\))/u.exec(chosen.get("background") ?? "");
      expect(ratio(ring(chosen), surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(color(dot?.[1] ?? "", chosen), surface)).toBeGreaterThanOrEqual(3);
    },
  );
});
