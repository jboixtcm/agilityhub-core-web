import { describe, expect, it } from 'vitest';
import {
  centerCourseInRing,
  courseAnchor,
  courseDesignBoundsMeters,
  courseLargerThanRing,
  courseToRingTransform,
  IDENTITY_PLACEMENT,
  placeControlPointsInRing,
  placedCourseBoundsMeters,
  placedCourseFitsInRing,
  placeObstacleInRing,
  type CoursePlacement,
} from '../src/geometry/placement.js';
import { applyTransform } from '../src/geometry/transform.js';
import { distance } from '../src/geometry/primitives.js';
import { makeCourse, makeObstacle, makeRing } from './helpers/synthetic.js';

const course = makeCourse({
  designLengthMeters: 20,
  designWidthMeters: 10,
  obstacles: [
    makeObstacle({ type: 'Jump', xMeters: 0, yMeters: 0 }), // top-left
    makeObstacle({ type: 'Jump', xMeters: 20, yMeters: 0 }), // top-right
    makeObstacle({ type: 'Jump', xMeters: 20, yMeters: 10 }), // bottom-right
    makeObstacle({ type: 'Jump', xMeters: 0, yMeters: 10 }), // bottom-left
    makeObstacle({ type: 'Jump', xMeters: 10, yMeters: 5 }), // centre
    makeObstacle({
      type: 'Tunnel3m',
      controlPointsMeters: [
        { x: 5, y: 5 },
        { x: 7, y: 5 },
        { x: 9, y: 5 },
      ],
    }),
  ],
});

const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });

describe('placement — helpers', () => {
  it('courseAnchor is the design-centre', () => {
    expect(courseAnchor(course)).toEqual({ x: 10, y: 5 });
  });

  it('courseDesignBoundsMeters spans the nominal rectangle', () => {
    const r = courseDesignBoundsMeters(course);
    expect(r.min).toEqual({ x: 0, y: 0 });
    expect(r.max).toEqual({ x: 20, y: 10 });
  });

  it('courseLargerThanRing — true / false cases', () => {
    expect(courseLargerThanRing(course, ring)).toBe(false);
    const tiny = makeRing({ lengthMeters: 15, widthMeters: 8 });
    expect(courseLargerThanRing(course, tiny)).toBe(true);
  });
});

describe('placement — identity and translations', () => {
  const identity: CoursePlacement = {
    ...IDENTITY_PLACEMENT,
    offsetXMeters: courseAnchor(course).x,
    offsetYMeters: courseAnchor(course).y,
  };

  it('identity placement leaves obstacle coordinates unchanged', () => {
    const corners = course.obstacles.slice(0, 5);
    for (const o of corners) {
      const placed = placeObstacleInRing(o, identity, course);
      expect(placed!.x).toBeCloseTo(o.xMeters!, 6);
      expect(placed!.y).toBeCloseTo(o.yMeters!, 6);
    }
  });

  it('pure translation shifts every obstacle by the same vector', () => {
    const moved: CoursePlacement = {
      ...identity,
      offsetXMeters: identity.offsetXMeters + 3,
      offsetYMeters: identity.offsetYMeters - 2,
    };
    for (const o of course.obstacles.slice(0, 5)) {
      const a = placeObstacleInRing(o, identity, course)!;
      const b = placeObstacleInRing(o, moved, course)!;
      expect(b.x - a.x).toBeCloseTo(3, 6);
      expect(b.y - a.y).toBeCloseTo(-2, 6);
    }
  });

  it('centerCourseInRing puts the course centre on the ring centre', () => {
    const p = centerCourseInRing(course, ring);
    const t = courseToRingTransform(p, course);
    const placedCenter = applyTransform(t, courseAnchor(course));
    expect(placedCenter.x).toBeCloseTo(15, 6); // ring.length/2
    expect(placedCenter.y).toBeCloseTo(10, 6); // ring.width/2
    expect(p.placementMode).toBe('centered');
  });
});

describe('placement — rotation preserves geometry', () => {
  const centered = centerCourseInRing(course, ring);

  for (const angle of [90, 180, 270, 360]) {
    it(`rotation ${angle}° preserves pair-wise distances`, () => {
      const rotated = { ...centered, rotationDegrees: angle };
      const orig = course.obstacles.slice(0, 5);
      for (let i = 0; i < orig.length; i += 1) {
        for (let j = i + 1; j < orig.length; j += 1) {
          const a0 = placeObstacleInRing(orig[i]!, centered, course)!;
          const b0 = placeObstacleInRing(orig[j]!, centered, course)!;
          const a1 = placeObstacleInRing(orig[i]!, rotated, course)!;
          const b1 = placeObstacleInRing(orig[j]!, rotated, course)!;
          expect(distance(a0, b0)).toBeCloseTo(distance(a1, b1), 6);
        }
      }
    });
  }

  it('rotation 360° equals identity for the centred placement', () => {
    const fullTurn = { ...centered, rotationDegrees: 360 };
    for (const o of course.obstacles.slice(0, 5)) {
      const a = placeObstacleInRing(o, centered, course)!;
      const b = placeObstacleInRing(o, fullTurn, course)!;
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
    }
  });
});

describe('placement — control points + bounds', () => {
  const centered = centerCourseInRing(course, ring);

  it('placeControlPointsInRing returns null when input is null', () => {
    expect(placeControlPointsInRing(null, centered, course)).toBeNull();
  });

  it('placeControlPointsInRing transforms every point', () => {
    const cps = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const out = placeControlPointsInRing(cps, centered, course)!;
    expect(out).toHaveLength(3);
    // Spacing is preserved (rigid transform).
    expect(distance(out[0]!, out[1]!)).toBeCloseTo(1, 6);
    expect(distance(out[1]!, out[2]!)).toBeCloseTo(1, 6);
  });

  it('placedCourseBoundsMeters spans 20×10 around the ring centre when centered', () => {
    const b = placedCourseBoundsMeters(course, centered)!;
    expect(b.min.x).toBeCloseTo(5, 6); // 15 − 10
    expect(b.max.x).toBeCloseTo(25, 6); // 15 + 10
    expect(b.min.y).toBeCloseTo(5, 6); // 10 − 5
    expect(b.max.y).toBeCloseTo(15, 6); // 10 + 5
  });

  it('placedCourseFitsInRing — true centred, false when shoved out', () => {
    expect(placedCourseFitsInRing(course, centered, ring)).toBe(true);
    const shoved = { ...centered, offsetXMeters: 100, offsetYMeters: 100 };
    expect(placedCourseFitsInRing(course, shoved, ring)).toBe(false);
  });
});

describe('placement — flip', () => {
  const centered = centerCourseInRing(course, ring);
  // Course is 20 × 10 design, centred on ring (15, 10). Identity placement
  // is a pure 2D translation by (5, 5) here, so:
  //   - design (0,0)   → ring (5,  5)
  //   - design (20,0)  → ring (25, 5)
  //   - design (0,10)  → ring (5,  15)
  //   - design (20,10) → ring (25, 15)
  //   - design (10,5)  → ring (15, 10)   (course centre lands on ring centre)

  it('flipX mirrors X about the course centroid; Y untouched', () => {
    const flipped = { ...centered, flipX: true };
    const tl = course.obstacles[0]!; // design (0,0)
    const tr = course.obstacles[1]!; // design (20,0)
    const ctr = course.obstacles[4]!; // design (10,5)
    const tlPlaced = placeObstacleInRing(tl, flipped, course)!;
    const trPlaced = placeObstacleInRing(tr, flipped, course)!;
    const ctrPlaced = placeObstacleInRing(ctr, flipped, course)!;
    // Left and right swap in ring frame; the centroid is invariant.
    expect(tlPlaced.x).toBeCloseTo(25, 6);
    expect(trPlaced.x).toBeCloseTo(5, 6);
    expect(ctrPlaced.x).toBeCloseTo(15, 6);
    // No change on Y.
    expect(tlPlaced.y).toBeCloseTo(5, 6);
    expect(trPlaced.y).toBeCloseTo(5, 6);
  });

  it('flipY mirrors Y about the course centroid; X untouched', () => {
    const flipped = { ...centered, flipY: true };
    const tl = course.obstacles[0]!; // design (0,0)
    const bl = course.obstacles[3]!; // design (0,10)
    const tlPlaced = placeObstacleInRing(tl, flipped, course)!;
    const blPlaced = placeObstacleInRing(bl, flipped, course)!;
    // Top and bottom swap in ring frame.
    expect(tlPlaced.y).toBeCloseTo(15, 6);
    expect(blPlaced.y).toBeCloseTo(5, 6);
    // X is unchanged.
    expect(tlPlaced.x).toBeCloseTo(5, 6);
    expect(blPlaced.x).toBeCloseTo(5, 6);
  });

  it('flipX + flipY equals 180° rotation about the centroid', () => {
    const flipBoth = { ...centered, flipX: true, flipY: true };
    const rot180 = { ...centered, rotationDegrees: 180 };
    for (const o of course.obstacles.slice(0, 5)) {
      const a = placeObstacleInRing(o, flipBoth, course)!;
      const b = placeObstacleInRing(o, rot180, course)!;
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('flip preserves pair-wise distances (it is an isometry)', () => {
    const flipped = { ...centered, flipX: true };
    const obs = course.obstacles.slice(0, 5);
    for (let i = 0; i < obs.length; i += 1) {
      for (let j = i + 1; j < obs.length; j += 1) {
        const a0 = placeObstacleInRing(obs[i]!, centered, course)!;
        const b0 = placeObstacleInRing(obs[j]!, centered, course)!;
        const a1 = placeObstacleInRing(obs[i]!, flipped, course)!;
        const b1 = placeObstacleInRing(obs[j]!, flipped, course)!;
        expect(distance(a0, b0)).toBeCloseTo(distance(a1, b1), 6);
      }
    }
  });

  it('flip also applies to tunnel control points', () => {
    const flipped = { ...centered, flipX: true };
    const tunnel = course.obstacles[5]!;
    const baseline = placeControlPointsInRing(tunnel.controlPointsMeters, centered, course)!;
    const mirrored = placeControlPointsInRing(tunnel.controlPointsMeters, flipped, course)!;
    // Mirror reverses the X ordering relative to the ring-centre column
    // (x = 15 for this course/ring), while preserving pair-wise distances
    // (it's an isometry).
    expect(distance(baseline[0]!, baseline[2]!)).toBeCloseTo(
      distance(mirrored[0]!, mirrored[2]!),
      6,
    );
    // Each mirrored x equals (2·ringCentreX − baseline.x).
    for (let i = 0; i < baseline.length; i += 1) {
      expect(mirrored[i]!.x).toBeCloseTo(30 - baseline[i]!.x, 6);
      // Y is unchanged — these cps are all on y=5 in design.
      expect(mirrored[i]!.y).toBeCloseTo(baseline[i]!.y, 6);
    }
  });
});
