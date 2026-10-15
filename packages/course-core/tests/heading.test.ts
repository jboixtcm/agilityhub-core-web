import { describe, expect, it } from 'vitest';

import { placedObstacleHeadingDegrees, placedObstacleHeadingVector } from '../src/geometry/heading.js';

const base = { flipX: false, flipY: false, rotationDegrees: 0 };

describe('R-16-01 / R-16-05 one heading convention (Smarter Y-down angle → ring Y-up heading)', () => {
  it('turns a Smarter clockwise-on-screen angle into the ring frame by negating its Y', () => {
    expect(placedObstacleHeadingDegrees(30, base)).toBeCloseTo(-30, 9);
    expect(placedObstacleHeadingDegrees(90, base)).toBeCloseTo(-90, 9);
    expect(placedObstacleHeadingDegrees(0, base)).toBeCloseTo(0, 9);
    expect(placedObstacleHeadingDegrees(null, base)).toBeCloseTo(0, 9);
  });

  it.each([
    // [Smarter angle, flipX, flipY, placement rotation, ring heading]
    [30, false, false, 0, -30],
    [30, true, false, 0, -150],
    [30, false, true, 0, 30],
    [30, true, true, 0, 150],
    [30, false, false, 90, 60],
    [30, true, false, 90, -60],
    [30, false, true, 90, 120],
    [30, true, true, 90, -120],
    [120, false, false, -45, -165],
    [120, true, true, 45, 105],
  ])(
    'angle %d° with flipX=%s flipY=%s and rotation %d° heads %d° in the ring',
    (angle, flipX, flipY, rotationDegrees, expected) => {
      const heading = placedObstacleHeadingDegrees(angle, { flipX, flipY, rotationDegrees });
      expect(heading).toBeCloseTo(expected, 9);
      const vector = placedObstacleHeadingVector(angle, { flipX, flipY, rotationDegrees });
      expect(Math.atan2(vector.y, vector.x)).toBeCloseTo((expected * Math.PI) / 180, 9);
      expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 9);
    },
  );
});
