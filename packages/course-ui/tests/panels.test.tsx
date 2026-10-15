import { makeWarning, type Warning } from "@agilityhub/course-core";
import { createCourseTexts, createI18n, type CourseTexts } from "@agilityhub/i18n";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  PlacementControls,
  RingMarkerDiagram,
  WarningsPanel,
  type PlannerRing,
  type PlannerRingMarker,
} from "../src/index";

const texts: Partial<Record<"ca" | "en", CourseTexts>> = {};

beforeAll(async () => {
  for (const locale of ["ca", "en"] as const) {
    const i18n = await createI18n({
      branding: { defaultLocale: locale, locales: ["ca", "es", "en"] },
      browserLanguages: [locale],
      initialNamespaces: ["common", "enums", "errors"],
      storage: undefined,
    });
    const t = i18n.getFixedT(locale);
    texts[locale] = createCourseTexts((key, options) => t(key, options ?? {}));
  }
});

afterEach(cleanup);

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

const ring: PlannerRing = {
  border_clearance_m: 1,
  created_at: "2026-10-15T09:00:00Z",
  default_units: "m",
  doors: [],
  geometry_version: 3,
  id: "ring-1",
  is_active: true,
  length_m: 40,
  // The recovered Supabase heuristic recognised exactly this «legacy perimeter» A–F layout and
  // drew A at (0, 20) instead of its stored (0, 0).
  markers: [
    marker("A", 0, 0),
    marker("B", 0, 20),
    marker("C", 40, 0),
    marker("D", 40, 20),
    marker("E", 20, 0),
    marker("F", 20, 20),
  ],
  name: "Pista central",
  no_go_zones: [],
  notes: null,
  obstacle_inventory: [],
  surface: "GRASS",
  updated_at: "2026-10-15T09:00:00Z",
  venue_id: "club-1",
  width_m: 22.5,
};

describe("#6 R-16-04 RingMarkerDiagram draws the markers at their Core coordinates", () => {
  it("every marker sits where the api stores it (no A–F reading-order relocation)", () => {
    const { container } = render(
      <RingMarkerDiagram ariaLabel="Marcadors de la pista" locale="ca" ring={ring} />,
    );
    const drawn = Object.fromEntries(
      [...container.querySelectorAll("circle")].map((circle) => {
        const label = circle.parentElement?.querySelector("text")?.textContent ?? "";
        return [label, [Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy"))]];
      }),
    );
    expect(drawn).toEqual({
      A: [0, 0],
      B: [0, 20],
      C: [40, 0],
      D: [40, 20],
      E: [20, 0],
      F: [20, 20],
    });
  });

  it("R-16-17 the ring sides read in the club's locale", () => {
    const { container, rerender } = render(
      <RingMarkerDiagram ariaLabel="Marcadors de la pista" locale="ca" ring={ring} />,
    );
    const texts = () => [...container.querySelectorAll("text")].map((text) => text.textContent);
    expect(texts()).toEqual(expect.arrayContaining(["40 m", "22,50 m"]));
    rerender(<RingMarkerDiagram ariaLabel="Ring markers" locale="en" ring={ring} />);
    expect(texts()).toEqual(expect.arrayContaining(["40 m", "22.50 m"]));
  });
});

const inventoryShortage: Warning = makeWarning({
  // course-core's obstacle-inventory rule puts the missing count in distanceMeters.
  distanceMeters: 2,
  id: "obstacle-inventory:Tunnel6m",
  message: "Missing 2 × Tunnel6m",
  ruleId: "obstacle-inventory",
  severity: "warning",
});
const doorClearance: Warning = makeWarning({
  distanceMeters: 0.8,
  doorId: "door-entrance",
  id: "door-clearance:3:door-entrance",
  message: "Obstacle 3 is 0.80 m from door Entrada",
  obstacleSourceId: "jump-3",
  ruleId: "door-clearance",
  severity: "warning",
  thresholdMeters: 1.5,
});

function panel(locale: "ca" | "en", units: "M" | "FT" = "M") {
  const course = texts[locale];
  if (course === undefined) throw new Error("TEXTS_NOT_LOADED");
  return render(
    <WarningsPanel
      labels={{
        empty: "—",
        rule: (ruleId) => course.warningRule(ruleId),
        severity: { critical: "crític", info: "info", warning: "avís" },
        title: (count) => `Avisos (${String(count)})`,
        warning: (warning) =>
          warning.ruleId === "obstacle-inventory" ? "Falten 2 túnels" : "Salt 3 prop de l'entrada",
      }}
      locale={locale}
      onSelectObstacle={vi.fn()}
      selectedObstacleId={null}
      units={units}
      warnings={[inventoryShortage, doorClearance]}
    />,
  );
}

describe("#12/#13 WarningsPanel: translated rules, lengths only where they are lengths", () => {
  it("R-16-12 an inventory shortage never reads its missing count as metres or feet", () => {
    panel("ca");
    const shortage = screen.getByText("Falten 2 túnels").closest("button");
    if (shortage === null) throw new Error("ROW_NOT_FOUND");
    expect(within(shortage).getByText("Inventari d'obstacles")).toBeDefined();
    expect(shortage.textContent).not.toMatch(/\d\s?(m|ft)\b/u);
    cleanup();
    panel("ca", "FT");
    const inFeet = screen.getByText("Falten 2 túnels").closest("button");
    expect(inFeet?.textContent).not.toMatch(/ft\b/u);
  });

  it("R-16-17 a door clearance reads its translated rule and its distance in the club's locale", () => {
    panel("ca");
    const row = screen.getByText("Salt 3 prop de l'entrada").closest("button");
    if (row === null) throw new Error("ROW_NOT_FOUND");
    expect(within(row).getByText("Distància a la porta")).toBeDefined();
    expect(within(row).getByText("0,80 m")).toBeDefined();
    expect(row.textContent).not.toContain("door-clearance ");
    cleanup();
    panel("en");
    const english = screen.getByText("Salt 3 prop de l'entrada").closest("button");
    expect(english === null ? null : within(english).getByText("Door clearance")).toBeDefined();
    expect(english === null ? null : within(english).getByText("0.80 m")).toBeDefined();
  });
});

describe("#13 PlacementControls formats the nudge steps in the club's locale", () => {
  it.each([
    ["ca", ["0,10 m", "0,50 m", "1,00 m"]],
    ["en", ["0.10 m", "0.50 m", "1.00 m"]],
  ] as const)("%s", (locale, steps) => {
    render(
      <PlacementControls
        labels={{
          center: "Centra",
          flipHorizontal: "Mirall horitzontal",
          flipVertical: "Mirall vertical",
          nudgeDown: "Avall",
          nudgeLeft: "Esquerra",
          nudgeRight: "Dreta",
          nudgeUp: "Amunt",
          reset: "Restableix",
          rotateFineLeft: "−1°",
          rotateFineRight: "+1°",
          rotateLeft: "−90°",
          rotateRight: "+90°",
          stepSize: "Pas",
          title: "Col·locació",
        }}
        locale={locale}
        onCenter={vi.fn()}
        onFlipX={vi.fn()}
        onFlipY={vi.fn()}
        onNudge={vi.fn()}
        onReset={vi.fn()}
        onRotate={vi.fn()}
        units="M"
      />,
    );
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(steps);
  });
});
