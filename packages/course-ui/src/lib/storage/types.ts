import type { CourseData, CoursePlacement, ObstacleType, Warning } from "@agilityhub/course-core";

export const MAX_RING_DOORS = 4;

export interface PlannerVenue {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string | null;
  readonly default_paper_size: "a4" | "letter";
}

export interface PlannerRingDoor {
  readonly id: string;
  readonly label: string;
  readonly polygon_points_m: readonly { x: number; y: number }[];
  readonly clearance_m: number;
  readonly flow?: "in" | "out" | "both" | null;
  readonly is_active?: boolean;
  readonly side?: string | null;
  readonly start_m?: number | null;
  readonly end_m?: number | null;
  readonly notes?: string | null;
}

export interface PlannerRingMarker {
  readonly id: string;
  readonly ring_id: string;
  readonly label: string;
  readonly marker_uid: string;
  readonly role: string;
  readonly x_m: number;
  readonly y_m: number;
  readonly z_m: number;
  readonly rotation_y_deg: number;
  readonly physical_width_m: number;
  readonly physical_height_m: number;
  readonly is_fixed: boolean;
  readonly is_active: boolean;
  readonly april_tag_id: number | null;
  readonly notes: string | null;
}

export interface PlannerRing {
  readonly id: string;
  readonly venue_id: string;
  readonly name: string;
  readonly default_units: "m" | "ft";
  readonly length_m: number;
  readonly width_m: number;
  readonly surface: string | null;
  readonly notes: string | null;
  readonly is_active: boolean;
  readonly border_clearance_m: number;
  readonly geometry_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly doors: readonly PlannerRingDoor[];
  readonly no_go_zones: readonly {
    readonly id: string;
    readonly label: string;
    readonly polygon_points_m: readonly { x: number; y: number }[];
    readonly warning_margin_m: number;
  }[];
  readonly markers: readonly PlannerRingMarker[];
  readonly obstacle_inventory: readonly {
    readonly obstacle_type: ObstacleType;
    readonly quantity: number;
  }[];
}

export interface SaveRingDoorInput {
  readonly id?: string;
  readonly label: string;
  readonly side: "north" | "south" | "east" | "west";
  readonly startMeters: number;
  readonly endMeters: number;
  readonly flow: "in" | "out" | "both";
  readonly clearanceMeters?: number;
  readonly isActive?: boolean;
  readonly notes?: string | null;
}

export interface UploadCourseInput {
  readonly submissionKey: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly courseData: CourseData;
}

export interface PlannerCourse {
  readonly id: string;
  readonly version: number;
  readonly name: string;
}

export interface SavePlacementInput {
  readonly submissionKey: string;
  readonly course: CourseData;
  readonly courseId: string;
  readonly courseVersion: number;
  readonly venueId: string;
  readonly ringId: string;
  readonly placement: CoursePlacement;
  readonly warnings: readonly Warning[];
  /**
   * The placement's `warningThresholdM`; `null` (or absent) lets the api apply the club's
   * `courses.defaultWarningThresholdM` (R-16-05), which an INSTRUCTOR cannot read.
   */
  readonly thresholdMeters?: number | null;
  readonly name?: string;
  readonly scheduledAt?: string | null;
  readonly activityId?: string | null;
  readonly displayName?: string | null;
  readonly grades?: readonly string[];
  readonly sizes?: readonly PlacementSize[];
  readonly isTraining?: boolean;
  readonly mode?: "event" | "training" | "free-floating";
  /** Only when the user chooses it; absent, the api's default applies (`DRAFT`). */
  readonly status?: PlannerPlacement["status"];
  /**
   * R-16-05: a placement with a `critical` warning is refused (`422 PLACEMENT_BLOCKED{warnings}`)
   * unless an ADMIN confirms it; the confirmed retry sends `force: true` (and a new
   * `submissionKey`, since the body changes).
   */
  readonly force?: boolean;
}

/**
 * `PUT /placements/{id}` replaces the placement (R-16-05/06): the body is the stored placement the
 * user read (`stored`, at its `version`, so another editor's save in between answers
 * `409 STALE_VERSION`) with the user's new transform, course-core's recalculated obstacles and
 * warnings, and only the fields the user edited (`edits`). Everything else (schedule, grades,
 * sizes, threshold, status, mode, activity) goes back as it is stored, because the api replaces
 * a missing value with its default (E9-W03 round 2, review #1). The ring and the course are kept.
 */
export interface UpdatePlacementInput {
  readonly stored: PlannerPlacement;
  readonly course: CourseData;
  /** The course's version the user placed (the api wants its current version). */
  readonly courseVersion: number;
  readonly placement: CoursePlacement;
  readonly warnings: readonly Warning[];
  readonly force?: boolean;
  readonly edits?: PlacementEdits;
}

/** What the user changed on a stored placement; an absent field keeps the stored value. */
export interface PlacementEdits {
  readonly name?: string | null;
  readonly displayName?: string | null;
  readonly scheduledAt?: string | null;
  readonly activityId?: string | null;
  readonly grades?: readonly string[];
  readonly sizes?: readonly PlacementSize[];
  readonly thresholdMeters?: number;
  readonly status?: PlannerPlacement["status"];
  readonly mode?: PlannerPlacement["mode"];
}

export type PlacementSize = "XS" | "S" | "M" | "I" | "L" | "ALL";

export interface PlannerPlacement {
  readonly id: string;
  readonly version: number;
  readonly ringId: string;
  readonly courseId: string;
  readonly courseVersion: number;
  readonly activityId: string | null;
  readonly displayName: string | null;
  readonly name: string | null;
  readonly scheduledAt: string | null;
  readonly mode: "EVENT" | "TRAINING" | "FREE_FLOATING";
  readonly status: "DRAFT" | "READY_TO_BUILD" | "ARCHIVED";
  /** The stored transform, in course-core's shape (what the editor reopens). */
  readonly placement: CoursePlacement;
  /** R-16-06: the ring's geometry changed after the placement was resolved. */
  readonly stale: boolean;
  readonly updatedAt: string;
  readonly grades: readonly string[];
  readonly sizes: readonly PlacementSize[];
  readonly warningThresholdM: number;
  /** R-16-10: the stored build sheet (`GET /placements/{id}/build-sheet`), `null` without one. */
  readonly buildSheetFileKey: string | null;
}

export interface ListCalendarPlacementsInput {
  readonly ringId?: string;
  readonly courseId?: string;
  readonly activityId?: string;
}

export interface CreateMarkerInput {
  readonly ringId: string;
  /**
   * The geometry version the user read (`PlannerRing.geometry_version`): another editor's save in
   * between answers `409 STALE_VERSION` instead of being overwritten (R-16-04). Without it the
   * write is based on the geometry read just before it.
   */
  readonly geometryVersion?: number;
  readonly label: string;
  readonly markerUid: string;
  readonly role: string;
  readonly xMeters: number;
  readonly yMeters: number;
  readonly zMeters?: number;
  readonly rotationYDegrees?: number;
  readonly physicalWidthMeters: number;
  readonly physicalHeightMeters: number;
  readonly isFixed?: boolean;
  readonly aprilTagId?: number | null;
  readonly notes?: string | null;
}

export interface UpdateMarkerPatch {
  /** The geometry version the user read; see `CreateMarkerInput.geometryVersion`. */
  readonly geometryVersion?: number;
  readonly label?: string;
  readonly role?: string;
  readonly xMeters?: number;
  readonly yMeters?: number;
  readonly zMeters?: number;
  readonly rotationYDegrees?: number;
  readonly physicalWidthMeters?: number;
  readonly physicalHeightMeters?: number;
  readonly isFixed?: boolean;
  readonly isActive?: boolean;
  readonly notes?: string | null;
}

export interface PlannerCalibrationLog {
  readonly appVersion: string | null;
  readonly arProvider: string | null;
  readonly averageErrorCm: number;
  readonly createdAt: string;
  readonly createdByAccountId: string;
  readonly deviceModel: string | null;
  readonly id: string;
  readonly markerCount: number;
  readonly maxErrorCm: number;
  readonly notes: string | null;
  readonly osVersion: string | null;
  readonly outcome: "GREEN" | "YELLOW" | "RED" | "ABORTED";
  readonly rawMetadata: unknown;
  readonly ringId: string;
}

export interface CreateCalibrationLogInput {
  readonly ringId: string;
  readonly outcome: PlannerCalibrationLog["outcome"];
  readonly averageErrorCm: number;
  readonly maxErrorCm: number;
  readonly markerCount: number;
  readonly notes?: string | null;
  readonly rawMetadata?: Record<string, unknown>;
  readonly appVersion?: string | null;
  readonly arProvider?: string | null;
  readonly deviceModel?: string | null;
  readonly osVersion?: string | null;
}

export interface PlannerBuildObstacleStatus {
  readonly obstacleId: string;
  readonly status: "NOT_PLACED" | "CURRENT" | "PLACED" | "SKIPPED" | "NEEDS_CHECK";
  readonly at: string | null;
  readonly byAccountId: string | null;
  readonly lastUpdatedClientSessionId: string | null;
}

export interface UpsertBuildObstacleStatusInput {
  readonly buildSessionId: string;
  readonly obstacleId: string;
  readonly status: PlannerBuildObstacleStatus["status"];
  readonly version?: number | null;
}

export interface PlannerBuildSession {
  readonly id: string;
  readonly version: number;
  readonly placementId: string;
  readonly ringId: string;
  readonly buildSheetFileKey: string | null;
  readonly finishedAt: string | null;
  readonly joinCode: string;
  readonly joinToken: string | null;
  readonly joinTokenRotatedAt: string | null;
  readonly lastKnownMarkerId: string | null;
  readonly live: boolean;
  readonly localCacheVersion: number;
  readonly obstacles: readonly PlannerBuildObstacleStatus[];
  readonly participants: readonly {
    readonly accountId: string;
    readonly joinedAt: string;
    readonly joinedVia: "QR" | "CODE";
  }[];
  readonly progressJson: unknown;
  readonly selectedStrategy: "EQUIPMENT_TYPE" | "CLOSER_OBSTACLE_ORDER" | "FREE_BUILD";
  readonly startedAt: string | null;
  readonly startedByAccountId: string;
  readonly status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
}

export interface PlannerStore {
  readonly kind: "core-api";
  listVenues(): Promise<readonly PlannerVenue[]>;
  listRings(venueId: string): Promise<readonly PlannerRing[]>;
  getRing(ringId: string): Promise<PlannerRing | null>;
  updateRingInventory(
    ringId: string,
    inventory: readonly { obstacle_type: ObstacleType; quantity: number }[],
  ): Promise<PlannerRing>;
  /**
   * Replaces the ring's doors under optimistic locking: `geometryVersion` is the version the user
   * edited (`PlannerRing.geometry_version`), so another editor's save in between answers
   * `409 STALE_VERSION` instead of being overwritten (CONVENCIONS_API §7, R-16-04).
   */
  updateRingDoors(
    ringId: string,
    doors: readonly SaveRingDoorInput[],
    geometryVersion: number,
  ): Promise<PlannerRing>;
  uploadSmarterFile(input: UploadCourseInput): Promise<{ readonly course: PlannerCourse }>;
  savePlacement(input: SavePlacementInput): Promise<PlannerPlacement>;
  updatePlacement(input: UpdatePlacementInput): Promise<PlannerPlacement>;
  listCalendarPlacements(input?: ListCalendarPlacementsInput): Promise<readonly PlannerPlacement[]>;
  listMarkers(ringId: string): Promise<readonly PlannerRingMarker[]>;
  createMarker(input: CreateMarkerInput): Promise<PlannerRingMarker>;
  updateMarker(
    ringId: string,
    markerId: string,
    patch: UpdateMarkerPatch,
  ): Promise<PlannerRingMarker>;
  /** `geometryVersion` is the version the user read (E9-W02 review #2): never a silent overwrite. */
  deactivateMarker(
    ringId: string,
    markerId: string,
    geometryVersion: number,
  ): Promise<PlannerRingMarker>;
  listCalibrationLogs(ringId: string): Promise<readonly PlannerCalibrationLog[]>;
  createCalibrationLog(input: CreateCalibrationLogInput): Promise<PlannerCalibrationLog>;
  createBuildSession(input: {
    readonly submissionKey: string;
    readonly placementId: string;
    readonly live?: boolean;
  }): Promise<PlannerBuildSession>;
  getBuildSession(buildSessionId: string): Promise<PlannerBuildSession | null>;
  listBuildObstacleStatuses(buildSessionId: string): Promise<readonly PlannerBuildObstacleStatus[]>;
  upsertBuildObstacleStatus(
    input: UpsertBuildObstacleStatusInput,
  ): Promise<PlannerBuildObstacleStatus>;
  /** R-16-11: `POST /build-sessions/{id}/finish` with the caller-owned `Idempotency-Key`. */
  finishBuildSession(input: {
    readonly buildSessionId: string;
    readonly submissionKey: string;
  }): Promise<PlannerBuildSession>;
  subscribeBuildObstacleStatuses(
    buildSessionId: string,
    onChange: (status: PlannerBuildObstacleStatus) => void,
  ): () => void;
}
