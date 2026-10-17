'use client';

/**
 * Top-down SVG diagram of a ring showing where each marker should be
 * mounted, plus any doors the venue admin has already drawn. Used by
 * `/markers` so installers can see the marker layout at a glance
 * instead of reading raw (x, y) pairs from the table.
 *
 * Why a dedicated component instead of reusing `PlannerCanvas`:
 *   - `PlannerCanvas` is the *course* renderer — it needs a parsed
 *     `CourseData` + `CoursePlacement`, neither of which exist on
 *     the markers page.
 *   - The marker diagram is informational only: no selection, no
 *     warnings, no obstacle icons. Keeping it small + read-only
 *     means we can render dozens of them on the same page (one per
 *     ring) without paying the planner's render cost.
 *
 * Coordinate convention matches `PlannerCanvas`:
 *   - Origin at the SW corner of the ring; +X east, +Y north.
 *   - SVG outer transform flips Y so +Y is visually up.
 *   - Every text element wraps in a counter-`scale(1 -1)` group so
 *     labels read upright.
 *
 * Markers are drawn at their Core coordinates, unchanged: the recovered
 * Supabase A–F reading-order heuristic moved authoritative markers away
 * from where `listMarkers`, the renderers and the AR export put them
 * (E9-W02 round 2, review #6).
 */

import { formatMeters } from '@agilityhub/course-core';

import type { PlannerRing } from '../lib/storage/types.js';

const COLORS = {
  ring: 'var(--ah-color-course-ring)',
  ringFill: 'var(--ah-color-course-floor)',
  grid: 'var(--ah-color-course-grid)',
  marker: 'var(--ah-color-course-marker)',
  markerInactive: 'var(--ah-color-course-marker-muted)',
  markerStroke: 'var(--ah-color-course-obstacle-dark)',
  markerLabel: 'var(--ah-color-course-obstacle-dark)',
  door: 'var(--ah-color-course-door)',
  doorStroke: 'var(--ah-color-course-door-accent)',
  doorLabel: 'var(--ah-color-course-text)',
  // The origin and the ring sides are text: the course text colour, never the ring's border
  // colour (1.4:1 on the floor; E11-W02, INC-60).
  axis: 'var(--ah-color-course-text)',
};

export interface RingMarkerDiagramProps {
  readonly ring: PlannerRing;
  readonly ariaLabel: string;
  /** The club's locale for the ring dimensions («22,5 m» in `ca`, R-16-17). */
  readonly locale: string;
  /** Optional className for the wrapping `<div>`. */
  readonly className?: string;
}

export function RingMarkerDiagram({ ring, ariaLabel, locale, className }: RingMarkerDiagramProps) {
  const W = ring.length_m;
  const H = ring.width_m;
  // Outer margin in metres — wide enough to fit a marker label sitting
  // just outside the ring rectangle without clipping.
  const margin = 1.6;
  const viewMinX = -margin;
  const viewMinY = -margin;
  const viewW = W + 2 * margin;
  const viewH = H + 2 * margin;

  // Aspect ratio of the SVG content. We pass it through to the
  // wrapping div as an inline `aspect-ratio` style so the parent can
  // size by width alone and the diagram fills it without distortion.
  const aspect = viewW / viewH;

  const markers = ring.markers;
  const activeMarkers = markers.filter((m) => m.is_active);
  const inactiveMarkers = markers.filter((m) => !m.is_active);
  const activeDoors = ring.doors.filter((d) => d.is_active ?? true);

  // Grid lines every 5 m, but only when the ring is large enough that
  // the marks actually help. Small rings (≤6 m on a side) get no grid
  // so the markers stay legible.
  const xGrid = W >= 6 ? rangeStrictlyInside(W, 5) : [];
  const yGrid = H >= 6 ? rangeStrictlyInside(H, 5) : [];

  return (
    <div
      className={className}
      style={{ aspectRatio: `${aspect}`, maxHeight: '360px' }}
    >
      <svg
        viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        role="img"
        aria-label={ariaLabel}
      >
        <g transform={`scale(1 -1) translate(0 ${-H})`}>
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill={COLORS.ringFill}
            stroke={COLORS.ring}
            strokeWidth={0.06}
            rx={0.1}
          />

          {xGrid.map((x) => (
            <line
              key={`gx-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={H}
              stroke={COLORS.grid}
              strokeWidth={0.02}
            />
          ))}
          {yGrid.map((y) => (
            <line
              key={`gy-${y}`}
              x1={0}
              y1={y}
              x2={W}
              y2={y}
              stroke={COLORS.grid}
              strokeWidth={0.02}
            />
          ))}

          {/* Doors first so markers paint over them if they happen to
              overlap (markers near the wall are intentionally close to
              door edges sometimes). */}
          {activeDoors.map((d) => {
            if (d.polygon_points_m.length === 0) return null;
            const cx =
              d.polygon_points_m.reduce((s, p) => s + p.x, 0) / d.polygon_points_m.length;
            const cy =
              d.polygon_points_m.reduce((s, p) => s + p.y, 0) / d.polygon_points_m.length;
            const points = d.polygon_points_m.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <g key={d.id}>
                <polygon
                  points={points}
                  fill={COLORS.door}
                  fillOpacity={0.55}
                  stroke={COLORS.doorStroke}
                  strokeWidth={0.04}
                />
                <g transform={`translate(${cx} ${cy}) scale(1 -1)`}>
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={0.45}
                    fill={COLORS.doorLabel}
                    stroke={COLORS.markerStroke}
                    strokeWidth={0.04}
                    paintOrder="stroke"
                  >
                    {d.label}
                  </text>
                </g>
              </g>
            );
          })}

          {inactiveMarkers.map((m) => (
            <g key={m.id} opacity={0.45}>
              <circle
                cx={m.x_m}
                cy={m.y_m}
                r={0.45}
                fill="none"
                stroke={COLORS.markerInactive}
                strokeWidth={0.08}
                strokeDasharray="0.18 0.18"
              />
              <g transform={`translate(${m.x_m} ${m.y_m}) scale(1 -1)`}>
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={0.55}
                  fontWeight="bold"
                  fill={COLORS.markerInactive}
                >
                  {m.label}
                </text>
              </g>
            </g>
          ))}

          {activeMarkers.map((m) => (
            <g key={m.id}>
              <circle
                cx={m.x_m}
                cy={m.y_m}
                r={0.45}
                fill={COLORS.marker}
                stroke={COLORS.markerStroke}
                strokeWidth={0.05}
              />
              <g transform={`translate(${m.x_m} ${m.y_m}) scale(1 -1)`}>
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={0.55}
                  fontWeight="bold"
                  fill={COLORS.markerLabel}
                >
                  {m.label}
                </text>
              </g>
            </g>
          ))}

          {/* Origin marker — small "0,0" hint just outside the SW corner. */}
          <g transform={`translate(${-0.15} ${-0.15}) scale(1 -1)`}>
            <text
              x={0}
              y={0}
              textAnchor="end"
              dominantBaseline="hanging"
              fontSize={0.4}
              fill={COLORS.axis}
            >
              0,0
            </text>
          </g>

          {/* Length label along the bottom edge, width label along
              the left edge. Both counter-flipped so the text reads
              upright. */}
          <g transform={`translate(${W / 2} ${-0.9}) scale(1 -1)`}>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="hanging"
              fontSize={0.42}
              fill={COLORS.axis}
            >
              {dimension(W, locale)}
            </text>
          </g>
          <g transform={`translate(${-0.9} ${H / 2}) scale(1 -1) rotate(-90)`}>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="hanging"
              fontSize={0.42}
              fill={COLORS.axis}
            >
              {dimension(H, locale)}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}

/** A ring side in metres, in the reader's locale, without padding whole metres («40 m»). */
function dimension(meters: number, locale: string): string {
  return formatMeters(meters, { locale, precision: Number.isInteger(meters) ? 0 : 2 });
}

/**
 * Return every integer multiple of `step` strictly between 0 and
 * `total`. e.g. `rangeStrictlyInside(20, 5) === [5, 10, 15]`. We use
 * "strictly between" so grid lines don't overdraw the ring border.
 */
function rangeStrictlyInside(total: number, step: number): number[] {
  const out: number[] = [];
  for (let v = step; v < total; v += step) out.push(v);
  return out;
}
