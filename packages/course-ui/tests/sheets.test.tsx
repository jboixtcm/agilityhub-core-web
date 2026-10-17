import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  aprilTag36h11Bits,
  centerCourseInRing,
  parseSmarterTxt,
  resolvePlacedObstacles,
  type CourseData,
} from "@agilityhub/course-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useReducer } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  computeWarnings,
  INITIAL_STATE,
  MarkerSheetError,
  markerSheetProblem,
  PlannerCanvas,
  plannerReducer,
  renderBuildSheetPdf,
  renderMarkerSheetPdf,
  ringToCore,
  SHEET_PAPER,
  type BuildSheetLabels,
  type MarkerSheetLabels,
  type PlannerRing,
  type PlannerRingMarker,
} from "../src/index";
import { PdfDocument, textWidthMm } from "../src/lib/pdf/pdf-document";

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
  listSeparator: " · ",
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
  unnumbered: "—",
};

/** Every `Tj` string of the file, in order (latin1 bytes, escapes undone). */
function fileTexts(bytes: Uint8Array): string[] {
  return pageStreams(bytes).flatMap(texts);
}

/** The Info dictionary's `key` string: a `<FEFF…>` hex string decoded as UTF-16BE. */
function infoString(bytes: Uint8Array, key: string): string {
  const hex = new RegExp(`/${key} <([0-9A-Fa-f]*)>`, "u").exec(latin1(bytes))?.[1];
  expect(hex).toBeDefined();
  const units: number[] = [];
  for (let index = 0; index < (hex ?? "").length; index += 4) {
    units.push(Number.parseInt((hex ?? "").slice(index, index + 4), 16));
  }
  expect(units[0]).toBe(0xfeff);
  return String.fromCharCode(...units.slice(1));
}

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("R-16-17 the PDF writer prints every Catalan, Spanish and English letter", () => {
  it("R-16-17 decomposed accents and «ŀ» (U+0140) print as WinAnsi letters, never «?»", () => {
    const document = new PdfDocument({ producer: "AgilityHub", title: "Prova" });
    const page = document.addPage(SHEET_PAPER.a4);
    // «Coŀlocació» with the Catalan ligature U+0140, «Café» with a combining acute (U+0301).
    page.text(10, 10, "Coŀlocació · Café");
    // A combining mark on a letter with no precomposed WinAnsi form keeps the letter.
    page.text(10, 20, "q́");
    // Nothing WinAnsi can show (Polish «ł», a check mark) still reads as «?».
    page.text(10, 30, "ł✓");
    expect(fileTexts(document.toBytes())).toEqual(["Col·locació · Café", "q", "??"]);
    expect(textWidthMm("Coŀlocació", 10)).toBeCloseTo(textWidthMm("Col·locació", 10), 6);
    expect(textWidthMm("Café", 10)).toBeCloseTo(textWidthMm("Café", 10), 6);
  });

  it("R-16-17 the document properties are UTF-16BE text strings, so ’, · and a character outside the BMP read back as typed", () => {
    // «𝄞» (U+1D11E) is outside the BMP: UTF-16BE writes it as the surrogate pair D834 DD1E.
    const document = new PdfDocument({
      producer: "AgilityHub · Pla d’obstacles",
      title: "Full de muntatge · Col·locació d’entrenament 𝄞",
    });
    document.addPage(SHEET_PAPER.a4);
    const bytes = document.toBytes();
    checkStructure(bytes);
    expect(infoString(bytes, "Title")).toBe("Full de muntatge · Col·locació d’entrenament 𝄞");
    expect(infoString(bytes, "Producer")).toBe("AgilityHub · Pla d’obstacles");
    // E9-W05 #7e: the pair itself, high surrogate first, at the end of the title's hex string.
    expect(latin1(bytes)).toMatch(/\/Title <FEFF[0-9A-F]*0020D834DD1E>/u);
  });
});

describe("R-16-10 the build sheet's punctuation comes from the caller", () => {
  it("R-16-10 the marker distances join with `listSeparator` and an unnumbered obstacle shows `unnumbered`", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    const [firstObstacle, ...rest] = resolvePlacedObstacles(
      course,
      centerCourseInRing(course, ringToCore(ring)),
    );
    expect(firstObstacle).toBeDefined();
    if (firstObstacle === undefined) return;
    const bytes = renderBuildSheetPdf({
      labels: { ...buildLabels, listSeparator: " ; ", unnumbered: "s/n" },
      obstacles: [{ ...firstObstacle, numbers: [] }, ...rest],
      ring,
    });
    const all = fileTexts(bytes);
    expect(all).toContain("s/n");
    expect(all).not.toContain("—");
    const distances = all.filter((text) => /^[A-D]: /u.test(text));
    expect(distances.length).toBeGreaterThan(0);
    for (const text of distances) {
      expect(text).toMatch(/^[A-D]: [\d,]+ m ; [A-D]: [\d,]+ m$/u);
    }
  });
});

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
      // 8 × 8 modules, every border module and every 0 bit black, each where the AR app reads
      // it: row 0 at the top of the printed tag, column 0 at its left (a transposed or mirrored
      // tag fails here).
      const expected = grid.map((row, y) =>
        row.map((white, x) => x === 0 || y === 0 || x === 7 || y === 7 || !white),
      );
      expect(drawnModules(stream)).toEqual(expected);
      // The dashed cut line is the 190 mm footprint: 190 mm = 538.583 pt.
      expect(stream).toContain("538.583 538.583 re");
      expect(texts(stream)).toContain("190 mm");
      expect(texts(stream)).toContain(
        `club-central-${String.fromCharCode(97 + index)} · AprilTag 36h11 núm. ${String(tagId)}`,
      );
    });
  });

  it("A8b a marker always prints at its stored size, and the size line says that size", () => {
    const small = { ...marker("A", 0, 0), physical_height_m: 0.15, physical_width_m: 0.15 };
    const bytes = renderMarkerSheetPdf({
      labels: markerLabels,
      markers: [small],
      tagIds: new Map([[small.id, 3]]),
    });
    const [stream = ""] = pageStreams(bytes);
    // 150 mm = 425.197 pt; one module is a tenth of it.
    expect(stream).toContain("425.197 425.197 re");
    expect(texts(stream)).toContain("150 mm");
    expect(drawnModules(stream).flat().length).toBe(64);
  });

  it("A8b a marker larger than the printable width is refused, never printed smaller", () => {
    const markers = [
      marker("A", 0, 0),
      { ...marker("B", 10, 0), physical_height_m: 0.25, physical_width_m: 0.25 },
      { ...marker("C", 20, 0, false), physical_height_m: 0.3, physical_width_m: 0.3 },
    ];
    // Inactive markers are never printed, so C does not count.
    expect(markerSheetProblem(markers)).toEqual({
      kind: "too-large",
      labels: ["B"],
      maxMillimetres: 190,
    });
    expect(markerSheetProblem(markers, "letter")).toEqual({
      kind: "too-large",
      labels: ["B"],
      maxMillimetres: 195.9,
    });
    expect(markerSheetProblem(markers.slice(0, 1))).toBeNull();
    const error = thrown(() =>
      renderMarkerSheetPdf({
        labels: markerLabels,
        markers,
        tagIds: new Map(markers.map((item, index) => [item.id, index])),
      }),
    );
    expect(error).toBeInstanceOf(MarkerSheetError);
    expect((error as MarkerSheetError).problem).toEqual(markerSheetProblem(markers));
  });

  it("A8b a ring without an active marker has no sheet (no empty PDF)", () => {
    const markers = [marker("A", 0, 0, false), marker("B", 10, 0, false)];
    expect(markerSheetProblem(markers)).toEqual({ kind: "no-active-marker" });
    expect(markerSheetProblem([])).toEqual({ kind: "no-active-marker" });
    const error = thrown(() =>
      renderMarkerSheetPdf({
        labels: markerLabels,
        markers,
        tagIds: new Map(markers.map((item, index) => [item.id, index])),
      }),
    );
    expect(error).toBeInstanceOf(MarkerSheetError);
    expect((error as MarkerSheetError).problem).toEqual({ kind: "no-active-marker" });
  });
});

/**
 * The AprilTag modules a marker page draws, as an 8 × 8 grid of «black» flags: each filled
 * black `re` placed by its offset from the top-left one (row 0 at the top of the page).
 */
function drawnModules(stream: string): boolean[][] {
  const rects = [...stream.matchAll(/0 g\n([\d.]+) ([\d.]+) ([\d.]+) [\d.]+ re\nf/gu)].map(
    (match) => ({ size: Number(match[3]), x: Number(match[1]), y: Number(match[2]) }),
  );
  const module = rects[0]?.size ?? 1;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.max(...rects.map((rect) => rect.y));
  const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => false));
  for (const rect of rects) {
    const column = Math.round((rect.x - left) / module);
    const row = Math.round((top - rect.y) / module);
    const cells = grid[row];
    expect(cells?.[column]).toBe(false);
    if (cells !== undefined) cells[column] = true;
  }
  return grid;
}

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
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 160, clientY: 130, pointerId: 7 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 220, clientY: 160, pointerId: 7 });
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
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 11, clientY: 11, pointerId: 1 });
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

  it("T-16-04 a second finger on the plan neither restarts nor moves the drag of the first", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    const onDrag = vi.fn<(dxMeters: number, dyMeters: number) => void>();
    render(
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
    const scale = Math.max((ring.length_m + 3) / 600, (ring.width_m + 3) / 600);
    fireEvent.pointerDown(svg, { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 160, clientY: 130, pointerId: 7 });
    // The second finger lands, moves and lifts far away while the first one stays down.
    fireEvent.pointerDown(svg, { button: 0, clientX: 400, clientY: 400, pointerId: 8 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 500, clientY: 500, pointerId: 8 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 8 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 220, clientY: 160, pointerId: 7 });
    fireEvent.pointerUp(svg, { clientX: 220, clientY: 160, pointerId: 7 });
    const total = onDrag.mock.calls.reduce((sum, [dx, dy]) => ({ x: sum.x + dx, y: sum.y + dy }), {
      x: 0,
      y: 0,
    });
    expect(onDrag).toHaveBeenCalledTimes(2);
    expect(total.x).toBeCloseTo(120 * scale, 6);
    expect(total.y).toBeCloseTo(-60 * scale, 6);
  });

  it("T-16-04 a cancelled drag ends without swallowing the next real click on an obstacle", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    const onDrag = vi.fn();
    const onSelect = vi.fn();
    render(
      <PlannerCanvas
        course={course}
        labels={{ ariaLabel: "Plànol", entry: "Entrada", exit: "Sortida" }}
        onDragPlacement={onDrag}
        onSelectObstacle={onSelect}
        placement={centerCourseInRing(course, ringToCore(ring))}
        ring={ring}
        selectedObstacleId={null}
        warnings={[]}
      />,
    );
    const svg = screen.getByRole("img", { name: "Plànol" });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 200, clientY: 150, pointerId: 3 });
    fireEvent.pointerCancel(svg, { pointerId: 3 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    // The drag is over: further moves of that pointer do nothing.
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 260, clientY: 180, pointerId: 3 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    const obstacle = svg.querySelector('g[style*="cursor: pointer"]');
    expect(obstacle).not.toBeNull();
    if (obstacle === null) return;
    // The next real tap on an obstacle, as a browser sends it: press, release, then click
    // (E9-W05 #7e: the click is not a bare synthetic one).
    fireEvent.pointerDown(obstacle, { button: 0, buttons: 1, clientX: 300, clientY: 300, pointerId: 4 });
    fireEvent.pointerUp(obstacle, { button: 0, clientX: 300, clientY: 300, pointerId: 4 });
    fireEvent.click(obstacle);
    expect(onDrag).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

/** The plan with a recorded pointer capture (jsdom has none). */
function capturingPlan(onDrag: (dxMeters: number, dyMeters: number) => void) {
  const course = fixture(JUMPING);
  const ring = ringFor(course);
  const onSelect = vi.fn();
  render(
    <PlannerCanvas
      course={course}
      labels={{ ariaLabel: "Plànol", entry: "Entrada", exit: "Sortida" }}
      onDragPlacement={onDrag}
      onSelectObstacle={onSelect}
      placement={centerCourseInRing(course, ringToCore(ring))}
      ring={ring}
      selectedObstacleId={null}
      warnings={[]}
    />,
  );
  const svg = screen.getByRole("img", { name: "Plànol" });
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
  const setPointerCapture = vi.fn<(pointerId: number) => void>();
  Object.assign(svg, { setPointerCapture });
  const obstacle = svg.querySelector('g[style*="cursor: pointer"]');
  if (obstacle === null) throw new Error("OBSTACLE_NOT_FOUND");
  return { obstacle, onSelect, setPointerCapture, svg };
}

describe("T-16-04 E9-W05 #6 the plan's drag holds the pointer capture", () => {
  it("T-16-04 E9-W05 #6 a press on the plan captures its pointer at once; a press on an obstacle only once it drags, so a tap still selects it", () => {
    const onDrag = vi.fn();
    const { obstacle, onSelect, setPointerCapture, svg } = capturingPlan(onDrag);
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, clientX: 20, clientY: 20, pointerId: 5 });
    expect(setPointerCapture).toHaveBeenCalledWith(5);
    fireEvent.pointerUp(svg, { button: 0, clientX: 20, clientY: 20, pointerId: 5 });
    setPointerCapture.mockClear();

    // A tap on an obstacle: no capture (a captured release would click the plan instead).
    fireEvent.pointerDown(obstacle, { button: 0, buttons: 1, clientX: 300, clientY: 300, pointerId: 6 });
    fireEvent.pointerUp(obstacle, { button: 0, clientX: 300, clientY: 300, pointerId: 6 });
    fireEvent.click(obstacle);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);

    // A drag that starts on an obstacle is captured as soon as it is a drag.
    fireEvent.pointerDown(obstacle, { button: 0, buttons: 1, clientX: 300, clientY: 300, pointerId: 7 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 360, clientY: 300, pointerId: 7 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(onDrag).toHaveBeenCalledTimes(1);
  });

  it("T-16-04 E9-W05 #6 a lost capture ends the drag: its pointer moves nothing more and another pointer drags at once", () => {
    const onDrag = vi.fn();
    const { svg } = capturingPlan(onDrag);
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 11 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 160, clientY: 100, pointerId: 11 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    // The release never reaches the plan; the browser takes the capture away.
    fireEvent.lostPointerCapture(svg, { pointerId: 11 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 220, clientY: 100, pointerId: 11 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    // The dead pointer does not block the next one (a new touch has a new id).
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 12 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 160, clientY: 100, pointerId: 12 });
    expect(onDrag).toHaveBeenCalledTimes(2);
  });

  it("T-16-04 E9-W05 #6 a move with no button pressed moves nothing and ends a drag whose release was missed", () => {
    const onDrag = vi.fn();
    const { svg } = capturingPlan(onDrag);
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 1 });
    // The mouse was let go off the plan; it hovers back with no button pressed.
    fireEvent.pointerMove(svg, { buttons: 0, clientX: 200, clientY: 150, pointerId: 1 });
    expect(onDrag).not.toHaveBeenCalled();
    // The stale drag is gone: even a later move with a button reported does not resume it.
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 260, clientY: 180, pointerId: 1 });
    expect(onDrag).not.toHaveBeenCalled();
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(svg, { buttons: 1, clientX: 160, clientY: 100, pointerId: 2 });
    expect(onDrag).toHaveBeenCalledTimes(1);
  });
});
