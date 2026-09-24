/**
 * Rule: "obstacle inside / too close to a ring-side no-go zone".
 *
 * "Ring-side" = permanent venue obstructions (pillars, AV rig, judges'
 * table) configured on the Ring. Coordinates are already in ring frame —
 * no transform needed for the polygon, only for the obstacle.
 *
 * Severity mirrors the course-side rule: inside → critical, near → warning.
 */
import type { CourseData } from '../../schema/course-data.js';
import {
  footprintRadiusMeters,
  obstacleFootprintPointsMeters,
} from '../../geometry/obstacle-footprint.js';
import { type CoursePlacement } from '../../geometry/placement.js';
import { signedDistancePointToPolygon } from '../../geometry/primitives.js';
import type { Ring } from '../../geometry/ring.js';
import { makeWarning, type Warning } from '../types.js';

export function checkRingNoGo(
  course: CourseData,
  placement: CoursePlacement,
  ring: Ring,
): Warning[] {
  if (ring.noGoZones.length === 0) return [];
  const warnings: Warning[] = [];

  for (const obstacle of course.obstacles) {
    const points = obstacleFootprintPointsMeters(obstacle, placement, course);
    if (points.length === 0) continue;
    const radius = footprintRadiusMeters(obstacle);

    for (const zone of ring.noGoZones) {
      let worstSigned = Infinity;
      for (const p of points) {
        const sd = signedDistancePointToPolygon(zone.polygonPointsMeters, p);
        if (sd < worstSigned) worstSigned = sd;
      }
      const inflated = worstSigned - radius;
      if (inflated < 0) {
        warnings.push(
          makeWarning({
            id: `ring-no-go-inside:${obstacle.id}:${zone.id}`,
            ruleId: 'ring-no-go',
            severity: 'critical',
            message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) overlaps ring no-go zone "${zone.label}".`,
            obstacleSourceId: obstacle.sourceId,
            ringNoGoZoneId: zone.id,
            distanceMeters: -inflated,
            thresholdMeters: 0,
          }),
        );
      } else if (inflated < zone.warningMarginMeters) {
        warnings.push(
          makeWarning({
            id: `ring-no-go-near:${obstacle.id}:${zone.id}`,
            ruleId: 'ring-no-go',
            severity: 'warning',
            message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) is only ${inflated.toFixed(2)} m from ring no-go zone "${zone.label}" (need ≥ ${zone.warningMarginMeters.toFixed(2)} m).`,
            obstacleSourceId: obstacle.sourceId,
            ringNoGoZoneId: zone.id,
            distanceMeters: inflated,
            thresholdMeters: zone.warningMarginMeters,
          }),
        );
      }
    }
  }
  return warnings;
}
