/**
 * Rule: "obstacle outside ring".
 *
 * Fires when any footprint sample point of an obstacle, inflated by the
 * obstacle's approximate radius, falls outside the ring rectangle.
 * Severity is `critical` because there's nowhere physical to place the
 * obstacle.
 */
import type { CourseData } from '../../schema/course-data.js';
import {
  footprintRadiusMeters,
  obstacleFootprintPointsMeters,
} from '../../geometry/obstacle-footprint.js';
import { type CoursePlacement } from '../../geometry/placement.js';
import { signedDistancePointToRect } from '../../geometry/primitives.js';
import { ringRect, type Ring } from '../../geometry/ring.js';
import { makeWarning, type Warning } from '../types.js';

export function checkOutsideRing(
  course: CourseData,
  placement: CoursePlacement,
  ring: Ring,
): Warning[] {
  const warnings: Warning[] = [];
  const rect = ringRect(ring);
  for (const obstacle of course.obstacles) {
    const points = obstacleFootprintPointsMeters(obstacle, placement, course);
    if (points.length === 0) continue;
    const radius = footprintRadiusMeters(obstacle);
    let worst = -Infinity;
    for (const p of points) {
      // sd = positive outside, negative inside (signed distance to ring rect).
      const sd = signedDistancePointToRect(p, rect);
      // Inflate by radius: an obstacle is "outside" if its outer edge is.
      const inflated = sd + radius;
      if (inflated > worst) worst = inflated;
    }
    if (worst > 0) {
      warnings.push(
        makeWarning({
          id: `outside-ring:${obstacle.id}`,
          ruleId: 'outside-ring',
          severity: 'critical',
          message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) lies outside the ring by ${worst.toFixed(2)} m.`,
          obstacleSourceId: obstacle.sourceId,
          distanceMeters: worst,
          thresholdMeters: 0,
        }),
      );
    }
  }
  return warnings;
}
