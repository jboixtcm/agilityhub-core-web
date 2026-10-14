import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseSmarterTxt } from "@agilityhub/course-core";
import { describe, expect, it } from "vitest";

import {
  INITIAL_STATE,
  normalizeLegacyMarkerReadingOrder,
  plannerReducer,
  summarizeInventoryWarnings,
  type PlannerRing,
  type PlannerRingMarker,
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

function marker(label: string, x: number, y: number): PlannerRingMarker {
  return {
    april_tag_id: null,
    id: `marker-${label}`,
    is_active: true,
    is_fixed: true,
    label,
    marker_uid: `marker-${label.toLowerCase()}`,
    notes: null,
    physical_height_m: 0.16,
    physical_width_m: 0.16,
    ring_id: "ring-1",
    role: "reference",
    rotation_y_deg: 0,
    x_m: x,
    y_m: y,
    z_m: 0,
  };
}

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

  it("R-16-04 normalizes only the exact legacy A-F marker arrangement", () => {
    const legacy = [
      marker("A", 0, 0),
      marker("B", 0, 20),
      marker("C", 40, 0),
      marker("D", 40, 20),
      marker("E", 20, 0),
      marker("F", 20, 20),
    ];

    expect(
      Object.fromEntries(
        normalizeLegacyMarkerReadingOrder(legacy).map((item) => [item.label, [item.x_m, item.y_m]]),
      ),
    ).toEqual({
      A: [0, 20],
      B: [20, 20],
      C: [40, 20],
      D: [0, 0],
      E: [20, 0],
      F: [40, 0],
    });
  });
});
