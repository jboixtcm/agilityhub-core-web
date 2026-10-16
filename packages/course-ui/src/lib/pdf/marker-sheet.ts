/**
 * The ring's marker sheet (S16 D16 «Full de marcadors», A8b: generated here from the stored
 * geometry and markers, organizer note of 15-10 on E9-W03). One page per active marker: its
 * AprilTag 36h11 fiducial at the physical size the geometry stores (the 10 × 10-module
 * footprint, quiet zone included, as the planner's `renderMarkerSvg` and the AR app use), its
 * label, where it goes on the ring, its size and its identifiers. Texts come from the caller in
 * the reader's language.
 */
import {
  APRILTAG_36H11_MARKER_WIDTH,
  APRILTAG_36H11_TOTAL_WIDTH,
  aprilTag36h11Bits,
} from "@agilityhub/course-core";

import type { PlannerRingMarker } from "../storage/types.js";

import { withFooters } from "./build-sheet.js";
import { SHEET_PAPER, type SheetPaper, wrapText } from "./layout.js";
import { fitText, PdfDocument } from "./pdf-document.js";

export interface MarkerSheetLabels {
  /** The PDF's title and footer, e.g. «Full de marcadors · Central». */
  readonly documentTitle: string;
  /** The page heading for one marker, e.g. «Marcador A». */
  readonly marker: (label: string) => string;
  /** Where it goes, e.g. «Posició a la pista: x 0,00 m · y 0,00 m». */
  readonly position: (marker: PlannerRingMarker) => string;
  /** Its printed size, e.g. «Mida: 190 mm (amb el marge blanc)». */
  readonly size: (millimetres: number) => string;
  /** Its identifiers, e.g. «Identificador: … · AprilTag 36h11 núm. 12». */
  readonly identifiers: (markerUid: string, tagId: number) => string;
  /** How to mount it (one paragraph). */
  readonly instructions: string;
  readonly page: (page: number, total: number) => string;
  readonly producer: string;
}

export interface MarkerSheetInput {
  readonly markers: readonly PlannerRingMarker[];
  /** The AprilTag id of each marker: its stored `april_tag_id`, or the planner's derivation. */
  readonly tagIds: ReadonlyMap<string, number>;
  readonly paper?: SheetPaper;
  readonly labels: MarkerSheetLabels;
}

const MARGIN = 12;
/** The fiducial may use the page's width down to this side margin (190 mm on A4, as the planner). */
const TAG_MARGIN = 10;

export function renderMarkerSheetPdf(input: MarkerSheetInput): Uint8Array {
  const { labels } = input;
  const size = SHEET_PAPER[input.paper ?? "a4"];
  const content = size.widthMm - 2 * MARGIN;
  const document = new PdfDocument({ producer: labels.producer, title: labels.documentTitle });

  for (const marker of input.markers.filter((candidate) => candidate.is_active)) {
    const tagId = input.tagIds.get(marker.id);
    if (tagId === undefined) continue;
    const page = document.addPage(size);
    page.text(MARGIN, MARGIN + 6, fitText(labels.documentTitle, content, 9, "regular"), {
      grey: 0.35,
      sizePt: 9,
    });

    // The fiducial: the 10 × 10 footprint at the stored physical size, never wider than the page
    // (then the size line says the printed size, so nobody calibrates with the wrong one).
    const footprint = Math.min(marker.physical_width_m * 1000, size.widthMm - 2 * TAG_MARGIN);
    const module = footprint / APRILTAG_36H11_TOTAL_WIDTH;
    const left = (size.widthMm - footprint) / 2;
    const top = MARGIN + 12;
    page.rect(left, top, footprint, footprint, { dashMm: [2, 2], lineWidthMm: 0.15, stroke: 0.7 });
    const grid = aprilTag36h11Bits(tagId);
    for (let y = 0; y < APRILTAG_36H11_MARKER_WIDTH; y += 1) {
      for (let x = 0; x < APRILTAG_36H11_MARKER_WIDTH; x += 1) {
        const border =
          x === 0 ||
          y === 0 ||
          x === APRILTAG_36H11_MARKER_WIDTH - 1 ||
          y === APRILTAG_36H11_MARKER_WIDTH - 1;
        if (!border && grid[y]?.[x] === true) continue;
        page.rect(left + (x + 1) * module, top + (y + 1) * module, module, module, { fill: 0 });
      }
    }

    let y = top + footprint + 16;
    page.text(size.widthMm / 2, y, labels.marker(marker.label), {
      align: "center",
      font: "bold",
      sizePt: 28,
    });
    y += 10;
    for (const line of [
      labels.position(marker),
      labels.size(Math.round(footprint)),
      labels.identifiers(marker.marker_uid, tagId),
    ]) {
      page.text(size.widthMm / 2, y, fitText(line, content, 10, "regular"), {
        align: "center",
        sizePt: 10,
      });
      y += 5.5;
    }
    y += 3;
    for (const line of wrapText(labels.instructions, content, 9)) {
      page.text(MARGIN, y, line, { grey: 0.2, sizePt: 9 });
      y += 4.6;
    }
  }

  return withFooters(document, size, labels);
}
