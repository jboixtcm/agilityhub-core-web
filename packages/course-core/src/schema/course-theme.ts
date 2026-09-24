import { z } from 'zod';

/**
 * Color tokens for a single obstacle type within a CourseTheme.
 *
 * Smarter color schemes (sad-colors-*.txt) carry many keys per obstacle:
 * stroke, fill, fill2, strokeWidth, plus -g (greyed) variants. We surface
 * the most useful ones; the rest stay in `extras` so the renderer can use
 * them when relevant.
 */
export const themeObstacleColorsSchema = z.object({
  stroke: z.string().nullable(),
  fill: z.string().nullable(),
  fill2: z.string().nullable(),
  fillGrey: z.string().nullable(),
  fill2Grey: z.string().nullable(),
  strokeWidth: z.number().nullable(),
  /** Anything else from the source — kept for renderer flexibility. */
  extras: z.record(z.string(), z.unknown()),
});
export type ThemeObstacleColors = z.infer<typeof themeObstacleColorsSchema>;

/**
 * A complete CourseTheme — typically loaded from a Smarter colors export.
 *
 * `id` is the palette key from the source (e.g. "canic", "agilityhub",
 * "hub"). `obstacleColors` is keyed by Smarter colorKey
 * (e.g. "j", "dj", "t3", "t4", "at", "n1").
 */
export const courseThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['smarter-agility', 'agilityhub-default']),
  obstacleColors: z.record(z.string(), themeObstacleColorsSchema),
  rawMetadata: z.record(z.string(), z.unknown()),
});
export type CourseTheme = z.infer<typeof courseThemeSchema>;

/**
 * The default AgilityHub palette shipped with the app. Renderers fall back
 * to this when a course doesn't include a custom theme.
 */
export const DEFAULT_THEME_ID = 'agilityhub';
