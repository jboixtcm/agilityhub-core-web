/**
 * Rule: "course design is larger than the ring".
 *
 * Per-course (not per-obstacle). Fires when the nominal design rectangle
 * (length × width) doesn't fit in the ring rectangle regardless of
 * rotation. Severity `critical` — the judge has to pick a different ring
 * (or a different course).
 *
 * Note: rotation can sometimes make a tall design fit by swapping
 * orientation. We test both "as-is" and "rotated 90°" against the ring;
 * if either fits, no warning fires.
 */
import type { CourseData } from '../../schema/course-data.js';
import type { CoursePlacement } from '../../geometry/placement.js';
import type { Ring } from '../../geometry/ring.js';
import { makeWarning, type Warning } from '../types.js';

export function checkCourseLargerThanRing(
  course: CourseData,
  _placement: CoursePlacement,
  ring: Ring,
): Warning[] {
  const cl = course.designLengthMeters;
  const cw = course.designWidthMeters;
  const rl = ring.lengthMeters;
  const rw = ring.widthMeters;

  const fitsAsIs = cl <= rl && cw <= rw;
  const fitsRotated = cw <= rl && cl <= rw;
  if (fitsAsIs || fitsRotated) return [];

  const overflowL = Math.max(0, cl - rl, cw - rl);
  const overflowW = Math.max(0, cw - rw, cl - rw);
  const overflow = Math.max(overflowL, overflowW);

  return [
    makeWarning({
      id: 'course-larger-than-ring',
      ruleId: 'course-larger-than-ring',
      severity: 'critical',
      message: `Course (${cl.toFixed(1)}×${cw.toFixed(1)} m) does not fit in ring "${ring.label}" (${rl.toFixed(1)}×${rw.toFixed(1)} m) in either orientation. Smallest overflow: ${overflow.toFixed(2)} m.`,
      distanceMeters: overflow,
      thresholdMeters: 0,
    }),
  ];
}
