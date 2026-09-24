/**
 * Rule: "obstacle too close to ring border".
 *
 * Fires when an obstacle is inside the ring but closer than
 * `borderClearanceMeters` to any edge. Threshold defaults to
 * `DEFAULT_CLEARANCE_M` (0.5 m; D-006) and can be overridden per ring.
 *
 * Does NOT fire for obstacles already outside the ring — those are
 * `outside-ring` warnings; we keep responsibilities cleanly separated so
 * the UI can show / dismiss them independently.
 *
 * Severity is `warning` (not critical) because the judge can usually
 * resolve it by nudging or rotating the course.
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

export function checkBorderClearance(
  course: CourseData,
  placement: CoursePlacement,
  ring: Ring,
): Warning[] {
  const warnings: Warning[] = [];
  const rect = ringRect(ring);
  const threshold = ring.borderClearanceMeters;

  for (const obstacle of course.obstacles) {
    const points = obstacleFootprintPointsMeters(obstacle, placement, course);
    if (points.length === 0) continue;
    const radius = footprintRadiusMeters(obstacle);

    // closestEdgeMeters = signed distance from the obstacle outer edge to
    // the ring boundary. Negative ⇒ outside (skip, handled by outside-ring).
    // Positive ⇒ inside; small positive ⇒ near the border.
    let closestEdge = Infinity;
    for (const p of points) {
      const sd = signedDistancePointToRect(p, rect); // negative inside
      const edge = -sd - radius; // distance from outer edge to boundary
      if (edge < closestEdge) closestEdge = edge;
    }

    // closestEdge < 0 means the obstacle pokes out — outside-ring's job.
    if (closestEdge < 0) continue;

    if (closestEdge < threshold) {
      warnings.push(
        makeWarning({
          id: `border-clearance:${obstacle.id}`,
          ruleId: 'border-clearance',
          severity: 'warning',
          message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) is only ${closestEdge.toFixed(2)} m from the ring border (need ≥ ${threshold.toFixed(2)} m).`,
          obstacleSourceId: obstacle.sourceId,
          distanceMeters: closestEdge,
          thresholdMeters: threshold,
        }),
      );
    }
  }
  return warnings;
}
