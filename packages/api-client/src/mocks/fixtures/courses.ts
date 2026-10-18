/**
 * The S16 mock world (E9-W03): the club's course library, the AgilityHub library, the rings'
 * geometry and inventory, placements and the setups history. Every course is a fictional one
 * built here (no Smarter export of a real person): a `CourseData` with the course-core shape, so
 * the planner components draw it and course-core places it exactly as with an import.
 */
import {
  centerCourseInRing,
  coursePathLengthMeters,
  placedObstacleHeadingDegrees,
  placeObstacleInRing,
  type CourseData,
  type CoursePlacement,
  type ObstacleType,
  type Ring as CoreRing,
} from "@agilityhub/course-core";

import type { components } from "../../generated/schema";
import { callerClubOwnsTheWorld, currentMockScenario } from "../scenarios";

import { clubInstant } from "./calendar";
import { catalogState } from "./catalogs";
import { addDays, clubLocalDate } from "./planning";
import { findParameter } from "./settings";

/**
 * `ACTIVITY_IDS.league` of `fixtures/activities` (the «Lliga social — 3a jornada» on every ring),
 * written out: that module reads this one for `Activity.placementIds`.
 */
const LEAGUE_ACTIVITY_ID = "activity-lliga-social-3";

type Schemas = components["schemas"];
export type Course = Schemas["Course"];
export type Placement = Schemas["Placement"];
export type RingGeometry = Schemas["RingGeometry"];
export type RingSetup = Schemas["RingSetup"];
export type ObstacleInventory = Schemas["ObstacleInventory"];
export type BuildSession = Schemas["BuildSession"];

export const COURSE_IDS = {
  agility: "course-agility-c-d",
  foundations: "course-ah-foundations-07",
  image: "course-plano-gimcana",
  jumping: "course-jumping-dijous",
  mine: "course-circuit-estiu",
} as const;

export const PLACEMENT_IDS = {
  centralLeague: "placement-central-lliga",
  muntanyaJumping: "placement-muntanya-dijous",
} as const;

export const SETUP_IDS = {
  centralPhoto: "setup-central-foto",
  muntanyaActive: "setup-muntanya-dijous",
  muntanyaDismantled: "setup-muntanya-buida",
  muntanyaExpired: "setup-muntanya-agility",
} as const;

const ADMIN_ACCOUNT = "10000000-0000-4000-8000-000000000001";
const INSTRUCTOR_ACCOUNT = "10000000-0000-4000-8000-000000000003";
export const COURSES_CLUB_ID = "50000000-0000-4000-8000-000000000001";

/** Where the mock storage serves the files (`thumbnailUrl`, `imageUrl`). */
export const COURSE_FILES_ORIGIN = "https://files.example.test";

type ObstacleRow = readonly [
  type: ObstacleType,
  x: number,
  y: number,
  rotation: number,
  numbers: readonly number[],
];

const SOURCE_CODES: Readonly<Record<ObstacleType, string>> = {
  AFrame: "af",
  DogWalk: "dw",
  DoubleJump: "dj",
  Jump: "jb",
  LongJump: "lj",
  Seesaw: "ss",
  Tire: "ty",
  Tunnel3m: "t3s",
  Tunnel4m: "t4s",
  Tunnel5m: "t5s",
  Tunnel6m: "t6s",
  Unknown: "x",
  Wall: "wl",
  Weave: "w12",
};

/** A course with the shape `parseSmarterTxt` returns (Smarter's top-left origin, Y down). */
function courseData(
  id: string,
  title: string,
  designer: string,
  courseType: string,
  size: { length: number; width: number },
  rows: readonly ObstacleRow[],
): CourseData {
  return {
    canvasHeight: size.width * 30,
    canvasWidth: size.length * 30,
    designLengthMeters: size.length,
    designWidthMeters: size.width,
    id,
    ignoredLogos: [],
    metadata: {
      category: "",
      courseType,
      date: "2026-09-30",
      designer,
      exportVersion: null,
      grade: "",
      location: "",
      obstacleSummary: null,
      organization: "fci",
      type: "smarter",
    },
    noGoZones: [],
    numbers: rows.flatMap(([, x, y, , numbers], index) =>
      numbers.map((sequenceNumber, offset) => ({
        id: `n-${String(sequenceNumber)}`,
        linkedObstacleSourceId: String(index + 1),
        obstacleConnectionPoint: null,
        rawMetadata: {},
        sequenceKey: "n1",
        sequenceNumber,
        text: String(sequenceNumber),
        xMeters: x + 1 + offset,
        yMeters: y - 1,
      })),
    ),
    obstacles: rows.map(([type, x, y, rotation], index) => {
      const tunnel = type.startsWith("Tunnel");
      return {
        colorKey: null,
        controlPointsMeters: tunnel
          ? [
              { x: x - 1.5, y: y + 1 },
              { x, y },
              { x: x + 1.5, y: y + 1 },
            ]
          : null,
        id: `o-${String(index + 1)}`,
        nominalLengthMeters: tunnel ? Number(type.slice(6, 7)) : null,
        obstacleType: type,
        rawMetadata: {},
        rotationDegrees: tunnel ? null : rotation,
        sourceCode: SOURCE_CODES[type],
        sourceId: String(index + 1),
        status: "notPlaced",
        xMeters: x,
        yMeters: y,
      };
    }),
    origin: "LT",
    rawMetadata: {},
    source: "smarter-agility",
    sourceFileName: `${id}.txt`,
    themeId: "agilityhub",
    title,
    titleRaw: title,
    units: "M",
  };
}

const JUMPING_ROWS: readonly ObstacleRow[] = [
  ["Jump", 4, 16, 90, [1]],
  ["Jump", 9, 16, 90, [2]],
  ["Tunnel4m", 14, 13, 0, [3]],
  ["Jump", 18, 10, 0, [4, 10]],
  ["Weave", 23, 12, 90, [5]],
  ["Jump", 26, 6, 0, [6]],
  ["Jump", 21, 4, 90, [7]],
  ["DoubleJump", 15, 4, 90, [8]],
  ["Tire", 10, 5, 90, [9]],
  ["LongJump", 6, 9, 45, [11]],
  ["Jump", 3, 4, 90, [12]],
];

const AGILITY_ROWS: readonly ObstacleRow[] = [
  ["Jump", 4, 18, 90, [1]],
  ["AFrame", 10, 17, 90, [2]],
  ["Jump", 16, 18, 90, [3]],
  ["Tunnel5m", 21, 15, 0, [4]],
  ["Jump", 26, 12, 0, [5]],
  ["DogWalk", 22, 7, 90, [6]],
  ["Jump", 15, 5, 90, [7]],
  ["Seesaw", 9, 6, 90, [8]],
  ["Tire", 5, 9, 0, [9]],
  ["Weave", 12, 11, 90, [10]],
  ["Jump", 18, 11, 0, [11]],
  ["Wall", 28, 4, 90, [12]],
];

const FOUNDATIONS_ROWS: readonly ObstacleRow[] = [
  ["Jump", 3, 12, 90, [1]],
  ["Jump", 8, 12, 90, [2]],
  ["Tunnel3m", 13, 10, 0, [3]],
  ["Jump", 18, 8, 0, [4]],
  ["Jump", 14, 4, 90, [5]],
  ["Jump", 8, 4, 90, [6]],
  ["Tire", 4, 6, 0, [7]],
];

const SUMMER_ROWS: readonly ObstacleRow[] = [
  ["Jump", 5, 10, 90, [1]],
  ["Jump", 10, 10, 90, [2]],
  ["Weave", 15, 6, 90, [3]],
  ["Jump", 20, 4, 0, [4]],
];

export const courseModels: Readonly<Record<string, CourseData>> = {
  [COURSE_IDS.agility]: courseData(
    COURSE_IDS.agility,
    "Agility C–D",
    "Pere Soler",
    "Agility",
    { length: 32, width: 22 },
    AGILITY_ROWS,
  ),
  [COURSE_IDS.foundations]: courseData(
    COURSE_IDS.foundations,
    "AH · Foundations 07",
    "AgilityHub",
    "Jumping",
    { length: 24, width: 16 },
    FOUNDATIONS_ROWS,
  ),
  [COURSE_IDS.jumping]: courseData(
    COURSE_IDS.jumping,
    "Jumping del dijous",
    "Marta Vidal",
    "Jumping",
    { length: 30, width: 20 },
    JUMPING_ROWS,
  ),
  [COURSE_IDS.mine]: courseData(
    COURSE_IDS.mine,
    "Circuit d'estiu",
    "Aina Serra",
    "Jumping",
    { length: 26, width: 14 },
    SUMMER_ROWS,
  ),
};

/** `stats` as the api derives them from the model (R-16-01: the path length comes from the client). */
export function courseStats(model: CourseData | null, pathLengthM = 0): Schemas["CourseStats"] {
  return model === null
    ? { bbox: { h: 0, w: 0 }, obstacleCount: 0, pathLengthM }
    : {
        bbox: { h: model.designWidthMeters, w: model.designLengthMeters },
        obstacleCount: model.obstacles.length,
        pathLengthM,
      };
}

function thumbnailUrl(courseId: string): string {
  return `${COURSE_FILES_ORIGIN}/thumbnails/${courseId}.svg`;
}

function storedCourse(
  id: string,
  fields: Partial<Course> & Pick<Course, "discipline" | "ownerType" | "source" | "visibility">,
  nameI18n: Record<string, string>,
): Course {
  const model = courseModels[id] ?? null;
  return {
    agilityhubLevel: null,
    canvasHeight: model?.canvasHeight ?? null,
    canvasWidth: model?.canvasWidth ?? null,
    clubId: fields.ownerType === "CLUB" ? COURSES_CLUB_ID : null,
    courseGrade: null,
    courseType: model?.metadata.courseType ?? null,
    createdAt: "2026-10-01T08:00:00Z",
    createdByAccountId: ADMIN_ACCOUNT,
    designLengthM: model?.designLengthMeters ?? null,
    designWidthM: model?.designWidthMeters ?? null,
    designedOn: null,
    designerName: model?.metadata.designer ?? null,
    eventName: null,
    id,
    imageFileKey: null,
    imageUrl: null,
    levelIds: [],
    name: nameI18n.ca ?? "",
    nameI18n,
    normalizedJson: model,
    notes: null,
    origin: model === null ? null : model.origin,
    ownerAccountId: null,
    schemaVersion: model === null ? null : 1,
    sizeCategory: null,
    sourceCourseId: null,
    sourceFileKey: model === null ? null : `${COURSES_CLUB_ID}/courses/${id}.txt`,
    stats: courseStats(model, model === null ? 0 : coursePathLengthMeters(model)),
    tags: [],
    thumbnailFileKey: model === null ? null : `${COURSES_CLUB_ID}/courses/${id}.svg`,
    thumbnailUrl: model === null ? null : thumbnailUrl(id),
    updatedAt: "2026-10-01T08:00:00Z",
    version: 1,
    ...fields,
  };
}

function initialCourses(): Course[] {
  return [
    storedCourse(
      COURSE_IDS.jumping,
      {
        agilityhubLevel: "MEDIUM",
        designedOn: "2026-09-30",
        discipline: "JUMPING",
        notes: "Pensat per al grup de dijous a la tarda.",
        ownerType: "CLUB",
        source: "SMARTER",
        tags: ["jumping", "dijous"],
        updatedAt: "2026-10-12T17:00:00Z",
        version: 3,
        visibility: "CLUB",
      },
      { ca: "Jumping del dijous", es: "Jumping del jueves" },
    ),
    storedCourse(
      COURSE_IDS.agility,
      {
        createdByAccountId: INSTRUCTOR_ACCOUNT,
        discipline: "AGILITY",
        levelIds: ["level-c", "level-d"],
        ownerType: "CLUB",
        source: "SMARTER",
        updatedAt: "2026-10-08T09:30:00Z",
        visibility: "CLUB",
      },
      { ca: "Agility C–D" },
    ),
    storedCourse(
      COURSE_IDS.image,
      {
        designerName: "Pere Soler",
        discipline: "OTHER",
        imageFileKey: `${COURSES_CLUB_ID}/courses/gimcana.svg`,
        imageUrl: `${COURSE_FILES_ORIGIN}/courses/gimcana.svg`,
        ownerType: "CLUB",
        source: "IMAGE",
        thumbnailUrl: `${COURSE_FILES_ORIGIN}/courses/gimcana.svg`,
        updatedAt: "2026-09-20T10:00:00Z",
        visibility: "CLUB",
      },
      { ca: "Plànol de la gimcana", es: "Plano de la gincana" },
    ),
    storedCourse(
      COURSE_IDS.foundations,
      {
        agilityhubLevel: "EASY",
        clubId: null,
        createdByAccountId: "10000000-0000-4000-8000-0000000000aa",
        discipline: "JUMPING",
        ownerType: "AGILITYHUB",
        source: "EDITOR",
        sourceFileKey: null,
        updatedAt: "2026-09-01T08:00:00Z",
        visibility: "PUBLIC",
      },
      { ca: "AH · Foundations 07", en: "AH · Foundations 07", es: "AH · Foundations 07" },
    ),
    storedCourse(
      COURSE_IDS.mine,
      {
        discipline: "JUMPING",
        ownerAccountId: ADMIN_ACCOUNT,
        ownerType: "ACCOUNT",
        source: "SMARTER",
        updatedAt: "2026-08-14T08:00:00Z",
        visibility: "PRIVATE",
      },
      { ca: "Circuit d'estiu" },
    ),
  ];
}

function marker(
  ringSlug: string,
  label: string,
  x: number,
  y: number,
  aprilTagId: number,
): Schemas["RingMarker"] {
  return {
    aprilTagId,
    id: `marker-${ringSlug}-${label.toLowerCase()}`,
    isActive: true,
    isFixed: true,
    label,
    markerUid: `club-${ringSlug}-${label.toLowerCase()}`,
    notes: null,
    physicalHeightM: 0.19,
    physicalWidthM: 0.19,
    role: "corner",
    rotationYDeg: 0,
    xM: x,
    yM: y,
    zM: 0,
  };
}

function initialGeometries(): Record<string, RingGeometry> {
  return {
    "ring-central": {
      borderClearanceM: 1,
      doors: [
        {
          clearanceM: 1.5,
          endM: 16,
          flow: "BOTH",
          id: "door-central-porta",
          isActive: true,
          label: "Porta",
          notes: null,
          polygonPointsM: [
            { x: 14, y: 0 },
            { x: 16, y: 0 },
            { x: 16, y: 0.1 },
            { x: 14, y: 0.1 },
          ],
          side: "SOUTH",
          startM: 14,
        },
      ],
      lengthM: 36,
      markers: [
        marker("central", "A", 0, 0, 211),
        marker("central", "B", 36, 0, 212),
        marker("central", "C", 36, 26, 213),
        marker("central", "D", 0, 26, 214),
      ],
      noGoZones: [],
      notes: null,
      orientationDeg: 90,
      surface: "ARTIFICIAL",
      updatedAt: "2026-09-25T08:00:00Z",
      version: 1,
      widthM: 26,
    },
    "ring-muntanya": {
      borderClearanceM: 1,
      doors: [
        {
          clearanceM: 1.5,
          endM: 5,
          flow: "IN",
          id: "door-muntanya-entrada",
          isActive: true,
          label: "Entrada",
          notes: null,
          polygonPointsM: [
            { x: 3, y: 25 },
            { x: 5, y: 25 },
            { x: 5, y: 24.9 },
            { x: 3, y: 24.9 },
          ],
          side: "NORTH",
          startM: 3,
        },
        {
          clearanceM: 1.5,
          endM: 37,
          flow: "OUT",
          id: "door-muntanya-sortida",
          isActive: true,
          label: "Sortida",
          notes: null,
          polygonPointsM: [
            { x: 35, y: 0 },
            { x: 37, y: 0 },
            { x: 37, y: 0.1 },
            { x: 35, y: 0.1 },
          ],
          side: "SOUTH",
          startM: 35,
        },
      ],
      lengthM: 40,
      markers: [
        marker("muntanya", "A", 0, 0, 101),
        marker("muntanya", "B", 40, 0, 102),
        marker("muntanya", "C", 40, 25, 103),
        marker("muntanya", "D", 0, 25, 104),
      ],
      noGoZones: [
        {
          id: "zone-muntanya-bassa",
          label: "Bassa",
          polygonPointsM: [
            { x: 1.5, y: 1.5 },
            { x: 4.5, y: 1.5 },
            { x: 4.5, y: 4.5 },
            { x: 1.5, y: 4.5 },
          ],
          warningMarginM: 0.5,
        },
      ],
      notes: "Gespa: el racó de la bassa queda tancat quan plou.",
      orientationDeg: 15,
      surface: "GRASS",
      updatedAt: "2026-10-13T08:00:00Z",
      version: 4,
      widthM: 25,
    },
  };
}

function initialInventories(): Record<string, ObstacleInventory> {
  return {
    club: {
      items: [
        { count: 16, type: "Jump" },
        { count: 2, type: "DoubleJump" },
        { count: 2, type: "Tunnel4m" },
        { count: 1, type: "Tunnel5m" },
        { count: 2, type: "Weave" },
        { count: 1, type: "AFrame" },
        { count: 1, type: "DogWalk" },
        { count: 1, type: "Seesaw" },
        { count: 2, type: "Tire" },
        { count: 1, type: "LongJump" },
        { count: 1, type: "Wall" },
      ],
      ringId: null,
      scope: "CLUB",
      updatedAt: "2026-09-25T08:00:00Z",
    },
    "ring:ring-muntanya": {
      items: [
        { count: 12, type: "Jump" },
        { count: 1, type: "DoubleJump" },
        { count: 1, type: "Tunnel4m" },
        { count: 1, type: "Weave" },
        { count: 1, type: "Tire" },
        { count: 1, type: "LongJump" },
      ],
      ringId: "ring-muntanya",
      scope: "RING",
      updatedAt: "2026-10-01T08:00:00Z",
    },
  };
}

/** course-core's view of a stored ring geometry (for the fixtures' placements). */
export function coreRing(ringId: string, geometry: RingGeometry): CoreRing {
  return {
    borderClearanceMeters: geometry.borderClearanceM,
    doors: [],
    id: ringId,
    label: ringId,
    lengthMeters: geometry.lengthM,
    noGoZones: [],
    obstacleInventory: {},
    widthMeters: geometry.widthM,
  };
}

/** `resolvedObstacles` as course-core computes them on the client (R-16-05). */
export function resolvedObstaclesOf(
  model: CourseData,
  placement: CoursePlacement,
): Schemas["ResolvedObstacle"][] {
  return model.obstacles.flatMap((obstacle) => {
    const point = placeObstacleInRing(obstacle, placement, model);
    if (point === null) return [];
    return [
      {
        numbers: model.numbers
          .filter((number) => number.linkedObstacleSourceId === obstacle.sourceId)
          .flatMap((number) => (number.sequenceNumber === null ? [] : [number.sequenceNumber])),
        obstacleId: obstacle.sourceId,
        rotationDeg: placedObstacleHeadingDegrees(obstacle.rotationDegrees, placement),
        type: obstacle.obstacleType,
        x: point.x,
        y: point.y,
      },
    ];
  });
}

function placementMode(mode: CoursePlacement["placementMode"]): Placement["placementMode"] {
  return mode === "centered"
    ? "CENTERED"
    : mode === "fitToRing"
      ? "FIT_TO_RING"
      : "PRESERVE_METERS";
}

function fixturePlacement(
  id: string,
  courseId: string,
  ringId: string,
  geometry: RingGeometry,
  fields: Partial<Placement>,
): Placement {
  const model = courseModels[courseId];
  if (model === undefined) throw new Error(`COURSE_MODEL_NOT_FOUND:${courseId}`);
  const placement = centerCourseInRing(model, coreRing(ringId, geometry));
  return {
    activityId: null,
    buildSheetFileKey: null,
    classSessionIds: [],
    courseId,
    courseVersion: 1,
    createdAt: "2026-10-10T08:00:00Z",
    createdByAccountId: ADMIN_ACCOUNT,
    displayName: null,
    grades: [],
    id,
    mode: "TRAINING",
    name: null,
    placementMode: placementMode(placement.placementMode),
    resolvedObstacles: resolvedObstaclesOf(model, placement),
    ringId,
    scheduledAt: null,
    sizes: [],
    stale: false,
    status: "READY_TO_BUILD",
    transform: {
      flipX: placement.flipX,
      flipY: placement.flipY,
      offsetXM: placement.offsetXMeters,
      offsetYM: placement.offsetYMeters,
      rotationDeg: placement.rotationDegrees,
    },
    updatedAt: "2026-10-10T08:00:00Z",
    version: 1,
    warningThresholdM: 1.5,
    warnings: [],
    ...fields,
  };
}

/** R-16-10: the build sheet the league placement has stored (D7 offers it). */
const LEAGUE_BUILD_SHEET_KEY = `${COURSES_CLUB_ID}/courses/7c1e0b9a-3f52-4d8e-9a41-2b6f0c8d5e17`;

/**
 * The stored sheet's bytes: a one-page landscape A4 PDF with the ring's outline (a real PDF, so a
 * browser opens it; the client renders the real sheet with course-ui).
 */
function leagueBuildSheetPdf(): Uint8Array {
  const content = "1 w 96 120 650 470 re S";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R >>",
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${String(index + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  const size = String(objects.length + 1);
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function initialPlacements(geometries: Record<string, RingGeometry>): Placement[] {
  const muntanya = geometries["ring-muntanya"];
  const central = geometries["ring-central"];
  if (muntanya === undefined || central === undefined) throw new Error("GEOMETRY_NOT_FOUND");
  return [
    // R-16-06: the Muntanya geometry changed (v4, 13-10) after this placement was resolved.
    fixturePlacement(PLACEMENT_IDS.muntanyaJumping, COURSE_IDS.jumping, "ring-muntanya", muntanya, {
      courseVersion: 3,
      name: "Dijous tarda",
      stale: true,
      updatedAt: "2026-10-12T17:30:00Z",
      version: 2,
    }),
    fixturePlacement(PLACEMENT_IDS.centralLeague, COURSE_IDS.agility, "ring-central", central, {
      activityId: LEAGUE_ACTIVITY_ID,
      buildSheetFileKey: LEAGUE_BUILD_SHEET_KEY,
      mode: "EVENT",
      name: "Lliga social · recorregut 1",
      updatedAt: "2026-09-26T08:00:00Z",
    }),
  ];
}

function setup(
  id: string,
  ringId: string,
  fields: Partial<RingSetup> & Pick<RingSetup, "builtAt" | "expiresAt" | "kind" | "status">,
): RingSetup {
  return {
    agilityhubLevel: null,
    builtByAccountId: INSTRUCTOR_ACCOUNT,
    builtByName: "Ivet Puig",
    courseId: null,
    createdAt: fields.builtAt,
    dismantledAt: null,
    dismantledByAccountId: null,
    expectedUntil: null,
    id,
    imageFileKey: null,
    imageUrl: null,
    levelIds: [],
    notes: null,
    placementId: null,
    ringId,
    view: "STAFF",
    ...fields,
  };
}

/**
 * The setups history, dated from the club-local `today` of the reset (like the planning world), so
 * «muntat ahir» reads right under any pinned clock: Muntanya's ACTIVE setup was built yesterday at
 * 19:00 from the Thursday placement (sent as D18's «Registra-ho com a muntat» sends it: the
 * placement only, so `courseId` is null), replacing the EMPTY one of five days ago; the AGILITY one
 * of fifteen days ago (sent with `courseId`) expired; Central's ACTIVE setup is a photo of two days
 * ago. Carretera, Cadells and Petita have none. Each expires at the club's midnight seven days
 * after it was built (`courses.setupAutoExpireDays`, no `expectedUntil`).
 */
export function initialSetups(today: string = clubLocalDate()): RingSetup[] {
  const at = (days: number, time: string) => clubInstant(addDays(today, days), time);
  const expiry = (builtDaysAgo: number) => clubInstant(addDays(today, 7 - builtDaysAgo), "00:00");
  const activeBuiltAt = at(-1, "19:00");
  return [
    setup(SETUP_IDS.muntanyaActive, "ring-muntanya", {
      builtAt: activeBuiltAt,
      expiresAt: expiry(1),
      kind: "JUMPING",
      levelIds: ["level-c", "level-d"],
      notes: "Muntat per al grup de dijous.",
      placementId: PLACEMENT_IDS.muntanyaJumping,
      status: "ACTIVE",
    }),
    setup(SETUP_IDS.muntanyaDismantled, "ring-muntanya", {
      builtAt: at(-5, "10:00"),
      dismantledAt: activeBuiltAt,
      dismantledByAccountId: INSTRUCTOR_ACCOUNT,
      expiresAt: expiry(5),
      kind: "EMPTY",
      status: "DISMANTLED",
    }),
    setup(SETUP_IDS.muntanyaExpired, "ring-muntanya", {
      agilityhubLevel: "HARD",
      builtAt: at(-15, "09:00"),
      courseId: COURSE_IDS.agility,
      expiresAt: expiry(15),
      kind: "AGILITY",
      status: "EXPIRED",
    }),
    setup(SETUP_IDS.centralPhoto, "ring-central", {
      builtAt: at(-2, "09:30"),
      expiresAt: expiry(2),
      imageFileKey: `${COURSES_CLUB_ID}/courses/gimcana.svg`,
      imageUrl: `${COURSE_FILES_ORIGIN}/courses/gimcana.svg`,
      kind: "FUN",
      status: "ACTIVE",
    }),
  ];
}

/** An upload of `POST /courses/upload-urls` and what the signed PUT stored. */
export interface CourseFile {
  bytes: Uint8Array | null;
  /** The club the upload was granted to (R-16-16: another club's key is `NOT_FOUND`). */
  clubId: string;
  contentType: string;
  /** R-16-10: the placement a BUILD_SHEET upload is bound to (`null` until it is). */
  placementId: string | null;
  purpose: string;
}

export interface CourseWorld {
  /** R-16-11: the club's build sessions, open and closed (none at start). */
  buildSessions: BuildSession[];
  courses: Course[];
  /** Uploaded files by `fileKey` (the S3 side of the upload URLs). */
  files: Map<string, CourseFile>;
  geometries: Record<string, RingGeometry>;
  inventories: Record<string, ObstacleInventory>;
  placements: Placement[];
  setups: RingSetup[];
  sequence: number;
}

function initialWorld(): CourseWorld {
  const geometries = initialGeometries();
  return {
    buildSessions: [],
    courses: initialCourses(),
    files: new Map([
      [
        LEAGUE_BUILD_SHEET_KEY,
        {
          bytes: leagueBuildSheetPdf(),
          clubId: COURSES_CLUB_ID,
          contentType: "application/pdf",
          placementId: PLACEMENT_IDS.centralLeague,
          purpose: "BUILD_SHEET",
        },
      ],
    ]),
    geometries,
    inventories: initialInventories(),
    placements: initialPlacements(geometries),
    sequence: 0,
    setups: initialSetups(),
  };
}

export const courseState: CourseWorld = initialWorld();

export function resetCourseState(): void {
  Object.assign(courseState, initialWorld());
}

/**
 * S06 R-16-13 (E9-T03): a class's `placementId` — only with COURSES (else `VALIDATION_ERROR
 * fieldErrors[{placementId, MODULE_DISABLED}]`), a placement of the club (`NOT_FOUND`) on the
 * class's own ring (`422 PLACEMENT_RING_MISMATCH`, also for a class without a ring); `null` = none.
 */
export function classPlacementRefusal(
  placementId: string | null | undefined,
  ringId: string | null | undefined,
  coursesModule: boolean,
): { code: string; status: number; fieldErrors?: { code: string; field: string }[] } | undefined {
  if (placementId === null || placementId === undefined) return undefined;
  if (!coursesModule) {
    return {
      code: "VALIDATION_ERROR",
      fieldErrors: [{ code: "MODULE_DISABLED", field: "placementId" }],
      status: 400,
    };
  }
  const placement = courseState.placements.find((item) => item.id === placementId);
  if (placement === undefined) return { code: "NOT_FOUND", status: 404 };
  return placement.ringId === ringId ? undefined : { code: "PLACEMENT_RING_MISMATCH", status: 422 };
}

// ---------------------------------------------------------------------------------------------
// What the other verticals read of the S16 world (R-16-09, R-16-13, S06, S09 R-09-15).

type ReaderLocale = "ca" | "en" | "es";

/**
 * `courses.showSetupToMembers` (R-16-09): the scenario's value (`memberSetupHidden`,
 * `instructorSetupHidden`), else the parameter world's (a test may `replaceParameter` it).
 */
export function setupsShownToMembers(): boolean {
  const pinned = currentMockScenario().showSetupToMembers;
  if (pinned !== undefined) return pinned;
  return findParameter("courses.showSetupToMembers")?.value !== false;
}

/** `courses.allowInstructorPublish` (R-16-07): the scenario's value, else the parameter world's. */
export function instructorsPublishSetups(): boolean {
  const pinned = currentMockScenario().allowInstructorPublish;
  if (pinned !== undefined) return pinned;
  return findParameter("courses.allowInstructorPublish")?.value !== false;
}

/** A MEMBER reader: an impersonation token, or an account without INSTRUCTOR or ADMIN. */
export function readsAsMember(): boolean {
  const { me } = currentMockScenario();
  if (me.impersonation !== undefined) return true;
  return !(me.membership?.roles.some((role) => role === "INSTRUCTOR" || role === "ADMIN") ?? false);
}

/**
 * Whether the caller sees the rings' setups and the classes' planned placements: only with
 * COURSES, and a MEMBER only while `courses.showSetupToMembers` (R-16-09, R-16-13, R-09-15).
 */
export function setupsVisible(modules: readonly string[]): boolean {
  return modules.includes("COURSES") && (!readsAsMember() || setupsShownToMembers());
}

/** The course's name in the reader's language (R-16-17), else Catalan, else any. */
export function courseNameIn(course: Course, locale: string): string {
  const names = course.nameI18n ?? {};
  return names[locale] ?? names.ca ?? Object.values(names)[0] ?? course.name;
}

/** The ring's ACTIVE setup (`Ring.activeSetupId`), of the caller's club only. */
export function activeSetupOf(ringId: string): RingSetup | undefined {
  if (!callerClubOwnsTheWorld()) return undefined;
  return courseState.setups.find((item) => item.ringId === ringId && item.status === "ACTIVE");
}

/** The course a setup shows: its own `courseId`, else its placement's (undefined once deleted). */
export function courseShownBy(item: RingSetup): Course | undefined {
  const courseId =
    item.courseId ??
    courseState.placements.find((placement) => placement.id === item.placementId)?.courseId;
  return courseId == null
    ? undefined
    : courseState.courses.find((course) => course.id === courseId);
}

/**
 * S09 R-09-15 `rings[].setup`: the ACTIVE setup as `RingSetupSummary`, `levelNames` the club
 * levels' names in the reader's language (S09 §6 example: `["D"]`); `null` for a ring without one.
 */
export function ringSetupSummary(
  ringId: string,
  locale: ReaderLocale = "ca",
): Schemas["RingSetupSummary"] | null {
  const active = activeSetupOf(ringId);
  if (active === undefined) return null;
  return {
    builtAt: active.builtAt,
    expectedUntil: active.expectedUntil ?? null,
    id: active.id,
    kind: active.kind,
    levelNames: active.levelIds.flatMap((id) => {
      const level = catalogState.levels.find((candidate) => candidate.id === id);
      return level === undefined ? [] : [level.nameI18n?.[locale] ?? level.name];
    }),
  };
}

/**
 * S06 R-16-13 `ClassSessionMemberView.plannedPlacement` («Recorregut previst», screen 07): the
 * placement and its course's name in the reader's language; `null` without a placement or once
 * its course is gone.
 */
export function plannedPlacementOf(
  placementId: string | null | undefined,
  locale: string,
): Schemas["PlannedPlacement"] | null {
  if (placementId == null || !callerClubOwnsTheWorld()) return null;
  const placement = courseState.placements.find((item) => item.id === placementId);
  const course = courseState.courses.find((item) => item.id === placement?.courseId);
  return placement === undefined || course === undefined
    ? null
    : { courseName: courseNameIn(course, locale), placementId: placement.id };
}

/** The placements of an activity (`Activity.placementIds`, only with COURSES). */
export function activityPlacementIds(activityId: string): string[] {
  return courseState.placements
    .filter((placement) => placement.activityId === activityId)
    .map((placement) => placement.id);
}
