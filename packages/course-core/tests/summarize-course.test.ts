import { describe, expect, it } from 'vitest';
import { parseSmarterTxt } from '../src/parser/parse-smarter-txt.js';
import { summarizeCourse } from '../src/parser/summarize-course.js';
import { listSmarterFixtures } from './fixtures.js';

const fixtures = listSmarterFixtures();

describe('summarizeCourse — quality-gate snapshot per fixture', () => {
  // One test per fixture, but assertions are on `summary` (stable shape) so
  // additions to CourseData don't break this suite.
  for (const f of fixtures) {
    it(`builds a complete summary for ${f.name}`, () => {
      const { courseData } = parseSmarterTxt(f.raw, { sourceFileName: f.name });
      const summary = summarizeCourse(courseData);

      expect(summary.title).toBe(courseData.title);
      expect(summary.units).toBe(courseData.units);
      expect(summary.origin).toBe(courseData.origin);
      expect(summary.dimensionsMeters.length).toBeCloseTo(courseData.designLengthMeters, 2);
      expect(summary.dimensionsMeters.width).toBeCloseTo(courseData.designWidthMeters, 2);
      expect(summary.canvas.width).toBe(courseData.canvasWidth);
      expect(summary.canvas.height).toBe(courseData.canvasHeight);
      expect(summary.counts.obstacles).toBe(courseData.obstacles.length);
      expect(summary.counts.numbers).toBe(courseData.numbers.length);
      expect(summary.counts.noGoZones).toBe(courseData.noGoZones.length);
      expect(summary.counts.ignoredLogos).toBe(courseData.ignoredLogos.length);

      // Counts-by-type sums to total obstacle count.
      const sum = Object.values(summary.counts.obstaclesByType).reduce((a, b) => a + b, 0);
      expect(sum).toBe(summary.counts.obstacles);
    });
  }
});
