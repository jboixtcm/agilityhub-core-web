import { describe, expect, it } from "vitest";

import type { components } from "./generated/schema";
import { ringSetupSummary } from "./ring-setups";

type RingSetup = components["schemas"]["RingSetup"];

const setup: RingSetup = {
  agilityhubLevel: "EASY",
  builtAt: "2026-10-16T08:00:00Z",
  builtByAccountId: "10000000-0000-4000-8000-000000000003",
  courseId: null,
  createdAt: "2026-10-16T08:00:00Z",
  dismantledAt: null,
  dismantledByAccountId: null,
  expectedUntil: null,
  expiresAt: "2026-10-23T08:00:00Z",
  id: "setup-1",
  imageFileKey: null,
  imageUrl: null,
  kind: "FUN",
  levelIds: [],
  notes: null,
  placementId: "placement-1",
  ringId: "ring-1",
  status: "ACTIVE",
  view: "STAFF",
};

describe("E9-W05 #9 · R-16-09 the ADMIN fallback's setup summary", () => {
  it("never carries the raw AgilityHub level code as a label, and opens the viewer of a placement", () => {
    const summary = ringSetupSummary(setup);
    expect(summary.levelLabel).toBeNull();
    expect(summary.hasViewer).toBe(true);
    expect(summary).toMatchObject({ id: "setup-1", kind: "FUN", thumbnailUrl: null });
  });

  it("an EMPTY setup has no viewer", () => {
    expect(ringSetupSummary({ ...setup, kind: "EMPTY" }).hasViewer).toBe(false);
  });
});
