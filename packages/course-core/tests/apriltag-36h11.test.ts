// Phase 9d2 — AprilTag 36h11 renderer tests.
//
// Locks the code count + the bit-grid shape + the id-derivation function
// + the renderer's structural properties. The cross-port parity test
// (Unity EditMode) loads the fixture this file emits manually via the
// "emit fixture" repl step.
import { describe, expect, it } from 'vitest';
import {
  APRILTAG_36H11_CODES,
  APRILTAG_36H11_CODE_COUNT,
  APRILTAG_36H11_DATA_BITS,
  APRILTAG_36H11_MARKER_WIDTH,
  APRILTAG_36H11_TOTAL_WIDTH,
  aprilTag36h11Bits,
  aprilTagIdFromMarkerUid,
  assignAprilTagIdForMarker,
  pickAprilTagId,
  renderAprilTag36h11Svg,
} from '../src/markers/apriltag-36h11.js';

describe('AprilTag 36h11 — code table', () => {
  it('contains exactly 587 codes', () => {
    expect(APRILTAG_36H11_CODE_COUNT).toBe(587);
    expect(APRILTAG_36H11_CODES.length).toBe(587);
  });

  it('every code fits in 36 bits', () => {
    const max = (1n << 36n) - 1n;
    for (const c of APRILTAG_36H11_CODES) {
      expect(c >= 0n && c <= max).toBe(true);
    }
  });

  it('first + last codes match the upstream snapshot', () => {
    expect(APRILTAG_36H11_CODES[0]).toBe(0xd7e00984bn);
    expect(APRILTAG_36H11_CODES[586]).toBe(0xe8b772fe0n);
  });

  it('codes are unique (basic sanity check)', () => {
    const set = new Set<string>();
    for (const c of APRILTAG_36H11_CODES) set.add(c.toString(16));
    expect(set.size).toBe(587);
  });

  it('exports the data-bits constant', () => {
    expect(APRILTAG_36H11_DATA_BITS).toBe(36);
  });
});

describe('AprilTag 36h11 — bit grid', () => {
  it('aprilTag36h11Bits(0) returns an 8x8 grid', () => {
    const grid = aprilTag36h11Bits(0);
    expect(grid.length).toBe(APRILTAG_36H11_MARKER_WIDTH);
    expect(grid[0]!.length).toBe(APRILTAG_36H11_MARKER_WIDTH);
    expect(APRILTAG_36H11_MARKER_WIDTH).toBe(8);
  });

  it('outer ring of every tag is all black (border)', () => {
    for (const tagId of [0, 1, 42, 100, 586]) {
      const g = aprilTag36h11Bits(tagId);
      for (let i = 0; i < APRILTAG_36H11_MARKER_WIDTH; i++) {
        expect(g[0]![i]).toBe(false);
        expect(g[APRILTAG_36H11_MARKER_WIDTH - 1]![i]).toBe(false);
        expect(g[i]![0]).toBe(false);
        expect(g[i]![APRILTAG_36H11_MARKER_WIDTH - 1]).toBe(false);
      }
    }
  });

  it('inner 6x6 contains both true + false bits for code 0 (not degenerate)', () => {
    const g = aprilTag36h11Bits(0);
    let trueCount = 0;
    let falseCount = 0;
    for (let y = 1; y < APRILTAG_36H11_MARKER_WIDTH - 1; y++) {
      for (let x = 1; x < APRILTAG_36H11_MARKER_WIDTH - 1; x++) {
        if (g[y]![x]) trueCount++;
        else falseCount++;
      }
    }
    expect(trueCount).toBeGreaterThan(0);
    expect(falseCount).toBeGreaterThan(0);
    expect(trueCount + falseCount).toBe(36);
  });

  it('rejects out-of-range tagIds', () => {
    expect(() => aprilTag36h11Bits(-1)).toThrow();
    expect(() => aprilTag36h11Bits(587)).toThrow();
    expect(() => aprilTag36h11Bits(1.5)).toThrow();
  });

  it('cross-port fixture for tagId=0 (locked + exported to Unity)', () => {
    // This expected grid is the canonical reference the Unity-side
    // cross-port test consumes. Generated from this file's output for
    // APRILTAG_36H11_CODES[0] = 0xd7e00984b (binary 36-bit pattern):
    //   0xd = 1101, 0x7 = 0111, 0xe = 1110, 0x0 = 0000, 0x0 = 0000,
    //   0x9 = 1001, 0x8 = 1000, 0x4 = 0100, 0xb = 1011
    //   → 110101111110000000001001100001001011  (bit 35..0, MSB first)
    // Render via BIT_X[i], BIT_Y[i] (verbatim from tag36h11.c).
    const grid = aprilTag36h11Bits(0);
    // Spot-check a few known module positions (1=white, 0=black).
    // Bit 0 → grid(1,1); bit value = MSB of 0xd7e00984b = 1 → white.
    expect(grid[1]![1]).toBe(true);
    // Bit 8 → grid(3,3) per BIT_X[8]=3, BIT_Y[8]=3; bit 8 of 36-bit data
    // 110101111_1_10000000001001100001001011 (counting from MSB).
    expect(grid[3]![3]).toBe(true);
    // Sanity: total true bits inside the inner 6x6 must equal popcount of the code.
    let pop = 0;
    let v = APRILTAG_36H11_CODES[0]!;
    while (v > 0n) {
      if (v & 1n) pop++;
      v >>= 1n;
    }
    let trueCount = 0;
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) if (grid[y]![x]) trueCount++;
    expect(trueCount).toBe(pop);
  });
});

describe('AprilTag 36h11 — aprilTagIdFromMarkerUid', () => {
  it('returns deterministic values in [0, 587)', async () => {
    const uids = [
      'demo-venue-ring-1-a',
      'demo-venue-ring-1-b',
      'demo-venue-ring-1-c',
      'demo-venue-ring-1-d',
      'south-hall-south-ring-a',
      'south-hall-south-ring-b',
    ];
    for (const uid of uids) {
      const id = await aprilTagIdFromMarkerUid(uid);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(587);
    }
  });

  it('is stable across calls for the same input', async () => {
    const a = await aprilTagIdFromMarkerUid('demo-venue-ring-1-a');
    const b = await aprilTagIdFromMarkerUid('demo-venue-ring-1-a');
    expect(a).toBe(b);
  });

  it('rejects empty / non-string input', async () => {
    await expect(aprilTagIdFromMarkerUid('')).rejects.toThrow();
    // @ts-expect-error — runtime guard for callers that bypass types
    await expect(aprilTagIdFromMarkerUid(null)).rejects.toThrow();
  });

  it('snapshot: known demo marker UIDs (cross-port fixture for C# tests)', async () => {
    // These snapshots ARE the cross-port fixtures the C# tests check.
    // SHA-256 of the UTF-8 bytes → big-endian first-4-bytes uint32 mod 587.
    expect(await aprilTagIdFromMarkerUid('demo-venue-ring-1-a')).toBe(43);
    expect(await aprilTagIdFromMarkerUid('demo-venue-ring-1-b')).toBe(256);
    expect(await aprilTagIdFromMarkerUid('demo-venue-ring-1-c')).toBe(208);
    expect(await aprilTagIdFromMarkerUid('demo-venue-ring-1-d')).toBe(503);
    expect(await aprilTagIdFromMarkerUid('demo-venue-ring-1-e')).toBe(271);
    expect(await aprilTagIdFromMarkerUid('demo-venue-ring-1-f')).toBe(419);
  });

  it('demo-venue 6 markers map to 6 distinct tag ids today', async () => {
    const ids = await Promise.all([
      aprilTagIdFromMarkerUid('demo-venue-ring-1-a'),
      aprilTagIdFromMarkerUid('demo-venue-ring-1-b'),
      aprilTagIdFromMarkerUid('demo-venue-ring-1-c'),
      aprilTagIdFromMarkerUid('demo-venue-ring-1-d'),
      aprilTagIdFromMarkerUid('demo-venue-ring-1-e'),
      aprilTagIdFromMarkerUid('demo-venue-ring-1-f'),
    ]);
    expect(new Set(ids).size).toBe(6);
  });
});

describe('AprilTag 36h11 — pickAprilTagId (Phase 9e1, Option A collision fix)', () => {
  it('returns the preferred id when nothing is taken', () => {
    expect(pickAprilTagId(42, [])).toBe(42);
    expect(pickAprilTagId(0, new Set<number>())).toBe(0);
    expect(pickAprilTagId(586, [])).toBe(586);
  });

  it('returns the preferred id when only OTHER ids are taken', () => {
    expect(pickAprilTagId(42, [10, 11, 12])).toBe(42);
  });

  it('steps to the next free id after a collision', () => {
    expect(pickAprilTagId(42, [42])).toBe(43);
    expect(pickAprilTagId(42, [42, 43, 44])).toBe(45);
  });

  it('wraps around to 0 past 586', () => {
    expect(pickAprilTagId(586, [586])).toBe(0);
    expect(pickAprilTagId(585, [585, 586])).toBe(0);
    expect(pickAprilTagId(585, [585, 586, 0])).toBe(1);
  });

  it('is deterministic — same (preferred, taken) → same output', () => {
    const a = pickAprilTagId(42, [42, 100, 200]);
    const b = pickAprilTagId(42, [200, 100, 42]); // order doesn't matter (Set)
    expect(a).toBe(b);
  });

  it('ignores out-of-range entries in the taken set defensively', () => {
    expect(pickAprilTagId(42, [-1, 587, 1000, 42])).toBe(43);
  });

  it('rejects an out-of-range preferred id', () => {
    expect(() => pickAprilTagId(-1, [])).toThrow();
    expect(() => pickAprilTagId(587, [])).toThrow();
    expect(() => pickAprilTagId(1.5, [])).toThrow();
  });

  it('throws when the entire 587-tag space is taken', () => {
    const all = Array.from({ length: 587 }, (_, i) => i);
    expect(() => pickAprilTagId(42, all)).toThrow(/saturated/i);
  });
});

describe('AprilTag 36h11 — assignAprilTagIdForMarker', () => {
  it('derives the SHA-based id and returns it directly when no collision', async () => {
    const direct = await aprilTagIdFromMarkerUid('demo-venue-ring-1-a');
    const assigned = await assignAprilTagIdForMarker('demo-venue-ring-1-a', []);
    expect(assigned).toBe(direct);
  });

  it('falls through to the next free id when the SHA-derived value collides', async () => {
    const direct = await aprilTagIdFromMarkerUid('demo-venue-ring-1-a');
    const assigned = await assignAprilTagIdForMarker('demo-venue-ring-1-a', [direct]);
    // Expected: (direct + 1) % 587, since `direct` is the only taken id.
    expect(assigned).toBe((direct + 1) % 587);
  });
});

describe('AprilTag 36h11 — renderAprilTag36h11Svg', () => {
  it('emits a single <g> rooted element with the right tag id attribute', () => {
    const svg = renderAprilTag36h11Svg(0, { sizeMillimetres: 200 });
    expect(svg.startsWith('<g class="apriltag-36h11" data-tag-id="0">')).toBe(true);
    expect(svg.endsWith('</g>')).toBe(true);
  });

  it('emits at least the background + every black module', () => {
    const svg = renderAprilTag36h11Svg(0, { sizeMillimetres: 200 });
    // background <rect> + (border + inner-black) <rect>s.
    // 28 border modules + N inner black; minimum 28 black + 1 bg = 29.
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    expect(rectCount).toBeGreaterThanOrEqual(29);
  });

  it('respects custom colors', () => {
    const svg = renderAprilTag36h11Svg(0, {
      sizeMillimetres: 200,
      fillColor: '#123456',
      backgroundColor: '#abcdef',
    });
    expect(svg.includes('fill="#123456"')).toBe(true);
    expect(svg.includes('fill="#abcdef"')).toBe(true);
  });

  it('total width respects sizeMillimetres', () => {
    const svg = renderAprilTag36h11Svg(0, { sizeMillimetres: 100 });
    // Background rect spans exactly 100mm × 100mm.
    expect(svg.includes('width="100.0000" height="100.0000"')).toBe(true);
  });

  it('rejects out-of-range tagIds', () => {
    expect(() => renderAprilTag36h11Svg(-1, { sizeMillimetres: 100 })).toThrow();
    expect(() => renderAprilTag36h11Svg(587, { sizeMillimetres: 100 })).toThrow();
  });

  it('APRILTAG_36H11_TOTAL_WIDTH == 10 (8x8 + 1-module quiet zone on each side)', () => {
    expect(APRILTAG_36H11_TOTAL_WIDTH).toBe(10);
  });
});
