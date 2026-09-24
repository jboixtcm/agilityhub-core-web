import { z } from 'zod';
import { point2DMetersSchema } from './primitives.js';

/**
 * A no-go (restricted) polygon inside the course frame.
 *
 * Smarter exports grey restricted areas as `obstacles.at`. Each entry has a
 * `points` array of [x, y] pairs in canvas pixels. We convert to meters and
 * apply a default 0.5 m warning margin (overridable per zone).
 *
 * Origin / coordinate frame is the same as the parent CourseData.
 */
export const noGoZoneSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceType: z.literal('at'),
  label: z.string(),

  polygonPointsMeters: z.array(point2DMetersSchema).min(3),

  /** Soft clearance margin around the polygon, in METERS. Default 0.5. */
  warningMarginMeters: z.number().nonnegative().default(0.5),

  rawMetadata: z.record(z.string(), z.unknown()),
});
export type NoGoZone = z.infer<typeof noGoZoneSchema>;
