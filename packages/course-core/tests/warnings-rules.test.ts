import { describe, expect, it } from 'vitest';
import {
  centerCourseInRing,
  IDENTITY_PLACEMENT,
  type CoursePlacement,
} from '../src/geometry/placement.js';
import { checkBorderClearance } from '../src/warnings/rules/border-clearance.js';
import { checkCourseLargerThanRing } from '../src/warnings/rules/course-larger-than-ring.js';
import { checkCourseNoGo } from '../src/warnings/rules/course-no-go.js';
import { checkDoorClearance } from '../src/warnings/rules/door-clearance.js';
import { checkObstacleInventory } from '../src/warnings/rules/obstacle-inventory.js';
import { checkOutsideRing } from '../src/warnings/rules/outside-ring.js';
import { checkRingNoGo } from '../src/warnings/rules/ring-no-go.js';
import { makeCourse, makeNoGoZone, makeObstacle, makeRing } from './helpers/synthetic.js';

// ---------------------------------------------------------------------------
// outside-ring
// ---------------------------------------------------------------------------

describe('checkOutsideRing', () => {
  const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });

  it('no warnings when every obstacle is well inside', () => {
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 }),
        makeObstacle({ type: 'Jump', xMeters: 15, yMeters: 5 }),
      ],
    });
    const p = centerCourseInRing(c, ring);
    expect(checkOutsideRing(c, p, ring)).toEqual([]);
  });

  it('critical warning when an obstacle pokes outside the ring', () => {
    // Bind the obstacle to a local — the synthetic helper's id counter is
    // module-scoped and shared across files, so asserting against a hard-
    // coded sourceId is fragile.
    const obstacle = makeObstacle({
      type: 'Jump',
      xMeters: 5,
      yMeters: 5,
      sourceId: 'outside-fixture-1',
    });
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [obstacle],
    });
    // Push the course offset way out beyond the ring.
    const p: CoursePlacement = {
      ...IDENTITY_PLACEMENT,
      offsetXMeters: 100,
      offsetYMeters: 5,
    };
    const warnings = checkOutsideRing(c, p, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('critical');
    expect(warnings[0]!.ruleId).toBe('outside-ring');
    expect(warnings[0]!.obstacleSourceId).toBe(obstacle.sourceId);
    expect(warnings[0]!.distanceMeters!).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// border-clearance
// ---------------------------------------------------------------------------

describe('checkBorderClearance', () => {
  const ring = makeRing({ lengthMeters: 30, widthMeters: 20, borderClearanceMeters: 0.5 });

  it('no warning when obstacle is comfortably inside', () => {
    const c = makeCourse({
      designLengthMeters: 4,
      designWidthMeters: 4,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 2, yMeters: 2 })],
    });
    const p = centerCourseInRing(c, ring);
    expect(checkBorderClearance(c, p, ring)).toEqual([]);
  });

  it('warning fires when an obstacle is 0.2 m from the border (threshold 0.5)', () => {
    // Jump has radius 0.4 m. Place its anchor 0.6 m from the right edge
    // ⇒ outer edge is 0.2 m from the border ⇒ should fire (< 0.5 m).
    const c = makeCourse({
      designLengthMeters: 1,
      designWidthMeters: 1,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 0.5, yMeters: 0.5 })],
    });
    const p: CoursePlacement = {
      ...IDENTITY_PLACEMENT,
      // courseAnchor = (0.5, 0.5). Set offset so the obstacle (anchor=0.5,0.5)
      // lands 0.6 m from the right edge: ring length 30, so obstacle x = 29.4.
      offsetXMeters: 29.4,
      offsetYMeters: 10,
    };
    const warnings = checkBorderClearance(c, p, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.distanceMeters!).toBeCloseTo(0.2, 1);
    expect(warnings[0]!.thresholdMeters).toBe(0.5);
  });

  it('does NOT fire for obstacles already outside (outside-ring handles those)', () => {
    const c = makeCourse({
      designLengthMeters: 1,
      designWidthMeters: 1,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 0.5, yMeters: 0.5 })],
    });
    const p: CoursePlacement = { ...IDENTITY_PLACEMENT, offsetXMeters: 100, offsetYMeters: 10 };
    expect(checkBorderClearance(c, p, ring)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// course-larger-than-ring
// ---------------------------------------------------------------------------

describe('checkCourseLargerThanRing', () => {
  it('no warning when course fits as-is', () => {
    const c = makeCourse({ designLengthMeters: 20, designWidthMeters: 10 });
    const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });
    expect(checkCourseLargerThanRing(c, IDENTITY_PLACEMENT, ring)).toEqual([]);
  });

  it('no warning when it fits only by 90° rotation', () => {
    // course 20×40, ring 30×40 → as-is 40 > 30 fails; rotated 40 ≤ 40, 20 ≤ 30 ✓
    const c = makeCourse({ designLengthMeters: 20, designWidthMeters: 40 });
    const ring = makeRing({ lengthMeters: 40, widthMeters: 30 });
    expect(checkCourseLargerThanRing(c, IDENTITY_PLACEMENT, ring)).toEqual([]);
  });

  it('critical warning when no orientation fits', () => {
    const c = makeCourse({ designLengthMeters: 40, designWidthMeters: 40 });
    const ring = makeRing({ lengthMeters: 30, widthMeters: 30 });
    const warnings = checkCourseLargerThanRing(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('critical');
    expect(warnings[0]!.ruleId).toBe('course-larger-than-ring');
    expect(warnings[0]!.distanceMeters!).toBeCloseTo(10, 6);
  });
});

// ---------------------------------------------------------------------------
// course-no-go (Smarter AT polygons travel with the placement)
// ---------------------------------------------------------------------------

describe('checkCourseNoGo', () => {
  const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });

  it('no warning when the course has no AT zones', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
    });
    expect(checkCourseNoGo(c, centerCourseInRing(c, ring), ring)).toEqual([]);
  });

  it('critical warning when an obstacle anchor is inside an AT polygon', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
      noGoZones: [
        makeNoGoZone({
          id: 'at:zone',
          polygon: [
            { x: 4, y: 4 },
            { x: 6, y: 4 },
            { x: 6, y: 6 },
            { x: 4, y: 6 },
          ],
        }),
      ],
    });
    const warnings = checkCourseNoGo(c, centerCourseInRing(c, ring), ring);
    const critical = warnings.find((w) => w.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.courseNoGoZoneId).toBe('at:zone');
  });

  it('warning (not critical) when obstacle is just inside the margin', () => {
    // Polygon is far from the obstacle; place obstacle just outside it.
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
      noGoZones: [
        makeNoGoZone({
          id: 'at:zone',
          // Square 1×1 with right edge at x=4.5 — obstacle anchor at x=5 is
          // 0.5 m away from polygon edge; outer edge of Jump (radius 0.4 m)
          // is 0.1 m away ⇒ within 0.5 m margin ⇒ warning.
          polygon: [
            { x: 3.5, y: 4 },
            { x: 4.5, y: 4 },
            { x: 4.5, y: 6 },
            { x: 3.5, y: 6 },
          ],
        }),
      ],
    });
    const warnings = checkCourseNoGo(c, centerCourseInRing(c, ring), ring);
    const warn = warnings.find((w) => w.severity === 'warning');
    expect(warn).toBeDefined();
    expect(warn!.distanceMeters!).toBeGreaterThan(0);
    expect(warn!.thresholdMeters).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// ring-no-go
// ---------------------------------------------------------------------------

describe('checkRingNoGo', () => {
  it('critical warning when obstacle (ring-frame) overlaps a venue zone', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
    });
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      noGoZones: [
        {
          id: 'pillar',
          label: 'Pillar',
          sourceType: 'ring',
          polygonPointsMeters: [
            { x: 14, y: 9 },
            { x: 16, y: 9 },
            { x: 16, y: 11 },
            { x: 14, y: 11 },
          ],
          warningMarginMeters: 0.5,
        },
      ],
    });
    // Centred ⇒ obstacle anchor lands at (15, 10) which is inside the pillar.
    const warnings = checkRingNoGo(c, centerCourseInRing(c, ring), ring);
    const critical = warnings.find((w) => w.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.ringNoGoZoneId).toBe('pillar');
  });
});

// ---------------------------------------------------------------------------
// door-clearance
// ---------------------------------------------------------------------------

describe('checkDoorClearance', () => {
  it('critical when obstacle (inflated) overlaps door polygon', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
    });
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      doors: [
        {
          id: 'main-door',
          label: 'Main door',
          polygonPointsMeters: [
            { x: 14.5, y: 9.5 },
            { x: 15.5, y: 9.5 },
            { x: 15.5, y: 10.5 },
            { x: 14.5, y: 10.5 },
          ],
          clearanceMeters: 0.5,
          flow: 'both',
          isActive: true,
        },
      ],
    });
    const warnings = checkDoorClearance(c, centerCourseInRing(c, ring), ring);
    const critical = warnings.find((w) => w.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.doorId).toBe('main-door');
  });

  it('warning (not critical) when obstacle is near but not on the door', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
    });
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      doors: [
        {
          id: 'd',
          label: 'D',
          polygonPointsMeters: [
            // Square 1×1 with left edge at x=15.8. Obstacle anchor lands at
            // (15, 10); distance from anchor to nearest door edge = 0.8 m;
            // inflate by Jump radius (0.4 m) ⇒ outer-edge distance 0.4 m,
            // which is strictly < clearance 0.5 m ⇒ warning, not critical.
            { x: 15.8, y: 9.5 },
            { x: 16.8, y: 9.5 },
            { x: 16.8, y: 10.5 },
            { x: 15.8, y: 10.5 },
          ],
          clearanceMeters: 0.5,
          flow: 'both',
          isActive: true,
        },
      ],
    });
    const warnings = checkDoorClearance(c, centerCourseInRing(c, ring), ring);
    const warn = warnings.find((w) => w.severity === 'warning');
    expect(warn).toBeDefined();
    expect(warn!.distanceMeters!).toBeGreaterThan(0);
    expect(warn!.thresholdMeters).toBe(0.5);
  });

  it('no warning when door list is empty', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 })],
    });
    const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });
    expect(checkDoorClearance(c, centerCourseInRing(c, ring), ring)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// obstacle-inventory
// ---------------------------------------------------------------------------

describe('checkObstacleInventory', () => {
  // Tiny demand-only course; placement is irrelevant for the inventory rule.
  function makeJumpsAndTunnel(jumpCount: number, tunnelType: 'Tunnel3m' | 'Tunnel6m') {
    return makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        ...Array.from({ length: jumpCount }, () =>
          makeObstacle({ type: 'Jump', xMeters: 1, yMeters: 1 }),
        ),
        makeObstacle({ type: tunnelType, xMeters: 5, yMeters: 5 }),
      ],
    });
  }

  it('emits a single non-blocking info warning when the ring has no inventory configured', () => {
    // Empty inventory map is the "opt-out" signal — venues that haven't
    // populated their stock yet shouldn't drown the planner in red.
    // Real-venue hardening (2026-05-20) replaced the previous silent
    // behaviour with a single info row so the user knows validation
    // was skipped (the alternative — silence — was indistinguishable
    // from "no problems found").
    const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });
    const c = makeJumpsAndTunnel(20, 'Tunnel6m');
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('info');
    expect(warnings[0]!.ruleId).toBe('obstacle-inventory');
    expect(warnings[0]!.id).toBe('obstacle-inventory:not-configured');
    // The info row is the *only* output — no per-type criticals masquerading
    // as "venue owns 0".
    expect(warnings.find((w) => w.severity === 'critical')).toBeUndefined();
    expect(warnings.find((w) => w.severity === 'warning')).toBeUndefined();
  });

  it('produces NO warnings when supply meets demand exactly', () => {
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 4, Tunnel3m: 1 },
    });
    const c = makeJumpsAndTunnel(4, 'Tunnel3m');
    expect(checkObstacleInventory(c, IDENTITY_PLACEMENT, ring)).toEqual([]);
  });

  it('returns a critical warning when the ring has zero of a needed type', () => {
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 10, Tunnel3m: 1 },
    });
    // Course wants a 6m tunnel, ring only stocks 3m.
    const c = makeJumpsAndTunnel(2, 'Tunnel6m');
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('critical');
    expect(warnings[0]!.ruleId).toBe('obstacle-inventory');
    expect(warnings[0]!.id).toBe('obstacle-inventory:Tunnel6m:missing');
    expect(warnings[0]!.thresholdMeters).toBe(0);
  });

  it('returns a non-critical warning when supply is short but non-zero', () => {
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 3, Tunnel3m: 1 },
    });
    const c = makeJumpsAndTunnel(5, 'Tunnel3m');
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.id).toBe('obstacle-inventory:Jump:short');
    // missing = 5 - 3 = 2, available = 3
    expect(warnings[0]!.distanceMeters).toBe(2);
    expect(warnings[0]!.thresholdMeters).toBe(3);
  });

  it('skips Unknown-typed obstacles from per-type demand and surfaces a single info row', () => {
    // Unknown obstacles don't have an `ObstacleType` we can match against
    // the inventory, but the judge still deserves to know the rule
    // skipped them — otherwise the warnings panel looks like the course
    // is fully validated when it isn't.
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 5 },
    });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        makeObstacle({ type: 'Jump', xMeters: 1, yMeters: 1 }),
        makeObstacle({ type: 'Unknown', xMeters: 2, yMeters: 2 }),
        makeObstacle({ type: 'Unknown', xMeters: 3, yMeters: 3 }),
      ],
    });
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    // No shortages for the Jump (1 used ≤ 5 available).
    expect(warnings.find((w) => w.severity === 'critical')).toBeUndefined();
    expect(warnings.find((w) => w.severity === 'warning')).toBeUndefined();
    // Single info row, aggregated over both Unknown obstacles.
    const info = warnings.find((w) => w.id === 'obstacle-inventory:unknown-types');
    expect(info).toBeDefined();
    expect(info!.severity).toBe('info');
    expect(info!.distanceMeters).toBe(2);
  });

  // Real-venue hardening (2026-05-20) — explicit acceptance-check coverage.

  it('sufficient inventory across mixed categories produces no warnings', () => {
    // A realistic small course: jumps, two tunnel sizes, a contact obstacle.
    // Ring stocks at least one of each. Expect zero rows from this rule.
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: {
        Jump: 12,
        Tunnel3m: 2,
        Tunnel6m: 1,
        AFrame: 1,
        DogWalk: 1,
        Weave: 1,
      },
    });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        ...Array.from({ length: 10 }, () =>
          makeObstacle({ type: 'Jump', xMeters: 1, yMeters: 1 }),
        ),
        makeObstacle({ type: 'Tunnel3m', xMeters: 2, yMeters: 2 }),
        makeObstacle({ type: 'Tunnel6m', xMeters: 3, yMeters: 3 }),
        makeObstacle({ type: 'AFrame', xMeters: 4, yMeters: 4 }),
        makeObstacle({ type: 'DogWalk', xMeters: 5, yMeters: 5 }),
        makeObstacle({ type: 'Weave', xMeters: 6, yMeters: 6 }),
      ],
    });
    expect(checkObstacleInventory(c, IDENTITY_PLACEMENT, ring)).toEqual([]);
  });

  it('insufficient jumps fires a non-critical short warning', () => {
    // Same shape as the existing "supply is short but non-zero" case, but
    // pinned as an acceptance check for the jumps-specific path.
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      // Ring stocks 6 jumps but no other obstacle types — the missing
      // tunnel is irrelevant here, the course doesn't use one.
      obstacleInventory: { Jump: 6 },
    });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: Array.from({ length: 10 }, () =>
        makeObstacle({ type: 'Jump', xMeters: 1, yMeters: 1 }),
      ),
    });
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.id).toBe('obstacle-inventory:Jump:short');
    expect(warnings[0]!.distanceMeters).toBe(4);
    expect(warnings[0]!.thresholdMeters).toBe(6);
  });

  it('insufficient tunnels of a specific length fire a critical when the ring has zero of that size', () => {
    // Tunnels are normalized to distinct ObstacleTypes (Tunnel3m vs
    // Tunnel6m) so a ring stocked with 3 m tunnels but no 6 m tunnels
    // produces a critical for the 6 m course requirement — even though
    // the *total* tunnel count looks adequate. This is the acceptance
    // check for "tunnel size/length if the imported course gives enough
    // information".
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 10, Tunnel3m: 4 },
    });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        makeObstacle({ type: 'Tunnel3m', xMeters: 1, yMeters: 1 }),
        makeObstacle({ type: 'Tunnel6m', xMeters: 2, yMeters: 2 }),
      ],
    });
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('critical');
    expect(warnings[0]!.id).toBe('obstacle-inventory:Tunnel6m:missing');
    expect(warnings[0]!.thresholdMeters).toBe(0);
  });

  it('insufficient tunnels short-fires when the ring has some but fewer than the course needs', () => {
    // The judge has two 4 m tunnels in the hall but the course calls for
    // three. Short, not critical — they can swap one obstacle or borrow.
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 10, Tunnel4m: 2 },
    });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        makeObstacle({ type: 'Tunnel4m', xMeters: 1, yMeters: 1 }),
        makeObstacle({ type: 'Tunnel4m', xMeters: 2, yMeters: 2 }),
        makeObstacle({ type: 'Tunnel4m', xMeters: 3, yMeters: 3 }),
      ],
    });
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.id).toBe('obstacle-inventory:Tunnel4m:short');
    expect(warnings[0]!.distanceMeters).toBe(1);
    expect(warnings[0]!.thresholdMeters).toBe(2);
  });

  it('missing-inventory advisory is the only output even when the course is huge', () => {
    // 30-obstacle course on a ring with no declared inventory. Even with
    // a clearly impossible demand profile, we still emit a single info
    // row — never per-type criticals. This is the regression net for the
    // "empty = opt-out" feedback memory.
    const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        ...Array.from({ length: 25 }, () =>
          makeObstacle({ type: 'Jump', xMeters: 1, yMeters: 1 }),
        ),
        makeObstacle({ type: 'Tunnel3m', xMeters: 2, yMeters: 2 }),
        makeObstacle({ type: 'Tunnel4m', xMeters: 3, yMeters: 3 }),
        makeObstacle({ type: 'Tunnel5m', xMeters: 4, yMeters: 4 }),
        makeObstacle({ type: 'Tunnel6m', xMeters: 5, yMeters: 5 }),
        makeObstacle({ type: 'AFrame', xMeters: 6, yMeters: 6 }),
      ],
    });
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings.map((w) => w.id)).toEqual(['obstacle-inventory:not-configured']);
  });

  it('emits one stable-ordered warning per under-supplied type', () => {
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 1, Tunnel3m: 0 },
    });
    const c = makeCourse({
      designLengthMeters: 20,
      designWidthMeters: 10,
      obstacles: [
        makeObstacle({ type: 'Jump', xMeters: 1, yMeters: 1 }),
        makeObstacle({ type: 'Jump', xMeters: 2, yMeters: 2 }),
        makeObstacle({ type: 'Tunnel3m', xMeters: 3, yMeters: 3 }),
      ],
    });
    const warnings = checkObstacleInventory(c, IDENTITY_PLACEMENT, ring);
    expect(warnings.map((w) => w.id)).toEqual([
      'obstacle-inventory:Jump:short',
      'obstacle-inventory:Tunnel3m:missing',
    ]);
  });
});
