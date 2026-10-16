/**
 * R-16-10 «Full de muntatge», generated in the browser (S16 §13 dubte 2, A8b): the ring with its
 * doors, no-go zones and markers and the placed course numbered on it; one row per obstacle with
 * its position (x, y), its heading and its distance to the two nearest markers (what a builder
 * measures with a tape); the equipment the course needs; the doors; the notes. Every text comes
 * from the caller in the reader's language (R-16-17), lengths in metres through the caller's
 * `Intl` formatter.
 */
import type { ObstacleType, ResolvedObstacle } from "@agilityhub/course-core";

import type { PlannerRing, PlannerRingDoor } from "../storage/types.js";

import { SHEET_PAPER, type SheetPaper, wrapText } from "./layout.js";
import { fitText, PdfDocument, type PdfPage } from "./pdf-document.js";

export interface BuildSheetLabels {
  /** The PDF's title (document properties) and the page footer, e.g. «Full de muntatge». */
  readonly documentTitle: string;
  /** The course's name. */
  readonly heading: string;
  /** One line under the heading: ring, size, placement… */
  readonly subheading: string;
  readonly plan: string;
  readonly obstaclesTitle: string;
  readonly columns: {
    readonly number: string;
    readonly obstacle: string;
    readonly x: string;
    readonly y: string;
    readonly heading: string;
    readonly markers: string;
  };
  readonly obstacle: (type: ObstacleType) => string;
  /** A length in metres, number only, in the reader's locale («4,25»). */
  readonly metres: (value: number) => string;
  /** An angle in degrees, number only («90»). */
  readonly degrees: (value: number) => string;
  /** One marker distance, e.g. «A: 4,25 m». */
  readonly markerDistance: (label: string, metres: string) => string;
  /** What joins the two marker distances of a row, e.g. « · ». */
  readonly listSeparator: string;
  /** The number cell of an obstacle the course does not number, e.g. «—». */
  readonly unnumbered: string;
  readonly inventoryTitle: string;
  readonly inventoryRow: (type: string, count: number) => string;
  readonly doorsTitle: string;
  readonly door: (door: PlannerRingDoor) => string;
  readonly notesTitle: string;
  readonly none: string;
  readonly page: (page: number, total: number) => string;
  /** The PDF's producer property (the product, never a person). */
  readonly producer: string;
}

export interface BuildSheetInput {
  readonly ring: PlannerRing;
  readonly obstacles: readonly ResolvedObstacle[];
  readonly notes?: string | null;
  readonly paper?: SheetPaper;
  readonly labels: BuildSheetLabels;
}

const MARGIN = 12;
const ROW = 5.5;
const FOOTER = 10;

interface Cursor {
  page: PdfPage;
  y: number;
}

/** The two nearest active markers of `ring` to (x, y), nearest first. */
export function nearestMarkers(
  ring: PlannerRing,
  x: number,
  y: number,
): { readonly label: string; readonly distance: number }[] {
  return ring.markers
    .filter((marker) => marker.is_active)
    .map((marker) => ({
      distance: Math.hypot(marker.x_m - x, marker.y_m - y),
      label: marker.label,
    }))
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label))
    .slice(0, 2);
}

/** Obstacles in course order: by their first number, unnumbered ones last (by id). */
function inCourseOrder(obstacles: readonly ResolvedObstacle[]): ResolvedObstacle[] {
  return [...obstacles].sort((a, b) => {
    const left = a.numbers.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...a.numbers);
    const right = b.numbers.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...b.numbers);
    return left - right || a.obstacleId.localeCompare(b.obstacleId);
  });
}

function drawPlan(
  page: PdfPage,
  input: BuildSheetInput,
  box: { x: number; y: number; width: number; height: number },
) {
  const { ring } = input;
  const pad = 1;
  const scale = Math.min(
    box.width / (ring.length_m + 2 * pad),
    box.height / (ring.width_m + 2 * pad),
  );
  const drawnW = (ring.length_m + 2 * pad) * scale;
  const drawnH = (ring.width_m + 2 * pad) * scale;
  const left = box.x + (box.width - drawnW) / 2 + pad * scale;
  const bottom = box.y + (box.height + drawnH) / 2 - pad * scale;
  const at = (x: number, y: number) => ({ x: left + x * scale, y: bottom - y * scale });

  // A 5 m grid helps the builder read distances off the plan.
  for (let x = 5; x < ring.length_m; x += 5) {
    page.line(at(x, 0).x, at(x, 0).y, at(x, ring.width_m).x, at(x, ring.width_m).y, {
      lineWidthMm: 0.1,
      stroke: 0.85,
    });
  }
  for (let y = 5; y < ring.width_m; y += 5) {
    page.line(at(0, y).x, at(0, y).y, at(ring.length_m, y).x, at(ring.length_m, y).y, {
      lineWidthMm: 0.1,
      stroke: 0.85,
    });
  }
  const origin = at(0, ring.width_m);
  page.rect(origin.x, origin.y, ring.length_m * scale, ring.width_m * scale, {
    lineWidthMm: 0.4,
    stroke: 0,
  });
  for (const zone of ring.no_go_zones) {
    page.polygon(
      zone.polygon_points_m.map((point) => at(point.x, point.y)),
      { dashMm: [1, 0.8], fill: 0.88, lineWidthMm: 0.2, stroke: 0.35 },
    );
  }
  for (const door of ring.doors.filter((candidate) => candidate.is_active !== false)) {
    page.polygon(
      door.polygon_points_m.map((point) => at(point.x, point.y)),
      { fill: 0.25, lineWidthMm: 0.6, stroke: 0.25 },
    );
    const centre = door.polygon_points_m.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    const count = Math.max(1, door.polygon_points_m.length);
    const label = at(centre.x / count, centre.y / count);
    page.text(label.x, label.y - 1.5, door.label, { align: "center", font: "bold", sizePt: 6 });
  }
  for (const marker of ring.markers.filter((candidate) => candidate.is_active)) {
    const point = at(marker.x_m, marker.y_m);
    page.rect(point.x - 1.2, point.y - 1.2, 2.4, 2.4, { fill: 0 });
    page.text(point.x + 1.8, point.y - 1.6, marker.label, { font: "bold", sizePt: 7 });
  }
  for (const obstacle of input.obstacles) {
    const point = at(obstacle.x, obstacle.y);
    const radians = (obstacle.rotationDeg * Math.PI) / 180;
    page.line(point.x, point.y, point.x + Math.cos(radians) * 3, point.y - Math.sin(radians) * 3, {
      lineWidthMm: 0.35,
      stroke: 0,
    });
    page.circle(point.x, point.y, 1.3, { fill: 1, lineWidthMm: 0.3, stroke: 0 });
    if (obstacle.numbers.length > 0) {
      page.text(point.x, point.y - 2.2, obstacle.numbers.join("/"), {
        align: "center",
        font: "bold",
        sizePt: 7,
      });
    }
  }
}

export function renderBuildSheetPdf(input: BuildSheetInput): Uint8Array {
  const { labels } = input;
  const size = SHEET_PAPER[input.paper ?? "a4"];
  const content = size.widthMm - 2 * MARGIN;
  const document = new PdfDocument({ producer: labels.producer, title: labels.documentTitle });
  const bottomLimit = size.heightMm - MARGIN - FOOTER;

  const first = document.addPage(size);
  first.text(MARGIN, MARGIN + 6, fitText(labels.heading, content, 16, "bold"), {
    font: "bold",
    sizePt: 16,
  });
  first.text(MARGIN, MARGIN + 12, fitText(labels.subheading, content, 9, "regular"), {
    grey: 0.25,
    sizePt: 9,
  });
  first.text(MARGIN, MARGIN + 21, labels.plan, { font: "bold", sizePt: 10 });
  const planBox = { height: 112, width: content, x: MARGIN, y: MARGIN + 24 };
  drawPlan(first, input, planBox);

  const cursor: Cursor = { page: first, y: planBox.y + planBox.height + 8 };
  const newPage = () => {
    cursor.page = document.addPage(size);
    cursor.y = MARGIN + 6;
  };
  const ensure = (height: number) => {
    if (cursor.y + height > bottomLimit) newPage();
  };

  // Obstacle table.
  const columns = [
    { key: "number", width: 12 },
    { key: "obstacle", width: 40 },
    { key: "x", width: 18 },
    { key: "y", width: 18 },
    { key: "heading", width: 22 },
    { key: "markers", width: content - 110 },
  ] as const;
  const header = () => {
    cursor.page.rect(MARGIN, cursor.y - 4, content, ROW, { fill: 0.9 });
    let x = MARGIN + 1;
    for (const column of columns) {
      cursor.page.text(
        x,
        cursor.y,
        fitText(labels.columns[column.key], column.width - 2, 8, "bold"),
        {
          font: "bold",
          sizePt: 8,
        },
      );
      x += column.width;
    }
    cursor.y += ROW;
  };
  ensure(ROW * 3 + 8);
  cursor.page.text(MARGIN, cursor.y, labels.obstaclesTitle, { font: "bold", sizePt: 10 });
  cursor.y += 6;
  header();
  for (const obstacle of inCourseOrder(input.obstacles)) {
    if (cursor.y + ROW > bottomLimit) {
      newPage();
      header();
    }
    const markers = nearestMarkers(input.ring, obstacle.x, obstacle.y)
      .map((marker) => labels.markerDistance(marker.label, labels.metres(marker.distance)))
      .join(labels.listSeparator);
    const cells: Record<(typeof columns)[number]["key"], string> = {
      heading: labels.degrees(obstacle.rotationDeg),
      markers: markers === "" ? labels.none : markers,
      number: obstacle.numbers.length === 0 ? labels.unnumbered : obstacle.numbers.join("/"),
      obstacle: labels.obstacle(obstacle.type),
      x: labels.metres(obstacle.x),
      y: labels.metres(obstacle.y),
    };
    let x = MARGIN + 1;
    for (const column of columns) {
      cursor.page.text(x, cursor.y, fitText(cells[column.key], column.width - 2, 8, "regular"), {
        font: column.key === "number" ? "bold" : "regular",
        sizePt: 8,
      });
      x += column.width;
    }
    cursor.page.line(MARGIN, cursor.y + 1.5, MARGIN + content, cursor.y + 1.5, {
      lineWidthMm: 0.1,
      stroke: 0.8,
    });
    cursor.y += ROW;
  }

  // A titled block of lines, continued on a new page when it runs out of room.
  const section = (title: string, lines: readonly string[]) => {
    cursor.y += 4;
    ensure(12);
    cursor.page.text(MARGIN, cursor.y, title, { font: "bold", sizePt: 10 });
    cursor.y += 5.5;
    for (const line of lines.length === 0 ? [labels.none] : lines) {
      for (const wrapped of wrapText(line, content, 9)) {
        ensure(5);
        cursor.page.text(MARGIN, cursor.y, wrapped, { sizePt: 9 });
        cursor.y += 4.6;
      }
    }
  };

  const counts = new Map<ObstacleType, number>();
  for (const obstacle of input.obstacles) {
    counts.set(obstacle.type, (counts.get(obstacle.type) ?? 0) + 1);
  }
  section(
    labels.inventoryTitle,
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, count]) => labels.inventoryRow(labels.obstacle(type), count)),
  );
  section(
    labels.doorsTitle,
    input.ring.doors.filter((door) => door.is_active !== false).map((door) => labels.door(door)),
  );
  const notes = [input.notes ?? "", input.ring.notes ?? ""].filter((note) => note.trim() !== "");
  section(labels.notesTitle, notes);

  return withFooters(document, size, labels);
}

/** Numbers the pages (n / total) at their foot once they all exist, and writes the file. */
export function withFooters(
  document: PdfDocument,
  size: { readonly widthMm: number; readonly heightMm: number },
  labels: {
    readonly documentTitle: string;
    readonly page: (page: number, total: number) => string;
  },
): Uint8Array {
  const { pages } = document;
  pages.forEach((page, index) => {
    const y = size.heightMm - MARGIN + 2;
    page.line(MARGIN, y - 5, size.widthMm - MARGIN, y - 5, { lineWidthMm: 0.1, stroke: 0.7 });
    page.text(MARGIN, y, labels.documentTitle, { grey: 0.35, sizePt: 7 });
    page.text(size.widthMm - MARGIN, y, labels.page(index + 1, pages.length), {
      align: "right",
      grey: 0.35,
      sizePt: 7,
    });
  });
  return document.toBytes();
}
