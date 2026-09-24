/**
 * BuildSessionExportV1 — the canonical JSON contract the Unity AR app loads.
 *
 * Why this lives in `@agilityhub/shared-types`:
 *   - Both the web planner (producer) and Unity (consumer-via-C#-DTOs) need
 *     the same shape. Putting the zod schema here makes it the single source
 *     of truth + lets the producer round-trip-validate before writing.
 *   - The shape is a *flattened bundle*: BuildSession + linked CoursePlacement
 *     + linked Course (with its embedded CourseData jsonb) + linked Venue +
 *     linked Ring (+ doors + no-go zones + markers) + per-obstacle build
 *     statuses. Everything Unity needs to render the course in a non-AR
 *     preview AND start a build flow, in one file.
 *
 * The shape mirrors `packages/shared-types/src/db.ts` field names 1:1 except
 * where noted; nested objects are inlined (not by id) so the file is
 * self-contained.
 *
 * Validation:
 *   - `buildSessionExportV1Schema.parse(json)` is the round-trip check the
 *     exporter runs before emitting + the consumer runs after loading.
 *
 * Versioning:
 *   - `schemaVersion: 1` is locked. Breaking changes bump the integer and
 *     ship a `schemaVersion: 2` schema alongside.
 *
 * Phase 8 — Unity prep (D-037).
 */
import { z } from 'zod';
import {
  courseDataSchema,
  DEFAULT_MARKER_PHYSICAL_SIZE_M,
  inferDoorEdgeFromPolygon,
  normalizeDoorSide,
  type CourseData,
  point2DMetersSchema,
  warningSchema,
  type Warning,
} from '@agilityhub/course-core';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const isoTimestamp = z.string().min(1);

export const exportVenueSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  surface: z.string().nullable(),
  indoor_outdoor: z.enum(['indoor', 'outdoor', 'mixed']),
});
export type ExportVenue = z.infer<typeof exportVenueSchema>;

export const exportRingDoorSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['entrance', 'exit', 'equipment', 'emergency', 'other']).default('other'),
  /**
   * Polygon footprint — still the canonical input to the Phase 2
   * door-clearance warning and the existing Unity polygon consumer.
   * The new structured edge fields below (`side`, `start_m`, `end_m`,
   * `flow`, `is_active`) are added in the Phase 12c ring-doors edit
   * pass. Optional + default-friendly so older JSON files still parse.
   */
  polygon_points_m: z.array(point2DMetersSchema),
  clearance_m: z.number(),
  /** When false the AR app should hide the door and skip clearance checks. */
  is_active: z.boolean().default(true),
  /** 'in' | 'out' | 'both' — defaults to 'both' for legacy compatibility. */
  flow: z.enum(['in', 'out', 'both']).default('both'),
  /** Wall the door sits on. Null when legacy polygon couldn't be snapped to a wall. */
  side: z.enum(['north', 'south', 'east', 'west']).nullable().default(null),
  /** Start position on the wall (meters). Null when not yet backfilled. */
  start_m: z.number().nullable().default(null),
  /** End position on the wall (meters). */
  end_m: z.number().nullable().default(null),
});
export type ExportRingDoor = z.infer<typeof exportRingDoorSchema>;

export const exportRingNoGoZoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['wall', 'column', 'restricted', 'entrance', 'equipment', 'other']).default('other'),
  polygon_points_m: z.array(point2DMetersSchema),
  warning_margin_m: z.number(),
});
export type ExportRingNoGoZone = z.infer<typeof exportRingNoGoZoneSchema>;

export const exportRingMarkerSchema = z.object({
  id: z.string(),
  label: z.string(),
  marker_uid: z.string(),
  role: z.string(),
  x_m: z.number(),
  y_m: z.number(),
  z_m: z.number(),
  rotation_y_deg: z.number(),
  /**
   * Physical size of the detected AprilTag square, in metres. This is not
   * the A4 paper size. For the default marker print layout both dimensions
   * are 0.19 m.
   */
  physical_width_m: z.number().positive(),
  physical_height_m: z.number().positive(),
  is_fixed: z.boolean(),
  is_active: z.boolean(),
  /**
   * AprilTag 36h11 id in 0..586, unique per ring. See Phase 9e1 Option A
   * (anchoring-strategy-plan.md §5.3). Optional + nullable so legacy DB
   * rows that pre-date the column still round-trip; the Unity-side
   * detector falls back to deriving the id from `marker_uid` when null.
   */
  april_tag_id: z.number().int().min(0).max(586).nullable().optional(),
});
export type ExportRingMarker = z.infer<typeof exportRingMarkerSchema>;

/**
 * The exported ring carries exactly 6 markers labelled A/B/C/D/E/F. Phase
 * 9d5 (D-A from docs/unity-prep/anchoring-strategy-plan.md): the AR app's
 * multi-anchor calibration is well-conditioned only when all six markers
 * are present, so the always-6 contract is enforced at *export time* by
 * the builder (`buildBuildSessionExportV1`) and at *consumer time* via
 * `assertSixCanonicalMarkers`. The zod schema below also enforces
 * `length === 6` so a hand-crafted JSON that bypasses the builder still
 * fails round-trip parsing.
 *
 * Legacy rings with fewer than 6 markers cannot ship to the AR app —
 * the venue admin must add the missing markers in the planner first.
 *
 * ## Coordinate frame contract (Phase 9e2 §6)
 *
 * Each marker's `x_m`, `y_m`, `z_m` live in the canonical RING FRAME:
 *   - Origin at the bottom-left ring corner.
 *   - +X axis = ring LENGTH direction. A/B/C run left-to-right along the visual top edge.
 *   - +Y axis = ring WIDTH direction. D/E/F run left-to-right along the visual bottom edge.
 *   - +Z axis = elevation (up). All markers usually share z ≈ mounting height.
 *   - RIGHT-HANDED. Units: meters.
 *
 * The Unity AR consumer applies a fixed axis swap (`CalibrationMath.PoseOf-
 * RingMarker` / `RingFrameSolver`):
 *   world.x = ring.x          (+X stays +X)
 *   world.y = ring.z          (elevation → Unity's up axis)
 *   world.z = ring.y          (width → Unity's forward axis)
 * After the swap, the multi-marker `RingFrameSolver` (Phase 9e2) computes a
 * single 6DoF `worldFromRing` Pose. The contract is also pinned on the C#
 * side via XML doc on `RingMarkerDto`; if you change one end, change the
 * other and re-run the EditMode round-trip test (RingFrameSolverTests
 * `CoordinateConvention_…`).
 *
 * Why the swap exists: ring designers think of agility courses as
 * floor-plans (X = along the long side, Y = across), which is how
 * @agilityhub/course-core encodes everything. Unity is Y-up by default
 * (it's how the AR session establishes gravity). Doing the swap once at
 * the boundary keeps both sides ergonomic in their native idiom.
 */
export const exportRingSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  name: z.string(),
  length_m: z.number().positive(),
  width_m: z.number().positive(),
  border_clearance_m: z.number(),
  surface: z.string().nullable(),
  doors: z.array(exportRingDoorSchema),
  no_go_zones: z.array(exportRingNoGoZoneSchema),
  markers: z.array(exportRingMarkerSchema).length(6),
});
export type ExportRing = z.infer<typeof exportRingSchema>;

/**
 * The canonical six labels the AR app expects in every exported ring.
 * Comparing this set to the export's marker labels (uppercased) is how
 * `assertSixCanonicalMarkers` distinguishes "6 markers labelled A..F"
 * from "6 markers labelled A/A/B/B/C/C" (a duplicate-letter typo that
 * the zod `length(6)` rule alone wouldn't catch).
 */
export const REQUIRED_RING_MARKER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * Throws a descriptive Error when `markers` is anything other than a
 * 6-element array whose labels (case-insensitive) are exactly the
 * canonical A..F set. The error message names the venue + ring so a
 * venue admin reading server logs can fix the right ring.
 *
 * Used by `buildBuildSessionExportV1` before the schema parse step, so
 * the failure surfaces with the bad-ring context attached instead of a
 * generic "expected length 6, got 4" zod error.
 */
export function assertSixCanonicalMarkers(
  markers: ReadonlyArray<{ label: string }>,
  context: { venueSlug?: string; ringName?: string } = {},
): void {
  const where =
    context.venueSlug && context.ringName
      ? ` (venue "${context.venueSlug}", ring "${context.ringName}")`
      : context.ringName
        ? ` (ring "${context.ringName}")`
        : '';
  if (markers.length !== 6) {
    throw new Error(
      `BuildSessionExportV1: expected exactly 6 markers per ring${where}, got ${markers.length}. ` +
        'Phase 9e1 requires the full A/B/C/D/E/F set — add the missing markers in the planner before exporting.',
    );
  }
  const seen = new Set<string>();
  for (const m of markers) {
    const upper = (m.label ?? '').trim().toUpperCase();
    seen.add(upper);
  }
  const missing = REQUIRED_RING_MARKER_LABELS.filter((label) => !seen.has(label));
  if (missing.length > 0) {
    throw new Error(
      `BuildSessionExportV1: ring${where} is missing canonical marker labels: ${missing.join(', ')}. ` +
        'Expected the full A/B/C/D/E/F set per Phase 9e1 (anchoring-strategy-plan.md §5.4).',
    );
  }
}

const DEFAULT_MARKER_SIZE_EPSILON_M = 0.001;

/**
 * Production marker rows must describe the detected AprilTag square, not
 * the surrounding A4 page. Production exports are standardized to the
 * 190 mm AprilTag square used by the printable A4 marker pack and Unity
 * pose estimation.
 */
export function assertAprilTagMarkerPhysicalSizes(
  markers: ReadonlyArray<{
    label: string;
    marker_uid?: string;
    physical_width_m: number;
    physical_height_m: number;
  }>,
  context: { venueSlug?: string; ringName?: string } = {},
): void {
  const where =
    context.venueSlug && context.ringName
      ? ` (venue "${context.venueSlug}", ring "${context.ringName}")`
      : context.ringName
        ? ` (ring "${context.ringName}")`
        : '';
  for (const m of markers) {
    const label = (m.label ?? '').trim() || m.marker_uid || 'unknown';
    const w = m.physical_width_m;
    const h = m.physical_height_m;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      throw new Error(
        `BuildSessionExportV1: marker ${label}${where} has invalid physical size ` +
          `${w} x ${h} m. Expected a positive square AprilTag fiducial size.`,
      );
    }
    if (Math.abs(w - h) > DEFAULT_MARKER_SIZE_EPSILON_M) {
      throw new Error(
        `BuildSessionExportV1: marker ${label}${where} has non-square physical size ` +
          `${w} x ${h} m. physical_width_m / physical_height_m must describe ` +
          'the detected AprilTag square, not the A4 paper.',
      );
    }
    if (
      Math.abs(w - DEFAULT_MARKER_PHYSICAL_SIZE_M) > DEFAULT_MARKER_SIZE_EPSILON_M ||
      Math.abs(h - DEFAULT_MARKER_PHYSICAL_SIZE_M) > DEFAULT_MARKER_SIZE_EPSILON_M
    ) {
      throw new Error(
        `BuildSessionExportV1: marker ${label}${where} is ${w} x ${h} m. ` +
          `Production exports require the standard ${DEFAULT_MARKER_PHYSICAL_SIZE_M} m ` +
          'AprilTag square. Check for stale A4-sheet or too-small marker dimensions.',
      );
    }
  }
}

export const exportCourseThemeSchema = z.object({
  id: z.string().nullable(),
  /** Lookup key (e.g. "agilityhub", "canic", "hub"). Renderer falls back to this when theme_json is unavailable. */
  palette_key: z.string(),
  /** Verbatim theme payload — Unity binds these to material slots. */
  theme_json: z.record(z.string(), z.unknown()),
});
export type ExportCourseTheme = z.infer<typeof exportCourseThemeSchema>;

export const exportCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_raw: z.string().nullable(),
  source: z.string(),
  source_version: z.string().nullable(),
  units: z.enum(['m', 'ft']),
  design_length_m: z.number().positive(),
  design_width_m: z.number().positive(),
  canvas_width: z.number().positive(),
  canvas_height: z.number().positive(),
  origin: z.string(),
  /** Full CourseData snapshot — Unity drives obstacle / number / no-go-zone rendering from this. */
  normalized_json: courseDataSchema,
  theme: exportCourseThemeSchema,
});
export type ExportCourse = z.infer<typeof exportCourseSchema>;

/**
 * Single-value course type. Mirrors the DB check constraint
 * `course_placements_course_type_chk` (migration
 * 20260520120000_phase12b_placement_metadata).
 *
 * `null` means "no placement-level override" — the AR app / planner
 * should fall back to `course.normalized_json.metadata.courseType`
 * (and ultimately to the Phase 11 `courses.course_type` column).
 */
export const exportCourseTypeSchema = z.enum(['Jumping', 'Agility']).nullable();
export type ExportCourseType = z.infer<typeof exportCourseTypeSchema>;

/**
 * Suggested dog-size class values. Kept as a soft enum on the producer
 * side (the export schema accepts any string) so emerging organisations
 * with extra classes can carry their values through to Unity without a
 * schema bump.
 */
export const SUGGESTED_PLACEMENT_SIZES = ['ALL', 'XS', 'S', 'M', 'I', 'L'] as const;
export type SuggestedPlacementSize = (typeof SUGGESTED_PLACEMENT_SIZES)[number];

export const exportPlacementSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  venue_id: z.string(),
  ring_id: z.string(),
  name: z.string().nullable(),
  /**
   * Phase 12b — optional placement-level display name override (mirrors
   * `DBCoursePlacement.display_name`). Falls back to `course.title` in
   * the AR app when null. `.default(null)` keeps older exports valid.
   */
  display_name: z.string().nullable().default(null),
  placement_mode: z.enum(['preserveMeters', 'centered', 'fitToRing']),
  offset_x_m: z.number(),
  offset_y_m: z.number(),
  rotation_deg: z.number(),
  /**
   * Mirror about the course centroid's vertical axis BEFORE rotation. Same
   * semantics as `CoursePlacement.flipX` in @agilityhub/course-core and the
   * `flip_x_bool` DB column. `.default(false)` keeps the schema
   * backwards-compatible for older exports.
   */
  flip_x_bool: z.boolean().default(false),
  flip_y_bool: z.boolean().default(false),
  warning_threshold_m: z.number(),
  /** Warnings snapshot at save time — Unity displays them in the BuildSession Summary screen (D-019). */
  warnings_json: z.array(warningSchema),
  status: z.enum(['draft', 'ready_to_build', 'archived']),
  /**
   * Phase 11 — ISO-8601 timestamp at which this placement is scheduled
   * to be built. Drives `/calendar`. Optional + nullable so exports
   * produced before this field existed still parse (defaults to null).
   */
  scheduled_at: isoTimestamp.nullable().default(null),
  /**
   * Phase 12a — optional event the placement belongs to. Mirrors
   * `DBCoursePlacement.event_id`. Optional + nullable for backward
   * compatibility with pre-Phase-12a exports.
   */
  event_id: z.string().nullable().default(null),
  /**
   * Phase 12b — placement-level course type override (single value).
   * Null = "no override; use the course's intrinsic type".
   */
  course_type: exportCourseTypeSchema.default(null),
  /**
   * Phase 12b — multi-value grades this placement targets (e.g.
   * `['0', '1', '2', '3']`). Empty array = "no explicit targeting".
   * Strings (not enum) so future organisations can ship custom labels
   * without an export-schema bump.
   */
  grades: z.array(z.string()).default([]),
  /**
   * Phase 12b — multi-value dog-size classes this placement targets
   * (e.g. ALL/XS/S/M/I/L). Same enum-vs-strings reasoning as `grades`.
   */
  sizes: z.array(z.string()).default([]),
  /**
   * Phase 12b — true when this placement is a training session
   * (typically eventless + dateless, but not enforced).
   */
  is_training: z.boolean().default(false),
});
export type ExportPlacement = z.infer<typeof exportPlacementSchema>;

export const exportBuildObstacleStatusSchema = z.object({
  course_obstacle_id: z.string(),
  status: z.enum(['not_placed', 'current', 'placed', 'skipped', 'needs_check']),
  updated_at: isoTimestamp.nullable(),
});
export type ExportBuildObstacleStatus = z.infer<typeof exportBuildObstacleStatusSchema>;

export const exportBuildSessionSchema = z.object({
  id: z.string(),
  placement_id: z.string(),
  judge_id: z.string().nullable(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'abandoned']),
  /**
   * The three canonical build modes. Kept in lockstep with the Postgres
   * `public.build_strategy` enum, `DBBuildStrategy` in `db.ts`, and
   * Unity's `BuildStrategy` (SharedCore/Domain/Enums.cs).
   *
   * Migration `20260525120000_build_strategy_three_modes.sql` collapsed the
   * reserved slots `course_order` / `jumps_only` / `tunnels_only` /
   * `contacts_only` into `equipment_type` and renamed `custom` →
   * `free_build`. None of them were ever surfaced in a production UI, and
   * no row can carry one any more, so they are gone from the wire format
   * too — this schema just hadn't caught up with the migration.
   */
  selected_strategy: z.enum(['equipment_type', 'closer_obstacle_order', 'free_build']),
  last_known_marker_id: z.string().nullable(),
  started_at: isoTimestamp.nullable(),
  completed_at: isoTimestamp.nullable(),
  local_cache_version: z.number().int().nonnegative(),
  obstacle_statuses: z.array(exportBuildObstacleStatusSchema),
});
export type ExportBuildSession = z.infer<typeof exportBuildSessionSchema>;

/**
 * The canonical Unity-loadable bundle. One file → one render-ready course.
 *
 * Field order is alphabetical inside each object to keep diffs stable; the
 * top level is intentionally ordered:
 *   1. schemaVersion / exportedAt / producer  — identification.
 *   2. buildSession + placement + course      — what the judge is building.
 *   3. venue + ring                            — where they're building it.
 *   4. assetProfile                            — which obstacle pack Unity should load.
 */
export const buildSessionExportV1Schema = z.object({
  schemaVersion: z.literal(1),
  /** ISO-8601 UTC timestamp when this file was emitted. */
  exportedAt: isoTimestamp,
  /** "agilityhub-web-planner@<version>" — for support / debugging. */
  producer: z.string(),

  buildSession: exportBuildSessionSchema,
  placement: exportPlacementSchema,
  course: exportCourseSchema,

  venue: exportVenueSchema,
  ring: exportRingSchema,

  /**
   * Which obstacle pack the Unity renderer should resolve through first.
   * Always falls back to `generic-fci` → procedural per D-035.
   */
  assetProfile: z.object({
    profileId: z.string(),
    /** Renderer falls through this list in order; last entry is always 'procedural'. */
    fallbackChain: z.array(z.string()).min(1),
  }),
});
export type BuildSessionExportV1 = z.infer<typeof buildSessionExportV1Schema>;

// ---------------------------------------------------------------------------
// Exporter — pure helper. Storage layer assembles the inputs.
// ---------------------------------------------------------------------------

export interface BuildSessionExporterInput {
  readonly producer: string;
  readonly exportedAt?: string;
  readonly assetProfile?: { profileId: string; fallbackChain?: string[] };

  // Rows already gathered by the caller (the web planner or a test harness).
  readonly buildSession: {
    id: string;
    placement_id: string;
    judge_id: string | null;
    status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
    selected_strategy: 'equipment_type' | 'closer_obstacle_order' | 'free_build';
    last_known_marker_id: string | null;
    started_at: string | null;
    completed_at: string | null;
    local_cache_version: number;
  };
  readonly obstacleStatuses: ReadonlyArray<{
    course_obstacle_id: string;
    status: 'not_placed' | 'current' | 'placed' | 'skipped' | 'needs_check';
    updated_at: string | null;
  }>;
  readonly placement: {
    id: string;
    course_id: string;
    venue_id: string;
    ring_id: string;
    name: string | null;
    /**
     * Phase 12b — optional display-name override. Optional + nullable
     * so callers reading pre-migration DB rows or older fixtures can
     * keep handing the row to the builder unchanged.
     */
    display_name?: string | null;
    placement_mode: 'preserveMeters' | 'centered' | 'fitToRing';
    offset_x_m: number;
    offset_y_m: number;
    rotation_deg: number;
    /**
     * Mirror about course-centroid vertical axis BEFORE rotation. Optional
     * (defaults to false in the builder) so callers reading pre-migration
     * DB rows or older fixtures don't have to plumb the field manually.
     */
    flip_x_bool?: boolean;
    /** Mirror about course-centroid horizontal axis BEFORE rotation. Optional, defaults to false. */
    flip_y_bool?: boolean;
    warning_threshold_m: number;
    warnings_json: ReadonlyArray<Warning>;
    status: 'draft' | 'ready_to_build' | 'archived';
    /**
     * Phase 11 — ISO timestamp the placement is scheduled at. Optional +
     * nullable; defaults to null in the builder.
     */
    scheduled_at?: string | null;
    /**
     * Phase 12a — optional event the placement belongs to. Optional +
     * nullable; defaults to null in the builder.
     */
    event_id?: string | null;
    /**
     * Phase 12b — placement-level course type override. Optional +
     * nullable; defaults to null (fall back to course-intrinsic type).
     */
    course_type?: 'Jumping' | 'Agility' | null;
    /**
     * Phase 12b — multi-value grades this placement targets. Optional;
     * defaults to `[]` in the builder when omitted.
     */
    grades?: ReadonlyArray<string>;
    /**
     * Phase 12b — multi-value sizes this placement targets. Optional;
     * defaults to `[]` in the builder when omitted.
     */
    sizes?: ReadonlyArray<string>;
    /**
     * Phase 12b — true when this placement is a training session.
     * Optional; defaults to `false` in the builder when omitted.
     */
    is_training?: boolean;
  };
  readonly course: {
    id: string;
    title: string;
    title_raw: string | null;
    source: string;
    source_version: string | null;
    units: 'm' | 'ft';
    design_length_m: number;
    design_width_m: number;
    canvas_width: number;
    canvas_height: number;
    origin: string;
    normalized_json: CourseData;
  };
  readonly theme: {
    id: string | null;
    palette_key: string;
    theme_json: Record<string, unknown>;
  };
  readonly venue: {
    id: string;
    slug: string;
    name: string;
    country: string | null;
    city: string | null;
    surface: string | null;
    indoor_outdoor: 'indoor' | 'outdoor' | 'mixed';
  };
  readonly ring: {
    id: string;
    venue_id: string;
    name: string;
    length_m: number;
    width_m: number;
    border_clearance_m: number;
    surface: string | null;
    doors: ReadonlyArray<{
      id: string;
      label: string;
      kind?: 'entrance' | 'exit' | 'equipment' | 'emergency' | 'other';
      polygon_points_m: ReadonlyArray<{ x: number; y: number }>;
      clearance_m: number;
      /**
       * Phase 12c — structured edge geometry + flow. All optional so
       * older PlannerStore implementations (and the MockStore default
       * door row that pre-dates the editor) can still hand a polygon-
       * only door to the builder unchanged. The builder fills in
       * defaults: `is_active = true`, `flow = 'both'`; canonical
       * side/start/end are inferred from edge-flush polygons when absent.
       * The Unity consumer should prefer the edge fields when present and
       * fall back to the polygon otherwise.
       */
      is_active?: boolean;
      flow?: 'in' | 'out' | 'both';
      side?: string | null;
      start_m?: number | null;
      end_m?: number | null;
    }>;
    no_go_zones: ReadonlyArray<{
      id: string;
      label: string;
      kind?: 'wall' | 'column' | 'restricted' | 'entrance' | 'equipment' | 'other';
      polygon_points_m: ReadonlyArray<{ x: number; y: number }>;
      warning_margin_m: number;
    }>;
    markers: ReadonlyArray<{
      id: string;
      label: string;
      marker_uid: string;
      role: string;
      x_m: number;
      y_m: number;
      z_m: number;
      rotation_y_deg: number;
      physical_width_m: number;
      physical_height_m: number;
      is_fixed: boolean;
      is_active: boolean;
      /**
       * Phase 9e1: optional / nullable so callers reading DB rows produced
       * before migration 20260518120000_april_tag_id can hand the row to
       * the builder unchanged. The builder forwards `null` and the Unity
       * runtime falls back to SHA-256 derivation in that case.
       */
      april_tag_id?: number | null;
    }>;
  };
}

/**
 * Build a BuildSessionExportV1 from already-fetched rows. Does NOT do I/O —
 * the caller is responsible for assembling the inputs (PlannerStore in the
 * web planner, fixture in tests).
 *
 * Round-trip validates the assembled value against the zod schema before
 * returning, so producers can't accidentally ship a malformed export.
 */
export function buildBuildSessionExportV1(input: BuildSessionExporterInput): BuildSessionExportV1 {
  // Phase 9e1 (§5.4 from anchoring-strategy-plan.md): fail FAST on rings
  // that don't carry the full A..F marker set, with a venue/ring-aware
  // message so the admin can find the right ring to fix. Without this
  // pre-check the zod schema would still reject the export — but with a
  // generic "expected length 6" error that would force the caller to
  // dig through the input to figure out which ring is wrong.
  assertSixCanonicalMarkers(input.ring.markers, {
    venueSlug: input.venue.slug,
    ringName: input.ring.name,
  });
  assertAprilTagMarkerPhysicalSizes(input.ring.markers, {
    venueSlug: input.venue.slug,
    ringName: input.ring.name,
  });

  const assetProfile = input.assetProfile ?? { profileId: 'generic-fci' };
  const fallbackChain =
    assetProfile.fallbackChain && assetProfile.fallbackChain.length > 0
      ? assetProfile.fallbackChain
      : Array.from(new Set([assetProfile.profileId, 'generic-fci', 'procedural']));

  const candidate: BuildSessionExportV1 = {
    schemaVersion: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    producer: input.producer,
    buildSession: {
      id: input.buildSession.id,
      placement_id: input.buildSession.placement_id,
      judge_id: input.buildSession.judge_id,
      status: input.buildSession.status,
      selected_strategy: input.buildSession.selected_strategy,
      last_known_marker_id: input.buildSession.last_known_marker_id,
      started_at: input.buildSession.started_at,
      completed_at: input.buildSession.completed_at,
      local_cache_version: input.buildSession.local_cache_version,
      obstacle_statuses: input.obstacleStatuses.map((s) => ({
        course_obstacle_id: s.course_obstacle_id,
        status: s.status,
        updated_at: s.updated_at,
      })),
    },
    placement: {
      id: input.placement.id,
      course_id: input.placement.course_id,
      venue_id: input.placement.venue_id,
      ring_id: input.placement.ring_id,
      name: input.placement.name,
      // Phase 12b — fields below default in the builder so that callers
      // hydrating pre-migration DB rows can keep their existing
      // `placement` payload shape unchanged. `?? null` / `?? []` /
      // `?? false` matches what `.default(...)` on the schema does at
      // parse time, so a hand-crafted input + a parsed input land on the
      // same value.
      display_name: input.placement.display_name ?? null,
      placement_mode: input.placement.placement_mode,
      offset_x_m: input.placement.offset_x_m,
      offset_y_m: input.placement.offset_y_m,
      rotation_deg: input.placement.rotation_deg,
      // ?? false keeps the builder safe when reading older DB rows that
      // pre-date the flip_x_bool / flip_y_bool columns. The columns are NOT
      // NULL going forward (migration 20260517090000), but defensive defaults
      // make schema migrations one-way safe even in mid-deploy states.
      flip_x_bool: input.placement.flip_x_bool ?? false,
      flip_y_bool: input.placement.flip_y_bool ?? false,
      warning_threshold_m: input.placement.warning_threshold_m,
      warnings_json: [...input.placement.warnings_json],
      status: input.placement.status,
      scheduled_at: input.placement.scheduled_at ?? null,
      event_id: input.placement.event_id ?? null,
      course_type: input.placement.course_type ?? null,
      grades: input.placement.grades ? [...input.placement.grades] : [],
      sizes: input.placement.sizes ? [...input.placement.sizes] : [],
      is_training: input.placement.is_training ?? false,
    },
    course: {
      id: input.course.id,
      title: input.course.title,
      title_raw: input.course.title_raw,
      source: input.course.source,
      source_version: input.course.source_version,
      units: input.course.units,
      design_length_m: input.course.design_length_m,
      design_width_m: input.course.design_width_m,
      canvas_width: input.course.canvas_width,
      canvas_height: input.course.canvas_height,
      origin: input.course.origin,
      normalized_json: input.course.normalized_json,
      theme: input.theme,
    },
    venue: input.venue,
    ring: {
      id: input.ring.id,
      venue_id: input.ring.venue_id,
      name: input.ring.name,
      length_m: input.ring.length_m,
      width_m: input.ring.width_m,
      border_clearance_m: input.ring.border_clearance_m,
      surface: input.ring.surface,
      doors: input.ring.doors.map((d) => {
        const inferred =
          d.start_m == null || d.end_m == null
            ? inferDoorEdgeFromPolygon(
                d.polygon_points_m,
                input.ring.length_m,
                input.ring.width_m,
              )
            : null;
        const side = normalizeDoorSide(d.side) ?? inferred?.side ?? null;
        return {
          id: d.id,
          label: d.label,
          kind: d.kind ?? 'other',
          polygon_points_m: d.polygon_points_m.map((p) => ({ x: p.x, y: p.y })),
          clearance_m: d.clearance_m,
          // Phase 12c — surface structured edge geometry so the AR app
          // (and any future consumer) can render arrows + flow indicators
          // directly. Legacy side aliases are normalized, and polygon-only
          // edge doors get side/start/end inferred from their bbox.
          is_active: d.is_active ?? true,
          flow: d.flow ?? 'both',
          side,
          start_m: d.start_m ?? inferred?.startMeters ?? null,
          end_m: d.end_m ?? inferred?.endMeters ?? null,
        };
      }),
      no_go_zones: input.ring.no_go_zones.map((z) => ({
        id: z.id,
        label: z.label,
        kind: z.kind ?? 'other',
        polygon_points_m: z.polygon_points_m.map((p) => ({ x: p.x, y: p.y })),
        warning_margin_m: z.warning_margin_m,
      })),
      markers: input.ring.markers.map((m) => ({
        id: m.id,
        label: m.label,
        marker_uid: m.marker_uid,
        role: m.role,
        x_m: m.x_m,
        y_m: m.y_m,
        z_m: m.z_m,
        rotation_y_deg: m.rotation_y_deg,
        physical_width_m: m.physical_width_m,
        physical_height_m: m.physical_height_m,
        is_fixed: m.is_fixed,
        is_active: m.is_active,
        // Phase 9e1: forward the persisted AprilTag id; ?? null normalises
        // both "field omitted" and "explicit null" to the schema's nullable.
        april_tag_id: m.april_tag_id ?? null,
      })),
    },
    assetProfile: {
      profileId: assetProfile.profileId,
      fallbackChain,
    },
  };
  // Round-trip validation. Catches drift between this helper and the schema.
  return buildSessionExportV1Schema.parse(candidate);
}
