import { describe, expect, it } from 'vitest';
import { distance, vec } from '../src/geometry/primitives.js';
import {
  applyTransform,
  applyTransformAll,
  IDENTITY_TRANSFORM,
  invertTransform,
  makeTransform,
} from '../src/geometry/transform.js';

describe('Transform2D', () => {
  it('identity returns the input unchanged', () => {
    const p = { x: 1.23, y: 4.56 };
    expect(applyTransform(IDENTITY_TRANSFORM, p)).toEqual(p);
  });

  it('pure translation', () => {
    const t = makeTransform(0, vec(10, 5), vec(0, 0));
    expect(applyTransform(t, { x: 1, y: 2 })).toEqual({ x: 11, y: 7 });
  });

  it('90° rotation around origin maps (1,0) → (0,1)', () => {
    const t = makeTransform(90, vec(0, 0), vec(0, 0));
    const out = applyTransform(t, { x: 1, y: 0 });
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
  });

  it('rotation preserves length to/from pivot', () => {
    const pivot = vec(3, 4);
    const t = makeTransform(37, vec(0, 0), pivot);
    const p = { x: 9, y: 10 };
    const initial = distance(p, pivot);
    const rotated = applyTransform(t, p);
    expect(distance(rotated, pivot)).toBeCloseTo(initial, 6);
  });

  it('invertTransform round-trips every point', () => {
    const t = makeTransform(73, vec(1.5, -2.5), vec(0.5, 0.5));
    const inv = invertTransform(t);
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 7 },
      { x: -2, y: 5 },
    ]) {
      const out = applyTransform(inv, applyTransform(t, p));
      expect(out.x).toBeCloseTo(p.x, 6);
      expect(out.y).toBeCloseTo(p.y, 6);
    }
  });

  it('applyTransformAll preserves order and length', () => {
    const t = makeTransform(45, vec(2, 2), vec(0, 0));
    const ps = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const out = applyTransformAll(t, ps);
    expect(out).toHaveLength(3);
    // The segment 0→1 is length 1 before; should still be length 1 after.
    expect(distance(out[0]!, out[1]!)).toBeCloseTo(1, 6);
    expect(distance(out[0]!, out[2]!)).toBeCloseTo(1, 6);
  });
});
