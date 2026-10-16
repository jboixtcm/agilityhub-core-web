import { describe, expect, it } from 'vitest';

import { coursePathLengthMeters } from '../src/geometry/path.js';
import { parseSmarterTxt } from '../src/parser/index.js';
import type { CourseData } from '../src/schema/index.js';

import { listSmarterFixtures } from './fixtures.js';

function course(
  obstacles: readonly [string, number | null, number | null][],
  numbers: readonly [number | null, string | null][],
): CourseData {
  return {
    canvasHeight: 600,
    canvasWidth: 900,
    designLengthMeters: 30,
    designWidthMeters: 20,
    id: 'c',
    ignoredLogos: [],
    metadata: {
      category: '',
      courseType: 'Jumping',
      date: '',
      designer: '',
      exportVersion: null,
      grade: '',
      location: '',
      obstacleSummary: null,
      organization: '',
      type: '',
    },
    noGoZones: [],
    numbers: numbers.map(([sequenceNumber, linked], index) => ({
      id: `n${String(index)}`,
      linkedObstacleSourceId: linked,
      obstacleConnectionPoint: null,
      rawMetadata: {},
      sequenceKey: 'n1',
      sequenceNumber,
      text: String(sequenceNumber),
      xMeters: 0,
      yMeters: 0,
    })),
    obstacles: obstacles.map(([sourceId, x, y]) => ({
      colorKey: null,
      controlPointsMeters: null,
      id: `o${sourceId}`,
      nominalLengthMeters: null,
      obstacleType: 'Jump',
      rawMetadata: {},
      rotationDegrees: 0,
      sourceCode: 'jb',
      sourceId,
      status: 'notPlaced',
      xMeters: x,
      yMeters: y,
    })),
    origin: 'LT',
    rawMetadata: {},
    source: 'smarter-agility',
    sourceFileName: null,
    themeId: 'agilityhub',
    title: 't',
    titleRaw: null,
    units: 'M',
  };
}

describe('E9-W03 stats.pathLengthM: the numbered path, leg by leg (S16 §3, E9-T03)', () => {
  it('sums the legs in number order, counts an obstacle taken twice each time and skips what has no position', () => {
    const value = coursePathLengthMeters(
      course(
        [
          ['a', 0, 0],
          ['b', 3, 4],
          ['c', 3, 10],
          ['d', null, null],
        ],
        [
          // Out of order on purpose: 1 → 2 → 3 → 4 → 5.
          [3, 'c'],
          [1, 'a'],
          [2, 'b'],
          [4, 'd'], // no position: skipped
          [5, 'b'], // taken again
          [null, 'a'], // no number: not on the path
          [6, null], // a number without an obstacle
        ],
      ),
    );
    // a→b 5 m, b→c 6 m, c→b 6 m.
    expect(value).toBe(17);
  });

  it('is a positive length for every Smarter fixture, rounded to 0.1 m', () => {
    for (const fixture of listSmarterFixtures()) {
      const { courseData } = parseSmarterTxt(fixture.raw, { sourceFileName: fixture.name });
      const value = coursePathLengthMeters(courseData);
      expect(value, fixture.name).toBeGreaterThan(0);
      expect(Math.round(value * 10) / 10).toBe(value);
    }
  });
});
