/**
 * Approximate obstacle footprints — used by the warning engine when it
 * needs more than a point to decide "is this obstacle inside the ring?".
 *
 * Phase 2 does **not** model real manufacturer dimensions yet. We expose
 * a per-type "approximate radius" (meters) that's conservative for warning
 * purposes — overestimating clearance is safer than underestimating it.
 * When manufacturer profiles arrive (future hook), replace this file with
 * real footprint polygons keyed by profile id.
 *
 * The returned points are in **ring frame** — placement is applied here so
 * callers don't have to remember to do it.
 *
 * For tunnels, we sample every control point (curved tunnels stretch
 * across the ring; checking only the anchor would miss most of the
 * obstacle).
 */
import type { CourseData } from '../schema/course-data.js';
import type { CourseObstacle } from '../schema/course-obstacle.js';
import type { ObstacleType } from '../schema/primitives.js';
import type { Point2DMeters } from '../schema/primitives.js';
import {
  placeControlPointsInRing,
  placeObstacleInRing,
  type CoursePlacement,
} from './placement.js';

/**
 * Approximate "keep this much clear around the obstacle anchor" radius in
 * meters. Generous on purpose — contacts (DogWalk/AFrame/Seesaw) extend
 * several metres but we test only their anchor.
 *
 * These numbers are subject to change once we have real profiles; revisit
 * during Phase 9 (AR builder) when real geometry is in hand.
 */
export const APPROX_FOOTPRINT_RADIUS_METERS: Readonly<Record<ObstacleType, number>> = {
  Jump: 0.4,
  DoubleJump: 0.5,
  Tunnel3m: 0.6,
  Tunnel4m: 0.6,
  Tunnel5m: 0.6,
  Tunnel6m: 0.6,
  DogWalk: 1.0,
  AFrame: 1.0,
  Seesaw: 0.8,
  Weave: 0.5,
  LongJump: 0.7,
  Wall: 0.5,
  Tire: 0.5,
  Unknown: 0.5,
};

export function footprintRadiusMeters(obstacle: CourseObstacle): number {
  return APPROX_FOOTPRINT_RADIUS_METERS[obstacle.obstacleType] ?? 0.5;
}

/**
 * Representative sample points (in ring frame) for the obstacle's
 * footprint. For tunnels: every control point. For other obstacles: just
 * the anchor (one point). Callers test each point individually against
 * polygons / borders, optionally inflating by `footprintRadiusMeters`.
 */
export function obstacleFootprintPointsMeters(
  obstacle: CourseObstacle,
  placement: CoursePlacement,
  course: CourseData,
): Point2DMeters[] {
  if (obstacle.controlPointsMeters && obstacle.controlPointsMeters.length > 0) {
    return placeControlPointsInRing(obstacle.controlPointsMeters, placement, course) ?? [];
  }
  const anchor = placeObstacleInRing(obstacle, placement, course);
  return anchor == null ? [] : [anchor];
}
