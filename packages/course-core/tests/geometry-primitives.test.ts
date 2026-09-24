import { describe, expect, it } from 'vitest';
import {
  add,
  boundsOf,
  distance,
  distancePointToPolygonEdge,
  distancePointToSegment,
  dot,
  length,
  polygonArea,
  polygonContainsPoint,
  rectCenter,
  rectContainsPoint,
  rectFromCorners,
  rectFromSize,
  rectHeight,
  rectWidth,
  scale,
  signedDistancePointToPolygon,
  signedDistancePointToRect,
  sub,
  vec,
} from '../src/geometry/primitives.js';

describe('vector math', () => {
  it('add / sub are inverses for the same vector', () => {
    const a = vec(3, 5);
    const b = vec(7, -2);
    expect(sub(add(a, b), b)).toEqual(a);
  });

  it('scale and length agree with manual calculation', () => {
    expect(length(scale(vec(3, 4), 2))).toBe(10);
  });

  it('dot product is commutative', () => {
    expect(dot(vec(1, 2), vec(3, 4))).toBe(dot(vec(3, 4), vec(1, 2)));
  });

  it('distance is symmetric and zero for equal points', () => {
    expect(distance(vec(1, 1), vec(4, 5))).toBe(5);
    expect(distance(vec(0, 0), vec(0, 0))).toBe(0);
    expect(distance(vec(1, 2), vec(3, 4))).toBe(distance(vec(3, 4), vec(1, 2)));
  });
});

describe('rect', () => {
  const r = rectFromSize(10, 20, 30, 40);

  it('rectFromSize sizes correctly', () => {
    expect(rectWidth(r)).toBe(30);
    expect(rectHeight(r)).toBe(40);
    expect(rectCenter(r)).toEqual({ x: 25, y: 40 });
  });

  it('rectFromCorners normalises any corner order', () => {
    const a = rectFromCorners({ x: 5, y: 5 }, { x: 1, y: 9 });
    expect(a.min).toEqual({ x: 1, y: 5 });
    expect(a.max).toEqual({ x: 5, y: 9 });
  });

  it('rectContainsPoint matches signed distance sign', () => {
    expect(rectContainsPoint(r, { x: 25, y: 40 })).toBe(true);
    expect(rectContainsPoint(r, { x: 100, y: 100 })).toBe(false);
    expect(signedDistancePointToRect({ x: 25, y: 40 }, r)).toBeLessThan(0);
    expect(signedDistancePointToRect({ x: 100, y: 100 }, r)).toBeGreaterThan(0);
  });

  it('signed distance to rect is monotonic moving outward', () => {
    const center = { x: 25, y: 40 };
    const slightlyOut = { x: 41, y: 40 }; // 1 m outside right edge
    const farOut = { x: 50, y: 40 }; // 10 m outside right edge
    expect(signedDistancePointToRect(slightlyOut, r)).toBeCloseTo(1, 6);
    expect(signedDistancePointToRect(farOut, r)).toBeCloseTo(10, 6);
    expect(signedDistancePointToRect(center, r)).toBeLessThan(
      signedDistancePointToRect(slightlyOut, r),
    );
  });
});

describe('polygon', () => {
  // Unit square at origin.
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  it('polygonContainsPoint — clearly inside / clearly outside', () => {
    expect(polygonContainsPoint(square, { x: 0.5, y: 0.5 })).toBe(true);
    expect(polygonContainsPoint(square, { x: 2, y: 2 })).toBe(false);
    expect(polygonContainsPoint(square, { x: -0.1, y: 0.5 })).toBe(false);
  });

  it('signedDistancePointToPolygon: negative inside, positive outside', () => {
    expect(signedDistancePointToPolygon(square, { x: 0.5, y: 0.5 })).toBeLessThan(0);
    expect(signedDistancePointToPolygon(square, { x: 2, y: 0.5 })).toBeCloseTo(1, 6);
    expect(signedDistancePointToPolygon(square, { x: -1, y: 0.5 })).toBeCloseTo(1, 6);
  });

  it('polygonArea = 1 for a unit square', () => {
    expect(polygonArea(square)).toBe(1);
  });

  it('distancePointToSegment basic L-shaped checks', () => {
    expect(distancePointToSegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(1);
    expect(distancePointToSegment({ x: 1.5, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(1);
  });

  it('distancePointToPolygonEdge picks the closest edge', () => {
    expect(distancePointToPolygonEdge(square, { x: 0.5, y: -3 })).toBe(3);
    expect(distancePointToPolygonEdge(square, { x: 0.5, y: 0.5 })).toBe(0.5);
  });
});

describe('boundsOf', () => {
  it('returns null on empty input', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('wraps every point', () => {
    const b = boundsOf([
      { x: -1, y: 2 },
      { x: 4, y: -3 },
      { x: 0, y: 0 },
    ])!;
    expect(b.min).toEqual({ x: -1, y: -3 });
    expect(b.max).toEqual({ x: 4, y: 2 });
  });
});
