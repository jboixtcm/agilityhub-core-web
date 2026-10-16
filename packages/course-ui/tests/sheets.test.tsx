import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  aprilTag36h11Bits,
  centerCourseInRing,
  parseSmarterTxt,
  type CourseData,
} from "@agilityhub/course-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useReducer } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  computeWarnings,
  INITIAL_STATE,
  PlannerCanvas,
  plannerReducer,
  renderBuildSheetPdf,
  renderMarkerSheetPdf,
  resolvePlacedObstacles,
  ringToCore,
  type BuildSheetLabels,
  type MarkerSheetLabels,
  type PlannerRing,
  type PlannerRingMarker,
} from "../src/index";

// ---------------------------------------------------------------------------
// Reading the PDFs back: the xref table must point at every object, and the text the pages
// show is what the `Tj` operators carry (WinAnsi, the escapes undone).
// ---------------------------------------------------------------------------

function latin1(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function checkStructure(bytes: Uint8Array): void {
  const file = latin1(bytes);
  expect(file.startsWith("%PDF-1.4\n")).toBe(true);
  expect(file.endsWith("%%EOF\n")).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/u.exec(file)?.[1]);
  expect(file.slice(startxref, startxref + 4)).toBe("xref");
  const [, countText] = /^xref\n0 (\d+)\n/u.exec(file.slice(startxref)) ?? [];
  const count = Number(countText);
  const entries = file
    .slice(startxref)
    .split("\n")
    .slice(3, 3 + count - 1);
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    expect(file.slice(offset, offset + `${String(index + 1)} 0 obj`.length)).toBe(
      `${String(index + 1)} 0 obj`,
    );
  });
  for (const match of file.matchAll(/<< \/Length (\d+) >>\nstream\n/gu)) {
    const start = match.index + match[0].length;
    expect(file.slice(start + Number(match[1]), start + Number(match[1]) + 10)).toBe("\nendstream");
  }
}

function pageStreams(bytes: Uint8Array): string[] {
  const file = latin1(bytes);
  return [...file.matchAll(/stream\n([\s\S]*?)\nendstream/gu)].map((match) => match[1] ?? "");
}

/** WinAnsi's 0x80–0x9F block back to the characters the copy uses. */
const WIN_ANSI: Readonly<Record<number, string>> = {
  0x85: "…",
  0x92: "’",
  0x95: "•",
  0x96: "–",
  0x97: "—",
};

function texts(stream: string): string[] {
  return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/gu)].map((match) =>
    Array.from(
      (match[1] ?? "").replace(/\\(.)/gu, "$1"),
      (char) => WIN_ANSI[char.charCodeAt(0)] ?? char,
    ).join(""),
  );
}

function fixture(name: string): CourseData {
  const text = readFileSync(
    resolve(process.cwd(), "../course-core/fixtures/smarter", name),
    "utf8",
  );
  return parseSmarterTxt(text, { sourceFileName: name }).courseData;
}

const JUMPING = "jp-s-sw_993483_sadesign.txt";
const AGILITY = "ag-au-tryout-i-copy_998859_sadesign.txt";

function marker(label: string, x: number, y: number, active = true): PlannerRingMarker {
  return {
    april_tag_id: null,
    id: `marker-${label}`,
    is_active: active,
    is_fixed: true,
    label,
    marker_uid: `club-central-${label.toLowerCase()}`,
    notes: null,
    physical_height_m: 0.19,
    physical_width_m: 0.19,
    ring_id: "ring-1",
    role: "corner",
    rotation_y_deg: 0,
    x_m: x,
    y_m: y,
    z_m: 0,
  };
}

function ringFor(course: CourseData): PlannerRing {
  const length = Math.ceil(course.designLengthMeters) + 4;
  const width = Math.ceil(course.designWidthMeters) + 4;
  return {
    border_clearance_m: 1,
    created_at: "2026-10-15T09:00:00Z",
    default_units: "m",
    doors: [
      {
        clearance_m: 1.5,
        end_m: 5,
        flow: "in",
        id: "door-entrance",
        is_active: true,
        label: "Entrada",
        notes: null,
        polygon_points_m: [
          { x: 3, y: width },
          { x: 5, y: width },
          { x: 5, y: width - 0.1 },
          { x: 3, y: width - 0.1 },
        ],
        side: "north",
        start_m: 3,
      },
    ],
    geometry_version: 3,
    id: "ring-1",
    is_active: true,
    length_m: length,
    markers: [
      marker("A", 0, 0),
      marker("B", length, 0),
      marker("C", length, width),
      marker("D", 0, width),
      marker("E", length / 2, width, false),
    ],
    name: "Pista central",
    no_go_zones: [
      {
        id: "pond",
        label: "Bassa",
        polygon_points_m: [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
          { x: 3, y: 3 },
          { x: 1, y: 3 },
        ],
        warning_margin_m: 0.5,
      },
    ],
    notes: "Gespa nova a la banda nord.",
    obstacle_inventory: [],
    surface: "GRASS",
    updated_at: "2026-10-15T09:00:00Z",
    venue_id: "club-1",
    width_m: width,
  };
}

const metres = new Intl.NumberFormat("ca", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const buildLabels: BuildSheetLabels = {
  columns: {
    heading: "Orientació",
    markers: "Marcadors més propers",
    number: "Núm.",
    obstacle: "Obstacle",
    x: "x (m)",
    y: "y (m)",
  },
  degrees: (value) => `${String(Math.round(value))}°`,
  documentTitle: "Full de muntatge",
  door: (door) => `${door.label}: ${String(door.start_m)}–${String(door.end_m)} m`,
  doorsTitle: "Portes",
  heading: "Jumping Sant Joan",
  inventoryRow: (type, count) => `${type} × ${String(count)}`,
  inventoryTitle: "Material necessari",
  markerDistance: (label, value) => `${label}: ${value} m`,
  metres: (value) => metres.format(value),
  none: "Cap",
  notesTitle: "Notes",
  obstacle: (type) => `tipus ${type}`,
  obstaclesTitle: "Obstacles",
  page: (page, total) => `Pàgina ${String(page)} de ${String(total)}`,
  plan: "Plànol",
  producer: "AgilityHub",
  subheading: "Pista central · Col·locació d'entrenament",
};

describe("T-16-04 / R-16-10 the build sheet of the fixture courses", () => {
  for (const name of [JUMPING, AGILITY]) {
    it(`T-16-04 ${name}: a valid PDF whose pages carry the plan, every obstacle, the equipment, the doors and the notes`, () => {
      const course = fixture(name);
      const ring = ringFor(course);
      const obstacles = resolvePlacedObstacles(
        course,
        centerCourseInRing(course, ringToCore(ring)),
      );
      const bytes = renderBuildSheetPdf({ labels: buildLabels, notes: null, obstacles, ring });
      checkStructure(bytes);
      const pages = pageStreams(bytes).map(texts);
      expect(pages.length).toBeGreaterThanOrEqual(1);
      const all = pages.flat();
      // One table row per placed obstacle, in course order, with its position and the two
      // nearest active markers (E is inactive and never measured from).
      for (const obstacle of obstacles) {
        expect(all).toContain(metres.format(obstacle.x));
        expect(all).toContain(metres.format(obstacle.y));
      }
      const first = obstacles
        .filter((obstacle) => obstacle.numbers.includes(1))
        .map((obstacle) => {
          const near = ring.markers
            .filter((candidate) => candidate.is_active)
            .map((candidate) => ({
              d: Math.hypot(candidate.x_m - obstacle.x, candidate.y_m - obstacle.y),
              label: candidate.label,
            }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 2);
          return near.map((item) => `${item.label}: ${metres.format(item.d)} m`).join(" · ");
        })[0];
      expect(first).toBeDefined();
      expect(all).toContain(first);
      expect(all.some((text) => text.startsWith("E: "))).toBe(false);
      expect(all).toEqual(expect.arrayContaining(["Material necessari", "Portes", "Notes"]));
      expect(all).toContain("Entrada: 3–5 m");
      expect(all).toContain("Gespa nova a la banda nord.");
      expect(all.at(-1)).toBe(`Pàgina ${String(pages.length)} de ${String(pages.length)}`);
      // The deterministic snapshot of what the sheet says, page by page.
      expect(pages).toMatchSnapshot();
    });
  }

  it("R-16-17 the copy travels in WinAnsi: «Col·locació» and «Pàgina» are single bytes, never «?»", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    const bytes = renderBuildSheetPdf({
      labels: buildLabels,
      obstacles: resolvePlacedObstacles(course, centerCourseInRing(course, ringToCore(ring))),
      ring,
    });
    const file = latin1(bytes);
    expect(file).toContain("(Pista central · Col·locació d'entrenament) Tj");
    expect(file).toContain("/Encoding /WinAnsiEncoding");
  });
});

const markerLabels: MarkerSheetLabels = {
  documentTitle: "Full de marcadors · Pista central",
  identifiers: (uid, tag) => `${uid} · AprilTag 36h11 núm. ${String(tag)}`,
  instructions:
    "Fixeu el marcador pla, a l'altura del terra, amb la fletxa cap a dins de la pista.",
  marker: (label) => `Marcador ${label}`,
  page: (page, total) => `${String(page)}/${String(total)}`,
  position: (item) => `x ${metres.format(item.x_m)} m · y ${metres.format(item.y_m)} m`,
  producer: "AgilityHub",
  size: (mm) => `${String(mm)} mm`,
};

describe("A8b the ring's marker sheet from the stored markers", () => {
  it("one page per active marker, the AprilTag at its physical size with the modules of its id", () => {
    const ring = ringFor(fixture(JUMPING));
    const tagIds = new Map(ring.markers.map((item, index) => [item.id, index * 7]));
    const bytes = renderMarkerSheetPdf({ labels: markerLabels, markers: ring.markers, tagIds });
    checkStructure(bytes);
    const streams = pageStreams(bytes);
    // A–D are active; E is not printed.
    expect(streams).toHaveLength(4);
    expect(
      streams.map((stream) => texts(stream).find((text) => text.startsWith("Marcador"))),
    ).toEqual(["Marcador A", "Marcador B", "Marcador C", "Marcador D"]);
    streams.forEach((stream, index) => {
      const tagId = index * 7;
      const grid = aprilTag36h11Bits(tagId);
      const whiteData = grid.flat().filter(Boolean).length;
      // 8 × 8 modules, every border module and every 0 bit black: one filled `re` each.
      const black = 64 - whiteData;
      const filled = [...stream.matchAll(/0 g\n[\d. ]+ re\nf/gu)].length;
      expect(filled).toBe(black);
      // The dashed cut line is the 190 mm footprint: 190 mm = 538.583 pt.
      expect(stream).toContain("538.583 538.583 re");
      expect(texts(stream)).toContain(
        `club-central-${String.fromCharCode(97 + index)} · AprilTag 36h11 núm. ${String(tagId)}`,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// T-16-04 «PlacementEditor emet transform i avisos en arrossegar»: dragging the plan moves the
// course in the ring's frame and the live warnings follow.
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (typeof window.PointerEvent !== "function") {
    class PointerEventPolyfill extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
});

afterEach(() => {
  cleanup();
});

function DragHarness({ course, ring }: { course: CourseData; ring: PlannerRing }) {
  const [state, dispatch] = useReducer(plannerReducer, INITIAL_STATE, (initial) =>
    plannerReducer(
      plannerReducer(initial, {
        course,
        courseDbId: "course-1",
        filename: "x.txt",
        type: "SET_COURSE",
      }),
      { ring, type: "SET_RING" },
    ),
  );
  const warnings = useMemo(() => computeWarnings(state), [state]);
  return (
    <>
      <output data-testid="offset">
        {`${state.placement.offsetXMeters.toFixed(2)},${state.placement.offsetYMeters.toFixed(2)}`}
      </output>
      <output data-testid="warnings">{warnings.map((warning) => warning.id).join("|")}</output>
      <PlannerCanvas
        course={course}
        labels={{ ariaLabel: "Plànol", entry: "Entrada", exit: "Sortida" }}
        onDragPlacement={(dxMeters, dyMeters) => {
          dispatch({ dxMeters, dyMeters, type: "NUDGE" });
        }}
        onSelectObstacle={() => undefined}
        placement={state.placement}
        ring={ring}
        selectedObstacleId={null}
        warnings={warnings}
      />
    </>
  );
}

describe("T-16-04 dragging the plan in the placement editor", () => {
  it("T-16-04 a drag of 120 px right and 60 px down moves the course east and south by the drawn scale, and the warnings follow", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    render(<DragHarness course={course} ring={ring} />);
    const before = screen.getByTestId("offset").textContent;
    const warningsBefore = screen.getByTestId("warnings").textContent;
    const svg = screen.getByRole("img", { name: "Plànol" });
    // 600 px wide for a view of the ring + 1.5 m each side: one pixel is viewW / 600 metres.
    const viewW = ring.length_m + 3;
    const viewH = ring.width_m + 3;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 600,
      toJSON: () => ({}),
      top: 0,
      width: 600,
      x: 0,
      y: 0,
    });
    const scale = Math.max(viewW / 600, viewH / 600);
    fireEvent.pointerDown(svg, { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 130, pointerId: 7 });
    fireEvent.pointerMove(svg, { clientX: 220, clientY: 160, pointerId: 7 });
    fireEvent.pointerUp(svg, { clientX: 220, clientY: 160, pointerId: 7 });
    const offset = (text: string) => {
      const [x = Number.NaN, y = Number.NaN] = text.split(",").map(Number);
      return { x, y };
    };
    const start = offset(before);
    const end = offset(screen.getByTestId("offset").textContent);
    expect(end.x - start.x).toBeCloseTo(120 * scale, 1);
    expect(end.y - start.y).toBeCloseTo(-60 * scale, 1);
    // The course now runs past the east border: the live warnings are not the same any more.
    expect(screen.getByTestId("warnings").textContent).not.toBe(warningsBefore);
  });

  it("T-16-04 a press without travel is a click (no move), and a read-only viewer never moves", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    const onDrag = vi.fn();
    const { rerender } = render(
      <PlannerCanvas
        course={course}
        labels={{ ariaLabel: "Plànol", entry: "Entrada", exit: "Sortida" }}
        onDragPlacement={onDrag}
        onSelectObstacle={() => undefined}
        placement={centerCourseInRing(course, ringToCore(ring))}
        ring={ring}
        selectedObstacleId={null}
        warnings={[]}
      />,
    );
    const svg = screen.getByRole("img", { name: "Plànol" });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
    fireEvent.pointerDown(svg, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 11, clientY: 11, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 11, clientY: 11, pointerId: 1 });
    expect(onDrag).not.toHaveBeenCalled();
    rerender(
      <PlannerCanvas
        course={course}
        labels={{ ariaLabel: "Plànol", entry: "Entrada", exit: "Sortida" }}
        onSelectObstacle={() => undefined}
        placement={centerCourseInRing(course, ringToCore(ring))}
        ring={ring}
        selectedObstacleId={null}
        warnings={[]}
      />,
    );
    expect(screen.getByRole("img", { name: "Plànol" }).style.cursor).toBe("");
  });
});
