/**
 * The obstacles of a placed course in the ring's frame (metres, Y up): what `Placement` persists
 * as `resolvedObstacles` (A8c), what the AR app reads and what the build sheet prints. course-core
 * is the one place that computes placement geometry (R-16-01): the api stores this result, the web
 * client and the PDFs read it (E9-W03 round 2, review #17).
 */
import type { CourseData } from '../schema/course-data.js';
import type { ObstacleType } from '../schema/primitives.js';
import { placedObstacleHeadingDegrees } from './heading.js';
import { placeControlPointsInRing, placeObstacleInRing, type CoursePlacement } from './placement.js';

export interface ResolvedObstacle {
  readonly obstacleId: string;
  readonly type: ObstacleType;
  readonly x: number;
  readonly y: number;
  /** The ring-frame Y-up heading both planners render (R-16-01/05, one convention). */
  readonly rotationDeg: number;
  /** The course numbers the obstacle carries (more than one when it is taken twice). */
  readonly numbers: readonly number[];
  /** Frozen ring geometry; null/absent on legacy placements, empty when there is no curve. */
  readonly controlPointsMeters?: readonly { readonly x: number; readonly y: number }[] | null;
}

/** course-core's placement of every positioned obstacle of `course` (R-16-05). */
export function resolvePlacedObstacles(
  course: CourseData,
  placement: CoursePlacement,
): ResolvedObstacle[] {
  const numbers = new Map<string, number[]>();
  for (const number of course.numbers) {
    if (number.linkedObstacleSourceId === null || number.sequenceNumber === null) continue;
    const current = numbers.get(number.linkedObstacleSourceId) ?? [];
    current.push(number.sequenceNumber);
    numbers.set(number.linkedObstacleSourceId, current);
  }
  return course.obstacles.flatMap((obstacle) => {
    const point = placeObstacleInRing(obstacle, placement, course);
    return point === null
      ? []
      : [
          {
            controlPointsMeters:
              placeControlPointsInRing(obstacle.controlPointsMeters, placement, course) ?? [],
            numbers: numbers.get(obstacle.sourceId) ?? [],
            obstacleId: obstacle.sourceId,
            rotationDeg: placedObstacleHeadingDegrees(obstacle.rotationDegrees, placement),
            type: obstacle.obstacleType,
            x: point.x,
            y: point.y,
          },
        ];
  });
}
