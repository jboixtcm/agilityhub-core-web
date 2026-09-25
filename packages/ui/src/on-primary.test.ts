import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

// Primary-coloured shapes that carry no text (bars, tracks, switches, dots): no text colour to set.
const TEXTLESS = new Set([
  ".activity-ring__dot",
  ".ah-bar-chart__bar--highlighted",
  ".ah-switch--checked",
  ".dog-pack__track span",
  ".profile-notices__toggle--on",
  ".signup-progress__track .signup-progress__done",
]);

/** A mix with at least this share of the primary colour is «on primary»; below it, a tint. */
const PRIMARY_SHARE = 50;

function sourceFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "dist"].includes(entry.name) ? [] : sourceFiles(path, extension);
    }
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

function sourceRoots(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(join(repositoryRoot, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repositoryRoot, group, entry.name, "src")),
  );
}

function filesOf(extension: string): string[] {
  return sourceRoots().flatMap((root) => {
    try {
      return sourceFiles(root, extension);
    } catch {
      return [];
    }
  });
}

/**
 * The share of the primary colour a `background`/`background-color` value paints: 100 for the
 * solid colour (also as the first value of a shorthand, with `!important`, or as the fallback of
 * a custom property), N for `color-mix(… var(--ah-color-primary) N% …)`, 0 otherwise.
 */
function primaryShare(value: string): number {
  const solid = /^(?:var\(--[a-z-]+,\s*)?var\(--ah-color-primary\)/u;
  if (solid.test(value.trim())) return 100;
  const mix = /color-mix\([^,]+,\s*var\(--ah-color-primary\)\s*(\d+(?:\.\d+)?)%/u.exec(value);
  return mix === null ? 0 : Number(mix[1]);
}

function declarations(block: string): Map<string, string> {
  const entries = block
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.includes(":"))
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const;
    });
  return new Map(entries);
}

/** The selector without its states (`:hover`, `:not(…)`, `:focus-visible`…): the base rule. */
function baseSelector(selector: string): string {
  return selector.replaceAll(/:(?:hover|active|focus|focus-visible|focus-within|not\([^)]*\))/gu, "").trim();
}

describe("A32 (Jordi 24-09): text on the primary colour reads the club's onPrimary", () => {
  it("every CSS rule that paints the primary colour (solid, shorthand or a ≥ 50 % mix) behind text uses --ah-color-primary-fg", () => {
    const offending: string[] = [];
    let checked = 0;
    for (const file of filesOf(".css")) {
      const css = readFileSync(file, "utf8").replaceAll(/\/\*[\s\S]*?\*\//gu, "");
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(([, selector = "", block = ""]) => ({
        declarations: declarations(block),
        selectors: selector.trim().split(/\s*,\s*/u),
      }));
      // The text colour each selector sets, so a state rule (`:hover`) inherits its base rule's.
      const textColour = new Map<string, string>();
      for (const rule of rules) {
        const colour = rule.declarations.get("color");
        if (colour !== undefined) for (const selector of rule.selectors) textColour.set(selector, colour);
      }
      for (const rule of rules) {
        const background = rule.declarations.get("background") ?? rule.declarations.get("background-color");
        if (background === undefined || primaryShare(background) < PRIMARY_SHARE) continue;
        for (const selector of rule.selectors) {
          if (TEXTLESS.has(selector)) continue;
          checked += 1;
          const colour = rule.declarations.get("color") ?? textColour.get(baseSelector(selector));
          if (colour?.replace(/\s*!important$/u, "") !== "var(--ah-color-primary-fg)") {
            offending.push(`${relative(repositoryRoot, file)}: ${selector} (color: ${colour ?? "unset"})`);
          }
        }
      }
    }
    // The primary button and its hover, the signup segments and chips, the shells' marks…
    expect(checked).toBeGreaterThan(15);
    expect(offending).toEqual([]);
  });

  it("the guard reads shorthands, fallbacks and mixes", () => {
    expect(primaryShare("var(--ah-color-primary)")).toBe(100);
    expect(primaryShare("var(--ah-color-primary) !important")).toBe(100);
    expect(primaryShare("var(--ah-color-primary) url(mark.svg) no-repeat")).toBe(100);
    expect(primaryShare("var(--ring-colour, var(--ah-color-primary))")).toBe(100);
    expect(primaryShare("color-mix(in srgb, var(--ah-color-primary) 86%, var(--ah-color-text))")).toBe(86);
    expect(primaryShare("color-mix(in srgb, var(--ah-color-primary) 12%, transparent)")).toBe(12);
    expect(primaryShare("var(--ah-color-surface)")).toBe(0);
    expect(baseSelector(".ah-button--primary:hover:not(:disabled)")).toBe(".ah-button--primary");
  });

  it("no component paints the primary colour in an inline style (TSX): the colour lives in the CSS rules above", () => {
    const inline = filesOf(".tsx").flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/background(?:Color)?\s*:\s*[`"'][^`"']*--ah-color-primary\)/gu)].map(
        () => relative(repositoryRoot, file),
      ),
    );
    expect(inline).toEqual([]);
  });
});
