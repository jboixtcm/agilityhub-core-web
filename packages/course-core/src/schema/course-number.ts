import { z } from 'zod';

/**
 * A course number (label like "1", "2", "3"…) placed near an obstacle.
 *
 * Smarter stores these under `settings.numbers` groups such as `n1`, `n2`,
 * or `l3`. Each number can link to
 * an obstacle via `oid`; we surface that as `linkedObstacleSourceId`. The
 * raw label is preserved in `text`, and `sequenceNumber` is the numeric
 * value when `text` is numeric (otherwise null — e.g. "S", "F").
 */
export const courseNumberSchema = z.object({
  id: z.string(),
  text: z.string(),
  sequenceNumber: z.number().int().nullable(),
  /** Smarter sequence group (`n1`, `n2`, `l3`, ...). */
  sequenceKey: z.string().min(1).default('n1'),

  xMeters: z.number(),
  yMeters: z.number(),

  /** The Smarter obstacle id this number is anchored to, if any. */
  linkedObstacleSourceId: z.string().nullable(),

  /** Which connection point ("cp1" / "cp2" / null) the number references. */
  obstacleConnectionPoint: z.string().nullable(),

  rawMetadata: z.record(z.string(), z.unknown()),
});
export type CourseNumber = z.infer<typeof courseNumberSchema>;
