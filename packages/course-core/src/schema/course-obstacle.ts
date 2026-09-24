import { z } from 'zod';
import { obstacleTypeSchema, point2DMetersSchema } from './primitives.js';

/**
 * A single obstacle in a course.
 *
 * - `sourceCode` is the raw Smarter group key (e.g. "jb", "t3s", "djb").
 * - `obstacleType` is the normalized AgilityHub type.
 * - `xMeters` / `yMeters` are the obstacle anchor in the course-design
 *   coordinate frame (meters, origin given by the parent CourseData).
 * - Tunnels and other multi-point obstacles also carry
 *   `controlPointsMeters`.
 * - Original Smarter id (numeric string) is preserved in `sourceId` so
 *   numbers can be linked via `oid`.
 * - `rawMetadata` contains everything else from the source entry, including
 *   original canvas-pixel coordinates under `_canvas`, so downstream tools
 *   can debug or re-render against the original frame.
 */
export const courseObstacleSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceCode: z.string(),
  obstacleType: obstacleTypeSchema,

  /** Anchor point. Tunnels: this is the midpoint of `controlPointsMeters`. */
  xMeters: z.number().nullable(),
  yMeters: z.number().nullable(),

  rotationDegrees: z.number().nullable(),

  /** Nominal physical length in meters (e.g. 3 / 4 / 5 / 6 for tunnels). */
  nominalLengthMeters: z.number().nullable(),

  /** Polyline / Bezier control points in METERS (tunnels mainly). */
  controlPointsMeters: z.array(point2DMetersSchema).nullable(),

  /** Color palette key used by the renderer (e.g. "j", "t3", "at"). */
  colorKey: z.string().nullable(),

  /** Phase-9 ("AR build") state — always "notPlaced" right after import. */
  status: z.enum(['notPlaced', 'placed']).default('notPlaced'),

  /** Everything we kept from the source for debugging / re-render. */
  rawMetadata: z.record(z.string(), z.unknown()),
});
export type CourseObstacle = z.infer<typeof courseObstacleSchema>;
