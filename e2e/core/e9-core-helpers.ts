/** The latest two valid one-hour starts, leaving the largest booking headroom on the current day. */
export function futureClassStarts(first: number, busy: ReadonlySet<number>): number[] {
  return [...new Set([first, first + 1, first + 2, 17, 19])]
    .filter((start) => start >= first && start <= 21 && !busy.has(start))
    .sort((left, right) => left - right)
    .slice(-2);
}

/** The full-replace placement body used while the real-core scenario cleans up its own placement. */
export function archivedPlacementBody(placement: Record<string, unknown>): Record<string, unknown> {
  return {
    activityId: placement.activityId ?? null,
    courseId: placement.courseId,
    courseVersion: placement.courseVersion,
    displayName: placement.displayName ?? null,
    force: true,
    grades: placement.grades,
    mode: placement.mode,
    name: placement.name ?? null,
    placementMode: placement.placementMode,
    resolvedObstacles: placement.resolvedObstacles,
    ringId: placement.ringId,
    scheduledAt: placement.scheduledAt ?? null,
    sizes: placement.sizes,
    status: "ARCHIVED",
    transform: placement.transform,
    version: placement.version,
    warningThresholdM: placement.warningThresholdM,
    warnings: placement.warnings,
  };
}
