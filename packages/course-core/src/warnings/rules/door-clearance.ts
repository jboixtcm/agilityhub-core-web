/**
 * Rule: "obstacle too close to a door / exit".
 *
 * Fires when an obstacle (inflated by its footprint radius) is closer to a
 * door polygon than the door's `clearanceMeters`. Inside the polygon
 * counts as "zero distance" → critical.
 *
 * Doors are venue-configured rectangles (Phase 6 will let admins draw
 * them). Coordinates are ring-frame; no transform needed for the polygon.
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

export function checkDoorClearance(
  course: CourseData,
  placement: CoursePlacement,
  ring: Ring,
): Warning[] {
  if (ring.doors.length === 0) return [];
  const warnings: Warning[] = [];

  for (const obstacle of course.obstacles) {
    const points = obstacleFootprintPointsMeters(obstacle, placement, course);
    if (points.length === 0) continue;
    const radius = footprintRadiusMeters(obstacle);

    for (const door of ring.doors) {
      let worstSigned = Infinity;
      for (const p of points) {
        const sd = signedDistancePointToPolygon(door.polygonPointsMeters, p);
        if (sd < worstSigned) worstSigned = sd;
      }
      const inflated = worstSigned - radius;
      if (inflated < 0) {
        warnings.push(
          makeWarning({
            id: `door-clearance-inside:${obstacle.id}:${door.id}`,
            ruleId: 'door-clearance',
            severity: 'critical',
            message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) blocks door "${door.label}".`,
            obstacleSourceId: obstacle.sourceId,
            doorId: door.id,
            distanceMeters: -inflated,
            thresholdMeters: 0,
          }),
        );
      } else if (inflated < door.clearanceMeters) {
        warnings.push(
          makeWarning({
            id: `door-clearance-near:${obstacle.id}:${door.id}`,
            ruleId: 'door-clearance',
            severity: 'warning',
            message: `Obstacle ${obstacle.obstacleType} (${obstacle.sourceCode}#${obstacle.sourceId}) is only ${inflated.toFixed(2)} m from door "${door.label}" (need ≥ ${door.clearanceMeters.toFixed(2)} m).`,
            obstacleSourceId: obstacle.sourceId,
            doorId: door.id,
            distanceMeters: inflated,
            thresholdMeters: door.clearanceMeters,
          }),
        );
      }
    }
  }
  return warnings;
}
