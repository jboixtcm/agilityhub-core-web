import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Rgb = readonly [number, number, number];
export type Theme = "light" | "dark";

const tokensCss = readFileSync(resolve(process.cwd(), "../ui/src/tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  "",
);

function declarationsOf(block: string): Map<string, string> {
  return new Map(
    block
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("--"))
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const;
      }),
  );
}

/** The `:root` variables, then the dark theme's overrides (`prefers-color-scheme: dark`). */
function variables(theme: Theme): Map<string, string> {
  const root = /:root\s*\{([^{}]*)\}/u.exec(tokensCss)?.[1] ?? "";
  const result = declarationsOf(root);
  if (theme === "dark") {
    const dark =
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\[data-theme="auto"\]\s*\{([^{}]*)\}/u.exec(
        tokensCss,
      )?.[1];
    if (dark === undefined) throw new Error("DARK_THEME_BLOCK_NOT_FOUND");
    for (const [name, value] of declarationsOf(dark)) result.set(name, value);
  }
  return result;
}

function hex(text: string): Rgb {
  const value = text.replace("#", "");
  return [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  ) as unknown as Rgb;
}

function colour(value: string, vars: ReadonlyMap<string, string>): Rgb {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/iu.test(text)) return hex(text);
  const variable = /^var\((--[\w-]+)\)$/u.exec(text)?.[1];
  if (variable !== undefined) {
    const next = vars.get(variable);
    if (next === undefined) throw new Error(`UNKNOWN_TOKEN:${variable}`);
    return colour(next, vars);
  }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/u.exec(text);
  if (mix === null) throw new Error(`UNSUPPORTED_COLOUR:${text}`);
  const share = Number(mix[2]) / 100;
  const a = colour(mix[1] ?? "", vars);
  const b = colour(mix[3] ?? "", vars);
  return a.map((channel, i) =>
    Math.round(channel * share + (b[i] ?? 0) * (1 - share)),
  ) as unknown as Rgb;
}

/** A design token resolved to sRGB in the given theme (var chains and `color-mix` included). */
export function tokenRgb(token: string, theme: Theme = "light"): Rgb {
  return colour(`var(${token})`, variables(theme));
}

export function tokenHex(token: string, theme: Theme = "light"): string {
  return `#${tokenRgb(token, theme)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio of two tokens in a theme. */
export function contrast(foreground: string, background: string, theme: Theme): number {
  const a = luminance(tokenRgb(foreground, theme));
  const b = luminance(tokenRgb(background, theme));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
