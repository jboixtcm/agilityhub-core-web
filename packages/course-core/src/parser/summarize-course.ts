/**
 * Compact, human-readable digest of a `CourseData`. Used by:
 *   - the `importer:summary` CLI (`pnpm importer:summary <file>`)
 *   - vitest assertions
 *   - the Phase 1 quality gate
 *
 * Keep this stable — downstream consumers may snapshot it.
 */
import type { CourseData } from '../schema/course-data.js';

export interface CourseSummary {
  readonly id: string;
  readonly title: string;
  readonly units: string;
  readonly dimensionsMeters: { readonly length: number; readonly width: number };
  readonly canvas: { readonly width: number; readonly height: number };
  readonly origin: string;
  readonly counts: {
    readonly obstacles: number;
    readonly obstaclesByType: Record<string, number>;
    readonly numbers: number;
    readonly noGoZones: number;
    readonly ignoredLogos: number;
  };
}

export function summarizeCourse(course: CourseData): CourseSummary {
  const obstaclesByType: Record<string, number> = {};
  for (const o of course.obstacles) {
    obstaclesByType[o.obstacleType] = (obstaclesByType[o.obstacleType] ?? 0) + 1;
  }
  return {
    id: course.id,
    title: course.title,
    units: course.units,
    dimensionsMeters: {
      length: round(course.designLengthMeters, 3),
      width: round(course.designWidthMeters, 3),
    },
    canvas: { width: course.canvasWidth, height: course.canvasHeight },
    origin: course.origin,
    counts: {
      obstacles: course.obstacles.length,
      obstaclesByType,
      numbers: course.numbers.length,
      noGoZones: course.noGoZones.length,
      ignoredLogos: course.ignoredLogos.length,
    },
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
