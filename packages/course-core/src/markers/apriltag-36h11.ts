// Phase 9d2 — AprilTag 36h11 renderer (closes D-027).
//
// Replaces Phase 6's "PREVIEW PATTERN" placeholder with the canonical
// AprilTag 36h11 fiducial used by AR Foundation's tracked-image API and
// the AprilTag detector libraries the Unity-side AR pipeline will rely on.
//
// Family metadata (from tag36h11.c):
//   ncodes = 587, h = 11, nbits = 36
//   total_width = 10  (8x8 marker + 1-module white quiet zone)
//   width_at_border = 8  (1-module black border + 6x6 data interior)
//   reversed_border = false  (border is black on white, normal AprilTag)
//
// Bit-layout convention:
//   - Each code packs 36 data bits in the low 36 bits of a 64-bit value.
//   - For i in 0..35, bit i of the code = (code >> (35 - i)) & 1.
//   - Bit i lives at grid position (BIT_X[i], BIT_Y[i]) within the 8x8
//     marker (top-left of border = (0,0); top-left of inner data = (1,1)).
//   - A bit value of 1 = WHITE module; 0 = BLACK module. The border
//     (positions on the edge of the 8x8) is ALWAYS BLACK regardless.
//
// Both TS + C# (SharedCore/Markers/AprilTag36h11.cs) read from the same
// canonical codes table and must produce the same bit grid for any tagId.
// Cross-port parity is locked by the fixture
// `unity/.../Tests/Fixtures/apriltag-bits-0.json` (emitted from this TS
// renderer, consumed by the EditMode test).
//
// Copyright on the codes + bit-layout tables: BSD-2-Clause, see
// LICENSE-apriltag at the repo root.
import {
  APRILTAG_36H11_CODE_COUNT,
  APRILTAG_36H11_CODES,
  APRILTAG_36H11_DATA_BITS,
} from './apriltag-36h11-codes.js';

/** Verbatim copy of bit_x[] from tag36h11.c (BSD-2-Clause). */
const BIT_X: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 2, 3, 4, 3, 6, 6, 6, 6, 6, 5, 5, 5, 4, 6, 5, 4, 3, 2, 5, 4, 3, 4, 1, 1, 1, 1, 1, 2,
  2, 2, 3,
]);
/** Verbatim copy of bit_y[] from tag36h11.c (BSD-2-Clause). */
const BIT_Y: readonly number[] = Object.freeze([
  1, 1, 1, 1, 1, 2, 2, 2, 3, 1, 2, 3, 4, 5, 2, 3, 4, 3, 6, 6, 6, 6, 6, 5, 5, 5, 4, 6, 5, 4, 3, 2, 5,
  4, 3, 4,
]);

/** 8x8 marker (includes border). */
export const APRILTAG_36H11_MARKER_WIDTH = 8;
/** 10x10 full printable footprint (1-module white quiet zone). */
export const APRILTAG_36H11_TOTAL_WIDTH = 10;

/**
 * Returns the 8x8 module grid for a given tagId (0..586). The outer ring
 * is always `false` (black border); the inner 6x6 carries the 36 data bits.
 * `grid[y][x]` where (0,0) is top-left. `true` = white module, `false` = black.
 */
export function aprilTag36h11Bits(tagId: number): readonly (readonly boolean[])[] {
  if (!Number.isInteger(tagId) || tagId < 0 || tagId >= APRILTAG_36H11_CODE_COUNT) {
    throw new Error(`tagId out of range: ${tagId} (must be 0..${APRILTAG_36H11_CODE_COUNT - 1})`);
  }
  const code = APRILTAG_36H11_CODES[tagId]!;
  const grid: boolean[][] = [];
  for (let y = 0; y < APRILTAG_36H11_MARKER_WIDTH; y++) {
    const row: boolean[] = new Array(APRILTAG_36H11_MARKER_WIDTH);
    for (let x = 0; x < APRILTAG_36H11_MARKER_WIDTH; x++) {
      // Default: black (the border occupies x=0, x=7, y=0, y=7).
      row[x] = false;
    }
    grid.push(row);
  }
  for (let i = 0; i < APRILTAG_36H11_DATA_BITS; i++) {
    const shift = BigInt(APRILTAG_36H11_DATA_BITS - 1 - i);
    const bit = (code >> shift) & 1n;
    const x = BIT_X[i]!;
    const y = BIT_Y[i]!;
    grid[y]![x] = bit === 1n;
  }
  return grid;
}

export interface RenderAprilTag36h11SvgOptions {
  /** Printable side length of the 10x10 quiet-zone-included footprint, in millimetres. */
  readonly sizeMillimetres: number;
  /** Black-module fill colour. Defaults to `#000`. */
  readonly fillColor?: string;
  /** Background (quiet zone) fill. Defaults to `#fff`. */
  readonly backgroundColor?: string;
  /** When true, draws faint grid lines between modules for design review. Defaults to false. */
  readonly showGrid?: boolean;
}

/**
 * Render an AprilTag 36h11 marker as an SVG `<g>` element (inner content
 * only — caller wraps in the outer `<svg viewBox>` per their layout).
 * Includes the 1-module white quiet zone (total 10x10 modules).
 */
export function renderAprilTag36h11Svg(tagId: number, opts: RenderAprilTag36h11SvgOptions): string {
  const fill = opts.fillColor ?? '#000';
  const bg = opts.backgroundColor ?? '#fff';
  const total = APRILTAG_36H11_TOTAL_WIDTH;
  const moduleSize = opts.sizeMillimetres / total;
  const grid = aprilTag36h11Bits(tagId);

  const rects: string[] = [];
  // Background (quiet zone + the white modules inside the 8x8 — drawn as one
  // big rect so we don't emit a `<rect>` per white module).
  rects.push(
    `<rect x="0" y="0" width="${(total * moduleSize).toFixed(4)}" height="${(total * moduleSize).toFixed(4)}" fill="${bg}"/>`,
  );

  // Black modules (only the 8x8 region, offset by 1 module of quiet zone).
  for (let y = 0; y < APRILTAG_36H11_MARKER_WIDTH; y++) {
    for (let x = 0; x < APRILTAG_36H11_MARKER_WIDTH; x++) {
      // Border or data bit?
      const isBorder =
        x === 0 ||
        x === APRILTAG_36H11_MARKER_WIDTH - 1 ||
        y === 0 ||
        y === APRILTAG_36H11_MARKER_WIDTH - 1;
      // Border = always black; data bit = black when grid[y][x] is false.
      const isBlack = isBorder ? true : !grid[y]![x];
      if (!isBlack) continue;
      const px = (x + 1) * moduleSize; // +1 for quiet zone
      const py = (y + 1) * moduleSize;
      rects.push(
        `<rect x="${px.toFixed(4)}" y="${py.toFixed(4)}" width="${moduleSize.toFixed(4)}" height="${moduleSize.toFixed(4)}" fill="${fill}"/>`,
      );
    }
  }

  if (opts.showGrid) {
    for (let i = 0; i <= total; i++) {
      const p = (i * moduleSize).toFixed(4);
      const len = (total * moduleSize).toFixed(4);
      rects.push(
        `<line x1="${p}" y1="0" x2="${p}" y2="${len}" stroke="#888" stroke-width="0.05"/>`,
      );
      rects.push(
        `<line x1="0" y1="${p}" x2="${len}" y2="${p}" stroke="#888" stroke-width="0.05"/>`,
      );
    }
  }

  return `<g class="apriltag-36h11" data-tag-id="${tagId}">${rects.join('')}</g>`;
}

/**
 * Derive a stable tagId from a marker_uid (D-029 format = `<venue-slug>-<ring-slug>-<label>`).
 * SHA-256 → take the first 4 bytes as a uint32 → mod 587. Deterministic across runs +
 * platforms (TS Web Crypto + C# SHA256.HashData agree byte-for-byte).
 *
 * Collision risk: with 6 markers per ring out of 587 tags, P(any 2 collide) ≈ 2.6%
 * per ring (birthday-problem math). With Phase 9e1's mandatory-6 contract this
 * stops being hypothetical — every ring rolls the dice. The collision mitigation
 * lives at marker-creation time: callers should call this to get the *preferred*
 * id, then run `pickAprilTagId` against the set of ids already in use within the
 * ring to land on a guaranteed-unique value. The chosen id is persisted on
 * `ring_markers.april_tag_id` (migration 20260518120000_april_tag_id.sql) so
 * both the printable pack and the AR runtime see the same id even if the
 * SHA-derived value drifts.
 *
 * Pre-9d5 rings with a null `april_tag_id` keep using the raw SHA derivation as
 * a backwards-compatible fallback.
 */
export async function aprilTagIdFromMarkerUid(markerUid: string): Promise<number> {
  if (typeof markerUid !== 'string' || markerUid.length === 0) {
    throw new Error('markerUid must be a non-empty string');
  }
  // Web Crypto path (works in Node 19+ + browsers). Mirrors C#'s
  // SHA256.HashData(Encoding.UTF8.GetBytes(uid)).
  const bytes = new TextEncoder().encode(markerUid);
  // Defensive copy into a fresh ArrayBuffer so digest doesn't see SharedArrayBuffer.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ab));
  // First 4 bytes → big-endian uint32 → mod 587.
  const u32 = (digest[0]! << 24) | (digest[1]! << 16) | (digest[2]! << 8) | digest[3]!;
  // `>>> 0` makes it unsigned (>= 0); JS bitwise ops are signed-32-bit.
  return (u32 >>> 0) % APRILTAG_36H11_CODE_COUNT;
}

/**
 * Pick a guaranteed-unique AprilTag id for a marker inside a ring (Phase 9e1,
 * Option A from anchoring-strategy-plan.md §5.3).
 *
 * Strategy: prefer the SHA-derived id (so re-generations are stable for the
 * common no-collision case). If it's already taken by another marker in the
 * same ring, fall through to the next free slot by scanning the 0..586 range
 * starting one past the preferred id and wrapping around. Throws when every
 * id is taken (which would require more than 587 markers in one ring — not
 * physically possible for an agility ring, but the guard rail is cheap).
 *
 * The scan is deterministic: the (preferred, taken) pair fully determines the
 * output, so re-running it for an unchanged set is a no-op. Callers should
 * persist the chosen id on `ring_markers.april_tag_id` so neither the
 * printable pack nor the AR runtime ever re-derives a stale value.
 */
export function pickAprilTagId(preferredId: number, takenIds: Iterable<number>): number {
  if (
    !Number.isInteger(preferredId) ||
    preferredId < 0 ||
    preferredId >= APRILTAG_36H11_CODE_COUNT
  ) {
    throw new Error(
      `preferredId out of range: ${preferredId} (must be 0..${APRILTAG_36H11_CODE_COUNT - 1})`,
    );
  }
  const taken = new Set<number>();
  for (const id of takenIds) {
    // Defensive: silently ignore out-of-range ids in the taken set so a
    // corrupt legacy row can't break new marker creation.
    if (Number.isInteger(id) && id >= 0 && id < APRILTAG_36H11_CODE_COUNT) taken.add(id);
  }
  if (!taken.has(preferredId)) return preferredId;
  for (let step = 1; step < APRILTAG_36H11_CODE_COUNT; step++) {
    const candidate = (preferredId + step) % APRILTAG_36H11_CODE_COUNT;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(
    `Ring is saturated: all ${APRILTAG_36H11_CODE_COUNT} AprilTag 36h11 ids are taken. ` +
      'Agility rings should never need more than a handful of markers; investigate.',
  );
}

/**
 * Convenience: derive the SHA-based id from `markerUid`, then pick a free id
 * within the ring. Common case for `createMarker` paths.
 */
export async function assignAprilTagIdForMarker(
  markerUid: string,
  takenIds: Iterable<number>,
): Promise<number> {
  const preferred = await aprilTagIdFromMarkerUid(markerUid);
  return pickAprilTagId(preferred, takenIds);
}

export { APRILTAG_36H11_CODES, APRILTAG_36H11_CODE_COUNT, APRILTAG_36H11_DATA_BITS, BIT_X, BIT_Y };
