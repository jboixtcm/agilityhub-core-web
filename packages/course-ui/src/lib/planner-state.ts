/**
 * Pure reducer for the planner's UI state — no React, no DOM, no Supabase
 * imports. Lets vitest run the state machine without spinning up RTL or
 * happy-dom.
 *
 * The reducer owns:
 *   - which step the judge is on (upload → place → saved);
 *   - the parsed CourseData;
 *   - the selected venue + ring;
 *   - the current CoursePlacement;
 *   - the optional selected unit system (display only);
 *   - the optional selected obstacle id (when the judge clicks a warning).
 *
 * It does NOT run the warning engine — that's a derived computation done
 * by the UI / by `computeWarnings()` below. Keeping `runWarnings` out of
 * the reducer means the reducer stays a pure data transform.
 */
import {
  centerCourseInRing,
  type CourseData,
  type CoursePlacement,
  IDENTITY_PLACEMENT,
  inferDoorEdgeFromPolygon,
  normalizeDoorSide,
  type ObstacleInventory,
  obstacleTypeSchema,
  type ObstacleType,
  runWarnings,
  type Ring,
  type UnitSystem,
  type Warning,
} from '@agilityhub/course-core';

import type { PlannerRing, PlannerVenue } from './storage/types.js';

// Re-export so UI components can pull `PlannerRing` from the same module
// they pull the reducer types from. Keeps imports tidy.
export type { PlannerRing } from './storage/types.js';

export type PlannerPhase = 'upload' | 'place' | 'saved';

export interface PlannerState {
  readonly phase: PlannerPhase;

  // Upload phase outputs
  readonly course: CourseData | null;
  readonly courseDbId: string | null;
  readonly courseFilename: string | null;

  // Place phase inputs
  readonly venue: PlannerVenue | null;
  readonly ring: PlannerRing | null;
  readonly placement: CoursePlacement;
  readonly displayUnits: UnitSystem;
  readonly selectedObstacleId: string | null;

  // Save phase outputs
  readonly savedPlacementId: string | null;
  readonly savedBuildSessionId: string | null;
}

export const INITIAL_STATE: PlannerState = {
  phase: 'upload',
  course: null,
  courseDbId: null,
  courseFilename: null,
  venue: null,
  ring: null,
  placement: IDENTITY_PLACEMENT,
  displayUnits: 'M',
  selectedObstacleId: null,
  savedPlacementId: null,
  savedBuildSessionId: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type PlannerAction =
  | { type: 'SET_COURSE'; course: CourseData; courseDbId: string; filename: string }
  | { type: 'SET_VENUE'; venue: PlannerVenue }
  | { type: 'SET_RING'; ring: PlannerRing }
  | { type: 'NUDGE'; dxMeters: number; dyMeters: number }
  | { type: 'ROTATE'; deltaDegrees: number }
  | { type: 'FLIP_X' }
  | { type: 'FLIP_Y' }
  | { type: 'CENTER' }
  | { type: 'RESET_PLACEMENT' }
  | { type: 'SET_DISPLAY_UNITS'; units: UnitSystem }
  | { type: 'SELECT_OBSTACLE'; obstacleId: string | null }
  | { type: 'MARK_SAVED'; placementId: string; buildSessionId: string }
  | { type: 'START_OVER' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'SET_COURSE': {
      // IA refresh (May 2026): the wizard now picks venue + ring BEFORE
      // upload, so a fresh SET_COURSE arrives on top of an existing
      // (venue, ring) selection. Preserve them — and, when a ring is
      // already in hand, immediately centre the new course on it so
      // the user can advance straight to Step 4 (Place & save) without
      // an intermediate "no placement yet" state.
      //
      // We still clear placement-only fields (selectedObstacleId,
      // savedPlacementId, savedBuildSessionId) so step counts and save
      // markers don't bleed across courses inside the same wizard
      // lifetime.
      const nextPlacement = state.ring
        ? centerCourseInRing(action.course, ringToCore(state.ring))
        : IDENTITY_PLACEMENT;
      return {
        ...INITIAL_STATE,
        displayUnits: state.displayUnits,
        venue: state.venue,
        ring: state.ring,
        placement: nextPlacement,
        phase: 'place',
        course: action.course,
        courseDbId: action.courseDbId,
        courseFilename: action.filename,
      };
    }

    case 'SET_VENUE': {
      // Picking a venue clears the previously-picked ring (rings are
      // venue-scoped — see D-016).
      return { ...state, venue: action.venue, ring: null };
    }

    case 'SET_RING': {
      // Picking a ring auto-centres the course on it WHEN a course is
      // already loaded. When a course isn't loaded yet (the new
      // venue-before-upload ordering) we just record the ring and let
      // the subsequent SET_COURSE perform the centring — the
      // displayed/exported placement is still well-defined because
      // IDENTITY_PLACEMENT remains the seed value.
      //
      // The Smarter LT (Y-down) → planner Y-up inversion is handled by
      // the renderer itself (Planner3D applies an auto Y-flip to
      // course-frame points), so we no longer default placement.flipY=
      // true here — doing that was double-flipping the headings,
      // causing every dog-walk / seesaw / weave / tilted-jump to come
      // out at the wrong angle.
      //
      // placement.flipY now means what it should: a user-controlled
      // mathematical reflection on top of the auto-display flip — useful
      // when the judge wants to design a mirrored version of an existing
      // course.
      if (!state.course) {
        return { ...state, ring: action.ring };
      }
      const placement = centerCourseInRing(state.course, ringToCore(action.ring));
      return { ...state, ring: action.ring, placement };
    }

    case 'NUDGE': {
      return {
        ...state,
        placement: {
          ...state.placement,
          offsetXMeters: state.placement.offsetXMeters + action.dxMeters,
          offsetYMeters: state.placement.offsetYMeters + action.dyMeters,
          placementMode:
            state.placement.placementMode === 'centered'
              ? 'preserveMeters'
              : state.placement.placementMode,
        },
      };
    }

    case 'ROTATE': {
      return {
        ...state,
        placement: {
          ...state.placement,
          rotationDegrees: normalizeDegrees(state.placement.rotationDegrees + action.deltaDegrees),
          placementMode:
            state.placement.placementMode === 'centered'
              ? 'preserveMeters'
              : state.placement.placementMode,
        },
      };
    }

    case 'FLIP_X': {
      return {
        ...state,
        placement: {
          ...state.placement,
          flipX: !state.placement.flipX,
          placementMode:
            state.placement.placementMode === 'centered'
              ? 'preserveMeters'
              : state.placement.placementMode,
        },
      };
    }

    case 'FLIP_Y': {
      return {
        ...state,
        placement: {
          ...state.placement,
          flipY: !state.placement.flipY,
          placementMode:
            state.placement.placementMode === 'centered'
              ? 'preserveMeters'
              : state.placement.placementMode,
        },
      };
    }

    case 'CENTER': {
      // CENTER preserves the user's current flipX/flipY choices — it's a
      // "snap back to the middle" gesture, not a hard reset. Use
      // RESET_PLACEMENT for that.
      if (!state.course || !state.ring) return state;
      const centered = centerCourseInRing(state.course, ringToCore(state.ring));
      return {
        ...state,
        placement: { ...centered, flipX: state.placement.flipX, flipY: state.placement.flipY },
      };
    }

    case 'RESET_PLACEMENT': {
      if (!state.course || !state.ring) return state;
      return { ...state, placement: centerCourseInRing(state.course, ringToCore(state.ring)) };
    }

    case 'SET_DISPLAY_UNITS':
      return { ...state, displayUnits: action.units };

    case 'SELECT_OBSTACLE':
      return { ...state, selectedObstacleId: action.obstacleId };

    case 'MARK_SAVED':
      return {
        ...state,
        phase: 'saved',
        savedPlacementId: action.placementId,
        savedBuildSessionId: action.buildSessionId,
      };

    case 'START_OVER':
      return { ...INITIAL_STATE, displayUnits: state.displayUnits };

    default:
      // exhaustive — TS narrows `action` to never if we covered every case.
      return assertNever(action);
  }
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Live warnings derived from current state. The UI memoises this. */
export function computeWarnings(state: PlannerState): readonly Warning[] {
  if (!state.course || !state.ring) return [];
  return runWarnings(state.course, state.placement, ringToCore(state.ring));
}

/**
 * Inventory-validation summary used by the save flow.
 *
 * - `blockers`: critical `obstacle-inventory` warnings — the ring has 0
 *   of a type the course needs (e.g. only 3 m tunnels in stock but the
 *   course calls for a 6 m one). The judge cannot physically build the
 *   obstacle on site, so the save flow forces an explicit confirmation
 *   before sending to AR.
 * - `shortages`: non-critical `obstacle-inventory` warnings — the ring
 *   has *some* but not enough of a type. Still requires confirmation
 *   so the judge has a heads-up before helpers arrive.
 * - `inventoryNotConfigured`: the single info-level "ring has no
 *   inventory configured" row. Does NOT block save (see feedback
 *   memory `obstacle-inventory empty = opt-out`) — surfaced so the
 *   planner can render a clear "validation skipped" notice.
 *
 * Lives in this module (not the rule file) so the planner UI and the
 * planner-state tests can both consume it without re-implementing the
 * filter. Callers should treat `blockers.length > 0 || shortages.length > 0`
 * as "needs explicit confirmation before save".
 */
export interface InventoryValidationSummary {
  readonly blockers: readonly Warning[];
  readonly shortages: readonly Warning[];
  readonly inventoryNotConfigured: boolean;
}

export function summarizeInventoryWarnings(
  warnings: readonly Warning[],
): InventoryValidationSummary {
  const blockers: Warning[] = [];
  const shortages: Warning[] = [];
  let inventoryNotConfigured = false;
  for (const w of warnings) {
    if (w.ruleId !== 'obstacle-inventory') continue;
    if (w.id === 'obstacle-inventory:not-configured') {
      inventoryNotConfigured = true;
      continue;
    }
    if (w.severity === 'critical') blockers.push(w);
    else if (w.severity === 'warning') shortages.push(w);
  }
  return { blockers, shortages, inventoryNotConfigured };
}

/** Convert a PlannerRing (DB row + doors/zones/markers) to course-core's Ring. */
export function ringToCore(ring: PlannerRing): Ring {
  return {
    id: ring.id,
    label: ring.name,
    lengthMeters: ring.length_m,
    widthMeters: ring.width_m,
    borderClearanceMeters: ring.border_clearance_m,
    // Inactive doors are skipped here so the warning engine does not
    // flag obstacles for clearance against a door the venue admin has
    // explicitly disabled (e.g. emergency exit kept off during events).
    doors: ring.doors
      .filter((d) => d.is_active ?? true)
      .map((d) => {
        const inferred =
          d.start_m == null || d.end_m == null
            ? inferDoorEdgeFromPolygon(d.polygon_points_m, ring.length_m, ring.width_m)
            : null;
        const side = normalizeDoorSide(d.side) ?? inferred?.side ?? null;
        const startMeters = d.start_m ?? inferred?.startMeters;
        const endMeters = d.end_m ?? inferred?.endMeters;
        return {
          id: d.id,
          label: d.label,
          polygonPointsMeters: d.polygon_points_m.map((p) => ({ x: p.x, y: p.y })),
          clearanceMeters: d.clearance_m,
          flow: d.flow ?? 'both',
          ...(side ? { side } : {}),
          ...(startMeters != null ? { startMeters } : {}),
          ...(endMeters != null ? { endMeters } : {}),
          isActive: d.is_active ?? true,
        };
      }),
    noGoZones: ring.no_go_zones.map((z) => ({
      id: z.id,
      label: z.label,
      sourceType: 'ring' as const,
      polygonPointsMeters: z.polygon_points_m.map((p) => ({ x: p.x, y: p.y })),
      warningMarginMeters: z.warning_margin_m,
    })),
    obstacleInventory: inventoryRowsToMap(ring.obstacle_inventory),
  };
}

/**
 * Collapse the row-shaped DB inventory into the map shape the warning
 * engine expects. Skips rows with unknown obstacle types (forward-compat
 * with future enum additions on the DB side) and rows with non-positive
 * quantities (defensive — the table check constraint already forbids them).
 */
export function inventoryRowsToMap(
  rows: readonly { obstacle_type: string; quantity: number }[],
): ObstacleInventory {
  const out: Partial<Record<ObstacleType, number>> = {};
  for (const row of rows) {
    if (row.quantity <= 0) continue;
    const parsed = obstacleTypeSchema.safeParse(row.obstacle_type);
    if (!parsed.success) continue;
    out[parsed.data] = (out[parsed.data] ?? 0) + row.quantity;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tiny utilities
// ---------------------------------------------------------------------------

function normalizeDegrees(deg: number): number {
  // Keep in (-180, 180] for UX. Multiples of 90 are exact.
  let v = deg % 360;
  if (v > 180) v -= 360;
  if (v <= -180) v += 360;
  return v === 0 ? 0 : v; // collapse -0
}

function assertNever(x: never): never {
  throw new Error(`Unhandled planner action: ${JSON.stringify(x)}`);
}
