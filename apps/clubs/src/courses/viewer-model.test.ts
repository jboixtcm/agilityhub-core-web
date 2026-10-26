import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { components } from "@agilityhub/api-client";
import { parseSmarterTxt } from "@agilityhub/course-core";
import { describe, expect, it } from "vitest";

import { memberPlacementScene } from "./viewer-model";

const source = readFileSync(
  resolve(process.cwd(), "../../packages/course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt"),
  "utf8",
);

function tunnelScene() {
  const course = parseSmarterTxt(source).courseData;
  const tunnel = course.obstacles.find((obstacle) => obstacle.obstacleType.startsWith("Tunnel"));
  if (tunnel === undefined) throw new Error("FIXTURE_WITHOUT_A_TUNNEL");
  const placement: components["schemas"]["MemberSetupPlacement"] = {
    ringLengthM: 40,
    ringWidthM: 20,
    transform: { flipX: false, flipY: false, offsetXM: 20, offsetYM: 10, rotationDeg: 0 },
    resolvedObstacles: [
      {
        obstacleId: tunnel.sourceId,
        type: tunnel.obstacleType,
        x: 7,
        y: 5,
        rotationDeg: 0,
        numbers: [],
        controlPointsMeters: [
          { x: 5, y: 4 },
          { x: 7, y: 6 },
          { x: 9, y: 4 },
        ],
      },
    ],
  };
  return { course, placement, tunnel };
}

describe("T-16-16 INC-86 the member reads the tunnel that was placed", () => {
  it("keeps the saved curve after the source tunnel is edited or removed", () => {
    const { course, placement, tunnel } = tunnelScene();
    const expected = placement.resolvedObstacles[0]?.controlPointsMeters;
    tunnel.controlPointsMeters = [
      { x: 12, y: 12 },
      { x: 14, y: 18 },
      { x: 17, y: 14 },
    ];
    expect(
      memberPlacementScene(course, placement)?.course.obstacles[0]?.controlPointsMeters,
    ).toEqual(expected);
    course.obstacles = [];
    expect(
      memberPlacementScene(course, placement)?.course.obstacles[0]?.controlPointsMeters,
    ).toEqual(expected);
  });

  it("preserves an explicitly empty saved curve instead of copying the live tunnel", () => {
    const { course, placement } = tunnelScene();
    const row = placement.resolvedObstacles[0];
    if (row === undefined) throw new Error("MISSING_PLACED_TUNNEL");
    row.controlPointsMeters = [];
    expect(
      memberPlacementScene(course, placement)?.course.obstacles[0]?.controlPointsMeters,
    ).toEqual([]);
  });

  it.each([undefined, null])("keeps the legacy fallback when saved geometry is %s", (geometry) => {
    const { course, placement } = tunnelScene();
    const row = placement.resolvedObstacles[0];
    if (row === undefined) throw new Error("MISSING_PLACED_TUNNEL");
    if (geometry === undefined) delete row.controlPointsMeters;
    else row.controlPointsMeters = geometry;
    expect(
      memberPlacementScene(course, placement)?.course.obstacles[0]?.controlPointsMeters,
    ).not.toHaveLength(0);
  });
});
