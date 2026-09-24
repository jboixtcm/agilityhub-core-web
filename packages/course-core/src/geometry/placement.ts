/**
 * `CoursePlacement` — how a parsed CourseData is positioned inside a Ring.
 *
 * Phase 2 deliberately keeps this minimal:
 *   - `offsetXMeters`, `offsetYMeters` — translation of the course centre
 *     in ring frame.
 *   - `rotationDegrees` — rotation around the course centre.
 *   - `placementMode` — `preserveMeters` is the default. `centered` is a
 *     hint for the UI that the user accepted "centered in ring" semantics.
 *     `fitToRing` is reserved (requires user confirmation and is not
 *     applied silently — see `04_web_planner_prompt.md`).
 *
 * The pivot is the **course centre** (`designLengthMeters/2`,
 * `designWidthMeters/2`). This matches user expectation when they hit
 * "rotate 90°" — the course should rotate in place, not swing around the
 * design top-left corner.
 *
 * The offset is the position of the course centre in ring frame. So
 * "centered placement" simply means `offset == ringCenter`.
 */
import { z } from 'zod';
import type { CourseData } from '../schema/course-data.js';
import type { CourseObstacle } from '../schema/course-obstacle.js';
import type { Point2DMeters } from '../schema/primitives.js';
import { boundsOf, rectFromSize, rectHeight, rectWidth, type Rect } from './primitives.js';
import { applyTransform, makeTransform, type Transform2D } from './transform.js';
import { ringCenter, type Ring } from './ring.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const placementModeSchema = z.enum(['preserveMeters', 'centered', 'fitToRing']);
export type PlacementMode = z.infer<typeof placementModeSchema>;

export const coursePlacementSchema = z.object({
  /** Position of the course centre in ring frame (meters). */
  offsetXMeters: z.number(),
  offsetYMeters: z.number(),
  /** Rotation around the course centre. */
  rotationDegrees: z.number(),
  placementMode: placementModeSchema.default('preserveMeters'),
  /**
   * Mirror the course about its centroid in the design X axis. Applied
   * BEFORE rotation, so successive rotations operate on the mirrored
   * layout.
   *
   * Persistence: backed by `course_placements.flip_x_bool` (DB),
   * `DBCoursePlacement.flip_x_bool` (TS), and `exportPlacementSchema.flip_x_bool`
   * in the BuildSessionExportV1. Defaults to false everywhere, so older
   * rows / payloads remain valid.
   */
  flipX: z.boolean().default(false),
  /** Mirror the course about its centroid in the design Y axis. See `flipX`. */
  flipY: z.boolean().default(false),
});
export type CoursePlacement = z.infer<typeof coursePlacementSchema>;

export const IDENTITY_PLACEMENT: CoursePlacement = {
  offsetXMeters: 0,
  offsetYMeters: 0,
  rotationDegrees: 0,
  placementMode: 'preserveMeters',
  flipX: false,
  flipY: false,
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function courseAnchor(course: CourseData): Point2DMeters {
  return { x: course.designLengthMeters / 2, y: course.designWidthMeters / 2 };
}

export function courseDesignBoundsMeters(course: CourseData): Rect {
  return rectFromSize(0, 0, course.designLengthMeters, course.designWidthMeters);
}

/**
 * Build the rigid transform that takes course-design coordinates to ring
 * coordinates for the given placement. The transform:
 *   1. rotates around the course centre,
 *   2. translates the (now rotated) course centre to (offsetX, offsetY).
 *
 * Concretely: `applyTransform(t, courseCenter) === {offsetX, offsetY}`.
 */
export function courseToRingTransform(placement: CoursePlacement, course: CourseData): Transform2D {
  const pivot = courseAnchor(course);
  // We want pivot + translation = offset (in ring frame), since rotation
  // leaves the pivot in place. So translation = offset - pivot.
  const translation = {
    x: placement.offsetXMeters - pivot.x,
    y: placement.offsetYMeters - pivot.y,
  };
  return makeTransform(placement.rotationDegrees, translation, pivot);
}

/**
 * Mirror a course-design-frame point about the course centroid if the
 * placement has flipX/flipY set. No-op when both are false.
 *
 * Flip semantics:
 *   - flipX mirrors about the vertical axis through the course centroid
 *     (so x → 2·cx − x), i.e. a left-right mirror of the design frame.
 *   - flipY mirrors about the horizontal axis through the course centroid
 *     (so y → 2·cy − y), i.e. an up-down mirror of the design frame.
 *
 * Flips are applied BEFORE rotation and translation so the UX is "mirror
 * the layout intrinsically, then orient it on the ring".
 */
export function mirrorCoursePoint(
  p: Point2DMeters,
  placement: CoursePlacement,
  course: CourseData,
): Point2DMeters {
  const c = courseAnchor(course);
  return {
    x: placement.flipX ? 2 * c.x - p.x : p.x,
    y: placement.flipY ? 2 * c.y - p.y : p.y,
  };
}

/**
 * Map a course-design-frame point to ring frame, honouring flipX/Y in
 * addition to rotation + translation. Use this instead of calling
 * `applyTransform(courseToRingTransform(...), p)` directly whenever the
 * caller is mapping a *course-design-frame* point — direct
 * `applyTransform` use bypasses the flip.
 */
export function placeCoursePoint(
  p: Point2DMeters,
  placement: CoursePlacement,
  course: CourseData,
): Point2DMeters {
  const t = courseToRingTransform(placement, course);
  return applyTransform(t, mirrorCoursePoint(p, placement, course));
}

/** Anchor (xMeters, yMeters) of an obstacle, mapped into ring frame. */
export function placeObstacleInRing(
  obstacle: CourseObstacle,
  placement: CoursePlacement,
  course: CourseData,
): Point2DMeters | null {
  if (obstacle.xMeters == null || obstacle.yMeters == null) return null;
  return placeCoursePoint({ x: obstacle.xMeters, y: obstacle.yMeters }, placement, course);
}

/** Control points (e.g. tunnel polyline) mapped into ring frame. Null preserved. */
export function placeControlPointsInRing(
  controlPoints: readonly Point2DMeters[] | null,
  placement: CoursePlacement,
  course: CourseData,
): Point2DMeters[] | null {
  if (controlPoints == null) return null;
  return controlPoints.map((p) => placeCoursePoint(p, placement, course));
}

/**
 * Bounding rectangle of every obstacle + tunnel control point + course-side
 * no-go zone polygon point, **after** the placement is applied. Useful for
 * the "course larger than ring" rule and for hint-fitting in the UI.
 */
export function placedCourseBoundsMeters(
  course: CourseData,
  placement: CoursePlacement,
): Rect | null {
  const allPoints: Point2DMeters[] = [];

  for (const o of course.obstacles) {
    if (o.controlPointsMeters && o.controlPointsMeters.length > 0) {
      for (const cp of o.controlPointsMeters)
        allPoints.push(placeCoursePoint(cp, placement, course));
    } else if (o.xMeters != null && o.yMeters != null) {
      allPoints.push(placeCoursePoint({ x: o.xMeters, y: o.yMeters }, placement, course));
    }
  }
  for (const z of course.noGoZones) {
    for (const p of z.polygonPointsMeters) allPoints.push(placeCoursePoint(p, placement, course));
  }
  // Always include the 4 corners of the design rectangle so the bounds are
  // at least as big as the nominal course frame. Flipping is a symmetry of
  // this rectangle so the bounds are unaffected by flipX/flipY here, but
  // we still route through placeCoursePoint so the rotation/translation
  // path stays consistent.
  const designRect = courseDesignBoundsMeters(course);
  const designCorners: Point2DMeters[] = [
    designRect.min,
    { x: designRect.max.x, y: designRect.min.y },
    designRect.max,
    { x: designRect.min.x, y: designRect.max.y },
  ];
  for (const c of designCorners) allPoints.push(placeCoursePoint(c, placement, course));
  return boundsOf(allPoints);
}

// ---------------------------------------------------------------------------
// Built-in placement strategies
// ---------------------------------------------------------------------------

/**
 * "Centred in ring" placement: keep `preserveMeters` semantics (no scaling)
 * and set the offset so the course centre lands on the ring centre. No
 * rotation.
 */
export function centerCourseInRing(course: CourseData, ring: Ring): CoursePlacement {
  const c = ringCenter(ring);
  return {
    offsetXMeters: c.x,
    offsetYMeters: c.y,
    rotationDegrees: 0,
    placementMode: 'centered',
    flipX: false,
    flipY: false,
  };
}

/**
 * True when the placed course (its bounding rect) fits entirely within
 * the ring rect. Cheap shortcut for the "course larger than ring" rule.
 */
export function placedCourseFitsInRing(
  course: CourseData,
  placement: CoursePlacement,
  ring: Ring,
): boolean {
  const placed = placedCourseBoundsMeters(course, placement);
  if (placed == null) return true; // No obstacles to place — vacuously fits.
  return (
    placed.min.x >= 0 &&
    placed.min.y >= 0 &&
    placed.max.x <= ring.lengthMeters &&
    placed.max.y <= ring.widthMeters
  );
}

/** Convenience: is the design rectangle itself larger than the ring? */
export function courseLargerThanRing(course: CourseData, ring: Ring): boolean {
  const d = courseDesignBoundsMeters(course);
  return rectWidth(d) > ring.lengthMeters || rectHeight(d) > ring.widthMeters;
}
