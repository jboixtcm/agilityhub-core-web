import { centerCourseInRing, type CourseData, type CoursePlacement } from "@agilityhub/course-core";
import { type PlannerRing, ringToCore } from "@agilityhub/course-ui";

/** `Course.normalizedJson` is course-core's `CourseData` (schema v1) when the course has a model. */
export function isCourseData(value: unknown): value is CourseData {
  return typeof value === "object" && value !== null && "obstacles" in value && "numbers" in value;
}

/**
 * The ring a course is drawn in on its own (a MEMBER reads no ring geometry nor placement, R-16-16):
 * the course's design size, without doors, zones or markers (as D18's course page draws it).
 */
export function courseFrameRing(course: CourseData): PlannerRing {
  return {
    border_clearance_m: 0,
    created_at: "",
    default_units: "m",
    doors: [],
    geometry_version: 0,
    id: `course-frame-${course.id}`,
    is_active: true,
    length_m: course.designLengthMeters,
    markers: [],
    name: course.title,
    no_go_zones: [],
    notes: null,
    obstacle_inventory: [],
    surface: null,
    updated_at: "",
    venue_id: "",
    width_m: course.designWidthMeters,
  };
}

/** The course centred in its own frame. */
export function framePlacement(course: CourseData, ring: PlannerRing): CoursePlacement {
  return centerCourseInRing(course, ringToCore(ring));
}

/** What the viewer draws: the course, the ring it is drawn in and where it sits there. */
export interface ViewerScene {
  course: CourseData;
  placement: CoursePlacement;
  ring: PlannerRing;
  /** `true` = the real ring with the stored placement (staff); `false` = the course's own frame. */
  placed: boolean;
}

export function frameScene(course: CourseData): ViewerScene {
  const ring = courseFrameRing(course);
  return { course, placed: false, placement: framePlacement(course, ring), ring };
}
