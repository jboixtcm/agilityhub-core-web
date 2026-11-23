'use client';

import type { ObstacleType } from '@agilityhub/course-core';

import { CONTACT_FOOTPRINTS } from '../lib/obstacle-plan.js';

/**
 * Top-down symbols in metres, centred on their anchor. The local X axis follows the
 * long dimension of the symbol (the bar for a jump, the plank for a contact).
 * PlannerCanvas places each symbol along the same axis as its 3D counterpart.
 */

export interface ObstacleFootprintM {
  /** Long dimension (along +X, the dog's run-through). */
  readonly lengthM: number;
  /** Short dimension (along +Y). */
  readonly widthM: number;
}

/** Manifest-derived footprints in meters. Tunnels are procedural — handled separately by the polyline renderer. */
export const OBSTACLE_FOOTPRINTS_M: Partial<Record<ObstacleType, ObstacleFootprintM>> = {
  Jump: { lengthM: 1.3, widthM: 0.55 },
  DoubleJump: { lengthM: 1.3, widthM: 0.65 },
  ...CONTACT_FOOTPRINTS,
  Weave: { lengthM: 6.6, widthM: 0.6 },
  LongJump: { lengthM: 1.5, widthM: 1.5 },
  Wall: { lengthM: 2, widthM: 0.35 },
  Tire: { lengthM: 0.77, widthM: 1.25 },
};

interface IconProps {
  readonly type: ObstacleType;
  /** Render selection state (yellow ring). */
  readonly selected?: boolean;
  /** Render warning state (red ring). */
  readonly warn?: boolean;
}

const COLORS = {
  body: 'var(--ah-color-course-obstacle)',
  bodyLight: 'var(--ah-color-course-obstacle-light)',
  bodyDark: 'var(--ah-color-course-obstacle-dark)',
  stroke: 'var(--ah-color-course-obstacle-dark)',
  accent: 'var(--ah-color-course-text)',
  selected: 'var(--ah-color-course-selected)',
  warning: 'var(--ah-color-course-warning)',
};

/**
 * Render the icon for a known obstacle type. Returns `null` for unknown /
 * tunnel types (the caller should fall back to a circle or polyline).
 */
export function ObstacleIcon({ type, selected, warn }: IconProps): React.ReactElement | null {
  const fp = OBSTACLE_FOOTPRINTS_M[type];
  if (!fp) return null;

  const L = fp.lengthM;
  const W = fp.widthM;
  const sw = 0.04; // baseline stroke width in meters

  // Outline ring drawn AROUND the icon for selection / warning state.
  const outline =
    selected || warn ? (
      <rect
        x={-L / 2 - 0.06}
        y={-W / 2 - 0.06}
        width={L + 0.12}
        height={W + 0.12}
        fill="none"
        stroke={warn ? COLORS.warning : COLORS.selected}
        strokeWidth={warn ? 0.12 : 0.08}
        rx={0.08}
        ry={0.08}
      />
    ) : null;

  switch (type) {
    case 'Jump': {
      const upW = 0.1;
      return (
        <g>
          {outline}
          {/* Pole — light bar across the middle */}
          <rect
            x={-L / 2 + upW}
            y={-0.06}
            width={L - 2 * upW}
            height={0.12}
            fill={COLORS.bodyLight}
            stroke={COLORS.stroke}
            strokeWidth={sw / 2}
          />
          {/* Uprights — chunky end caps */}
          <rect
            x={-L / 2}
            y={-W / 2}
            width={upW}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          <rect
            x={L / 2 - upW}
            y={-W / 2}
            width={upW}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
        </g>
      );
    }
    case 'DoubleJump': {
      const upW = 0.1;
      const poleY1 = -W / 2 + W * 0.22;
      const poleY2 = W / 2 - W * 0.22;
      return (
        <g>
          {outline}
          <rect
            x={-L / 2 + upW}
            y={poleY1 - 0.05}
            width={L - 2 * upW}
            height={0.1}
            fill={COLORS.bodyLight}
            stroke={COLORS.stroke}
            strokeWidth={sw / 2}
          />
          <rect
            x={-L / 2 + upW}
            y={poleY2 - 0.05}
            width={L - 2 * upW}
            height={0.1}
            fill={COLORS.bodyLight}
            stroke={COLORS.stroke}
            strokeWidth={sw / 2}
          />
          <rect
            x={-L / 2}
            y={-W / 2}
            width={upW}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          <rect
            x={L / 2 - upW}
            y={-W / 2}
            width={upW}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
        </g>
      );
    }
    case 'DogWalk': {
      // Long plank, three segments (up-ramp / mid-plank / down-ramp).
      const seg = L / 3;
      return (
        <g>
          {outline}
          <rect
            x={-L / 2}
            y={-W / 2}
            width={seg}
            height={W}
            fill={COLORS.bodyDark}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          <rect
            x={-L / 2 + seg}
            y={-W / 2}
            width={seg}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          <rect
            x={L / 2 - seg}
            y={-W / 2}
            width={seg}
            height={W}
            fill={COLORS.bodyDark}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
        </g>
      );
    }
    case 'AFrame': {
      // Trapezoid-like: two ramps meeting in the middle. Diagonals hint at slope.
      return (
        <g>
          {outline}
          <rect
            x={-L / 2}
            y={-W / 2}
            width={L}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          {/* Ridge line down the middle (the apex of the A) */}
          <line
            x1={0}
            y1={-W / 2}
            x2={0}
            y2={W / 2}
            stroke={COLORS.accent}
            strokeWidth={0.06}
            strokeDasharray="0.12,0.08"
          />
          {/* Subtle slope hints */}
          <line
            x1={-L / 2 + 0.1}
            y1={-W / 2 + 0.1}
            x2={-0.1}
            y2={-W / 2 + 0.1}
            stroke={COLORS.bodyLight}
            strokeWidth={0.04}
          />
          <line
            x1={0.1}
            y1={-W / 2 + 0.1}
            x2={L / 2 - 0.1}
            y2={-W / 2 + 0.1}
            stroke={COLORS.bodyLight}
            strokeWidth={0.04}
          />
        </g>
      );
    }
    case 'Seesaw': {
      // Long plank with a clear pivot circle in the centre.
      return (
        <g>
          {outline}
          <rect
            x={-L / 2}
            y={-W / 2}
            width={L}
            height={W}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          {/* Pivot — a darker disc at the centre */}
          <circle
            cx={0}
            cy={0}
            r={Math.min(W * 0.55, 0.22)}
            fill={COLORS.bodyDark}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          <circle cx={0} cy={0} r={Math.min(W * 0.25, 0.08)} fill={COLORS.accent} />
        </g>
      );
    }
    case 'Weave': {
      // 12 poles equally spaced along +X.
      const n = 12;
      const r = Math.min(W * 0.4, 0.12);
      const poles: React.ReactElement[] = [];
      // The distance between the first and last pole is 11 intervals.
      const spacing = L / (n - 1);
      for (let i = 0; i < n; i += 1) {
        const cx = -L / 2 + spacing * i;
        poles.push(
          <circle
            key={i}
            cx={cx}
            cy={0}
            r={r}
            fill={COLORS.body}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />,
        );
      }
      return (
        <g>
          {outline}
          {/* Faint center line so the slalom path reads as a line */}
          <line
            x1={-L / 2}
            y1={0}
            x2={L / 2}
            y2={0}
            stroke={COLORS.body}
            strokeOpacity={0.25}
            strokeWidth={0.04}
            strokeDasharray="0.1,0.08"
          />
          {poles}
        </g>
      );
    }
    case 'LongJump': {
      // 4 parallel low bars, ascending in spacing front-to-back.
      const n = 4;
      const bars: React.ReactElement[] = [];
      for (let i = 0; i < n; i += 1) {
        const cx = -L / 2 + (L / n) * (i + 0.5);
        // Slightly wider bars towards the back.
        const halfH = W / 2 - 0.04;
        bars.push(
          <rect
            key={i}
            x={cx - 0.05}
            y={-halfH}
            width={0.1}
            height={2 * halfH}
            fill={COLORS.bodyLight}
            stroke={COLORS.stroke}
            strokeWidth={sw / 2}
          />,
        );
      }
      return (
        <g>
          {outline}
          {/* Footprint outline so the pit reads as one obstacle */}
          <rect
            x={-L / 2}
            y={-W / 2}
            width={L}
            height={W}
            fill={COLORS.body}
            fillOpacity={0.2}
            stroke={COLORS.body}
            strokeWidth={sw}
            strokeDasharray="0.15,0.1"
          />
          {bars}
        </g>
      );
    }
    case 'Wall': {
      // Solid block with two horizontal brick-courses lines.
      return (
        <g>
          {outline}
          <rect
            x={-L / 2}
            y={-W / 2}
            width={L}
            height={W}
            fill={COLORS.bodyDark}
            stroke={COLORS.stroke}
            strokeWidth={sw}
          />
          <line
            x1={-L / 2}
            y1={-W / 6}
            x2={L / 2}
            y2={-W / 6}
            stroke={COLORS.stroke}
            strokeWidth={sw / 2}
          />
          <line
            x1={-L / 2}
            y1={W / 6}
            x2={L / 2}
            y2={W / 6}
            stroke={COLORS.stroke}
            strokeWidth={sw / 2}
          />
        </g>
      );
    }
    case 'Tire': {
      // Top view of the upright hoop and its two feet (generic-fci tire model).
      return (
        <g>
          {outline}
          <rect x={-L / 2} y={-W / 2} width={0.07} height={W} fill={COLORS.bodyDark} />
          <rect x={L / 2 - 0.07} y={-W / 2} width={0.07} height={W} fill={COLORS.bodyDark} />
          <rect x={-0.35} y={-0.05} width={0.7} height={0.1} rx={0.05}
            fill={COLORS.body} stroke={COLORS.stroke} strokeWidth={sw} />
        </g>
      );
    }
    default:
      return null;
  }
}
