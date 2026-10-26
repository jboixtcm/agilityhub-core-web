import type { components } from "@agilityhub/api-client";
import {
  centerCourseInRing,
  type CourseData,
  type CoursePlacement,
  placeControlPointsInRing,
  placeCoursePoint,
  placedObstacleHeadingDegrees,
  placeObstacleInRing,
} from "@agilityhub/course-core";
import { type PlannerRing, ringToCore } from "@agilityhub/course-ui";

type MemberSetupPlacement = components["schemas"]["MemberSetupPlacement"];
type ResolvedObstacle = MemberSetupPlacement["resolvedObstacles"][number];

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

/**
 * E9-T07's member projection has no staff-only ring record, but it carries the ring's dimensions,
 * the transform and the placement's `resolvedObstacles`: what stands on the ring, stored when the
 * placement was saved. The viewer draws those (E11-W03, INC-72): a course edited after the
 * placement must not move on the member's screen. Each obstacle the course still has lends its
 * number labels, carried rigidly to the stored point and heading. New placements freeze tunnel
 * curves too; only legacy rows borrow the live course's curve.
 * an obstacle the course no longer has is drawn from the stored row alone. A legacy projection
 * without obstacles draws the course through the transform, and one without the ring's
 * dimensions falls back to the course's own frame in the caller.
 */
export function memberPlacementScene(
  course: CourseData,
  memberPlacement: MemberSetupPlacement,
): ViewerScene | null {
  const length = memberPlacement.ringLengthM ?? null;
  const width = memberPlacement.ringWidthM ?? null;
  if (length === null || width === null || length <= 0 || width <= 0) return null;
  const ring: PlannerRing = {
    border_clearance_m: 0,
    created_at: "",
    default_units: "m",
    doors: [],
    geometry_version: 0,
    id: `member-setup-${course.id}`,
    is_active: true,
    length_m: length,
    markers: [],
    name: course.title,
    no_go_zones: [],
    notes: null,
    obstacle_inventory: [],
    surface: null,
    updated_at: "",
    venue_id: "",
    width_m: width,
  };
  const transform = memberPlacement.transform;
  const placement: CoursePlacement = {
    flipX: transform.flipX,
    flipY: transform.flipY,
    offsetXMeters: transform.offsetXM,
    offsetYMeters: transform.offsetYM,
    // Placement mode is a UI hint; the persisted transform contains the resolved geometry.
    placementMode: "preserveMeters",
    rotationDegrees: transform.rotationDeg,
  };
  if (memberPlacement.resolvedObstacles.length === 0) {
    return { course, placed: true, placement, ring };
  }
  return {
    course: standingCourse(course, placement, memberPlacement.resolvedObstacles, length, width),
    placed: true,
    // The standing course is already in the ring's frame: its centre on the ring's centre.
    placement: {
      flipX: false,
      flipY: false,
      offsetXMeters: length / 2,
      offsetYMeters: width / 2,
      placementMode: "preserveMeters",
      rotationDegrees: 0,
    },
    ring,
  };
}

interface Point {
  x: number;
  y: number;
}

/** A stored number without its label in the course is drawn this far (m) above its obstacle. */
const NUMBER_OFFSET_M = 0.9;

function rotateAbout(point: Point, centre: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: centre.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

/**
 * The course as it stands on the ring, in the ring's frame (its design size is the ring's): one
 * obstacle per stored row, at the stored point and heading. Under the identity placement
 * course-core draws a heading of `-rotationDegrees` (Smarter's Y-down angle), so each obstacle
 * keeps the negated ring heading.
 */
function standingCourse(
  course: CourseData,
  placement: CoursePlacement,
  resolved: readonly ResolvedObstacle[],
  length: number,
  width: number,
): CourseData {
  const live = new Map(course.obstacles.map((obstacle) => [obstacle.sourceId, obstacle]));
  const obstacles: CourseData["obstacles"] = [];
  const numbers: CourseData["numbers"] = [];
  for (const row of resolved) {
    const target = { x: row.x, y: row.y };
    const source = live.get(row.obstacleId);
    const anchor = source === undefined ? null : placeObstacleInRing(source, placement, course);
    // How far the course's obstacle (where the transform puts it today) turned from where it stands.
    const turn =
      source === undefined || anchor === null
        ? 0
        : row.rotationDeg - placedObstacleHeadingDegrees(source.rotationDegrees, placement);
    const carry = (point: Point): Point => {
      if (anchor === null) return target;
      const turned = rotateAbout(point, anchor, turn);
      return { x: turned.x - anchor.x + target.x, y: turned.y - anchor.y + target.y };
    };
    // INC-86: saved points are already in the ring's frame. Null/absent is a legacy placement;
    // an explicitly empty curve must stay empty, even if the live course gained one later.
    const controlPoints =
      row.controlPointsMeters != null
        ? row.controlPointsMeters.map((point) => ({ ...point }))
        : source === undefined || anchor === null
          ? null
          : (placeControlPointsInRing(source.controlPointsMeters, placement, course)?.map(carry) ??
            null);
    obstacles.push({
      colorKey: source?.colorKey ?? null,
      controlPointsMeters: controlPoints,
      id: source?.id ?? `standing-${row.obstacleId}`,
      nominalLengthMeters: source?.nominalLengthMeters ?? null,
      obstacleType: row.type,
      rawMetadata: {},
      rotationDegrees: -row.rotationDeg,
      sourceCode: source?.sourceCode ?? "",
      sourceId: row.obstacleId,
      status: "notPlaced",
      xMeters: target.x,
      yMeters: target.y,
    });
    for (const sequence of row.numbers) {
      const label =
        anchor === null
          ? undefined
          : course.numbers.find(
              (number) =>
                number.linkedObstacleSourceId === row.obstacleId &&
                number.sequenceNumber === sequence,
            );
      const point =
        label === undefined
          ? { x: target.x, y: target.y + NUMBER_OFFSET_M }
          : carry(placeCoursePoint({ x: label.xMeters, y: label.yMeters }, placement, course));
      numbers.push({
        id: label?.id ?? `standing-${row.obstacleId}-${String(sequence)}`,
        linkedObstacleSourceId: row.obstacleId,
        obstacleConnectionPoint: label?.obstacleConnectionPoint ?? null,
        rawMetadata: {},
        sequenceKey: label?.sequenceKey ?? "n1",
        sequenceNumber: sequence,
        text: label?.text ?? String(sequence),
        xMeters: point.x,
        yMeters: point.y,
      });
    }
  }
  return {
    ...course,
    designLengthMeters: length,
    designWidthMeters: width,
    // Only what stands on the ring: the course's own zones are no part of it.
    noGoZones: [],
    numbers,
    obstacles,
  };
}
