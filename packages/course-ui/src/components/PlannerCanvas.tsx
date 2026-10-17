'use client';

import {
  footprintRadiusMeters,
  normalizeDoorSide,
  placeControlPointsInRing,
  placeCoursePoint,
  placeObstacleInRing,
  placedObstacleHeadingVector,
  type CourseData,
  type CoursePlacement,
  type Warning,
} from '@agilityhub/course-core';
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import type { PlannerRing } from '../lib/planner-state.js';

import { ObstacleIcon, OBSTACLE_FOOTPRINTS_M } from './ObstacleIcon.js';

interface Props {
  ring: PlannerRing;
  course: CourseData;
  placement: CoursePlacement;
  warnings: readonly Warning[];
  selectedObstacleId: string | null;
  labels: {
    readonly ariaLabel: string;
    readonly entry: string;
    readonly exit: string;
  };
  onSelectObstacle: (id: string | null) => void;
  /**
   * D18's placement editor (T-16-04): dragging the plan moves the course by the dragged distance
   * in the ring's frame (metres, +Y up), one call per pointer move. The keyboard path is
   * `PlacementControls`. Absent = a read-only viewer.
   */
  onDragPlacement?: (dxMeters: number, dyMeters: number) => void;
}

/** Pointer travel (px) before a press on the plan counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;

const COLORS = {
  ring: 'var(--ah-color-course-ring)',
  ringFill: 'var(--ah-color-course-floor)',
  marker: 'var(--ah-color-course-marker)',
  door: 'var(--ah-color-course-door)',
  doorStroke: 'var(--ah-color-course-door-accent)',
  doorArrow: 'var(--ah-color-course-obstacle)',
  doorLabel: 'var(--ah-color-course-text)',
  ringNoGo: 'var(--ah-color-course-no-go)',
  courseNoGo: 'var(--ah-color-course-no-go)',
  obstacleStroke: 'var(--ah-color-course-obstacle-dark)',
  obstacleFill: 'var(--ah-color-course-obstacle)',
  obstacleSelected: 'var(--ah-color-course-selected)',
  warning: 'var(--ah-color-course-warning)',
  number: 'var(--ah-color-course-text)',
};

/**
 * Geometry helper: given a door polygon and the enclosing ring, figure out
 * which wall the door sits on, return the inward normal and the "outside"
 * direction (for label placement), plus the door's centroid and its
 * parallel-to-wall width.
 *
 * Doors are expected to be thin axis-aligned rectangles flush with a wall
 * (see mock-store seed). We tolerate small float drift with `EPS_M`.
 */
const EPS_M = 0.05;
interface DoorAnchor {
  cx: number;
  cy: number;
  inwardNx: number;
  inwardNy: number;
  outwardNx: number;
  outwardNy: number;
  parallelLengthM: number;
}
function anchorDoor(
  points: readonly { x: number; y: number }[],
  ringLenM: number,
  ringWidM: number,
): DoorAnchor {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Bottom wall (y == 0)
  if (minY <= EPS_M) {
    return {
      cx,
      cy,
      inwardNx: 0,
      inwardNy: 1,
      outwardNx: 0,
      outwardNy: -1,
      parallelLengthM: maxX - minX,
    };
  }
  // Top wall (y == ringWidM)
  if (maxY >= ringWidM - EPS_M) {
    return {
      cx,
      cy,
      inwardNx: 0,
      inwardNy: -1,
      outwardNx: 0,
      outwardNy: 1,
      parallelLengthM: maxX - minX,
    };
  }
  // Left wall (x == 0)
  if (minX <= EPS_M) {
    return {
      cx,
      cy,
      inwardNx: 1,
      inwardNy: 0,
      outwardNx: -1,
      outwardNy: 0,
      parallelLengthM: maxY - minY,
    };
  }
  // Right wall (default — x == ringLenM)
  return {
    cx,
    cy,
    inwardNx: -1,
    inwardNy: 0,
    outwardNx: 1,
    outwardNy: 0,
    parallelLengthM: maxY - minY,
  };
}

/**
 * Phase 12c — same edge-or-polygon fallback as Planner3D. When the editor
 * has written `side` + `start_m` + `end_m`, derive the anchor directly so
 * the arrow is deterministic; otherwise use the bbox-from-polygon path so
 * legacy rows still render correctly.
 */
function anchorDoorOrEdge(
  door: {
    polygon_points_m: readonly { x: number; y: number }[];
    side?: string | null;
    start_m?: number | null;
    end_m?: number | null;
  },
  ringLenM: number,
  ringWidM: number,
): DoorAnchor {
  if (door.side && door.start_m != null && door.end_m != null && door.end_m > door.start_m) {
    const side = normalizeDoorSide(door.side);
    if (!side) return anchorDoor(door.polygon_points_m, ringLenM, ringWidM);
    const mid = (door.start_m + door.end_m) / 2;
    const len = door.end_m - door.start_m;
    switch (side) {
      case 'south':
        return {
          cx: mid,
          cy: 0,
          inwardNx: 0,
          inwardNy: 1,
          outwardNx: 0,
          outwardNy: -1,
          parallelLengthM: len,
        };
      case 'north':
        return {
          cx: mid,
          cy: ringWidM,
          inwardNx: 0,
          inwardNy: -1,
          outwardNx: 0,
          outwardNy: 1,
          parallelLengthM: len,
        };
      case 'west':
        return {
          cx: 0,
          cy: mid,
          inwardNx: 1,
          inwardNy: 0,
          outwardNx: -1,
          outwardNy: 0,
          parallelLengthM: len,
        };
      case 'east':
        return {
          cx: ringLenM,
          cy: mid,
          inwardNx: -1,
          inwardNy: 0,
          outwardNx: 1,
          outwardNy: 0,
          parallelLengthM: len,
        };
    }
  }
  return anchorDoor(door.polygon_points_m, ringLenM, ringWidM);
}

/** Build a triangle polygon for an arrowhead at `tip` pointing in `dir`. */
function arrowheadPoints(
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  lengthM = 0.45,
  halfBaseM = 0.28,
): string {
  // perp(dir) rotated 90° CCW = (-dy, dx)
  const baseCx = tipX - dirX * lengthM;
  const baseCy = tipY - dirY * lengthM;
  const px = -dirY * halfBaseM;
  const py = dirX * halfBaseM;
  return [`${tipX},${tipY}`, `${baseCx + px},${baseCy + py}`, `${baseCx - px},${baseCy - py}`].join(
    ' ',
  );
}

/**
 * Single SVG. Coordinates are in **ring frame** (bottom-left origin,
 * +Y up — D-011). We flip Y to map to SVG's top-down coords via the SVG
 * transform `scale(1,-1) translate(0,-height)`. That way every internal
 * calculation stays in the "real-world" frame the warning engine uses.
 */
export function PlannerCanvas({
  ring,
  course,
  placement,
  warnings,
  selectedObstacleId,
  labels,
  onSelectObstacle,
  onDragPlacement,
}: Props) {
  const margin = 1.5; // m of breathing room around the ring rect
  const ringW = ring.length_m;
  const ringH = ring.width_m;
  const drag = useRef<{ x: number; y: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);
  /** The press now reaching the plan started on an obstacle (its handler runs first). */
  const pressedObstacle = useRef(false);

  // Obstacles + their footprints in ring frame. placeObstacleInRing /
  // placeControlPointsInRing internally route through placeCoursePoint,
  // which honours placement.flipX/flipY.
  const placed = useMemo(
    () =>
      course.obstacles.map((o) => {
        const anchor = placeObstacleInRing(o, placement, course);
        const cps = placeControlPointsInRing(o.controlPointsMeters, placement, course);
        return { o, anchor, cps };
      }),
    [course, placement],
  );

  // Course no-go zones in ring frame (flip-aware).
  const courseZones = useMemo(
    () =>
      course.noGoZones.map((z) => ({
        z,
        points: z.polygonPointsMeters.map((p) => placeCoursePoint(p, placement, course)),
      })),
    [course, placement],
  );

  // Numbers in ring frame (flip-aware).
  const placedNumbers = useMemo(
    () =>
      course.numbers.map((n) => ({
        n,
        p: placeCoursePoint({ x: n.xMeters, y: n.yMeters }, placement, course),
      })),
    [course, placement],
  );

  const obstaclesWithWarnings = useMemo(() => {
    const ids = new Set<string>();
    for (const w of warnings) if (w.obstacleSourceId) ids.add(w.obstacleSourceId);
    return ids;
  }, [warnings]);

  // SVG viewport spans the larger of ring + course bounds, plus a margin.
  const viewMinX = -margin;
  const viewMinY = -margin;
  const viewW = ringW + 2 * margin;
  const viewH = ringH + 2 * margin;

  // The SVG keeps its aspect ratio (`xMidYMid meet`), so one screen pixel is the larger of the
  // two axis ratios in metres. Screen Y grows downwards; the ring's +Y is up.
  // Only the pointer that pressed first drags: a second finger neither restarts nor moves it
  // (the same pointer pressing again restarts, in case its release happened off the plan).
  // The plan holds the pointer's capture while it drags, so the release (or the loss of the
  // capture) always reaches it, even off the plan, and a dead press never blocks later drags.
  function capture(element: SVGSVGElement, pointerId: number) {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // No pointer capture (a test DOM, an old browser): the drag still follows the moves.
    }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const onObstacle = pressedObstacle.current;
    pressedObstacle.current = false;
    if (onDragPlacement === undefined || event.button !== 0) return;
    if (drag.current !== null && drag.current.pointerId !== event.pointerId) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
    suppressClick.current = false;
    // Captured at once, except on an obstacle: a captured release sends its click to the plan
    // (Pointer Events 3), and the obstacle would never be selected. That press is captured as
    // soon as it becomes a drag (`onPointerMove`); until then the obstacle's own release
    // reaches the plan by bubbling.
    if (!onObstacle) capture(event.currentTarget, event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (onDragPlacement === undefined || current === null) return;
    if (event.pointerId !== current.pointerId) return;
    // No button pressed: the release happened where the plan could not hear it. The drag is
    // over, and hovering back over the plan never moves the course.
    if (event.buttons === 0) {
      drag.current = null;
      suppressClick.current = false;
      return;
    }
    const dxPx = event.clientX - current.x;
    const dyPx = event.clientY - current.y;
    if (!current.moved && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD_PX) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (!current.moved) capture(event.currentTarget, current.pointerId);
    const metresPerPx = Math.max(viewW / rect.width, viewH / rect.height);
    drag.current = { ...current, x: event.clientX, y: event.clientY, moved: true };
    onDragPlacement(dxPx * metresPerPx, -dyPx * metresPerPx);
  }

  // A release after a drag swallows the click it produces; a cancel (the browser took the
  // gesture over) produces none, so it ends the drag without swallowing the next real click.
  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
  }

  function onPointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = false;
    drag.current = null;
  }

  // The capture went away without a release reaching the plan (the browser took it, the pointer
  // vanished): the drag ends. After a normal release `drag.current` is already empty, so the
  // click that release produces is still swallowed.
  function onLostPointerCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = false;
    drag.current = null;
  }

  return (
    <div className="w-full aspect-square max-h-[80vh] bg-surface-2 border border-border rounded-2xl overflow-hidden">
      <svg
        viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        role="img"
        aria-label={labels.ariaLabel}
        style={onDragPlacement === undefined ? undefined : { cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        onClickCapture={(event) => {
          // A drag that ends over an obstacle is not a click on it.
          if (suppressClick.current) {
            suppressClick.current = false;
            event.stopPropagation();
          }
        }}
      >
        {/* Flip Y so +Y is visually up. Everything inside this <g> works in
            ring frame. */}
        <g transform={`scale(1 -1) translate(0 ${-ringH})`}>
          {/* Ring rect */}
          <rect
            x={0}
            y={0}
            width={ringW}
            height={ringH}
            fill={COLORS.ringFill}
            stroke={COLORS.ring}
            strokeWidth={0.06}
          />

          {/* Doors. Drawn with high contrast + directional arrow(s) so it's
              obvious where the ring is entered/exited and which way pedestrian
              traffic flows. `flow` defaults to 'both' (two-way) when absent. */}
          {ring.doors
            .filter((d) => d.is_active !== false)
            .map((d) => {
            const flow = d.flow ?? 'both';
            const a = anchorDoorOrEdge(d, ring.length_m, ring.width_m);

            // Arrow shaft: half-length scales with door width but is capped
            // so wide doors don't get giant arrows.
            const armM = Math.min(1.2, Math.max(0.6, a.parallelLengthM * 0.35));

            // Direction *along* the wall (perpendicular to the inward normal).
            // Used to space the two one-way arrows of a two-way door so they
            // sit side-by-side, like real-life "in" / "out" lane markings.
            const parallelX = -a.inwardNy;
            const parallelY = a.inwardNx;
            const lateralOffsetM =
              flow === 'both' ? Math.min(0.9, Math.max(0.4, a.parallelLengthM * 0.22)) : 0;

            // One-way doors get a single centered arrow; two-way doors get
            // two parallel arrows pointing opposite directions.
            const arrows: { lateral: number; dir: 'in' | 'out' }[] =
              flow === 'in'
                ? [{ lateral: 0, dir: 'in' }]
                : flow === 'out'
                  ? [{ lateral: 0, dir: 'out' }]
                  : [
                      { lateral: -lateralOffsetM, dir: 'in' },
                      { lateral: lateralOffsetM, dir: 'out' },
                    ];

            // Label sits just past the arrow tip, outside the wall, so it
            // never overlaps the shaft regardless of door width.
            const labelOffset = armM + 0.4;
            const labelX = a.cx + a.outwardNx * labelOffset;
            const labelY = a.cy + a.outwardNy * labelOffset;

            return (
              <g key={d.id}>
                {/* Door slab */}
                <polygon
                  points={d.polygon_points_m.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={COLORS.door}
                  fillOpacity={0.95}
                  stroke={COLORS.doorStroke}
                  strokeWidth={0.08}
                />

                {/* Soft glow halo around the door to draw the eye */}
                <polygon
                  points={d.polygon_points_m.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={COLORS.doorStroke}
                  strokeWidth={0.25}
                  strokeOpacity={0.25}
                />

                {/* Flow arrows — one per direction. For 'both' we draw two
                    parallel arrows offset along the wall (in on one side,
                    out on the other). */}
                {arrows.map((arrow, i) => {
                  const baseX = a.cx + parallelX * arrow.lateral;
                  const baseY = a.cy + parallelY * arrow.lateral;
                  const tipNx = arrow.dir === 'in' ? a.inwardNx : a.outwardNx;
                  const tipNy = arrow.dir === 'in' ? a.inwardNy : a.outwardNy;
                  const tipX = baseX + tipNx * armM;
                  const tipY = baseY + tipNy * armM;
                  const tailX = baseX - tipNx * armM;
                  const tailY = baseY - tipNy * armM;
                  return (
                    <g key={i}>
                      <line
                        x1={tailX}
                        y1={tailY}
                        x2={tipX}
                        y2={tipY}
                        stroke={COLORS.doorArrow}
                        strokeWidth={0.13}
                        strokeLinecap="round"
                      />
                      <polygon
                        points={arrowheadPoints(tipX, tipY, tipNx, tipNy)}
                        fill={COLORS.doorArrow}
                      />
                    </g>
                  );
                })}

                {/* Label outside the ring — counter-flip so text reads upright.
                    Flow direction is conveyed by the drawn arrows above;
                    the label just names the door and (for one-way) annotates
                    the direction in plain words. */}
                <g transform={`translate(${labelX} ${labelY}) scale(1 -1)`}>
                  <text
                    x={0}
                    y={0}
                    fontSize={0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={COLORS.doorLabel}
                    stroke={COLORS.obstacleStroke}
                    strokeWidth={0.04}
                    paintOrder="stroke"
                  >
                    {d.label}
                    {flow === 'in'
                      ? ` (${labels.entry})`
                      : flow === 'out'
                        ? ` (${labels.exit})`
                        : ''}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Ring no-go zones */}
          {ring.no_go_zones.map((z) => (
            <polygon
              key={z.id}
              points={z.polygon_points_m.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={COLORS.ringNoGo}
              fillOpacity={0.2}
              stroke={COLORS.ringNoGo}
              strokeWidth={0.05}
            />
          ))}

          {/* Markers (printable, fixed) */}
          {ring.markers.map((m) => (
            <g key={m.id}>
              <circle
                cx={m.x_m}
                cy={m.y_m}
                r={0.4}
                fill={COLORS.marker}
                stroke={COLORS.obstacleStroke}
                strokeWidth={0.03}
              />
            </g>
          ))}

          {/* Course-side no-go zones (transformed by placement) */}
          {courseZones.map(({ z, points }) => (
            <polygon
              key={z.id}
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={COLORS.courseNoGo}
              fillOpacity={0.25}
              stroke={COLORS.courseNoGo}
              strokeWidth={0.05}
              strokeDasharray="0.2,0.15"
            />
          ))}

          {/* Tunnel polylines */}
          {placed.map(({ o, cps }) =>
            cps && cps.length > 1 ? (
              <polyline
                key={`tunnel-${o.id}`}
                points={cps.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={COLORS.door}
                strokeWidth={Math.max(0.2, footprintRadiusMeters(o))}
                strokeLinecap="round"
                strokeOpacity={0.85}
              />
            ) : null,
          )}

          {/* Obstacle anchors (non-tunnel). For known types we draw a
              recognisable top-down silhouette (see ObstacleIcon); types that
              don't have an icon yet fall back to the legacy orange circle. */}
          {placed.map(({ o, anchor }) => {
            if (!anchor || (o.controlPointsMeters && o.controlPointsMeters.length > 0)) return null;
            const isSelected = selectedObstacleId === o.sourceId;
            const isWarn = obstaclesWithWarnings.has(o.sourceId);

            // Visual rotation angle for this obstacle, in the SVG's already-
            // Y-flipped frame. The heading vector comes from course-core's
            // `placedObstacleHeadingVector` (flip → Smarter Y-down → rotate),
            // the same function persistence and Planner3D use, then atan2
            // gives a single rotation we can pass to SVG `rotate(...)`.
            //
            // The angle is then NEGATED before being handed to SVG `rotate`
            // because the outer <g scale(1 -1) ...> reverses orientation:
            // a positive CCW math-angle on a vector corresponds to a
            // negative-degree SVG rotation under that flip.
            const { x: rx, y: ry } = placedObstacleHeadingVector(o.rotationDegrees, placement);
            const visualAngleDeg = (Math.atan2(ry, rx) * 180) / Math.PI;

            const hasIcon = OBSTACLE_FOOTPRINTS_M[o.obstacleType] != null;
            const r = footprintRadiusMeters(o);

            return (
              <g
                key={o.id}
                onClick={() => { onSelectObstacle(isSelected ? null : o.sourceId); }}
                onPointerDown={() => { pressedObstacle.current = true; }}
                style={{ cursor: 'pointer' }}
              >
                {hasIcon ? (
                  // Place + rotate the icon. SVG `rotate(deg)` is clockwise;
                  // we use -visualAngleDeg so the icon visually rotates in
                  // the same direction as the heading vector under the outer
                  // scale(1,-1) flip.
                  <g transform={`translate(${anchor.x} ${anchor.y}) rotate(${-visualAngleDeg})`}>
                    <ObstacleIcon type={o.obstacleType} selected={isSelected} warn={isWarn} />
                  </g>
                ) : (
                  <>
                    <circle
                      cx={anchor.x}
                      cy={anchor.y}
                      r={r}
                      fill={isSelected ? COLORS.obstacleSelected : COLORS.obstacleFill}
                      stroke={isWarn ? COLORS.warning : COLORS.obstacleStroke}
                      strokeWidth={isWarn ? 0.12 : 0.06}
                      fillOpacity={0.85}
                    />
                    {/* Heading tick (only for fallback circle obstacles —
                        the icons encode their own forward direction). */}
                    {o.rotationDegrees != null && (
                      <line
                        x1={anchor.x}
                        y1={anchor.y}
                        x2={anchor.x + r * rx}
                        y2={anchor.y + r * ry}
                        stroke={COLORS.obstacleStroke}
                        strokeWidth={0.05}
                      />
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Number labels — drawn last so they're on top.
              We render labels with a separate Y-flip so the text reads
              upright (otherwise the outer scale(1,-1) would mirror them). */}
          {placedNumbers.map(({ n, p }) => (
            <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(1 -1)`}>
              <text
                x={0}
                y={0}
                fontSize={0.6}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={COLORS.number}
                stroke={COLORS.obstacleStroke}
                strokeWidth={0.04}
                paintOrder="stroke"
              >
                {n.text}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
