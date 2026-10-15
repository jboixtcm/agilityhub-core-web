/**
 * The one heading convention shared by persistence (`resolvedObstacles[].rotationDeg`, R-16-05) and
 * every renderer (2D planner, 3D planner), so the saved AR geometry never disagrees with the
 * preview (E9-W02 round 2, review #2).
 *
 * Positions in `CourseData` are already ring Y-up (the parser flips them at ingest, see
 * `pxToRingMetersY`), but `CourseObstacle.rotationDegrees` keeps Smarter's Y-down angle. The
 * heading vector therefore goes: mirror (flipX/flipY, applied before rotation like positions) →
 * negate Y (Smarter Y-down → ring Y-up) → rotate by the placement's `rotationDegrees`.
 */
import type { CoursePlacement } from './placement.js';

export type HeadingPlacement = Pick<CoursePlacement, 'flipX' | 'flipY' | 'rotationDegrees'>;

/** Unit vector of the obstacle's running direction in the ring frame (+X east, +Y north). */
export function placedObstacleHeadingVector(
  smarterAngleDegrees: number | null,
  placement: HeadingPlacement,
): { readonly x: number; readonly y: number } {
  const theta = ((smarterAngleDegrees ?? 0) * Math.PI) / 180;
  const dx = (placement.flipX ? -1 : 1) * Math.cos(theta);
  const dy = -((placement.flipY ? -1 : 1) * Math.sin(theta));
  const phi = ((placement.rotationDegrees ?? 0) * Math.PI) / 180;
  return {
    x: dx * Math.cos(phi) - dy * Math.sin(phi),
    y: dx * Math.sin(phi) + dy * Math.cos(phi),
  };
}

/** The same heading as an angle in degrees, counter-clockwise from +X, in [-180, 180]. */
export function placedObstacleHeadingDegrees(
  smarterAngleDegrees: number | null,
  placement: HeadingPlacement,
): number {
  const { x, y } = placedObstacleHeadingVector(smarterAngleDegrees, placement);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
