/**
 * Hand-written TypeScript types for the Phase 3 Supabase schema.
 *
 * Why hand-written rather than `supabase gen types`:
 *   - Phase 3 finishes without the user having to install / run the Supabase
 *     CLI. Phase 4 will swap this for the auto-generated types once the
 *     planner ships, but the surface area is small enough that drift is
 *     manageable in the meantime.
 *   - Keeps the shapes close to the zod schemas in `@agilityhub/course-core`
 *     so future code-gen has an obvious target.
 *
 * Conventions:
 *   - Field names match the SQL column names (snake_case).
 *   - `timestamptz` columns are typed as `string` (ISO-8601), matching how
 *     supabase-js returns them.
 *   - `jsonb` columns that mirror a `@agilityhub/course-core` type are
 *     typed as that type when the schema is locked (CourseData, Warning, …).
 */
import type { CourseData, CoursePlacement, Point2DMeters, Warning } from '@agilityhub/course-core';

// ---------------------------------------------------------------------------
// Enums (mirror the Postgres ENUM types in supabase/migrations/)
// ---------------------------------------------------------------------------

export type DBAppRole = 'agilityhub_admin' | 'venue_admin' | 'judge' | 'trainer';

export type DBUnitSystem = 'm' | 'ft';

export type DBVenueVisibility = 'private_link' | 'members_only' | 'public_preview';

export type DBVenuePartnerStatus = 'inactive' | 'trial' | 'active' | 'expired';

export type DBVenueIndoorKind = 'indoor' | 'outdoor' | 'mixed';

export type DBVenueMemberRole = 'owner' | 'admin' | 'judge' | 'trainer' | 'viewer';

export type DBVenueMemberStatus = 'invited' | 'active' | 'removed';

export type DBRingDoorType = 'entrance' | 'exit' | 'equipment' | 'emergency' | 'other';

/**
 * Pedestrian flow through a ring door.
 *   - `'in'`  — judges/dogs entering the ring
 *   - `'out'` — leaving the ring
 *   - `'both'` — bidirectional (the common case)
 *
 * Persisted as nullable text on `ring_doors.flow` so legacy rows (which
 * pre-date the column) still parse; the planner treats NULL as `'both'`.
 */
export type DBRingDoorFlow = 'in' | 'out' | 'both';

/**
 * Canonical sides the venue-admin door editor writes. The persisted
 * `ring_doors.side` column remains free-form text for legacy compatibility;
 * new writes go through `normalizeDoorSide()` to land on one of the four
 * canonical values.
 */
export type DBRingDoorSide = 'north' | 'south' | 'east' | 'west';

export type DBRingNoGoKind = 'wall' | 'column' | 'restricted' | 'entrance' | 'equipment' | 'other';

export type DBVenueAssetKind = 'photo' | 'panorama360' | 'map' | 'marker_guide' | 'other';

export type DBCourseSourceKind = 'smarter_txt' | 'manual';

export type DBCoursePlacementMode = CoursePlacement['placementMode'];

export type DBCoursePlacementStatus = 'draft' | 'ready_to_build' | 'archived';

export type DBBuildSessionStatus = 'not_started' | 'in_progress' | 'completed' | 'abandoned';

/**
 * Canonical build strategy wire values. Mirrors the Postgres
 * `public.build_strategy` enum (see migration
 * `20260525120000_build_strategy_three_modes.sql`).
 *
 * - `equipment_type`        — contacts → tunnels → weaves → specials → jumps
 * - `closer_obstacle_order` — pick the nearest unplaced obstacle as next
 * - `free_build`            — all obstacles visible; user picks any order
 *
 * Earlier values (`course_order`, `jumps_only`, `tunnels_only`,
 * `contacts_only`, `custom`) were reserved enum slots never surfaced in any
 * production UI; they were collapsed into the three canonical modes by
 * migration 20260525120000 (`custom` → `free_build`, others → `equipment_type`).
 */
export type DBBuildStrategy =
  | 'equipment_type'
  | 'closer_obstacle_order'
  | 'free_build';

export type DBBuildObstacleStatusKind =
  | 'not_placed'
  | 'current'
  | 'placed'
  | 'skipped'
  | 'needs_check';

export type DBPartnerReferralStatus = 'pending' | 'active' | 'qualified' | 'expired' | 'void';

export type DBPartnerCreditStatus = 'pending' | 'available' | 'applied' | 'expired' | 'void';

export type DBImportLogOutcome =
  | 'success'
  | 'wrapper_missing'
  | 'base64_failed'
  | 'json_failed'
  | 'schema_failed'
  | 'unsupported_source'
  | 'unknown_error';

export type DBCalibrationOutcome = 'green' | 'yellow' | 'red' | 'aborted';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface DBProfile {
  /** Internal Course Builder profile id (today's auth.uid()). Use this for everything. */
  id: string;
  email: string;
  full_name: string | null;
  role: DBAppRole;
  preferred_units: DBUnitSystem;
  partner_referral_code: string | null;
  /**
   * Future link to the existing AgilityHub platform user (Phase 6.5, D-030).
   * NULL today; populated when account linking ships. Never required by app
   * code — always use `id` for current behaviour. The DB enforces partial
   * uniqueness (one platform user → at most one Course Builder profile)
   * via `profiles_platform_user_id_unique`.
   */
  platform_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Paper the venue's printable marker packs default to.
 * `a4` = ISO 210 × 297 mm, `letter` = US Letter 8½ × 11 in
 * (215.9 × 279.4 mm). The 190 mm AprilTag square is identical on both —
 * only the branded chrome footer rescales — so this never affects
 * detection, but printing an A4 layout on a Letter tray does: the browser
 * shrinks to fit and the tag comes out undersized.
 */
export type DBPaperSize = 'a4' | 'letter';

export interface DBVenue {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  city: string | null;
  address: string | null;
  surface: string | null;
  indoor_outdoor: DBVenueIndoorKind;
  contact_email: string | null;
  public_notes: string | null;
  private_notes: string | null;
  visibility: DBVenueVisibility;
  partner_status: DBVenuePartnerStatus;
  partner_since: string | null;
  partner_until: string | null;
  /** Seeds the marker print page's paper toggle. Defaults to `'a4'`. */
  default_paper_size: DBPaperSize;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBVenueMember {
  id: string;
  venue_id: string;
  profile_id: string;
  role: DBVenueMemberRole;
  status: DBVenueMemberStatus;
  invited_by: string | null;
  invited_at: string;
  activated_at: string | null;
  removed_at: string | null;
}

export interface DBRing {
  id: string;
  venue_id: string;
  name: string;
  default_units: DBUnitSystem;
  length_m: number;
  width_m: number;
  surface: string | null;
  notes: string | null;
  is_active: boolean;
  border_clearance_m: number;
  created_at: string;
  updated_at: string;
}

export interface DBRingDoor {
  id: string;
  ring_id: string;
  label: string;
  kind: DBRingDoorType;
  /**
   * Wall the door sits on. Canonical writes are `'north' | 'south' |
   * 'east' | 'west'`; legacy rows may use arbitrary hints (`'left'`,
   * `'top'`, `'Door side'`, etc.). Readers should pass through
   * `normalizeDoorSide()` before handing the value to strict schemas. NULL
   * on rows pre-dating the
   * 20260520130000 migration where the backfill couldn't infer a side
   * from the polygon bbox.
   */
  side: string | null;
  /**
   * Polygon footprint in ring frame (bottom-left origin, +X length, +Y
   * width). Source of truth for the Phase 2 `door-clearance` warning
   * rule. The new edge geometry below (`start_m` / `end_m` / `side`)
   * is the canonical input for writes — the polygon is derived from it
   * via `doorPolygonFromEdge()` in `course-core`.
   */
  polygon_points_m: Point2DMeters[];
  clearance_m: number;
  /**
   * When false the door is hidden from the planner + AR export but
   * preserved in the DB for history. Defaults to true on insert.
   */
  is_active: boolean;
  /**
   * Pedestrian flow direction (in/out/both). NULL on legacy rows —
   * readers should default to `'both'` in that case.
   */
  flow: DBRingDoorFlow | null;
  /**
   * Position along the chosen `side` where the door starts (meters
   * from the ring origin along the wall). For N/S walls this is along
   * the X (length) axis; for E/W walls it's along the Y (width) axis.
   * NULL on legacy rows where the backfill couldn't recover edge
   * geometry from the polygon.
   */
  start_m: number | null;
  /**
   * Position along the chosen `side` where the door ends. Same axis
   * rules as `start_m`. `end_m - start_m` is the door's physical
   * opening width.
   */
  end_m: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBRingNoGoZone {
  id: string;
  ring_id: string;
  label: string;
  kind: DBRingNoGoKind;
  polygon_points_m: Point2DMeters[];
  warning_margin_m: number;
  color: string | null;
  notes: string | null;
  created_at: string;
}

export interface DBRingMarker {
  id: string;
  ring_id: string;
  label: string;
  marker_uid: string;
  role: string;
  x_m: number;
  y_m: number;
  z_m: number;
  rotation_y_deg: number;
  /**
   * Physical dimensions of the detected AprilTag square, in metres. These
   * are not the surrounding A4 paper dimensions; Unity uses them for tag
   * pose estimation.
   */
  physical_width_m: number;
  physical_height_m: number;
  is_fixed: boolean;
  is_active: boolean;
  /**
   * AprilTag 36h11 id in 0..586, unique per ring (Phase 9e1 Option A from
   * anchoring-strategy-plan.md §5.3). The marker-creation path derives the
   * preferred id from `marker_uid` (SHA-256 mod 587) and falls through to
   * the next free slot if it collides with another marker in the same ring.
   *
   * Null for legacy rows created before the migration — readers should
   * fall back to `aprilTagIdFromMarkerUid(marker_uid)` in that case.
   */
  april_tag_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBRingObstacleInventoryRow {
  id: string;
  ring_id: string;
  obstacle_type: string;
  quantity: number;
  notes: string | null;
}

export interface DBVenueAsset {
  id: string;
  venue_id: string;
  ring_id: string | null;
  kind: DBVenueAssetKind;
  storage_path: string;
  title: string | null;
  notes: string | null;
  created_at: string;
}

export interface DBCourseSourceFile {
  id: string;
  owner_id: string | null;
  original_filename: string;
  source_type: DBCourseSourceKind;
  storage_path: string;
  file_hash: string;
  bytes_size: number | null;
  uploaded_at: string;
  immutable: boolean;
}

export interface DBCourseTheme {
  id: string;
  owner_id: string | null;
  name: string;
  source: string;
  palette_key: string;
  theme_json: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
}

export interface DBCourse {
  id: string;
  source_file_id: string | null;
  owner_id: string | null;
  title: string;
  title_raw: string | null;
  source: string;
  source_version: string | null;
  units: DBUnitSystem;
  design_length_m: number;
  design_width_m: number;
  canvas_width: number;
  canvas_height: number;
  origin: string;
  metadata: Record<string, unknown>;
  /**
   * Phase 11 — competition grade (typically '0'..'3'). Pre-filled from
   * `metadata.grade` on Smarter ingest; editable in the planner placement
   * save form. Null when the source file didn't carry the field.
   */
  course_grade: string | null;
  /**
   * Phase 11 — course type (typically 'Agility' or 'Jumping'). Pre-filled
   * from `metadata.courseType` on Smarter ingest. Null when unknown.
   */
  course_type: string | null;
  /** Full snapshot of @agilityhub/course-core's CourseData (the source of truth at load time). */
  normalized_json: CourseData;
  theme_id: string | null;
  /**
   * Phase 12a — optional event the course was authored for. A judge
   * typically uploads a course tied to a specific show. Column added by
   * migration `20260519120000_phase12a_events_and_invites.sql`.
   */
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBCourseObstacle {
  id: string;
  course_id: string;
  source_id: string;
  source_code: string;
  obstacle_type: string;
  sequence_number: number | null;
  x_m: number | null;
  y_m: number | null;
  rotation_deg: number | null;
  nominal_length_m: number | null;
  control_points_m: Point2DMeters[] | null;
  color_key: string | null;
  status: 'notPlaced' | 'placed';
  raw_metadata: Record<string, unknown>;
}

export interface DBCourseNumber {
  id: string;
  course_id: string;
  text: string;
  sequence_number: number | null;
  x_m: number;
  y_m: number;
  linked_obstacle_source_id: string | null;
  obstacle_connection_point: string | null;
  raw_metadata: Record<string, unknown>;
}

export interface DBCourseNoGoZone {
  id: string;
  course_id: string;
  source_id: string;
  source_type: string;
  label: string;
  polygon_points_m: Point2DMeters[];
  warning_margin_m: number;
  raw_metadata: Record<string, unknown>;
}

export interface DBCoursePlacement {
  id: string;
  course_id: string;
  venue_id: string;
  ring_id: string;
  owner_id: string | null;
  name: string | null;
  placement_mode: DBCoursePlacementMode;
  offset_x_m: number;
  offset_y_m: number;
  rotation_deg: number;
  /**
   * Mirror the course about the vertical axis through its centroid BEFORE
   * rotation. Matches `CoursePlacement.flipX` (packages/course-core) and the
   * `flip_x_bool` column added in migration 20260517090000.
   */
  flip_x_bool: boolean;
  /** Mirror about the horizontal axis through the course centroid (see flip_x_bool). */
  flip_y_bool: boolean;
  warning_threshold_m: number;
  /** Snapshot of Warning[] from `@agilityhub/course-core/src/warnings/types.ts`. */
  warnings_json: Warning[];
  status: DBCoursePlacementStatus;
  /**
   * Phase 11 — when this placement is scheduled to be built. Drives the
   * `/calendar` view. Null = unscheduled (still works in the planner; just
   * absent from /calendar).
   */
  scheduled_at: string | null;
  /**
   * Phase 12a — optional event the placement belongs to. When set, the
   * `enforce_placement_ring_in_event` trigger enforces that `ring_id`
   * appears in the corresponding `event_rings` row. Free-floating
   * placements (event_id null) are unconstrained. Column added by
   * migration `20260519120000_phase12a_events_and_invites.sql`.
   */
  event_id: string | null;
  /**
   * Phase 12b — optional placement-level display name override. NULL
   * means the planner / AR app should fall back to `DBCourse.title`.
   * Column added by `20260520120000_phase12b_placement_metadata.sql`.
   */
  display_name: string | null;
  /**
   * Phase 12b — placement-level course type override (single value).
   * Valid: `'Jumping' | 'Agility' | null`. NULL falls back to
   * `DBCourse.course_type` (Phase 11). Enforced by the DB check
   * constraint `course_placements_course_type_chk`.
   */
  course_type: 'Jumping' | 'Agility' | null;
  /**
   * Phase 12b — multi-value grades this placement targets (e.g.
   * `['0', '1', '2', '3']`). Empty array means "no explicit targeting".
   * Distinct from `DBCourse.course_grade`, which holds the single
   * Smarter-imported grade for the source course.
   */
  grades: string[];
  /**
   * Phase 12b — multi-value dog-size classes this placement targets.
   * Typical values: `'ALL' | 'XS' | 'S' | 'M' | 'I' | 'L'`. Empty array
   * means "no explicit targeting".
   */
  sizes: string[];
  /**
   * Phase 12b — flags a placement as a training session. Typically
   * paired with `event_id == null && scheduled_at == null`, but the DB
   * does not enforce that combination; the explicit flag lets the
   * planner UI render training placements separately from
   * "free-floating but scheduled" ones.
   */
  is_training: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBBuildSession {
  id: string;
  placement_id: string;
  judge_id: string | null;
  status: DBBuildSessionStatus;
  selected_strategy: DBBuildStrategy;
  last_known_marker_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  local_cache_version: number;
  progress_json: Record<string, unknown>;
  /**
   * Phase 11 — random hex token embedded in the agilityhub://join QR deep
   * link. Auto-rotated by the `rotate_invite_on_start` trigger whenever
   * `status` enters `'in_progress'`, and on explicit
   * `rotate_build_session_invite()` calls. Null when the session has
   * never been started.
   */
  join_token: string | null;
  /**
   * Phase 11 — 6-digit numeric code shown alongside the QR for manual
   * entry when scanning fails. Same lifecycle as `join_token`.
   */
  join_code: string | null;
  /** Phase 11 — when `join_token` + `join_code` were last regenerated. */
  join_token_rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBBuildObstacleStatus {
  id: string;
  build_session_id: string;
  course_obstacle_id: string;
  status: DBBuildObstacleStatusKind;
  updated_by: string | null;
  updated_at: string;
  /**
   * Phase 10b — uuid generated by the writing AR app session at app start.
   * The Phase 10c RemoteProgressSubscriber filters incoming realtime events
   * against its own clientSessionId to suppress echoes of its own writes.
   * Null on legacy rows (pre-migration 20260518130000_collab_build) and on
   * writes from non-AR contexts (e.g. the planner's manual edits).
   */
  last_updated_client_session_id: string | null;
}

export interface DBPartnerReferral {
  id: string;
  venue_id: string;
  referrer_profile_id: string | null;
  referred_profile_id: string;
  source_link: string | null;
  status: DBPartnerReferralStatus;
  qualified_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBPartnerCredit {
  id: string;
  venue_id: string;
  source_referral_id: string | null;
  amount: number;
  unit: string;
  status: DBPartnerCreditStatus;
  available_at: string | null;
  applied_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBAuditLog {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface DBImportLog {
  id: string;
  source_file_id: string | null;
  course_id: string | null;
  uploaded_by: string | null;
  outcome: DBImportLogOutcome;
  warnings_count: number;
  error_message: string | null;
  parser_version: string | null;
  raw_metadata: Record<string, unknown>;
  created_at: string;
}

export interface DBCalibrationLog {
  id: string;
  venue_id: string;
  ring_id: string | null;
  judge_id: string | null;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  ar_provider: string | null;
  marker_count: number | null;
  average_error_cm: number | null;
  max_error_cm: number | null;
  outcome: DBCalibrationOutcome;
  notes: string | null;
  raw_metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Phase 11 — per-venue collaborator grant. Owner X lets `collaborator_email`
 * see and build all of X's courses at `venue_id`. Revoked by setting
 * `revoked_at`; not deleted (audit trail).
 *
 * Resolution at RLS time: the helper `is_course_collaborator_of_*` joins
 * `course_collaborators` → `profiles.email` to map auth.uid() to a grant.
 */
export interface DBCourseCollaborator {
  id: string;
  owner_profile_id: string;
  collaborator_email: string;
  venue_id: string;
  granted_at: string;
  revoked_at: string | null;
}

/**
 * Phase 11 — accepted invite for a build session. One row per
 * (session, redeeming auth.uid()). Inserted only via the
 * `join_build_session` SECURITY DEFINER RPC; direct inserts denied by RLS.
 */
export interface DBBuildSessionParticipant {
  id: string;
  build_session_id: string;
  participant_user_id: string;
  joined_at: string;
  joined_via: 'qr' | 'code';
}

// ---------------------------------------------------------------------------
// Phase 12a — events + event_rings + event_judges
// ---------------------------------------------------------------------------

export type DBEventStatus = 'draft' | 'active' | 'completed' | 'archived';
export type DBEventJudgeStatus = 'invited' | 'active' | 'removed';
export type DBEventJudgeRole = 'judge' | 'co_judge' | 'observer';

/**
 * Phase 12 — venue-scoped show / trial weekend. Container for
 * event_rings, event_judges, and (Phase 12d) event_attachments.
 * Placements without an event still work via course_placements.scheduled_at
 * (Phase 11).
 */
export interface DBEvent {
  id: string;
  venue_id: string;
  name: string;
  start_date: string; // ISO date "YYYY-MM-DD"
  end_date: string | null; // ISO date or null when single-day
  status: DBEventStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Phase 12 — many-to-many of events ↔ rings. Drives RLS widening so
 * event judges can READ the rings of their events.
 */
export interface DBEventRing {
  event_id: string;
  ring_id: string;
  created_at: string;
}

/**
 * Phase 12 — pre-event judge invitation.
 *
 * Pending rows have `profile_id = null` + `invite_email` set; the
 * post-signup linker (migration 20260519120100) flips them on first
 * sign-in by setting `profile_id`, nulling `invite_email`, and
 * setting `status = 'active'`.
 */
export interface DBEventJudge {
  id: string;
  event_id: string;
  profile_id: string | null;
  invite_email: string | null;
  status: DBEventJudgeStatus;
  role: DBEventJudgeRole;
  invited_by: string | null;
  invited_at: string;
  activated_at: string | null;
  removed_at: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 12d — event_attachments (broadcast-first slice)
// ---------------------------------------------------------------------------

/**
 * Author of an `event_attachments` row, stamped server-side by the
 * BEFORE INSERT trigger. The client cannot pick this value.
 */
export type DBEventAttachmentAuthorRole = 'manager' | 'judge';

/**
 * Payload variant of an `event_attachments` row.
 *   - `pdf`  → `storage_path` set, `body_md` null. File lives in the
 *              `event-docs` bucket at `<event_id>/<attachment_id>.pdf`.
 *   - `note` → `body_md` set (markdown, ≤ 8000 chars), `storage_path` null.
 */
export type DBEventAttachmentKind = 'pdf' | 'note';

/**
 * Phase 12d — a single message or document attached to an event.
 *
 * In the broadcast-first slice every row is `author_role = 'manager'`
 * because only venue admins can insert. A follow-up slice will widen
 * INSERT to active judges and start populating `author_role = 'judge'`
 * for the private "Notes to organisers" channel.
 */
export interface DBEventAttachment {
  id: string;
  event_id: string;
  author_profile_id: string;
  author_role: DBEventAttachmentAuthorRole;
  kind: DBEventAttachmentKind;
  title: string | null;
  /** Object key inside the `event-docs` bucket. Set iff `kind = 'pdf'`. */
  storage_path: string | null;
  /** Markdown body. Set iff `kind = 'note'`. */
  body_md: string | null;
  created_at: string;
  updated_at: string;
}
