/**
 * Rule: "obstacle inside / too close to a course-side no-go zone".
 *
 * "Course-side" = the grey-area polygons parsed from Smarter's `at` group
 * in Phase 1. These travel with the placement (i.e. they rotate / move
 * along with the course), so we transform both the obstacle footprint and
 * the polygon into ring frame before checking.
 *
 * Severity:
 *   - inside polygon            → `critical`
 *   - within warning margin      → `warning`
 *
 * The margin defaults to `NoGoZone.warningMarginMeters` (0.5 m in Phase 1).
 */
import type { CourseData } from '../../schema/course-data.js';
import {
  footprintRadiusMeters,
  obstacleFootprintPointsMeters,
} from '../../geometry/obstacle-footprint.js';
import { courseToRingTransform, type CoursePlacement } from '../../geometry/placement.js';
import { applyTransformAll } from '../../geometry/transform.js';
import { signedDistancePointToPolygon } from '../../geometry/primitives.js';
import type { Ring } from '../../geometry/ring.js';
import { makeWarning, type Warning } from '../types.js';

export function checkCourseNoGo(
  course: CourseData,
  placement: CoursePlacement,
  _ring: Ring,
): Warning[] {
  if (course.noGoZones.length === 0) return [];
  const warnings: Warning[] = [];
  const t = courseToRingTransform(placement, course);

  // Pre-transform every course-side polygon into ring frame.
  const placedPolys = course.noGoZones.map((zone) => ({
    zone,
    polygon: applyTransformAll(t, zone.polygonPointsMeters),
  }));

  for (const obstacle of course.obstacles) {
    const points = obstacleFootprintPointsMeters(obstacle, placement, course);
    if (points.length === 0) continue;
    const radius = footprintRadiusMeters(obstacle);

    for (const { zone, polygon } of placedPolys) {
      // For each obstacle, pick the worst (most-violating) sample point.
      let worstSigned = Infinity;
      for (const p of points) {
        const sd = signedDistancePointToPolygon(polygon, p);
        if (sd < worstSigned) worstSigned = sd;
      }
      // Inflate by obstacle radius: an obstacle is "inside" if even its
      // outer edge is inside; "near" if its outer edge is within margin.
      const inflated = worstSigned - radius;
      if (inflated < 0) {
        warnings.push(
          makeWarning({
            id: `course-no-go-inside:${obstacle.id}:${zone.id}`,
            ruleId: 'course-no-go',
            severity: 'critical',
            message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) overlaps course no-go zone ${zone.id}.`,
            obstacleSourceId: obstacle.sourceId,
            courseNoGoZoneId: zone.id,
            distanceMeters: -inflated, // depth of overlap (positive)
            thresholdMeters: 0,
          }),
        );
      } else if (inflated < zone.warningMarginMeters) {
        warnings.push(
          makeWarning({
            id: `course-no-go-near:${obstacle.id}:${zone.id}`,
            ruleId: 'course-no-go',
            severity: 'warning',
            message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) is only ${inflated.toFixed(2)} m from course no-go zone ${zone.id} (need ≥ ${zone.warningMarginMeters.toFixed(2)} m).`,
            obstacleSourceId: obstacle.sourceId,
            courseNoGoZoneId: zone.id,
            distanceMeters: inflated,
            thresholdMeters: zone.warningMarginMeters,
          }),
        );
      }
    }
  }
  return warnings;
}
