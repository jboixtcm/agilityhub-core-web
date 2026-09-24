/**
 * Pure 2D geometry primitives — meters.
 *
 * All functions are pure, allocate small plain objects, and never mutate
 * their inputs. The schema layer (`schema/primitives.ts`) declares the
 * `Point2DMeters` type; this file implements the math on top of it.
 *
 * Conventions:
 *   - `Point` and `Vector` share the same `{x, y}` shape. Operations that
 *     return a vector vs. a point are named accordingly for the reader.
 *   - Angles are in **degrees** at the public surface (matches placement
 *     UI controls); internal trig uses radians.
 *   - Distances and lengths are always **meters**.
 *
 * Phase 2 only — Phase 3+ will extend this with intersection / inflation
 * helpers as the warning engine grows.
 */
import type { Point2DMeters } from '../schema/primitives.js';

// ---------------------------------------------------------------------------
// Vector / point math
// ---------------------------------------------------------------------------

export type Vector2D = Point2DMeters;

export const vec = (x: number, y: number): Vector2D => ({ x, y });

export const add = (a: Point2DMeters, b: Vector2D): Point2DMeters => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const sub = (a: Point2DMeters, b: Point2DMeters): Vector2D => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const scale = (v: Vector2D, k: number): Vector2D => ({ x: v.x * k, y: v.y * k });

export const dot = (a: Vector2D, b: Vector2D): number => a.x * b.x + a.y * b.y;

export const length = (v: Vector2D): number => Math.hypot(v.x, v.y);

export const distance = (a: Point2DMeters, b: Point2DMeters): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------------------
// Rect (axis-aligned)
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle in meters. `min` is the corner with the smaller x/y. */
export interface Rect {
  readonly min: Point2DMeters;
  readonly max: Point2DMeters;
}

export const rectFromSize = (
  originX: number,
  originY: number,
  width: number,
  height: number,
): Rect => ({
  min: { x: originX, y: originY },
  max: { x: originX + width, y: originY + height },
});

export const rectFromCorners = (a: Point2DMeters, b: Point2DMeters): Rect => ({
  min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
  max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
});

/** Smallest axis-aligned rect that contains every point. Empty input → null. */
export function boundsOf(points: readonly Point2DMeters[]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export const rectWidth = (r: Rect): number => r.max.x - r.min.x;
export const rectHeight = (r: Rect): number => r.max.y - r.min.y;
export const rectCenter = (r: Rect): Point2DMeters => ({
  x: (r.min.x + r.max.x) / 2,
  y: (r.min.y + r.max.y) / 2,
});

export const rectContainsPoint = (r: Rect, p: Point2DMeters): boolean =>
  p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;

/**
 * Signed distance from a point to a rect.
 *   - negative inside (distance to the nearest edge)
 *   - zero on the edge
 *   - positive outside (distance to the nearest edge)
 *
 * The "inside" branch uses the standard SDF for axis-aligned rectangles.
 */
export function signedDistancePointToRect(p: Point2DMeters, r: Rect): number {
  const dx = Math.max(r.min.x - p.x, 0, p.x - r.max.x);
  const dy = Math.max(r.min.y - p.y, 0, p.y - r.max.y);
  const outside = Math.hypot(dx, dy);
  if (outside > 0) return outside;
  // Inside — distance to nearest edge (positive number); make it negative.
  const inside = Math.min(p.x - r.min.x, r.max.x - p.x, p.y - r.min.y, r.max.y - p.y);
  return -inside;
}

// ---------------------------------------------------------------------------
// Polygon (closed, in CW or CCW order — we don't rely on winding)
// ---------------------------------------------------------------------------

export type Polygon = readonly Point2DMeters[];

/**
 * Point-in-polygon via the ray-casting / crossing-number test. Works for
 * convex and concave polygons. Points exactly on the boundary may report
 * either inclusion; if you care, combine with `distancePointToPolygonEdge`.
 */
export function polygonContainsPoint(polygon: Polygon, p: Point2DMeters): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Closest distance from a point to a single line segment (meters). */
export function distancePointToSegment(
  p: Point2DMeters,
  a: Point2DMeters,
  b: Point2DMeters,
): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const denom = dot(ab, ab);
  if (denom === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, dot(ap, ab) / denom));
  const projection = add(a, scale(ab, t));
  return distance(p, projection);
}

/** Closest distance from a point to the polygon boundary (edges only). */
export function distancePointToPolygonEdge(polygon: Polygon, p: Point2DMeters): number {
  if (polygon.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const d = distancePointToSegment(p, polygon[j]!, polygon[i]!);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Signed distance from a point to a polygon.
 *   - negative inside
 *   - zero on the boundary (within floating-point noise)
 *   - positive outside
 */
export function signedDistancePointToPolygon(polygon: Polygon, p: Point2DMeters): number {
  const edge = distancePointToPolygonEdge(polygon, p);
  return polygonContainsPoint(polygon, p) ? -edge : edge;
}

/** Polygon area (always positive; uses the shoelace formula). */
export function polygonArea(polygon: Polygon): number {
  if (polygon.length < 3) return 0;
  let acc = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    acc += polygon[j]!.x * polygon[i]!.y - polygon[i]!.x * polygon[j]!.y;
  }
  return Math.abs(acc) / 2;
}
