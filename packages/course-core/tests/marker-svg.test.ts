import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKER_PHYSICAL_SIZE_M,
  DEFAULT_MARKER_PHYSICAL_HEIGHT_M,
  DEFAULT_MARKER_PHYSICAL_WIDTH_M,
  DEFAULT_PAGE_HEIGHT_MM,
  DEFAULT_PAGE_WIDTH_MM,
  DEFAULT_PAPER_SIZE,
  isPaperSize,
  normalisePaperSize,
  PAPER_PRESETS,
  PAPER_SIZES,
  paperPreset,
  renderMarkerSvg,
} from '../src/markers/marker-svg.js';
import { canonicalMarkerPosition } from '../src/markers/marker-roles.js';

function diagramLabelY(svg: string, label: string): number {
  const match = svg.match(
    new RegExp(`<text x="[^"]+" y="([^"]+)" text-anchor="middle"[^>]*>${label}</text>`),
  );
  if (!match) throw new Error(`Missing diagram label ${label}`);
  return Number(match[1]);
}

describe('renderMarkerSvg (A4 portrait design system)', () => {
  const template = {
    venueName: 'Demo Partner Venue',
    ringName: 'Ring 1',
    label: 'A',
    markerUid: 'demo-venue-ring-1-a',
    ringLengthMeters: 30,
    ringWidthMeters: 18,
  };

  it('produces a self-contained SVG document', () => {
    const { svg } = renderMarkerSvg(template);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
  });

  it('defaults to A4 portrait (210 mm × 297 mm) — one marker per page', () => {
    expect(DEFAULT_PAGE_WIDTH_MM).toBe(210);
    expect(DEFAULT_PAGE_HEIGHT_MM).toBe(297);
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('width="210mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain('viewBox="0 0 210 297"');
  });

  it('defaults the physical marker size to 190 mm × 190 mm', () => {
    expect(DEFAULT_MARKER_PHYSICAL_SIZE_M).toBe(0.19);
    expect(DEFAULT_MARKER_PHYSICAL_WIDTH_M).toBe(0.19);
    expect(DEFAULT_MARKER_PHYSICAL_HEIGHT_M).toBe(0.19);
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('190 mm marker check');
    expect(svg).toContain('width="190" height="190"');
  });

  it('embeds the label, venue / ring names, marker UID, and canonical role', () => {
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('Demo Partner Venue');
    expect(svg).toContain('Ring 1');
    expect(svg).toContain('demo-venue-ring-1-a');
    // Canonical role for label A is "Top-left marker" (two-line: TOP-LEFT / MARKER)
    expect(svg).toContain('TOP-LEFT');
    expect(svg).toContain('MARKER');
    // Big letter (font-size 36, large orange A in the chrome footer)
    expect(svg).toMatch(/font-size="36"[^>]*>A</);
  });

  it('emits the THIS SIDE UP orientation indicator and the DO NOT RESIZE warning', () => {
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('THIS SIDE UP');
    expect(svg).toContain('DO NOT RESIZE');
  });

  it('renders the actual-size marker check line in the chrome footer', () => {
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('190 mm marker check');
    expect(svg).not.toContain('should measure 10 cm');
  });

  it('renders a mini ring diagram with the ring dimensions caption', () => {
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('RING DIAGRAM');
    expect(svg).toContain('30 × 18 m');
  });

  it('escapes XML-special characters in user-supplied text', () => {
    const evil = renderMarkerSvg({
      ...template,
      venueName: '<script>alert("x")</script>',
      ringName: 'Ring & Co',
    }).svg;
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&lt;script&gt;');
    expect(evil).toContain('Ring &amp; Co');
  });

  it('produces a stable suggested filename derived from the UID', () => {
    const { suggestedFilename } = renderMarkerSvg(template);
    expect(suggestedFilename).toBe('demo-venue-ring-1-a-marker.svg');
  });

  it('uses the canonical role per marker label in reading order', () => {
    const A = renderMarkerSvg({ ...template, label: 'A' }).svg;
    const B = renderMarkerSvg({ ...template, label: 'B', markerUid: 'demo-venue-ring-1-b' }).svg;
    const C = renderMarkerSvg({ ...template, label: 'C', markerUid: 'demo-venue-ring-1-c' }).svg;
    const D = renderMarkerSvg({ ...template, label: 'D', markerUid: 'demo-venue-ring-1-d' }).svg;
    const E = renderMarkerSvg({ ...template, label: 'E', markerUid: 'demo-venue-ring-1-e' }).svg;
    const F = renderMarkerSvg({ ...template, label: 'F', markerUid: 'demo-venue-ring-1-f' }).svg;
    expect(A).toContain('TOP-LEFT');
    expect(B).toContain('TOP-MID');
    expect(C).toContain('TOP-RIGHT');
    expect(D).toContain('BOTTOM-LEFT');
    expect(E).toContain('BOTTOM-MID');
    expect(F).toContain('BOTTOM-RIGHT');
  });

  it('uses top-row A/B/C and bottom-row D/E/F for canonical positions', () => {
    expect(canonicalMarkerPosition('A', 30, 18)).toEqual({ xMeters: 0, yMeters: 18 });
    expect(canonicalMarkerPosition('B', 30, 18)).toEqual({ xMeters: 15, yMeters: 18 });
    expect(canonicalMarkerPosition('C', 30, 18)).toEqual({ xMeters: 30, yMeters: 18 });
    expect(canonicalMarkerPosition('D', 30, 18)).toEqual({ xMeters: 0, yMeters: 0 });
    expect(canonicalMarkerPosition('E', 30, 18)).toEqual({ xMeters: 15, yMeters: 0 });
    expect(canonicalMarkerPosition('F', 30, 18)).toEqual({ xMeters: 30, yMeters: 0 });
  });

  it('projects ring-frame marker coordinates in the same visual direction as the planner', () => {
    const { svg } = renderMarkerSvg({
      ...template,
      label: 'A',
      markerXMeters: 0.5,
      markerYMeters: 17.5,
      diagramMarkers: [
        { label: 'A', xMeters: 0.5, yMeters: 17.5 },
        { label: 'D', xMeters: 0.5, yMeters: 0.5 },
      ],
    });
    expect(diagramLabelY(svg, 'A')).toBeLessThan(diagramLabelY(svg, 'D'));
  });

  it('two markers in the same ring render visibly different placeholder patterns', () => {
    const a = renderMarkerSvg({ ...template, label: 'A', markerUid: 'demo-venue-ring-1-a' }).svg;
    const b = renderMarkerSvg({ ...template, label: 'B', markerUid: 'demo-venue-ring-1-b' }).svg;
    expect(a).not.toBe(b);
  });

  it('emits the real AprilTag <g> + tag-id caption when aprilTagId is supplied', () => {
    const { svg } = renderMarkerSvg({ ...template, aprilTagId: 43 });
    expect(svg).toMatch(/<g class="apriltag-36h11" data-tag-id="43">/);
    expect(svg).toContain('AprilTag 36h11 · tag 43');
    expect(svg).not.toContain('PREVIEW PATTERN');
  });

  it('falls back to a PREVIEW PATTERN footnote when aprilTagId is absent (dev / tests)', () => {
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('PREVIEW PATTERN');
  });

  it('respects an overridden physical marker size for the fiducial and scale check', () => {
    const { svg } = renderMarkerSvg({ ...template, physicalSizeMeters: 0.15 });
    expect(svg).toContain('width="150" height="150"');
    expect(svg).toContain('150 mm marker check');
  });

  it('rejects stale A4-sheet dimensions as fiducial size', () => {
    expect(() => renderMarkerSvg({ ...template, physicalSizeMeters: 0.297 })).toThrow(
      /Store the AprilTag square size/,
    );
  });

  it('rejects stale US Letter sheet dimensions as fiducial size', () => {
    // 8.5 in = 215.9 mm, 11 in = 279.4 mm. Same class of mistake as 0.297.
    expect(() => renderMarkerSvg({ ...template, physicalSizeMeters: 0.2159 })).toThrow(
      /Store the AprilTag square size/,
    );
    expect(() => renderMarkerSvg({ ...template, physicalSizeMeters: 0.2794 })).toThrow(
      /Store the AprilTag square size/,
    );
  });

  it('does not place any branding, label text, or chrome inside the white marker zone', () => {
    // The clean marker zone is y = 0..210 mm. Brand chrome lives entirely
    // inside the footer group, which is translated to the top of the
    // footer band; the only top-zone elements are the white background
    // and the fiducial pattern itself.
    const { svg } = renderMarkerSvg(template);
    expect(svg).toContain('<rect x="0" y="0" width="210" height="210" fill="#ffffff"/>');
    expect(svg).toContain('<g transform="translate(0, 210) scale(1)">');
    expect(footerGroup(svg)).toMatch(/<text x="10" y="28"[^>]*>AgilityHub</);
    expect(footerGroup(svg)).toMatch(/<text x="10" y="73"[^>]*>A</);
    // No text element at all is emitted before the footer group starts —
    // the marker zone holds the white background and the fiducial only.
    expect(svg.slice(0, svg.indexOf('<g transform="translate(0, 210)'))).not.toContain('<text');
  });
});

// ---------------------------------------------------------------------------
// Paper sizes — A4 (ISO) and US Letter (8½ × 11 in)
// ---------------------------------------------------------------------------

/**
 * The chrome footer group: everything between its opening transform and
 * the fiducial comment that follows it.
 */
function footerGroup(svg: string): string {
  const start = svg.indexOf('<g transform="translate(');
  const end = svg.indexOf('<!-- Machine-readable fiducial');
  if (start < 0 || end < 0) throw new Error('No chrome footer group in SVG');
  return svg.slice(start, end);
}

function footerTransform(svg: string): { tx: number; ty: number; scale: number } {
  const m = /translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(footerGroup(svg));
  if (!m) throw new Error('No footer transform in SVG');
  return { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) };
}

/** Bottom-most footer coordinate, mapped back into page millimetres. */
function footerBottomMm(svg: string): number {
  const { ty, scale } = footerTransform(svg);
  const ys = [...footerGroup(svg).matchAll(/\sy2?="([-\d.]+)"/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 1);
  return Math.max(...ys) * scale + ty;
}

describe('renderMarkerSvg paper sizes', () => {
  const template = {
    venueName: 'MaryEllen',
    ringName: 'MaryEllen',
    label: 'A',
    markerUid: 'maryellen-maryellen-a',
    ringLengthMeters: 29,
    ringWidthMeters: 29,
    aprilTagId: 123,
  };

  it('exposes A4 and US Letter presets with exact millimetre dimensions', () => {
    expect(PAPER_SIZES).toEqual(['a4', 'letter']);
    expect(DEFAULT_PAPER_SIZE).toBe('a4');
    expect(PAPER_PRESETS.a4).toMatchObject({ widthMm: 210, heightMm: 297, label: 'A4' });
    // 8.5 in × 11 in, exactly.
    expect(PAPER_PRESETS.letter).toMatchObject({
      widthMm: 215.9,
      heightMm: 279.4,
      label: 'US Letter',
    });
    expect(PAPER_PRESETS.letter.widthMm).toBeCloseTo(8.5 * 25.4, 6);
    expect(PAPER_PRESETS.letter.heightMm).toBeCloseTo(11 * 25.4, 6);
  });

  it('carries a CSS @page size token for each preset', () => {
    expect(PAPER_PRESETS.a4.cssPageSize).toBe('A4 portrait');
    expect(PAPER_PRESETS.letter.cssPageSize).toBe('Letter portrait');
  });

  it('normalises paper-size input from query strings, DB columns, and CLI flags', () => {
    expect(normalisePaperSize('letter')).toBe('letter');
    expect(normalisePaperSize('LETTER')).toBe('letter');
    expect(normalisePaperSize('US Letter')).toBe('letter');
    expect(normalisePaperSize('us-letter')).toBe('letter');
    expect(normalisePaperSize('a4')).toBe('a4');
    expect(normalisePaperSize('A4')).toBe('a4');
    // Unknown input must fall back rather than throw — a pack on the wrong
    // paper is recoverable, one that fails to render is not.
    expect(normalisePaperSize('legal')).toBe('a4');
    expect(normalisePaperSize(undefined)).toBe('a4');
    expect(normalisePaperSize(null)).toBe('a4');
    expect(normalisePaperSize(42)).toBe('a4');
    expect(paperPreset('letter')).toBe(PAPER_PRESETS.letter);
    expect(paperPreset('nonsense')).toBe(PAPER_PRESETS.a4);
    expect(isPaperSize('letter')).toBe(true);
    expect(isPaperSize('legal')).toBe(false);
  });

  it('renders a US Letter page at 215.9 × 279.4 mm', () => {
    const { svg } = renderMarkerSvg({ ...template, paperSize: 'letter' });
    expect(svg).toContain('width="215.9mm"');
    expect(svg).toContain('height="279.4mm"');
    expect(svg).toContain('viewBox="0 0 215.9 279.4"');
    expect(svg).toContain('US Letter portrait');
  });

  it('keeps the 190 mm fiducial and its 10 mm quiet border on every paper size', () => {
    for (const size of PAPER_SIZES) {
      const preset = PAPER_PRESETS[size];
      const { svg } = renderMarkerSvg({ ...template, paperSize: size });
      // The white marker zone is 210 mm tall regardless of page height:
      // the tag's quiet space is never what absorbs a shorter page.
      expect(svg).toContain(`<rect x="0" y="0" width="${preset.widthMm}" height="210" fill="#ffffff"/>`);
      // Fiducial is 190 mm and centred horizontally, 10 mm below the top.
      const tag = /<g transform="translate\(([\d.]+), ([\d.]+)\)"><g class="apriltag-36h11"/.exec(svg);
      expect(tag).not.toBeNull();
      expect(Number(tag![1])).toBeCloseTo((preset.widthMm - 190) / 2, 6);
      expect(Number(tag![2])).toBeCloseTo(10, 6);
      expect(svg).toContain('width="190.0000" height="190.0000"');
      expect(svg).toContain('190 mm marker check');
    }
  });

  it('scales the chrome footer to fit instead of overflowing the page', () => {
    for (const size of PAPER_SIZES) {
      const preset = PAPER_PRESETS[size];
      const { svg } = renderMarkerSvg({ ...template, paperSize: size });
      const { ty, scale } = footerTransform(svg);
      expect(ty).toBe(210);
      expect(scale).toBeCloseTo((preset.heightMm - 210) / 87, 6);
      expect(footerBottomMm(svg)).toBeLessThanOrEqual(preset.heightMm);
    }
  });

  it('leaves the A4 footer at scale 1 — Letter support must not move A4 chrome', () => {
    const { tx, ty, scale } = footerTransform(renderMarkerSvg({ ...template }).svg);
    expect({ tx, ty, scale }).toEqual({ tx: 0, ty: 210, scale: 1 });
  });

  it('spans the full page width on Letter rather than leaving dark gutters', () => {
    const { svg } = renderMarkerSvg({ ...template, paperSize: 'letter' });
    const { scale } = footerTransform(svg);
    // The DO NOT RESIZE band is the widest chrome element; after scaling it
    // must sit within ~10 mm of each page edge, as it does on A4.
    const band = /<rect x="72" y="66" width="([\d.]+)" height="9"/.exec(footerGroup(svg));
    expect(band).not.toBeNull();
    const rightEdge = (72 + Number(band![1])) * scale;
    expect(PAPER_PRESETS.letter.widthMm - rightEdge).toBeLessThan(10);
    expect(PAPER_PRESETS.letter.widthMm - rightEdge).toBeGreaterThan(0);
  });

  it('still honours explicit page dimensions over the paper preset', () => {
    const { svg } = renderMarkerSvg({
      ...template,
      paperSize: 'letter',
      pageWidthMm: 210,
      pageHeightMm: 297,
    });
    expect(svg).toContain('viewBox="0 0 210 297"');
  });

  it('defaults to A4 when no paper size is given', () => {
    const implicit = renderMarkerSvg(template).svg;
    const explicit = renderMarkerSvg({ ...template, paperSize: 'a4' }).svg;
    expect(implicit).toBe(explicit);
  });
});
