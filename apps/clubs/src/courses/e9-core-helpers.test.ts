import { describe, expect, it } from "vitest";

import { archivedPlacementBody, futureClassStarts } from "../../../../e2e/core/e9-core-helpers";

describe("E9-W06 · E9-W05 review regressions in the real-core scenario", () => {
  it("keeps today's one-off class starts at or after `first`, including after 20:00", () => {
    expect(futureClassStarts(22, new Set())).toEqual([]);
    expect(futureClassStarts(18, new Set([19]))).toEqual([18, 20]);
    expect(futureClassStarts(13, new Set())).toEqual([17, 19]);
  });

  it("copies every optional placement value through the full-replace archive PUT", () => {
    expect(
      archivedPlacementBody({
        activityId: "activity-1",
        courseId: "course-1",
        courseVersion: 4,
        displayName: "Dijous",
        grades: ["G2"],
        mode: "EVENT",
        name: "Final",
        placementMode: "CENTERED",
        resolvedObstacles: [{ obstacleId: "1" }],
        ringId: "ring-1",
        scheduledAt: "2026-10-18T18:00:00Z",
        sizes: ["M"],
        transform: { flipX: false },
        version: 7,
        warningThresholdM: 1.5,
        warnings: [],
      }),
    ).toEqual({
      activityId: "activity-1",
      courseId: "course-1",
      courseVersion: 4,
      displayName: "Dijous",
      force: true,
      grades: ["G2"],
      mode: "EVENT",
      name: "Final",
      placementMode: "CENTERED",
      resolvedObstacles: [{ obstacleId: "1" }],
      ringId: "ring-1",
      scheduledAt: "2026-10-18T18:00:00Z",
      sizes: ["M"],
      status: "ARCHIVED",
      transform: { flipX: false },
      version: 7,
      warningThresholdM: 1.5,
      warnings: [],
    });
  });
});
