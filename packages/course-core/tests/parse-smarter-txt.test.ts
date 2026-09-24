import { describe, expect, it } from 'vitest';
import { parseSmarterTxt, SmarterParseError } from '../src/parser/parse-smarter-txt.js';
import { summarizeCourse } from '../src/parser/summarize-course.js';
import { FIXTURES_WITH_LOGOS, FIXTURES_WITH_NO_GO_ZONES, listSmarterFixtures } from './fixtures.js';

const fixtures = listSmarterFixtures();

describe('parseSmarterTxt — fixtures discovery', () => {
  it('finds at least one fixture under fixtures/smarter/', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });
});

describe.each(fixtures.map((f) => [f.name, f] as const))(
  'parseSmarterTxt — %s',
  (_name, fixture) => {
    const { courseData, warnings } = parseSmarterTxt(fixture.raw, { sourceFileName: fixture.name });
    const summary = summarizeCourse(courseData);

    it('does not throw and surfaces zod-validated CourseData', () => {
      expect(courseData.source).toBe('smarter-agility');
      expect(courseData.sourceFileName).toBe(fixture.name);
    });

    it('extracts a non-empty title', () => {
      expect(courseData.title).toBeTruthy();
      expect(courseData.title.length).toBeGreaterThan(0);
    });

    it('extracts positive design dimensions in meters', () => {
      expect(courseData.designLengthMeters).toBeGreaterThan(0);
      expect(courseData.designWidthMeters).toBeGreaterThan(0);
    });

    it('extracts positive canvas dimensions', () => {
      expect(courseData.canvasWidth).toBeGreaterThan(0);
      expect(courseData.canvasHeight).toBeGreaterThan(0);
    });

    it('extracts units and origin', () => {
      expect(['M', 'FT']).toContain(courseData.units);
      expect(['LT', 'LB', 'RT', 'RB', 'CC']).toContain(courseData.origin);
    });

    it('has at least one obstacle', () => {
      expect(summary.counts.obstacles).toBeGreaterThan(0);
    });

    it('normalises every obstacle type (no string surprises)', () => {
      for (const o of courseData.obstacles) {
        expect([
          'Jump',
          'DoubleJump',
          'Tunnel3m',
          'Tunnel4m',
          'Tunnel5m',
          'Tunnel6m',
          'DogWalk',
          'AFrame',
          'Seesaw',
          'Weave',
          'LongJump',
          'Wall',
          'Tire',
          'Unknown',
        ]).toContain(o.obstacleType);
      }
    });

    it('keeps every obstacle anchor inside or adjacent to the design rectangle', () => {
      // Allow a 1m tolerance — Smarter sometimes places obstacle anchors a
      // fraction outside the nominal rectangle (e.g. tunnel midpoints).
      const lengthM = courseData.designLengthMeters;
      const widthM = courseData.designWidthMeters;
      for (const o of courseData.obstacles) {
        if (o.xMeters == null || o.yMeters == null) continue;
        expect(o.xMeters).toBeGreaterThan(-1);
        expect(o.xMeters).toBeLessThan(lengthM + 1);
        expect(o.yMeters).toBeGreaterThan(-1);
        expect(o.yMeters).toBeLessThan(widthM + 1);
      }
    });

    it('produces a CourseNumber list with valid coordinates', () => {
      for (const n of courseData.numbers) {
        expect(typeof n.xMeters).toBe('number');
        expect(typeof n.yMeters).toBe('number');
        expect(Number.isFinite(n.xMeters)).toBe(true);
        expect(Number.isFinite(n.yMeters)).toBe(true);
      }
    });

    it('preserves canvas coordinates in rawMetadata._canvas for every obstacle', () => {
      for (const o of courseData.obstacles) {
        expect(o.rawMetadata).toHaveProperty('_canvas');
      }
    });

    it('counts no-go zones when the fixture is known to carry an AT group', () => {
      if (FIXTURES_WITH_NO_GO_ZONES.includes(fixture.name)) {
        expect(summary.counts.noGoZones).toBeGreaterThan(0);
        // Every zone must have ≥ 3 polygon points after meters conversion.
        for (const z of courseData.noGoZones) {
          expect(z.polygonPointsMeters.length).toBeGreaterThanOrEqual(3);
          expect(z.warningMarginMeters).toBe(0.5);
        }
      } else {
        expect(summary.counts.noGoZones).toBe(0);
      }
    });

    it('counts ignored logos when the fixture is known to carry logos', () => {
      if (FIXTURES_WITH_LOGOS.includes(fixture.name)) {
        expect(summary.counts.ignoredLogos).toBeGreaterThan(0);
      } else {
        expect(summary.counts.ignoredLogos).toBe(0);
      }
      // Whatever the count, logos must not have leaked into obstacles or zones.
      for (const o of courseData.obstacles) {
        expect(o.sourceCode).not.toBe('logos');
      }
    });

    it('emits no warnings for the bundled fixtures (smoke check on schema fit)', () => {
      // If a fixture starts producing warnings, surface them — they're
      // usually a sign the parser needs a new branch.
      expect(warnings, `unexpected warnings: ${warnings.join(' | ')}`).toEqual([]);
    });
  },
);

describe('parseSmarterTxt — tunnel control points', () => {
  // Pick the first fixture that has a tunnel and inspect it deeply.
  const fixture = fixtures.find((f) => /tryout|sw|tryouts|teams|jp/.test(f.name))!;
  const { courseData } = parseSmarterTxt(fixture.raw);
  const tunnels = courseData.obstacles.filter((o) => o.obstacleType.startsWith('Tunnel'));

  it('finds at least one tunnel in a representative fixture', () => {
    expect(tunnels.length).toBeGreaterThan(0);
  });

  it('every tunnel has control points in meters', () => {
    for (const t of tunnels) {
      expect(t.controlPointsMeters).not.toBeNull();
      expect(t.controlPointsMeters!.length).toBeGreaterThan(1);
      for (const p of t.controlPointsMeters!) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it('every tunnel carries nominalLengthMeters from its source code', () => {
    for (const t of tunnels) {
      expect(t.nominalLengthMeters).toBeGreaterThan(0);
    }
  });

  it('every tunnel anchor (mean of control points) is inside the design rectangle', () => {
    const lengthM = courseData.designLengthMeters;
    const widthM = courseData.designWidthMeters;
    for (const t of tunnels) {
      expect(t.xMeters).toBeGreaterThan(-1);
      expect(t.xMeters).toBeLessThan(lengthM + 1);
      expect(t.yMeters).toBeGreaterThan(-1);
      expect(t.yMeters).toBeLessThan(widthM + 1);
    }
  });
});

describe('parseSmarterTxt — number → obstacle linkage', () => {
  // Use a fixture rich in numbers.
  const fixture = fixtures.find((f) => f.name.startsWith('jp-s-sw'))!;
  const { courseData } = parseSmarterTxt(fixture.raw);

  it('most numbers carry a linkedObstacleSourceId (oid)', () => {
    const linked = courseData.numbers.filter((n) => n.linkedObstacleSourceId != null);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.length / courseData.numbers.length).toBeGreaterThan(0.5);
  });

  it('numeric labels become numeric sequenceNumber; non-numeric remain null', () => {
    for (const n of courseData.numbers) {
      if (/^-?\d+$/.test(n.text)) {
        expect(n.sequenceNumber).toBe(Number.parseInt(n.text, 10));
      } else {
        expect(n.sequenceNumber).toBeNull();
      }
    }
  });
});

describe('parseSmarterTxt — failure modes', () => {
  it('throws SmarterParseError when the wrapper is missing', () => {
    expect(() => parseSmarterTxt('totally not a smarter file')).toThrowError(SmarterParseError);
  });

  it('throws SmarterParseError on malformed base64', () => {
    // The wrapper RE will match but base64 of bytes that decode to invalid
    // JSON will reach the outer-JSON branch and throw there.
    expect(() => parseSmarterTxt('+++++++SADbm90LWpzb24=SAD+++++++')).toThrowError(
      SmarterParseError,
    );
  });
});
