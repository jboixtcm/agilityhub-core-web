import { z } from 'zod';
import { courseNumberSchema } from './course-number.js';
import { courseObstacleSchema } from './course-obstacle.js';
import { noGoZoneSchema } from './no-go-zone.js';
import { originSchema, unitSystemSchema } from './primitives.js';

/**
 * Lightweight metadata about the original Smarter file. We deliberately
 * keep this small and quotable in UI — the full source object is in
 * `CourseData.rawMetadata` for traceability.
 */
export const courseSourceMetadataSchema = z.object({
  type: z.string(),
  courseType: z.string(),
  grade: z.string(),
  category: z.string(),
  location: z.string(),
  designer: z.string(),
  organization: z.string(),
  date: z.string(),
  exportVersion: z.number().nullable(),
  obstacleSummary: z.array(z.string()).nullable(),
});
export type CourseSourceMetadata = z.infer<typeof courseSourceMetadataSchema>;

/**
 * Logos we ignored at import time. We don't render or warn on logos, but we
 * keep a count (and the raw entries for debugging) so importers don't
 * silently drop information.
 */
export const ignoredLogoSchema = z.object({
  url: z.string().nullable(),
  rawMetadata: z.record(z.string(), z.unknown()),
});
export type IgnoredLogo = z.infer<typeof ignoredLogoSchema>;

/**
 * The canonical AgilityHub course representation.
 *
 * Coordinates are METERS in the course-design frame. The Smarter source
 * canvas (pixels) is preserved in `rawMetadata.canvas` and in each
 * obstacle/number/zone's `rawMetadata` so we can re-render against the
 * original frame if needed.
 *
 * `themeId` references a CourseTheme by id. Themes live separately and may
 * not be present in every export — default to `agilityhub`.
 */
export const courseDataSchema = z.object({
  id: z.string(),
  source: z.literal('smarter-agility'),
  sourceFileName: z.string().nullable(),

  title: z.string(),
  titleRaw: z.string().nullable(),

  units: unitSystemSchema,
  designLengthMeters: z.number().positive(),
  designWidthMeters: z.number().positive(),
  canvasWidth: z.number().positive(),
  canvasHeight: z.number().positive(),
  origin: originSchema,

  metadata: courseSourceMetadataSchema,

  obstacles: z.array(courseObstacleSchema),
  numbers: z.array(courseNumberSchema),
  noGoZones: z.array(noGoZoneSchema),
  ignoredLogos: z.array(ignoredLogoSchema),

  /** Default theme key. Renderers look up the actual CourseTheme separately. */
  themeId: z.string().default('agilityhub'),

  /** Anything from the source we didn't surface, kept verbatim. */
  rawMetadata: z.record(z.string(), z.unknown()),
});
export type CourseData = z.infer<typeof courseDataSchema>;
