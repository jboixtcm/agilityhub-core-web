/**
 * Venue-side coordinate model: `Ring`, `Door`, and ring-level `NoGoZone`.
 *
 * Phase 2 keeps this purely schema + helper. Phase 3 will mirror it in
 * Supabase; Phase 6 will let venue admins configure it through the web
 * planner. The shape lives here so the warning engine can consume it
 * without depending on any UI / DB / Supabase code.
 *
 * Coordinate convention
 * ---------------------
 * Ring frame origin is the **bottom-left corner**, `+X` runs along the
 * ring's `lengthMeters`, `+Y` along its `widthMeters`. We pick BL (not LT
 * like Smarter) because:
 *   - the planner UI shows the ring from above with "up == farther from
 *     the judge", which is the natural `+Y` for venue staff;
 *   - measuring from a corner with `+Y up` matches how venues lay out
 *     markers in the floor plan;
 *   - the Smarter LT convention only matters at parse time, where Phase 1
 *     already flipped nothing (we kept LT in CourseData). Placement
 *     transforms work the same regardless — they're rigid.
 *
 * Doors are polygons in ring frame, plus a `clearanceMeters` distance
 * that obstacles must respect.
 */
import { z } from 'zod';
import {
  obstacleTypeSchema,
  point2DMetersSchema,
  type ObstacleType,
  type Point2DMeters,
} from '../schema/primitives.js';
import { DEFAULT_CLEARANCE_M } from './units.js';
import { boundsOf, rectFromSize, type Rect } from './primitives.js';

// ---------------------------------------------------------------------------
// Door
// ---------------------------------------------------------------------------

/** Canonical ring sides used by the venue-admin door editor + renderers. */
export const ringDoorSideSchema = z.enum(['north', 'south', 'east', 'west']);
export type RingDoorSide = z.infer<typeof ringDoorSideSchema>;

/** Pedestrian flow direction through the door. */
export const ringDoorFlowSchema = z.enum(['in', 'out', 'both']);
export type RingDoorFlow = z.infer<typeof ringDoorFlowSchema>;

/** How thick the derived door footprint slab is, perpendicular to the wall. */
export const DOOR_SLAB_DEPTH_M = 0.5;

export const doorSchema = z.object({
  id: z.string(),
  label: z.string().default('Door'),
  /** Door footprint in ring frame (meters). Must have ≥ 3 points. */
  polygonPointsMeters: z.array(point2DMetersSchema).min(3),
  /** How close obstacles may come to the door polygon before warning. */
  clearanceMeters: z.number().nonnegative().default(DEFAULT_CLEARANCE_M),
  /**
   * Pedestrian flow direction. Defaults to 'both' (two-way) when the
   * caller omits it — keeps backward compatibility with rings that have
   * doors but no flow info yet.
   */
  flow: ringDoorFlowSchema.default('both'),
  /**
   * Which wall the door sits on. Optional because legacy rings carry
   * polygon-only doors; readers should fall back to inferring the side
   * from the polygon bbox (`inferDoorSideFromPolygon`) when absent.
   */
  side: ringDoorSideSchema.optional(),
  /**
   * Door's start position along the wall (meters from the ring origin).
   * For N/S walls the axis is X (ring length); for E/W walls it's Y
   * (ring width). Optional for the same backward-compatibility reason
   * as `side`.
   */
  startMeters: z.number().nonnegative().optional(),
  /** Door's end position along the wall — same axis rules as `startMeters`. */
  endMeters: z.number().nonnegative().optional(),
  /** When false the door is hidden from the planner + AR export. */
  isActive: z.boolean().default(true),
});
export type Door = z.infer<typeof doorSchema>;

/**
 * Normalise alternative side spellings (left/right/top/bottom/N/S/E/W,
 * case-insensitive, with leading/trailing whitespace tolerated) to one
 * of the four canonical cardinals. Returns `null` for unknown inputs
 * so callers can decide whether to fall back to the polygon bbox.
 *
 * Mapping uses the planner's coordinate convention:
 *   - "bottom" / "S" / "south"  → 'south' (minY)
 *   - "top"    / "N" / "north"  → 'north' (maxY)
 *   - "left"   / "W" / "west"   → 'west'  (minX)
 *   - "right"  / "E" / "east"   → 'east'  (maxX)
 */
export function normalizeDoorSide(input: string | null | undefined): RingDoorSide | null {
  if (input == null) return null;
  const s = input.trim().toLowerCase();
  if (s === 'north' || s === 'n' || s === 'top') return 'north';
  if (s === 'south' || s === 's' || s === 'bottom') return 'south';
  if (s === 'east' || s === 'e' || s === 'right') return 'east';
  if (s === 'west' || s === 'w' || s === 'left') return 'west';
  return null;
}

/**
 * Pick the wall a polygon door sits against by snapping its bbox to the
 * closest ring boundary (within 0.10 m). Used to backfill `side` for
 * legacy polygon-only doors.
 */
export function inferDoorSideFromPolygon(
  polygon: ReadonlyArray<Point2DMeters>,
  ringLengthMeters: number,
  ringWidthMeters: number,
): RingDoorSide | null {
  if (polygon.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const EPS = 0.1;
  if (minY <= EPS) return 'south';
  if (maxY >= ringWidthMeters - EPS) return 'north';
  if (minX <= EPS) return 'west';
  if (maxX >= ringLengthMeters - EPS) return 'east';
  return null;
}

/**
 * Compute the door's edge geometry (start/end along its wall) from a
 * polygon footprint. Returns null when the polygon doesn't snap to any
 * ring wall.
 */
export function inferDoorEdgeFromPolygon(
  polygon: ReadonlyArray<Point2DMeters>,
  ringLengthMeters: number,
  ringWidthMeters: number,
): { side: RingDoorSide; startMeters: number; endMeters: number } | null {
  if (polygon.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const side = inferDoorSideFromPolygon(polygon, ringLengthMeters, ringWidthMeters);
  if (!side) return null;
  if (side === 'south' || side === 'north') {
    return { side, startMeters: minX, endMeters: maxX };
  }
  return { side, startMeters: minY, endMeters: maxY };
}

/**
 * Build the rectangular polygon that represents a door given edge
 * geometry. The slab extends `DOOR_SLAB_DEPTH_M` inward from the wall so
 * the polygon has measurable area (the `door-clearance` warning rule
 * needs a non-degenerate polygon).
 *
 * Coordinate convention matches `ring.ts`: bottom-left origin, +X
 * length, +Y width.
 */
export function doorPolygonFromEdge(input: {
  side: RingDoorSide;
  startMeters: number;
  endMeters: number;
  ringLengthMeters: number;
  ringWidthMeters: number;
  slabDepthMeters?: number;
}): Point2DMeters[] {
  const { side, ringLengthMeters, ringWidthMeters } = input;
  const slab = input.slabDepthMeters ?? DOOR_SLAB_DEPTH_M;
  // Clamp + order so a slightly out-of-range value still produces a legal
  // polygon (≥ 3 distinct points). The form layer enforces 0 ≤ start <
  // end ≤ wallLength on save; this clamp is defence in depth.
  const wallLen = side === 'north' || side === 'south' ? ringLengthMeters : ringWidthMeters;
  const lo = Math.max(0, Math.min(input.startMeters, input.endMeters));
  const hi = Math.min(wallLen, Math.max(input.startMeters, input.endMeters));
  // If the caller passed identical or out-of-range values we degenerate
  // to a tiny but valid slab so the polygon stays parseable.
  const start = lo === hi ? Math.max(0, lo - 0.05) : lo;
  const end = lo === hi ? Math.min(wallLen, hi + 0.05) : hi;

  switch (side) {
    case 'south':
      return [
        { x: start, y: 0 },
        { x: end, y: 0 },
        { x: end, y: slab },
        { x: start, y: slab },
      ];
    case 'north':
      return [
        { x: start, y: ringWidthMeters - slab },
        { x: end, y: ringWidthMeters - slab },
        { x: end, y: ringWidthMeters },
        { x: start, y: ringWidthMeters },
      ];
    case 'west':
      return [
        { x: 0, y: start },
        { x: slab, y: start },
        { x: slab, y: end },
        { x: 0, y: end },
      ];
    case 'east':
      return [
        { x: ringLengthMeters - slab, y: start },
        { x: ringLengthMeters, y: start },
        { x: ringLengthMeters, y: end },
        { x: ringLengthMeters - slab, y: end },
      ];
  }
}

/** Physical door opening width derived from edge geometry. */
export function doorOpeningWidth(door: {
  startMeters?: number;
  endMeters?: number;
}): number | null {
  if (door.startMeters == null || door.endMeters == null) return null;
  return Math.max(0, door.endMeters - door.startMeters);
}

// ---------------------------------------------------------------------------
// Ring-level NoGoZone
//
// The Phase 1 NoGoZone (course-side, from Smarter "at") lives in the
// course-design frame and travels with the placement. This one is fixed in
// the ring frame and represents permanent venue obstructions (pillars, AV
// rig, judges' table, etc.). We share the schema shape but disambiguate
// `sourceType` to make logs unambiguous.
// ---------------------------------------------------------------------------

export const ringNoGoZoneSchema = z.object({
  id: z.string(),
  label: z.string().default('Restricted area'),
  sourceType: z.literal('ring'),
  polygonPointsMeters: z.array(point2DMetersSchema).min(3),
  warningMarginMeters: z.number().nonnegative().default(DEFAULT_CLEARANCE_M),
});
export type RingNoGoZone = z.infer<typeof ringNoGoZoneSchema>;

// ---------------------------------------------------------------------------
// Per-ring obstacle inventory
//
// Which obstacles a venue actually owns for this ring, keyed by the
// normalized `ObstacleType` (see `schema/primitives.ts`). Sparse: an absent
// key means the ring has 0 of that type. Tunnels are intentionally split
// by nominal length (Tunnel3m / 4m / 5m / 6m) so the inventory can model
// "we have two 4 m tunnels but no 6 m ones".
//
// The DB-side source of truth is the `ring_obstacle_inventory` table (one
// row per (ring_id, obstacle_type)). We collapse that into a sparse map
// here because every consumer (warning engine, planner UI, admin form)
// wants random-access by type, not a list.
// ---------------------------------------------------------------------------

export const obstacleInventorySchema = z
  .record(obstacleTypeSchema, z.number().int().nonnegative())
  .default({} as Record<ObstacleType, number>);
export type ObstacleInventory = Partial<Record<ObstacleType, number>>;

export function inventoryCount(
  inventory: ObstacleInventory | null | undefined,
  type: ObstacleType,
): number {
  if (!inventory) return 0;
  return inventory[type] ?? 0;
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

export const ringSchema = z.object({
  id: z.string(),
  /** Human label, e.g. "Ring 1". */
  label: z.string().default('Ring'),
  /** Horizontal dimension (along ring frame +X), meters. */
  lengthMeters: z.number().positive(),
  /** Vertical dimension (along ring frame +Y), meters. */
  widthMeters: z.number().positive(),
  /** Doors / exits in ring frame. Phase 6 lets venues define these. */
  doors: z.array(doorSchema).default([]),
  /** Permanent venue-side no-go zones (pillars, judges' table…). */
  noGoZones: z.array(ringNoGoZoneSchema).default([]),
  /** Override the per-ring border clearance threshold. */
  borderClearanceMeters: z.number().nonnegative().default(DEFAULT_CLEARANCE_M),
  /**
   * What the venue physically has on hand for this ring, keyed by
   * `ObstacleType`. Sparse — missing key means 0 of that type. Used by the
   * `obstacle-inventory` warning rule.
   */
  obstacleInventory: obstacleInventorySchema,
});
export type Ring = z.infer<typeof ringSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle representing the ring footprint in ring frame. */
export function ringRect(ring: Ring): Rect {
  return rectFromSize(0, 0, ring.lengthMeters, ring.widthMeters);
}

/** Centre of the ring in ring frame. */
export function ringCenter(ring: Ring): Point2DMeters {
  return { x: ring.lengthMeters / 2, y: ring.widthMeters / 2 };
}

/** Axis-aligned bounds of all doors+zones combined; null if none. */
export function ringObstructionsBounds(ring: Ring): Rect | null {
  const all: Point2DMeters[] = [];
  for (const d of ring.doors) all.push(...d.polygonPointsMeters);
  for (const z of ring.noGoZones) all.push(...z.polygonPointsMeters);
  return boundsOf(all);
}
