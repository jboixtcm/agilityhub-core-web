/**
 * T-16-01 (R-16-02) — the 4 real Smarter route-validation files of the web-planner
 * (`apps/web-planner/route-validation-artifacts/` at course-builder 65126cf) parse with
 * `parseSmarterTxt` into the values documented in S16 §14.3.
 *
 * Expected values come from the files themselves (Smarter 10.1.2 export, FCI Agility, metres)
 * and, for Wald, from the fixtures README (12 physical obstacles, 13 labels). Each case also
 * decodes the base64 payload independently, so the parser is checked against the raw header
 * and the raw `settings.obstacles` groups, not only against a snapshot.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseSmarterTxt, summarizeCourse } from '../src/index.js';

import { ROUTE_VALIDATION_FIXTURES_DIR } from './fixtures.js';

interface ExpectedFixture {
  readonly file: string;
  readonly lengthMeters: number;
  readonly widthMeters: number;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly obstacles: number;
  readonly obstaclesByType: Record<string, number>;
  readonly numbers: number;
}

const EXPECTED: readonly ExpectedFixture[] = [
  {
    file: 'wald_1046378_v3_smarter_verified_sadesign.txt',
    lengthMeters: 40,
    widthMeters: 20,
    canvas: { width: 846, height: 473 },
    obstacles: 12,
    obstaclesByType: { Jump: 9, DogWalk: 1, AFrame: 1, Tunnel5m: 1 },
    numbers: 13,
  },
  {
    file: 'burning_dogs_fallback_v2_aframe_tangent_sadesign.txt',
    lengthMeters: 43.085,
    widthMeters: 20.503,
    canvas: { width: 907.702634, height: 483.064631 },
    obstacles: 20,
    obstaclesByType: {
      Jump: 9,
      DoubleJump: 1,
      Wall: 1,
      Tunnel3m: 1,
      DogWalk: 1,
      Seesaw: 1,
      Tunnel6m: 2,
      Weave: 1,
      LongJump: 1,
      Tunnel5m: 1,
      AFrame: 1,
    },
    numbers: 22,
  },
  {
    file: 'jg3_1029362_plus_3-4_sadesign.txt',
    lengthMeters: 40,
    widthMeters: 30,
    canvas: { width: 846, height: 673 },
    obstacles: 10,
    obstaclesByType: { Jump: 3, Weave: 1, LongJump: 1, Seesaw: 1, Tunnel6m: 2, Tunnel4m: 2 },
    numbers: 21,
  },
  {
    file: 'switz-a3-m-def_999795_plus_13-14_sadesign.txt',
    lengthMeters: 29,
    widthMeters: 27,
    canvas: { width: 626, height: 613 },
    obstacles: 11,
    obstaclesByType: {
      Jump: 1,
      Weave: 1,
      LongJump: 1,
      Tunnel5m: 1,
      AFrame: 1,
      Tire: 1,
      Seesaw: 1,
      Tunnel4m: 1,
      Tunnel6m: 1,
      Tunnel3m: 2,
    },
    numbers: 19,
  },
];

const HEADER_LINE = 'Copy the text below and paste it in the Smarter Agility import form';

function readFixture(file: string): string {
  return readFileSync(resolve(ROUTE_VALIDATION_FIXTURES_DIR, file), 'utf-8');
}

/** Independent decoder: `+++++++SAD<base64 JSON>SAD+++++++`, `settings` is JSON inside the JSON. */
function decodeRaw(raw: string): {
  outer: Record<string, unknown>;
  settings: { version: string; discipline: string; obstacles: Record<string, Record<string, unknown>> };
} {
  const start = raw.indexOf('+++++++SAD') + '+++++++SAD'.length;
  const end = raw.lastIndexOf('SAD+++++++');
  const outer = JSON.parse(Buffer.from(raw.slice(start, end), 'base64').toString('utf-8')) as Record<
    string,
    unknown
  >;
  const settings = JSON.parse(outer.settings as string) as {
    version: string;
    discipline: string;
    obstacles: Record<string, Record<string, unknown>>;
  };
  return { outer, settings };
}

describe('T-16-01 smarter fixtures — route-validation files parse with parseSmarterTxt', () => {
  it('bundles the 4 route-validation fixtures', () => {
    expect(EXPECTED.map((fixture) => fixture.file).sort()).toEqual([
      'burning_dogs_fallback_v2_aframe_tangent_sadesign.txt',
      'jg3_1029362_plus_3-4_sadesign.txt',
      'switz-a3-m-def_999795_plus_13-14_sadesign.txt',
      'wald_1046378_v3_smarter_verified_sadesign.txt',
    ]);
  });

  describe.each(EXPECTED.map((fixture) => [fixture.file, fixture] as const))('%s', (file, expected) => {
    const raw = readFixture(file);
    const { courseData, warnings } = parseSmarterTxt(raw, { sourceFileName: file });
    const summary = summarizeCourse(courseData);
    const { outer, settings } = decodeRaw(raw);

    it('is a Smarter 10.1.2 FCI Agility export (§14.3 wrapper and header)', () => {
      expect(raw.startsWith(HEADER_LINE)).toBe(true);
      expect(settings.version).toBe('10.1.2');
      expect(settings.discipline).toBe('AG');
      expect(outer.export_version).toBe(2);
      expect(outer.layout_version).toBe(1);
      expect(courseData.metadata.courseType).toBe('Agility');
      expect(courseData.metadata.organization).toBe('fci');
      expect(courseData.metadata.exportVersion).toBe(2);
    });

    it('parses with zero warnings', () => {
      expect(warnings).toEqual([]);
    });

    it('keeps metres, LT origin and the design dimensions', () => {
      expect(courseData.units).toBe('M');
      expect(courseData.origin).toBe('LT');
      expect(summary.dimensionsMeters).toEqual({
        length: expected.lengthMeters,
        width: expected.widthMeters,
      });
      expect(courseData.designLengthMeters).toBe(outer.length);
      expect(courseData.designWidthMeters).toBe(outer.width);
      expect(summary.canvas).toEqual(expected.canvas);
    });

    it('counts the obstacles by type and the number labels', () => {
      expect(summary.counts.obstacles).toBe(expected.obstacles);
      expect(summary.counts.obstaclesByType).toEqual(expected.obstaclesByType);
      expect(summary.counts.numbers).toBe(expected.numbers);
      expect(summary.counts.noGoZones).toBe(0);
      expect(summary.counts.ignoredLogos).toBe(0);
    });

    it('maps every raw settings.obstacles entry to one obstacle with the same source code', () => {
      const rawByCode = Object.fromEntries(
        Object.entries(settings.obstacles).map(([code, entries]) => [code, Object.keys(entries).length]),
      );
      const parsedByCode: Record<string, number> = {};
      for (const obstacle of courseData.obstacles) {
        parsedByCode[obstacle.sourceCode] = (parsedByCode[obstacle.sourceCode] ?? 0) + 1;
      }
      expect(parsedByCode).toEqual(rawByCode);
    });

    it('places every obstacle anchor inside the design field (pixel → metre conversion)', () => {
      for (const obstacle of courseData.obstacles) {
        expect(obstacle.xMeters).not.toBeNull();
        expect(obstacle.yMeters).not.toBeNull();
        expect(obstacle.xMeters).toBeGreaterThanOrEqual(0);
        expect(obstacle.xMeters).toBeLessThanOrEqual(expected.lengthMeters);
        expect(obstacle.yMeters).toBeGreaterThanOrEqual(0);
        expect(obstacle.yMeters).toBeLessThanOrEqual(expected.widthMeters);
      }
    });
  });
});
