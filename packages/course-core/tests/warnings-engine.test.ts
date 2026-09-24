import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  centerCourseInRing,
  IDENTITY_PLACEMENT,
  type CoursePlacement,
} from '../src/geometry/placement.js';
import { parseSmarterTxt } from '../src/parser/parse-smarter-txt.js';
import { runWarnings, summarizeWarnings } from '../src/warnings/engine.js';
import { SMARTER_FIXTURES_DIR } from './fixtures.js';
import { makeCourse, makeObstacle, makeRing } from './helpers/synthetic.js';

const GENEROUS_INVENTORY = {
  Jump: 50,
  DoubleJump: 10,
  Tunnel3m: 10,
  Tunnel4m: 10,
  Tunnel5m: 10,
  Tunnel6m: 10,
  DogWalk: 5,
  AFrame: 5,
  Seesaw: 5,
  Weave: 5,
  LongJump: 5,
  Wall: 5,
  Tire: 5,
};

describe('runWarnings — engine basics', () => {
  it('produces no warnings for a clean synthetic course', () => {
    const c = makeCourse({
      designLengthMeters: 4,
      designWidthMeters: 4,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 2, yMeters: 2 })],
    });
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 1 },
    });
    const p = centerCourseInRing(c, ring);
    const warnings = runWarnings(c, p, ring);
    expect(warnings).toEqual([]);
  });

  it('orders critical first, then warning, preserving rule order within severity', () => {
    const c = makeCourse({
      designLengthMeters: 50,
      designWidthMeters: 50,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 25, yMeters: 25 })],
    });
    // Ring too small ⇒ critical course-larger-than-ring + critical outside-ring
    // (when centred, every obstacle stays at the centre but the course
    // rect overflows the ring — outside-ring still passes because the
    // obstacle anchor itself is inside, but course-larger-than-ring fires).
    const ring = makeRing({ lengthMeters: 20, widthMeters: 20 });
    const warnings = runWarnings(c, centerCourseInRing(c, ring), ring);
    expect(warnings.length).toBeGreaterThan(0);
    const severities = warnings.map((w) => w.severity);
    // Severities must be in non-decreasing "criticality" order.
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i += 1) {
      expect(order[severities[i]!]).toBeGreaterThanOrEqual(order[severities[i - 1]!]!);
    }
  });

  it('`only` option restricts which rules run', () => {
    const c = makeCourse({
      designLengthMeters: 1,
      designWidthMeters: 1,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 0.5, yMeters: 0.5 })],
    });
    const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });
    const p: CoursePlacement = { ...IDENTITY_PLACEMENT, offsetXMeters: 100, offsetYMeters: 100 };
    const onlyOutside = runWarnings(c, p, ring, { only: ['outside-ring'] });
    expect(onlyOutside.every((w) => w.ruleId === 'outside-ring')).toBe(true);
  });
});

describe('summarizeWarnings', () => {
  it('aggregates per severity and per rule', () => {
    const c = makeCourse({
      designLengthMeters: 60,
      designWidthMeters: 60,
      obstacles: [makeObstacle({ type: 'Jump', xMeters: 30, yMeters: 30 })],
    });
    const ring = makeRing({ lengthMeters: 20, widthMeters: 20 });
    const summary = summarizeWarnings(runWarnings(c, IDENTITY_PLACEMENT, ring));
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.bySeverity.critical).toBeGreaterThan(0);
    expect(summary.byRule['course-larger-than-ring']).toBe(1);
  });
});

describe('runWarnings — obstacle-inventory integration', () => {
  it('engine fans inventory warnings into the same list as the other rules', () => {
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [
        makeObstacle({ type: 'Jump', xMeters: 5, yMeters: 5 }),
        makeObstacle({ type: 'Tunnel6m', xMeters: 5, yMeters: 5 }),
      ],
    });
    const ring = makeRing({
      lengthMeters: 30,
      widthMeters: 20,
      obstacleInventory: { Jump: 1, Tunnel3m: 1 }, // ring has no 6m tunnel
    });
    const warnings = runWarnings(c, centerCourseInRing(c, ring), ring);
    expect(warnings.some((w) => w.ruleId === 'obstacle-inventory')).toBe(true);
    expect(warnings.some((w) => w.id === 'obstacle-inventory:Tunnel6m:missing')).toBe(true);
  });

  it('engine emits only the non-blocking "not-configured" info row when the ring has no declared inventory', () => {
    // Real-venue hardening (2026-05-20) replaced the previous silent
    // behaviour with a single info row so the user knows validation was
    // skipped — but the row is still `info`-severity so the save flow
    // does not treat it as a blocker.
    const c = makeCourse({
      designLengthMeters: 10,
      designWidthMeters: 10,
      obstacles: [makeObstacle({ type: 'Tunnel6m', xMeters: 5, yMeters: 5 })],
    });
    const ring = makeRing({ lengthMeters: 30, widthMeters: 20 });
    const warnings = runWarnings(c, centerCourseInRing(c, ring), ring);
    const inventoryRows = warnings.filter((w) => w.ruleId === 'obstacle-inventory');
    expect(inventoryRows).toHaveLength(1);
    expect(inventoryRows[0]!.id).toBe('obstacle-inventory:not-configured');
    expect(inventoryRows[0]!.severity).toBe('info');
    // Specifically: no critical / warning rows masquerading as "venue
    // owns 0 of every type the course needs".
    expect(
      warnings.some(
        (w) => w.ruleId === 'obstacle-inventory' && w.severity !== 'info',
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fixture-driven integration tests
//
// Take real parsed CourseData (no synthetic data) and check that the
// engine produces sensible warning shapes against synthetic rings.
// ---------------------------------------------------------------------------

function loadFixture(name: string) {
  const raw = readFileSync(resolve(SMARTER_FIXTURES_DIR, name), 'utf-8');
  return parseSmarterTxt(raw, { sourceFileName: name }).courseData;
}

describe('runWarnings — fixture: jp-s-sw (27×29) inside a 30×30 ring', () => {
  const course = loadFixture('jp-s-sw_993483_sadesign.txt');
  const ring = makeRing({
    lengthMeters: 30,
    widthMeters: 30,
    obstacleInventory: GENEROUS_INVENTORY,
  });
  const placement = centerCourseInRing(course, ring);
  const warnings = runWarnings(course, placement, ring);

  it('does not fire course-larger-than-ring (27×29 fits in 30×30)', () => {
    expect(warnings.some((w) => w.ruleId === 'course-larger-than-ring')).toBe(false);
  });

  it('does not fire ring-no-go / door-clearance (none configured)', () => {
    expect(warnings.some((w) => w.ruleId === 'ring-no-go')).toBe(false);
    expect(warnings.some((w) => w.ruleId === 'door-clearance')).toBe(false);
  });

  it('every warning has a stable, well-formed shape', () => {
    for (const w of warnings) {
      expect(w.id).toBeTruthy();
      expect(['critical', 'warning', 'info']).toContain(w.severity);
      expect(w.message.length).toBeGreaterThan(0);
    }
  });

  it('any warnings that do fire are border-clearance / outside-ring (course is tight in 30×30)', () => {
    // Course is 27×29 in a 30×30 ring — there is at most 1.5/0.5m of margin
    // per side. Some obstacles near the design edge can fire border-clearance
    // and possibly outside-ring once footprint radius is inflated. Either is
    // acceptable; what's NOT acceptable is course-no-go (no AT zones in this
    // fixture) or anything venue-side.
    for (const w of warnings) {
      expect(['border-clearance', 'outside-ring']).toContain(w.ruleId);
    }
  });
});

describe('runWarnings — fixture: ag-au-tryout (has real AT no-go zone)', () => {
  const baseCourse = loadFixture('ag-au-tryout-i-copy_998859_sadesign.txt');
  const ring = makeRing({ lengthMeters: 45, widthMeters: 25 });

  it('parses at least one course-side NoGoZone (sanity)', () => {
    expect(baseCourse.noGoZones.length).toBeGreaterThan(0);
  });

  it('engine consumes the real AT polygon correctly: a probe obstacle dropped inside the zone fires course-no-go', () => {
    // The real AT polygon is a small triangle tucked into the top-left
    // corner of the design rectangle. None of the fixture's actual
    // obstacles overlap it (verified by hand against the parsed output).
    // To prove the engine handles real-shaped polygon data — not just
    // synthetic squares from the rule-level tests — we append a probe
    // obstacle whose anchor lies inside the polygon, then assert that a
    // course-no-go warning is raised for *that* obstacle.
    const zone = baseCourse.noGoZones[0]!;
    const centroid = {
      x: zone.polygonPointsMeters.reduce((s, p) => s + p.x, 0) / zone.polygonPointsMeters.length,
      y: zone.polygonPointsMeters.reduce((s, p) => s + p.y, 0) / zone.polygonPointsMeters.length,
    };
    const probe = makeObstacle({
      type: 'Jump',
      xMeters: centroid.x,
      yMeters: centroid.y,
      sourceId: 'probe-inside-AT',
    });
    const courseWithProbe = {
      ...baseCourse,
      obstacles: [...baseCourse.obstacles, probe],
    };
    const placement = centerCourseInRing(courseWithProbe, ring);
    const warnings = runWarnings(courseWithProbe, placement, ring);
    const noGoForProbe = warnings.filter(
      (w) => w.ruleId === 'course-no-go' && w.obstacleSourceId === probe.sourceId,
    );
    expect(noGoForProbe.length).toBeGreaterThan(0);
    expect(noGoForProbe[0]!.courseNoGoZoneId).toBe(zone.id);
  });

  it('engine runs on the real fixture (with no probe) without throwing', () => {
    const placement = centerCourseInRing(baseCourse, ring);
    const warnings = runWarnings(baseCourse, placement, ring);
    for (const w of warnings) {
      expect(w.id).toBeTruthy();
      expect(['critical', 'warning', 'info']).toContain(w.severity);
    }
  });
});
