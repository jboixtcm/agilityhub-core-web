import type { ObstacleType } from '../schema/primitives.js';

/**
 * Source-code → normalized obstacle definition.
 *
 * Derived from `docs/prompts/03_smarter_txt_importer_prompt.md` and verified
 * against every fixture under `fixtures/smarter/`. The detailed prompt also
 * lists secondary codes (`j`, `dj`, `t3`…) that may appear in older exports —
 * those alias to the same definitions.
 *
 * `colorKey` matches the keys used inside Smarter color schemes
 * (`fixtures/colors/sad-colors-*.txt`), so a renderer can look up palette
 * colors directly.
 *
 * `nominalLengthMeters` is set only when the source code implies a fixed
 * physical length (tunnels). The actual curved length comes from the
 * control points and is computed in Phase 2.
 */
export interface ObstacleDefinition {
  readonly obstacleType: ObstacleType;
  readonly colorKey: string;
  readonly nominalLengthMeters: number | null;
  /** True if Smarter stores this group as a polyline / Bezier (cps[]). */
  readonly hasControlPoints: boolean;
}

export const OBSTACLE_MAP: Readonly<Record<string, ObstacleDefinition>> = {
  // Jumps
  jb: { obstacleType: 'Jump', colorKey: 'j', nominalLengthMeters: null, hasControlPoints: false },
  j: { obstacleType: 'Jump', colorKey: 'j', nominalLengthMeters: null, hasControlPoints: false },
  // These source groups have geometry that the normalized renderer cannot
  // represent truthfully yet. Keep them as known physical objects, preserve
  // their exact sourceCode, and use Unknown rather than drawing the wrong
  // equipment (for example, wings on a wingless jump).
  jw: {
    obstacleType: 'Unknown',
    colorKey: 'jw',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  djb: {
    obstacleType: 'DoubleJump',
    colorKey: 'dj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  dj: {
    obstacleType: 'DoubleJump',
    colorKey: 'dj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  tju: {
    obstacleType: 'Unknown',
    colorKey: 'tju',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },

  // Tunnels
  t2: { obstacleType: 'Tunnel3m', colorKey: 't3', nominalLengthMeters: 2, hasControlPoints: true },
  t3s: {
    obstacleType: 'Tunnel3m',
    colorKey: 't3',
    nominalLengthMeters: 3,
    hasControlPoints: true,
  },
  t3: { obstacleType: 'Tunnel3m', colorKey: 't3', nominalLengthMeters: 3, hasControlPoints: true },
  t4s: {
    obstacleType: 'Tunnel4m',
    colorKey: 't4',
    nominalLengthMeters: 4,
    hasControlPoints: true,
  },
  t4: { obstacleType: 'Tunnel4m', colorKey: 't4', nominalLengthMeters: 4, hasControlPoints: true },
  t5s: {
    obstacleType: 'Tunnel5m',
    colorKey: 't5',
    nominalLengthMeters: 5,
    hasControlPoints: true,
  },
  t5: { obstacleType: 'Tunnel5m', colorKey: 't5', nominalLengthMeters: 5, hasControlPoints: true },
  t6s: {
    obstacleType: 'Tunnel6m',
    colorKey: 't6',
    nominalLengthMeters: 6,
    hasControlPoints: true,
  },
  t6: { obstacleType: 'Tunnel6m', colorKey: 't6', nominalLengthMeters: 6, hasControlPoints: true },

  // Contact equipment
  dw: {
    obstacleType: 'DogWalk',
    colorKey: 'dw',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  af: {
    obstacleType: 'AFrame',
    colorKey: 'af',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  ss: {
    obstacleType: 'Seesaw',
    colorKey: 'ss',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },

  // Other
  w12: {
    obstacleType: 'Weave',
    colorKey: 'w',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  lj4: {
    obstacleType: 'LongJump',
    colorKey: 'lj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  lj1: {
    obstacleType: 'Unknown',
    colorKey: 'lj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  lj2: {
    obstacleType: 'Unknown',
    colorKey: 'lj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  lj3: {
    obstacleType: 'Unknown',
    colorKey: 'lj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  lj5: {
    obstacleType: 'Unknown',
    colorKey: 'lj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  lj: {
    obstacleType: 'LongJump',
    colorKey: 'lj',
    nominalLengthMeters: null,
    hasControlPoints: false,
  },
  wb: { obstacleType: 'Wall', colorKey: 'wa', nominalLengthMeters: null, hasControlPoints: false },
  w: { obstacleType: 'Wall', colorKey: 'wa', nominalLengthMeters: null, hasControlPoints: false },
  tib: { obstacleType: 'Tire', colorKey: 'ti', nominalLengthMeters: null, hasControlPoints: false },
  ti: { obstacleType: 'Tire', colorKey: 'ti', nominalLengthMeters: null, hasControlPoints: false },
};

/**
 * Source-code group keys that are NOT obstacles. The parser handles these
 * separately so they're not accidentally added to `course.obstacles`.
 */
export const NON_OBSTACLE_GROUPS = new Set<string>([
  'at', // → NoGoZone
  'te', // free text annotation
  'SFLCP', // start/finish line control points
  'LCP', // route-line control points
  'ar', // route arrow annotation
]);

export function isKnownObstacleCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(OBSTACLE_MAP, code);
}

export function lookupObstacle(code: string): ObstacleDefinition | null {
  return OBSTACLE_MAP[code] ?? null;
}
