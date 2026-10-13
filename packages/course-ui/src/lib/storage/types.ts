import type {
  CourseData,
  CoursePlacement,
  ObstacleType,
  Warning,
} from "@agilityhub/course-core";

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
  readonly april_tag_id: number;
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
  readonly thresholdMeters: number;
  readonly name?: string;
  readonly scheduledAt?: string | null;
  readonly activityId?: string | null;
  readonly displayName?: string | null;
  readonly grades?: readonly string[];
  readonly sizes?: readonly ("XS" | "S" | "M" | "I" | "L" | "ALL")[];
  readonly isTraining?: boolean;
  readonly mode?: "event" | "training" | "free-floating";
}

export interface PlannerPlacement {
  readonly id: string;
  readonly version: number;
  readonly ringId: string;
  readonly courseId: string;
}

export interface PlannerBuildSession {
  readonly id: string;
  readonly version: number;
  readonly placementId: string;
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
  updateRingDoors(
    ringId: string,
    doors: readonly SaveRingDoorInput[],
  ): Promise<PlannerRing>;
  uploadSmarterFile(input: UploadCourseInput): Promise<{ readonly course: PlannerCourse }>;
  savePlacement(input: SavePlacementInput): Promise<PlannerPlacement>;
  createBuildSession(input: {
    readonly submissionKey: string;
    readonly placementId: string;
    readonly live?: boolean;
  }): Promise<PlannerBuildSession>;
}
