import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { contrastRatio } from "@agilityhub/ui";
import { describe, expect, it } from "vitest";

type Rgb = [number, number, number];

const clubStyles = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
const tokens = readFileSync(
  resolve(import.meta.dirname, "../../../packages/ui/src/tokens.css"),
  "utf8",
);

/** Every rule `selector { declarations }` of a stylesheet, those inside `@media` included. */
function rules(css: string): { declarations: string; selectors: string[] }[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(
    ([, selector = "", declarations = ""]) => ({
      declarations,
      selectors: selector.split(",").map((part) => part.trim()),
    }),
  );
}

/**
 * The opacity a task row's text is painted with: the product of every `opacity` of the rules on
 * the row, its text and its containers (`.dog-task…`, `.dog-tasks…`, `.dog-card…`).
 */
function taskRowOpacity(): number {
  return rules(clubStyles)
    .filter(({ selectors }) =>
      selectors.some((selector) => /^\.dog-(?:card|tasks?)(?![\w-])/u.test(selector)),
    )
    .flatMap(({ declarations }) =>
      [...declarations.matchAll(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/gu)].map(([, value]) =>
        Number(value),
      ),
    )
    .reduce((product, value) => product * value, 1);
}

function hexChannels(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as Rgb;
}

/** A token of the product's light default (`:root` of tokens.css): a hex or an sRGB `color-mix`. */
function lightToken(name: string): Rgb {
  const value = new RegExp(`${name}:\\s*([^;]+);`, "u").exec(tokens)?.[1]?.trim() ?? "";
  const mix = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, (#[0-9a-f]{6})\)$/iu.exec(value);
  if (mix === null) return hexChannels(value);
  const [, first = "", share = "0", second = ""] = mix;
  return blend(hexChannels(first), hexChannels(second), Number(share) / 100);
}

/** `color` painted with `alpha` over `background`, as the browser composites it. */
function blend(color: Rgb, background: Rgb, alpha: number): Rgb {
  return color.map(
    (channel, index) => channel * alpha + (background[index] ?? 0) * (1 - alpha),
  ) as Rgb;
}

/** The hex notation `contrastRatio` reads. */
function css(rgb: Rgb): string {
  return ["#", ...rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0"))].join("");
}

const canic = brandingCanicFixture.theme.colors;

/** The theme colour behind each token the club's theme sets (`applyBrandingTheme`). */
const THEME_KEYS: Readonly<Record<string, keyof typeof canic>> = {
  "--ah-color-border": "border",
  "--ah-color-danger": "danger",
  "--ah-color-info": "info",
  "--ah-color-primary": "primary",
  "--ah-color-success": "success",
  "--ah-color-surface": "surface",
  "--ah-color-text": "text",
  "--ah-color-text-muted": "textMuted",
  "--ah-color-warning": "warning",
};

function darkToken(name: string): Rgb {
  const key = THEME_KEYS[name];
  if (key === undefined) throw new TypeError(`No theme colour for ${name}`);
  return hexChannels(canic[key]);
}

/**
 * The token that paints a selector's text: the last `color: var(--ah-color-…)` of its rules, or
 * the card's own text colour when no rule sets one.
 */
function paintToken(selector: string): string {
  const tokensUsed = rules(clubStyles)
    .filter(({ selectors }) => selectors.includes(selector))
    .flatMap(({ declarations }) =>
      [...declarations.matchAll(/(?:^|;)\s*color\s*:\s*var\((--ah-color-[\w-]+)\)/gu)].map(
        ([, token]) => token ?? "",
      ),
    );
  return tokensUsed.at(-1) ?? "--ah-color-text";
}

const PALETTES = [
  {
    background: hexChannels(canic.surface),
    muted: hexChannels(canic.textMuted),
    name: "dark (the club's fixture theme)",
    token: darkToken,
  },
  {
    background: lightToken("--ah-color-surface"),
    muted: lightToken("--ah-color-text-muted"),
    name: "light (the product's default tokens)",
    token: lightToken,
  },
];

describe("E4-W16 round 2 #3 (AGENTS rule 6, R-03-18): a done task on 13 stays readable", () => {
  it("no rule dims the task rows: the check mark and the strike-through mark a done task", () => {
    expect(taskRowOpacity()).toBe(1);
    const done = rules(clubStyles).filter(({ selectors }) =>
      selectors.some((selector) => selector.startsWith(".dog-task[data-done]")),
    );
    expect(done.map(({ declarations }) => declarations.trim())).toEqual([
      "text-decoration: line-through;",
    ]);
    // The meta line keeps the muted text colour of the theme.
    expect(
      rules(clubStyles).find(({ selectors }) => selectors.includes(".dog-task small"))
        ?.declarations,
    ).toContain("color: var(--ah-color-text-muted)");
  });

  it.each(PALETTES)(
    "the task text and «feta el …» reach 4.5:1 on the card in the $name palette",
    ({ background, muted, token }) => {
      const opacity = taskRowOpacity();
      // E4-W18 step 4 (review nit #5): the task text with the colour that paints it
      // (`.dog-task p` → `--ah-color-text-muted` today), not the card's text colour.
      const text = token(paintToken(".dog-task p"));
      const textRatio = contrastRatio(css(blend(text, background, opacity)), css(background));
      const metaRatio = contrastRatio(css(blend(muted, background, opacity)), css(background));
      expect(textRatio).toBeGreaterThanOrEqual(4.5);
      expect(metaRatio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("E4-W18 step 4: the task text's paint is read from the stylesheet (`.dog-task p` → muted)", () => {
    expect(paintToken(".dog-task p")).toBe("--ah-color-text-muted");
  });
});
