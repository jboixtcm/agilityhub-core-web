/**
 * Smarter color-scheme file (`sad-colors-*.txt`) → CourseTheme[].
 *
 * The file is a JSON object (no wrapper) of shape:
 *
 *   {
 *     "obstacleCustomColors": {
 *       "setting_id": "obstacleCustomColors",
 *       "canic":      { "id": ..., "name": "Canic",      "obstacles": { ... } },
 *       "agilityhub": { "id": ..., "name": "AgilityHub", "obstacles": { ... } },
 *       "hub":        { "id": ..., "name": "hub",        "obstacles": { ... } }
 *     }
 *   }
 *
 * We surface one CourseTheme per palette, with `obstacleColors` keyed by
 * the same color keys used in the obstacle map (`j`, `dj`, `t3`, `at`, …).
 *
 * Anything we don't recognize stays in `extras` so the renderer is free to
 * use it when it needs to (e.g. specialty obstacles introduced later).
 */
import {
  courseThemeSchema,
  type CourseTheme,
  type ThemeObstacleColors,
} from '../schema/course-theme.js';

export class SmarterColorsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmarterColorsParseError';
  }
}

export interface ParseSmarterColorsResult {
  readonly themes: CourseTheme[];
  /** Convenience map: theme id → theme. */
  readonly byId: Map<string, CourseTheme>;
}

export function parseSmarterColorsTxt(rawFile: string): ParseSmarterColorsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawFile);
  } catch (err) {
    throw new SmarterColorsParseError(`JSON.parse failed: ${(err as Error).message}`);
  }
  if (parsed == null || typeof parsed !== 'object') {
    throw new SmarterColorsParseError('Top-level value must be an object.');
  }

  const custom = (parsed as Record<string, unknown>)['obstacleCustomColors'];
  if (custom == null || typeof custom !== 'object') {
    throw new SmarterColorsParseError(
      'Missing or invalid "obstacleCustomColors" key in colors file.',
    );
  }

  const themes: CourseTheme[] = [];
  for (const [paletteId, paletteUnknown] of Object.entries(custom as Record<string, unknown>)) {
    if (paletteId === 'setting_id') continue;
    if (paletteUnknown == null || typeof paletteUnknown !== 'object') continue;
    const palette = paletteUnknown as Record<string, unknown>;
    const name = typeof palette['name'] === 'string' ? (palette['name'] as string) : paletteId;
    const obstaclesRaw = palette['obstacles'];
    const obstacleColors: Record<string, ThemeObstacleColors> = {};
    if (obstaclesRaw != null && typeof obstaclesRaw === 'object') {
      for (const [colorKey, colorEntryUnknown] of Object.entries(
        obstaclesRaw as Record<string, unknown>,
      )) {
        if (colorKey === 'setting_id') continue;
        if (colorEntryUnknown == null || typeof colorEntryUnknown !== 'object') continue;
        obstacleColors[colorKey] = toThemeObstacleColors(
          colorEntryUnknown as Record<string, unknown>,
        );
      }
    }

    const theme = courseThemeSchema.parse({
      id: paletteId,
      name,
      source: 'smarter-agility',
      obstacleColors,
      rawMetadata: palette,
    });
    themes.push(theme);
  }

  return { themes, byId: new Map(themes.map((t) => [t.id, t])) };
}

function toThemeObstacleColors(raw: Record<string, unknown>): ThemeObstacleColors {
  const stroke = asColorString(raw['stroke']);
  const fill = asColorString(raw['fill']);
  const fill2 = asColorString(raw['fill2']);
  const fillGrey = asColorString(raw['fillg']);
  const fill2Grey = asColorString(raw['fill2g']);
  const strokeWidth =
    typeof raw['strokeWidth'] === 'number' && Number.isFinite(raw['strokeWidth'])
      ? (raw['strokeWidth'] as number)
      : null;

  const handled = new Set(['stroke', 'fill', 'fill2', 'fillg', 'fill2g', 'strokeWidth', 'type']);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!handled.has(k)) extras[k] = v;
  }

  return { stroke, fill, fill2, fillGrey, fill2Grey, strokeWidth, extras };
}

function asColorString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
