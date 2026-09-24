/**
 * Printable marker SVG renderer (D-027 -> branded page design system).
 *
 * Produces one portrait page per fiducial marker, on either A4
 * (210 × 297 mm) or US Letter (215.9 × 279.4 mm — 8½ × 11 in). The page
 * is split into two vertical zones:
 *
 *   - Top **marker zone** (pure white, 210 mm tall on every paper size).
 *     Carries the 190 x 190 mm machine-readable AprilTag 36h11 fiducial,
 *     centred with a 10 mm physical quiet border around the tag footprint.
 *     No branding, text, logo, or overlay enters this zone; venues' AR
 *     cameras need a clean black/white pattern with adequate quiet space.
 *   - Bottom **chrome footer** (deep charcoal, 210 x 87 mm on A4). Carries
 *     the AgilityHub wordmark, venue + ring identity, the big A/B/C/D/E/F
 *     letter, the role description, placement instruction, a mini ring
 *     diagram with this marker highlighted, a real-size marker check line,
 *     and the "DO NOT RESIZE" warning band.
 *
 * Paper sizes (2026-08-17): the fiducial is the one thing that must be
 * physically identical everywhere — a detector solving pose from a 190 mm
 * square is wrong the moment the print scales. So the marker zone stays a
 * fixed 210 mm on every paper size and only the *chrome footer* absorbs
 * the difference in page height: the footer is authored once in the A4
 * footer design space (210 x 87 mm) and uniformly scaled into whatever
 * band is left. US Letter is 17.6 mm shorter than A4, so its footer
 * renders at ~80% — same layout, smaller type, tag untouched. Never
 * "fit" the marker zone to the page; shrink the chrome instead.
 *
 * The SVG units are millimetres (`viewBox="0 0 210 297"` +
 * `width="210mm" height="297mm"` on A4). Browsers print
 * SVG-in-millimetres at 1:1 when the CSS page size matches, so venues
 * print directly onto their paper without any scaling step. The DO NOT
 * RESIZE band and marker check line are belt-and-braces reminders in case
 * someone reopens the SVG in a tool that asks about scale.
 *
 * Brand tokens mirror `packages/ui/src/agilityhub-tokens.css`:
 *   --agh-bg-input        #1d1d20  page background (dark-first)
 *   --agh-bg-surface      #333339  chrome accents
 *   --agh-accent-orange   #ea6d41  primary accent (big letter)
 *   --agh-accent-yellow   #f9ce59  secondary accent (role title)
 *   --agh-text-primary    #f1f1f1  off-white text
 *   --agh-text-muted      #aaaaaa  labels and captions
 */
import { renderAprilTag36h11Svg } from './apriltag-36h11.js';
import { markerRoleInfo, canonicalMarkerPosition } from './marker-roles.js';

export interface MarkerSvgTemplate {
  readonly venueName: string;
  readonly ringName: string;
  /** Single letter A/B/C/D/E/F (or custom label). */
  readonly label: string;
  readonly markerUid: string;
  /** Marker role description. Overrides the canonical role derived from `label`. */
  readonly role?: string;
  /** Optional override for the canonical placement instruction. */
  readonly placementInstruction?: string;
  /** Ring length (m). When set together with `ringWidthMeters`, drives the mini diagram. */
  readonly ringLengthMeters?: number;
  /** Ring width (m). */
  readonly ringWidthMeters?: number;
  /** This marker's position in ring coords (highlighted on the diagram). */
  readonly markerXMeters?: number;
  readonly markerYMeters?: number;
  /** Other markers' positions for the diagram (faint dots). */
  readonly diagramMarkers?: ReadonlyArray<{
    readonly label: string;
    readonly xMeters: number;
    readonly yMeters: number;
  }>;
  /** Fiducial side length in metres. Default 0.19 m (190 mm). */
  readonly physicalSizeMeters?: number;
  /**
   * Paper size to lay the page out for. Default `'a4'`. Venues in the US
   * print on `'letter'` (8½ × 11 in). Ignored when `pageWidthMm` /
   * `pageHeightMm` are given explicitly.
   */
  readonly paperSize?: PaperSize;
  /**
   * Page width in millimetres. Overrides `paperSize`. Default 210
   * (A4 portrait short side).
   */
  readonly pageWidthMm?: number;
  /**
   * Page height in millimetres. Overrides `paperSize`. Default 297
   * (A4 portrait long side).
   */
  readonly pageHeightMm?: number;
  /**
   * AprilTag 36h11 tag id (0..586). Compute via
   * `aprilTagIdFromMarkerUid(markerUid)` on the caller side so this
   * renderer stays synchronous. When absent, the Phase 6 hash-coded
   * preview pattern is used (kept for tests + iteration).
   */
  readonly aprilTagId?: number;
}

export interface RenderMarkerSvgOptions {
  /** Suggested filename for the downloaded file. Computed from UID by default. */
  readonly suggestedFilename?: string;
}

export interface RenderedMarkerSvg {
  readonly svg: string;
  readonly suggestedFilename: string;
}

// ---------------------------------------------------------------------------
// Layout + brand constants
// ---------------------------------------------------------------------------

/**
 * Default physical marker side length in metres for the machine-readable
 * AprilTag square (190 mm). This is the dimension the planner stores in
 * `ring_markers.physical_width_m` / `.physical_height_m`, the SVG renderer
 * draws, and the Unity detector uses for pose estimation.
 *
 * Do not confuse this with the A4 paper size. The printed page is
 * 210 × 297 mm, but the detected fiducial square is 190 × 190 mm.
 */
export const DEFAULT_MARKER_PHYSICAL_SIZE_M = 0.19;
/**
 * Default stored marker width in metres for new markers — 190 mm,
 * matching the AprilTag square, not the A4 sheet.
 */
export const DEFAULT_MARKER_PHYSICAL_WIDTH_M = DEFAULT_MARKER_PHYSICAL_SIZE_M;
/**
 * Default stored marker height in metres for new markers — 190 mm,
 * matching the AprilTag square, not the A4 sheet.
 */
export const DEFAULT_MARKER_PHYSICAL_HEIGHT_M = DEFAULT_MARKER_PHYSICAL_SIZE_M;
// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------

/**
 * Supported print paper sizes. `'a4'` is the ISO default (Europe and most
 * of the world); `'letter'` is US Letter, 8½ × 11 in, what North American
 * venues actually have in the tray.
 */
export type PaperSize = 'a4' | 'letter';

export interface PaperPreset {
  readonly id: PaperSize;
  /** Human label for pickers and print-page copy. */
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  /**
   * Value for the CSS `@page { size: … }` descriptor. Consumers must use
   * this rather than hardcoding a keyword: it is what makes the browser's
   * print engine lay the SVG out 1:1 instead of shrink-to-fit.
   */
  readonly cssPageSize: string;
}

/** US Letter is 8.5 × 11 in exactly → 215.9 × 279.4 mm. */
export const PAPER_PRESETS: Readonly<Record<PaperSize, PaperPreset>> = {
  a4: { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297, cssPageSize: 'A4 portrait' },
  letter: {
    id: 'letter',
    label: 'US Letter',
    widthMm: 215.9,
    heightMm: 279.4,
    cssPageSize: 'Letter portrait',
  },
};

/** Every supported paper size, in picker order. */
export const PAPER_SIZES: ReadonlyArray<PaperSize> = ['a4', 'letter'];

/** Paper size assumed when nothing else is specified. */
export const DEFAULT_PAPER_SIZE: PaperSize = 'a4';

export function isPaperSize(value: unknown): value is PaperSize {
  return value === 'a4' || value === 'letter';
}

/**
 * Tolerant paper-size parse for values arriving from a query string, a
 * database column, or a CLI flag. Anything unrecognised (including null /
 * undefined) falls back to A4 rather than throwing — a marker pack that
 * prints on the wrong paper is recoverable, one that fails to render is
 * not.
 */
export function normalisePaperSize(value: unknown): PaperSize {
  if (typeof value !== 'string') return DEFAULT_PAPER_SIZE;
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'a4') return 'a4';
  if (key === 'letter' || key === 'usletter' || key === 'us' || key === '85x11' || key === '85by11') {
    return 'letter';
  }
  return DEFAULT_PAPER_SIZE;
}

/** Preset for a paper size, tolerant of unknown input (falls back to A4). */
export function paperPreset(value: unknown): PaperPreset {
  return PAPER_PRESETS[normalisePaperSize(value)];
}

/** Default page width in millimetres (A4 portrait short side). */
export const DEFAULT_PAGE_WIDTH_MM = PAPER_PRESETS.a4.widthMm;
/** Default page height in millimetres (A4 portrait long side). */
export const DEFAULT_PAGE_HEIGHT_MM = PAPER_PRESETS.a4.heightMm;

/**
 * Height of the clean white marker zone at the top of the page. Fixed
 * across paper sizes: a 190 mm tag plus its 10 mm quiet border needs
 * 210 mm whatever is in the paper tray.
 */
const MARKER_ZONE_H_MM = 210;
/** Physical margin around the fiducial footprint. */
const MARKER_MARGIN_MM = 10;

/**
 * The chrome footer is authored in this design space (the A4 footer:
 * 297 − 210 = 87 mm tall) and uniformly scaled into the band the chosen
 * paper leaves below the marker zone. On A4 the scale is exactly 1.
 */
const FOOTER_DESIGN_W_MM = 210;
const FOOTER_DESIGN_H_MM = 87;

const BRAND_PAGE_BG = '#1d1d20';
const BRAND_SURFACE = '#333339';
const BRAND_ORANGE = '#ea6d41';
const BRAND_YELLOW = '#f9ce59';
const BRAND_TEXT = '#f1f1f1';
const BRAND_TEXT_MUTED = '#aaaaaa';
const BRAND_BORDER = '#707070';

const FONT_STACK = 'Open Sans, Helvetica, Arial, sans-serif';

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Render a printable marker SVG (one A4-portrait page).
 *
 * Returns a self-contained SVG string + a suggested filename. The caller
 * can either drop the SVG into the DOM for a print page, or trigger a
 * single-file download for advanced use.
 */
export function renderMarkerSvg(
  template: MarkerSvgTemplate,
  options: RenderMarkerSvgOptions = {},
): RenderedMarkerSvg {
  const physicalSizeM = template.physicalSizeMeters ?? DEFAULT_MARKER_PHYSICAL_SIZE_M;
  const preset = paperPreset(template.paperSize);
  const pageWmm = template.pageWidthMm ?? preset.widthMm;
  const pageHmm = template.pageHeightMm ?? preset.heightMm;

  const fiducialSizeMm = physicalSizeM * 1000;
  validateMarkerGeometry({
    physicalSizeM,
    fiducialSizeMm,
    pageWmm,
    pageHmm,
  });

  // Position the marker in the clean white top zone. The zone is 210 mm
  // tall on every paper size so a 190 mm tag always has a 10 mm physical
  // border on all four sides — the page height difference is taken out of
  // the chrome footer below, never out of the tag's quiet space.
  const markerZoneH = Math.min(
    pageHmm,
    Math.max(MARKER_ZONE_H_MM, fiducialSizeMm + MARKER_MARGIN_MM * 2),
  );
  const footerY = markerZoneH;
  const footerH = pageHmm - markerZoneH;
  const fiducialX = (pageWmm - fiducialSizeMm) / 2;
  const fiducialY = (markerZoneH - fiducialSizeMm) / 2;

  // Uniform scale that fits the 87 mm-tall footer design into the band this
  // paper leaves below the marker zone. Exactly 1 on A4; ~0.798 on US
  // Letter. Capped by the width ratio so a page much taller than A4 can't
  // blow the chrome up past the point where its columns collide.
  const footerScale = Math.min(footerH / FOOTER_DESIGN_H_MM, pageWmm / FOOTER_DESIGN_W_MM);
  // Then widen the design space so the scaled chrome still spans the full
  // page: the footer's own x anchors are all relative to this width, so the
  // side padding stays proportional instead of leaving dark gutters.
  const footerDesignW =
    footerScale > 0 ? Math.max(FOOTER_DESIGN_W_MM, pageWmm / footerScale) : FOOTER_DESIGN_W_MM;
  const footerOffsetX = (pageWmm - footerDesignW * footerScale) / 2;

  // A4 keeps the historical filename; other papers get a suffix so a
  // venue that prints both doesn't silently overwrite one with the other.
  const filename =
    options.suggestedFilename ??
    `${template.markerUid}-marker${preset.id === DEFAULT_PAPER_SIZE ? '' : `-${preset.id}`}.svg`;

  const venueName = escapeXml(template.venueName);
  const ringName = escapeXml(template.ringName);
  const label = escapeXml(template.label);
  const uid = escapeXml(template.markerUid);

  // Canonical role + placement default from the label letter, with
  // template overrides for custom roles (e.g. legacy markers).
  const roleInfo = markerRoleInfo(template.label);
  const roleTitle = template.role
    ? escapeXml(template.role)
    : escapeXml(roleInfo?.title ?? 'Marker');
  const roleTitleLines = (
    template.role
      ? splitToLines(template.role, 12)
      : (roleInfo?.titleLines ?? ['MARKER', '']).slice()
  ).map(escapeXml);
  const placementLines = (
    template.placementInstruction
      ? splitToLines(template.placementInstruction, 36)
      : (roleInfo?.placementLines ?? ['Mount the marker so it is clearly visible.'])
  ).map(escapeXml);

  // Fiducial — real AprilTag when an id is supplied, placeholder otherwise.
  const useRealAprilTag = typeof template.aprilTagId === 'number';
  const fiducial = useRealAprilTag
    ? renderRealAprilTagFiducial({
        x: fiducialX,
        y: fiducialY,
        size: fiducialSizeMm,
        tagId: template.aprilTagId!,
      })
    : renderPlaceholderFiducial({
        x: fiducialX,
        y: fiducialY,
        size: fiducialSizeMm,
        seed: hash32(template.markerUid),
      });

  // Footer children are laid out in the footer design space (origin at the
  // top-left of the footer band), then placed by the wrapping transform.
  const diagram = renderRingDiagram({
    x: footerDesignW - 72,
    y: 35,
    width: 62,
    height: 22,
    ringLengthMeters: template.ringLengthMeters,
    ringWidthMeters: template.ringWidthMeters,
    highlightLabel: template.label,
    highlightX: template.markerXMeters,
    highlightY: template.markerYMeters,
    diagramMarkers: template.diagramMarkers,
  });

  const chromeContent =
    footerH > 0
      ? `<g transform="translate(${round(footerOffsetX)}, ${round(footerY)}) scale(${round(footerScale)})">
    ${renderChromeFooter({
      pageWmm: footerDesignW,
      footerH: FOOTER_DESIGN_H_MM,
      physicalSizeMm: fiducialSizeMm,
      venueName,
      ringName,
      label,
      roleTitleLines,
      roleTitle,
      placementLines,
      uid,
      useRealAprilTag,
      aprilTagId: template.aprilTagId,
      diagramSvg: diagram,
    })}
  </g>`
      : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWmm} ${pageHmm}" width="${pageWmm}mm" height="${pageHmm}mm">
  <!-- AgilityHub printable marker page · ${describePaper(pageWmm, pageHmm)} portrait · do not resize -->
  <!-- Clean white marker zone (top) — required quiet area for the fiducial -->
  <rect x="0" y="0" width="${pageWmm}" height="${markerZoneH}" fill="#ffffff"/>

  <!-- Chrome footer (bottom) -->
  <rect x="0" y="${footerY}" width="${pageWmm}" height="${footerH}" fill="${BRAND_PAGE_BG}"/>
  <rect x="0" y="${footerY}" width="${pageWmm}" height="3" fill="${BRAND_ORANGE}"/>

  ${chromeContent}

  <!-- Machine-readable fiducial (clean black on white, no overlays) -->
  ${fiducial}
</svg>`;

  return { svg, suggestedFilename: filename };
}

/** Trim float noise from transform values (A4 stays exactly `0` / `1`). */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Label for the page-size comment: the matching preset's name when the
 * dimensions are one of ours, else the raw millimetres (callers may pass
 * `pageWidthMm` / `pageHeightMm` directly).
 */
function describePaper(pageWmm: number, pageHmm: number): string {
  for (const size of PAPER_SIZES) {
    const p = PAPER_PRESETS[size];
    if (Math.abs(p.widthMm - pageWmm) < 0.05 && Math.abs(p.heightMm - pageHmm) < 0.05) {
      return p.label;
    }
  }
  return `${formatMm(pageWmm)} × ${formatMm(pageHmm)} mm`;
}

function validateMarkerGeometry(args: {
  readonly physicalSizeM: number;
  readonly fiducialSizeMm: number;
  readonly pageWmm: number;
  readonly pageHmm: number;
}): void {
  if (!Number.isFinite(args.physicalSizeM) || args.physicalSizeM <= 0) {
    throw new Error('Marker physical size must be a positive finite number of metres.');
  }
  if (!Number.isFinite(args.pageWmm) || !Number.isFinite(args.pageHmm) || args.pageWmm <= 0 || args.pageHmm <= 0) {
    throw new Error('Marker page dimensions must be positive finite millimetre values.');
  }
  const requiredWidthMm = args.fiducialSizeMm + MARKER_MARGIN_MM * 2;
  if (requiredWidthMm > args.pageWmm + 0.001) {
    throw new Error(
      `Marker fiducial ${formatMm(args.fiducialSizeMm)} mm plus ${MARKER_MARGIN_MM} mm quiet margins ` +
        `does not fit the ${formatMm(args.pageWmm)} mm page width. ` +
        'Store the AprilTag square size, not the full A4 or Letter sheet size.',
    );
  }
  if (requiredWidthMm > args.pageHmm + 0.001) {
    throw new Error(
      `Marker fiducial ${formatMm(args.fiducialSizeMm)} mm plus ${MARKER_MARGIN_MM} mm quiet margins ` +
        `does not fit the ${formatMm(args.pageHmm)} mm page height. ` +
        'Store the AprilTag square size, not the full A4 or Letter sheet size.',
    );
  }
}

function formatMm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ---------------------------------------------------------------------------
// Chrome footer (bottom)
// ---------------------------------------------------------------------------

interface ChromeFooterArgs {
  /** Width of the footer design space, not the physical page. */
  readonly pageWmm: number;
  /** Height of the footer design space, not the physical page. */
  readonly footerH: number;
  readonly physicalSizeMm: number;
  readonly venueName: string;
  readonly ringName: string;
  readonly label: string;
  readonly roleTitleLines: readonly string[];
  readonly roleTitle: string;
  readonly placementLines: readonly string[];
  readonly uid: string;
  readonly useRealAprilTag: boolean;
  readonly aprilTagId?: number | undefined;
  readonly diagramSvg: string;
}

function renderChromeFooter(args: ChromeFooterArgs): string {
  const padX = 10;
  // Footer design space: the caller's transform puts (0, 0) at the top-left
  // of the footer band, so every offset below reads as "mm from the top of
  // the footer" and is paper-size independent.
  const y0 = 0;
  const titleLine0 = args.roleTitleLines[0] ?? '';
  const titleLine1 = args.roleTitleLines[1] ?? '';
  const fingerprint = args.useRealAprilTag
    ? `AprilTag 36h11 · tag ${args.aprilTagId}`
    : 'PREVIEW PATTERN — placeholder fiducial (D-027)';

  const placement = args.placementLines
    .slice(0, 2)
    .map(
      (line, i) =>
        `<text x="72" y="${y0 + 56 + i * 4.4}" font-size="3.2" fill="${BRAND_TEXT}">${line}</text>`,
    )
    .join('\n    ');

  const scale = renderScaleCheckLine({
    x: (args.pageWmm - args.physicalSizeMm) / 2,
    y: y0 + 10,
    width: args.physicalSizeMm,
    label: `${Math.round(args.physicalSizeMm)} mm marker check`,
  });
  const orientation = renderFooterOrientation({
    x: padX + 17,
    y: y0 + 31,
  });

  return `<g font-family="${FONT_STACK}">
    ${scale}

    <!-- AgilityHub wordmark -->
    <text x="${padX}" y="${y0 + 28}" font-size="6.5" font-weight="700" fill="${BRAND_YELLOW}">AgilityHub</text>
    <text x="${padX}" y="${y0 + 33}" font-size="2.7" fill="${BRAND_TEXT_MUTED}">Course Builder · venue marker pack</text>

    ${orientation}

    <!-- Big label letter + role -->
    <text x="${padX}" y="${y0 + 73}" font-size="36" font-weight="700" fill="${BRAND_ORANGE}">${args.label}</text>
    <text x="42" y="${y0 + 58}" font-size="4.2" font-weight="700" fill="${BRAND_YELLOW}">${titleLine0}</text>
    <text x="42" y="${y0 + 64}" font-size="4.2" font-weight="700" fill="${BRAND_YELLOW}">${titleLine1}</text>
    <text x="42" y="${y0 + 69}" font-size="2.8" fill="${BRAND_TEXT_MUTED}">Marker ${args.label}</text>

    <!-- Venue / Ring identity -->
    <text x="72" y="${y0 + 27}" font-size="2.6" fill="${BRAND_TEXT_MUTED}">VENUE</text>
    <text x="72" y="${y0 + 33}" font-size="4.1" font-weight="600" fill="${BRAND_TEXT}">${args.venueName}</text>
    <text x="72" y="${y0 + 40}" font-size="2.6" fill="${BRAND_TEXT_MUTED}">RING</text>
    <text x="72" y="${y0 + 46}" font-size="4.1" font-weight="600" fill="${BRAND_TEXT}">${args.ringName}</text>

    <!-- Placement instruction -->
    <text x="72" y="${y0 + 51}" font-size="2.6" fill="${BRAND_TEXT_MUTED}">PLACEMENT</text>
    ${placement}

    <!-- Ring diagram (this marker highlighted) -->
    <text x="${args.pageWmm - 72}" y="${y0 + 31}" font-size="2.6" fill="${BRAND_TEXT_MUTED}">RING DIAGRAM</text>
    ${args.diagramSvg}

    <!-- DO NOT RESIZE warning band (high-visibility yellow) -->
    <rect x="72" y="${y0 + 66}" width="${args.pageWmm - 82}" height="9" fill="${BRAND_YELLOW}"/>
    <text x="${72 + (args.pageWmm - 82) / 2}" y="${y0 + 72}" text-anchor="middle" font-size="3.6" font-weight="700" fill="${BRAND_SURFACE}">DO NOT RESIZE</text>

    <!-- Fingerprint / marker UID (tiny) -->
    <text x="${padX}" y="${y0 + args.footerH - 2.5}" font-size="2.3" fill="${BRAND_TEXT_MUTED}">${args.uid}</text>
    <text x="${args.pageWmm - padX}" y="${y0 + args.footerH - 2.5}" text-anchor="end" font-size="2.3" fill="${BRAND_TEXT_MUTED}">${fingerprint}</text>
  </g>`;
}

// ---------------------------------------------------------------------------
// Real AprilTag 36h11 fiducial (D-027 production)
// ---------------------------------------------------------------------------

interface RealAprilTagFiducialOpts {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tagId: number;
}

function renderRealAprilTagFiducial(opts: RealAprilTagFiducialOpts): string {
  // renderAprilTag36h11Svg places the 10×10 module grid (8×8 marker +
  // 1-module quiet zone) inside a `<g>` whose coordinates are 0..size mm.
  // Wrap with a translate so it sits on the printable page.
  const inner = renderAprilTag36h11Svg(opts.tagId, { sizeMillimetres: opts.size });
  return `<g transform="translate(${opts.x}, ${opts.y})">${inner}</g>`;
}

// ---------------------------------------------------------------------------
// Placeholder fiducial pattern (D-027) — kept for tests + dev iteration
// when an AprilTag id has not been derived from the marker UID yet.
// ---------------------------------------------------------------------------

interface FiducialOpts {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly seed: number;
}

function renderPlaceholderFiducial(opts: FiducialOpts): string {
  const cells = 10; // 8 data cells + 1-cell quiet zone on each side
  const cellSize = opts.size / cells;
  const rects: string[] = [];

  rects.push(
    `<rect x="${opts.x}" y="${opts.y}" width="${opts.size}" height="${opts.size}" fill="white"/>`,
  );
  const outerInsetX = opts.x + cellSize;
  const outerInsetY = opts.y + cellSize;
  const outerSize = opts.size - 2 * cellSize;
  rects.push(
    `<rect x="${outerInsetX}" y="${outerInsetY}" width="${outerSize}" height="${outerSize}" fill="black"/>`,
  );
  rects.push(
    `<rect x="${opts.x + 2 * cellSize}" y="${opts.y + 2 * cellSize}" width="${opts.size - 4 * cellSize}" height="${opts.size - 4 * cellSize}" fill="white"/>`,
  );

  let state = opts.seed >>> 0 || 0x9e3779b9;
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const bit = (state >>> 0) & 1;
      if (bit) {
        const cellX = opts.x + (2 + col) * cellSize;
        const cellY = opts.y + (2 + row) * cellSize;
        rects.push(
          `<rect x="${cellX}" y="${cellY}" width="${cellSize}" height="${cellSize}" fill="black"/>`,
        );
      }
    }
  }
  return rects.join('\n  ');
}

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Footer scale + orientation helpers
// ---------------------------------------------------------------------------

interface ScaleCheckLineOpts {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly label: string;
}

function renderScaleCheckLine(opts: ScaleCheckLineOpts): string {
  const tick = 2.8;
  const x2 = opts.x + opts.width;
  const labelY = opts.y - 2.1;
  return `<g font-family="${FONT_STACK}">
    <line x1="${opts.x}" y1="${opts.y}" x2="${x2}" y2="${opts.y}" stroke="${BRAND_YELLOW}" stroke-width="0.45"/>
    <line x1="${opts.x}" y1="${opts.y - tick}" x2="${opts.x}" y2="${opts.y + tick}" stroke="${BRAND_YELLOW}" stroke-width="0.45"/>
    <line x1="${x2}" y1="${opts.y - tick}" x2="${x2}" y2="${opts.y + tick}" stroke="${BRAND_YELLOW}" stroke-width="0.45"/>
    <text x="${opts.x + opts.width / 2}" y="${labelY}" text-anchor="middle" font-size="2.7" fill="${BRAND_TEXT_MUTED}">${escapeXml(opts.label)}</text>
  </g>`;
}

interface FooterOrientationOpts {
  readonly x: number;
  readonly y: number;
}

function renderFooterOrientation(opts: FooterOrientationOpts): string {
  const x = opts.x;
  const y = opts.y;
  return `<g font-family="${FONT_STACK}">
    <polygon points="${x - 4},${y + 6} ${x + 4},${y + 6} ${x},${y}" fill="${BRAND_ORANGE}"/>
    <text x="${x}" y="${y + 11.5}" text-anchor="middle" font-size="3.0" font-weight="700" fill="${BRAND_TEXT}">THIS SIDE UP</text>
  </g>`;
}

// ---------------------------------------------------------------------------
// Mini ring diagram with this marker highlighted
// ---------------------------------------------------------------------------

interface RingDiagramOpts {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly ringLengthMeters?: number | undefined;
  readonly ringWidthMeters?: number | undefined;
  readonly highlightLabel?: string | undefined;
  readonly highlightX?: number | undefined;
  readonly highlightY?: number | undefined;
  readonly diagramMarkers?:
    | ReadonlyArray<{
        readonly label: string;
        readonly xMeters: number;
        readonly yMeters: number;
      }>
    | undefined;
}

function renderRingDiagram(opts: RingDiagramOpts): string {
  // When we don't have ring dimensions, draw a generic placeholder
  // rectangle with corner dots so the page still composes.
  const L = opts.ringLengthMeters ?? 20;
  const W = opts.ringWidthMeters ?? 12;

  // Fit a rectangle of L×W into the diagram box (preserving aspect).
  const aspect = L / W;
  const boxAspect = opts.width / opts.height;
  let rectW: number;
  let rectH: number;
  if (aspect > boxAspect) {
    rectW = opts.width;
    rectH = opts.width / aspect;
  } else {
    rectH = opts.height;
    rectW = opts.height * aspect;
  }
  const rectX = opts.x + (opts.width - rectW) / 2;
  const rectY = opts.y + (opts.height - rectH) / 2;

  // Compute dot positions (in diagram coords) from ring metres.
  function projX(metersX: number): number {
    return rectX + (metersX / L) * rectW;
  }
  function projY(metersY: number): number {
    // Ring Y increases upward, but SVG Y increases downward. Match the
    // planner's top-down view so high ring-y appears at the visual top.
    return rectY + rectH - (metersY / W) * rectH;
  }

  // Build the set of dots from either explicit diagramMarkers or the
  // canonical positions A..F (the default visualisation). Phase 9e1
  // bumped the canonical default from 4 to 6 markers so the printed
  // diagram on every page matches the always-6 contract.
  const dots =
    opts.diagramMarkers && opts.diagramMarkers.length > 0
      ? opts.diagramMarkers.map((m) => ({ label: m.label, x: m.xMeters, y: m.yMeters }))
      : ['A', 'B', 'C', 'D', 'E', 'F'].flatMap((label) => {
          const pos = canonicalMarkerPosition(label, L, W);
          return pos ? [{ label, x: pos.xMeters, y: pos.yMeters }] : [];
        });

  // Determine where the highlight goes: the supplied (markerX, markerY)
  // when present, else the canonical position for the label.
  let highlight: { x: number; y: number; label: string } | null = null;
  if (opts.highlightLabel) {
    if (typeof opts.highlightX === 'number' && typeof opts.highlightY === 'number') {
      highlight = { x: opts.highlightX, y: opts.highlightY, label: opts.highlightLabel };
    } else {
      const canon = canonicalMarkerPosition(opts.highlightLabel, L, W);
      if (canon) highlight = { x: canon.xMeters, y: canon.yMeters, label: opts.highlightLabel };
    }
  }

  const dotEls = dots
    .map((d) => {
      const cx = projX(d.x);
      const cy = projY(d.y);
      const isHighlight = highlight && d.label.toUpperCase() === highlight.label.toUpperCase();
      if (isHighlight) {
        return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="1.8" fill="${BRAND_ORANGE}" stroke="${BRAND_YELLOW}" stroke-width="0.4"/>
      <text x="${cx.toFixed(2)}" y="${(cy - 2.4).toFixed(2)}" text-anchor="middle" font-size="2.4" font-weight="700" fill="${BRAND_YELLOW}" font-family="${FONT_STACK}">${escapeXml(d.label)}</text>`;
      }
      return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="1.2" fill="${BRAND_TEXT_MUTED}"/>
      <text x="${cx.toFixed(2)}" y="${(cy - 2.0).toFixed(2)}" text-anchor="middle" font-size="2.2" fill="${BRAND_TEXT_MUTED}" font-family="${FONT_STACK}">${escapeXml(d.label)}</text>`;
    })
    .join('\n      ');

  // Also place the highlight even if it isn't in the dot list (e.g. custom label).
  let extraHighlight = '';
  if (highlight && !dots.some((d) => d.label.toUpperCase() === highlight!.label.toUpperCase())) {
    const cx = projX(highlight.x);
    const cy = projY(highlight.y);
    extraHighlight = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="1.8" fill="${BRAND_ORANGE}" stroke="${BRAND_YELLOW}" stroke-width="0.4"/>
      <text x="${cx.toFixed(2)}" y="${(cy - 2.4).toFixed(2)}" text-anchor="middle" font-size="2.4" font-weight="700" fill="${BRAND_YELLOW}" font-family="${FONT_STACK}">${escapeXml(highlight.label)}</text>`;
  }

  const dimLabel =
    opts.ringLengthMeters && opts.ringWidthMeters
      ? `${formatMetres(L)} × ${formatMetres(W)} m`
      : 'ring layout';

  return `<g>
      <rect x="${rectX.toFixed(2)}" y="${rectY.toFixed(2)}" width="${rectW.toFixed(2)}" height="${rectH.toFixed(2)}" fill="${BRAND_SURFACE}" stroke="${BRAND_BORDER}" stroke-width="0.3"/>
      ${dotEls}
      ${extraHighlight}
      <text x="${(rectX + rectW / 2).toFixed(2)}" y="${(rectY + rectH + 4).toFixed(2)}" text-anchor="middle" font-size="2.8" fill="${BRAND_TEXT_MUTED}" font-family="${FONT_STACK}">${escapeXml(dimLabel)}</text>
    </g>`;
}

function formatMetres(m: number): string {
  if (Number.isInteger(m)) return String(m);
  return m.toFixed(1);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Greedy word-wrap into lines no longer than maxChars characters. */
function splitToLines(s: string, maxChars: number): string[] {
  const words = s.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxChars) {
      current = current + ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}
