/**
 * Shared primitives used across CourseData / CourseObstacle / CourseNumber /
 * NoGoZone / CourseTheme.
 *
 * Internal unit system is METERS. Source pixels are preserved only inside
 * `rawMetadata` for traceability — never used downstream.
 */
import { z } from 'zod';

/** Unit displayed to the user. Internal storage is always meters. */
export const unitSystemSchema = z.enum(['M', 'FT']);
export type UnitSystem = z.infer<typeof unitSystemSchema>;

/** Origin convention as exported by Smarter. Default is LT (left/top). */
export const originSchema = z.enum(['LT', 'LB', 'RT', 'RB', 'CC', 'LC', 'RC', 'CB']);
export type Origin = z.infer<typeof originSchema>;

/** 2D point in METERS in the course-design coordinate frame. */
export const point2DMetersSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point2DMeters = z.infer<typeof point2DMetersSchema>;

/** Normalized internal obstacle types. */
export const obstacleTypeSchema = z.enum([
  'Jump',
  'DoubleJump',
  'Tunnel3m',
  'Tunnel4m',
  'Tunnel5m',
  'Tunnel6m',
  'DogWalk',
  'AFrame',
  'Seesaw',
  'Weave',
  'LongJump',
  'Wall',
  'Tire',
  'Unknown',
]);
export type ObstacleType = z.infer<typeof obstacleTypeSchema>;
