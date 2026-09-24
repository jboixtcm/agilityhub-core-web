/**
 * 2D rigid transforms (rotation + translation).
 *
 * Used by `placement.ts` to map a course-design coordinate into ring frame,
 * and (later) by the AR layer to map ring → world. No scaling: per
 * `01_AUTONOMOUS_MASTER_PROMPT.md` and `04_web_planner_prompt.md` the
 * planner must never silently rescale a course.
 *
 * Transform semantics (matches `applyTransform`):
 *   1. Rotate the point around the **rotation pivot** (a point in the
 *      source frame, typically the course centre).
 *   2. Translate by `translation` (a vector in the destination frame).
 *
 *      out = R(angle) · (point − pivot) + pivot + translation
 *
 * The pivot is part of the transform so callers don't have to keep
 * recomputing "the course centre" every time they transform a point.
 *
 * Angles are degrees at the public surface; converted to radians inside.
 */
import type { Point2DMeters } from '../schema/primitives.js';
import { add, sub, vec, type Vector2D } from './primitives.js';

export interface Transform2D {
  readonly rotationDegrees: number;
  readonly translation: Vector2D;
  /** Point (in source frame) the rotation is applied around. */
  readonly pivot: Point2DMeters;
}

export const IDENTITY_TRANSFORM: Transform2D = {
  rotationDegrees: 0,
  translation: vec(0, 0),
  pivot: vec(0, 0),
};

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/** Apply transform to a point. Pure. */
export function applyTransform(t: Transform2D, p: Point2DMeters): Point2DMeters {
  const rad = degToRad(t.rotationDegrees);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const local = sub(p, t.pivot);
  const rotated = vec(local.x * c - local.y * s, local.x * s + local.y * c);
  return add(add(rotated, t.pivot), t.translation);
}

/** Apply transform to many points (preserves order). */
export function applyTransformAll(
  t: Transform2D,
  points: readonly Point2DMeters[],
): Point2DMeters[] {
  return points.map((p) => applyTransform(t, p));
}

/**
 * Construct a transform that:
 *   1. rotates the source frame around `pivot` by `rotationDegrees`, then
 *   2. translates by `translation`.
 */
export function makeTransform(
  rotationDegrees: number,
  translation: Vector2D,
  pivot: Point2DMeters,
): Transform2D {
  return { rotationDegrees, translation, pivot };
}

/** Build the inverse of a transform with the same pivot semantics. */
export function invertTransform(t: Transform2D): Transform2D {
  const rad = degToRad(-t.rotationDegrees);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // The forward transform's destination-frame translation, expressed as a
  // vector that has to be undone before we rotate back.
  const invTranslation = vec(
    -(t.translation.x * c - t.translation.y * s),
    -(t.translation.x * s + t.translation.y * c),
  );
  return {
    rotationDegrees: -t.rotationDegrees,
    translation: invTranslation,
    pivot: t.pivot,
  };
}
