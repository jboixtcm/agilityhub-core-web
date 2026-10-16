import {
  placedObstacleHeadingDegrees,
  placeObstacleInRing,
  type CourseData,
  type CoursePlacement,
  type ObstacleType,
} from "@agilityhub/course-core";

/**
 * An obstacle of a placed course in the ring's frame (metres, Y up): what `Placement`
 * persists as `resolvedObstacles` (A8c), what the AR app reads and what the build sheet prints.
 */
export interface ResolvedObstacle {
  readonly obstacleId: string;
  readonly type: ObstacleType;
  readonly x: number;
  readonly y: number;
  /** The ring-frame Y-up heading both planners render (R-16-01/05, one convention). */
  readonly rotationDeg: number;
  /** The course numbers the obstacle carries (more than one when it is taken twice). */
  readonly numbers: readonly number[];
}

/** course-core's placement of every positioned obstacle of `course` (R-16-05, computed here). */
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
