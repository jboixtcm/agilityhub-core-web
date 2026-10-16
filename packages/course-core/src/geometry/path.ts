/**
 * The course's path length (S16 §3 `stats.pathLengthM`, E9-T03: the api stores the client's
 * value and computes no geometry, R-16-01): the straight legs between the anchors of the
 * obstacles in number order (1 → 2 → …). An obstacle taken twice counts each time it is taken;
 * a number without an obstacle, or an obstacle without a position, is skipped. Metres, rounded
 * to 0.1 m. Distances do not depend on the source's origin or units (the model is in metres).
 */
import type { CourseData } from '../schema/index.js';

export function coursePathLengthMeters(course: CourseData): number {
  const anchors = new Map<string, { x: number; y: number }>();
  for (const obstacle of course.obstacles) {
    if (obstacle.xMeters === null || obstacle.yMeters === null) continue;
    anchors.set(obstacle.sourceId, { x: obstacle.xMeters, y: obstacle.yMeters });
  }
  const legs = course.numbers
    .filter((number) => number.sequenceNumber !== null && number.linkedObstacleSourceId !== null)
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
    .flatMap((number) => {
      const anchor = anchors.get(number.linkedObstacleSourceId ?? '');
      return anchor === undefined ? [] : [anchor];
    });
  let total = 0;
  for (let index = 1; index < legs.length; index += 1) {
    const from = legs[index - 1]!;
    const to = legs[index]!;
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return Math.round(total * 10) / 10;
}
