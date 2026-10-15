import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseSmarterTxt } from "@agilityhub/course-core";
import { describe, expect, it } from "vitest";

import {
  INITIAL_STATE,
  plannerReducer,
  summarizeInventoryWarnings,
  type PlannerRing,
} from "../src/index";

const course = parseSmarterTxt(
  readFileSync(
    resolve(process.cwd(), "../course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt"),
    "utf8",
  ),
).courseData;

const ring: PlannerRing = {
  border_clearance_m: 0.5,
  created_at: "2026-10-13T10:00:00Z",
  default_units: "m",
  doors: [],
  geometry_version: 1,
  id: "ring-1",
  is_active: true,
  length_m: 40,
  markers: [],
  name: "Main ring",
  no_go_zones: [],
  notes: null,
  obstacle_inventory: [],
  surface: "GRASS",
  updated_at: "2026-10-13T10:00:00Z",
  venue_id: "venue-1",
  width_m: 20,
};

describe("T-16-04 recovered planner behaviour", () => {
  it("R-16-05 centres a loaded course and changes to preserve-metres after a nudge", () => {
    const loaded = plannerReducer(INITIAL_STATE, {
      course,
      courseDbId: "course-1",
      filename: "course.txt",
      type: "SET_COURSE",
    });
    const placed = plannerReducer(loaded, { ring, type: "SET_RING" });
    const nudged = plannerReducer(placed, { dxMeters: 0.5, dyMeters: -0.5, type: "NUDGE" });

    expect(placed.placement).toMatchObject({
      offsetXMeters: 20,
      offsetYMeters: 10,
      placementMode: "centered",
    });
    expect(nudged.placement).toMatchObject({
      offsetXMeters: 20.5,
      offsetYMeters: 9.5,
      placementMode: "preserveMeters",
    });
  });

  it("R-16-12 keeps an unconfigured inventory advisory separate from blockers", () => {
    const summary = summarizeInventoryWarnings([
      {
        courseNoGoZoneId: null,
        distanceMeters: null,
        doorId: null,
        id: "obstacle-inventory:not-configured",
        message: "not configured",
        obstacleSourceId: null,
        ringNoGoZoneId: null,
        ruleId: "obstacle-inventory",
        severity: "info",
        thresholdMeters: null,
      },
    ]);

    expect(summary).toEqual({ blockers: [], inventoryNotConfigured: true, shortages: [] });
  });
});
