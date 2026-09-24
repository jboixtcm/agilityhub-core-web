/**
 * Tiny factory helpers that build synthetic CourseData / Ring objects for
 * geometry + warning tests. Tests that need the real Smarter shape parse
 * fixtures instead.
 */
import { courseDataSchema, type CourseData } from '../../src/schema/course-data.js';
import type { CourseObstacle } from '../../src/schema/course-obstacle.js';
import type { NoGoZone } from '../../src/schema/no-go-zone.js';
import type { ObstacleType, Point2DMeters } from '../../src/schema/primitives.js';
import { ringSchema, type Ring } from '../../src/geometry/ring.js';

let obstacleSeq = 0;

export function makeObstacle(input: {
  type?: ObstacleType;
  xMeters?: number | null;
  yMeters?: number | null;
  rotationDegrees?: number | null;
  controlPointsMeters?: Point2DMeters[] | null;
  sourceCode?: string;
  sourceId?: string;
}): CourseObstacle {
  obstacleSeq += 1;
  const sourceCode = input.sourceCode ?? 'jb';
  const sourceId = input.sourceId ?? String(obstacleSeq);
  return {
    id: `${sourceCode}:${sourceId}`,
    sourceId,
    sourceCode,
    obstacleType: input.type ?? 'Jump',
    xMeters: input.xMeters ?? null,
    yMeters: input.yMeters ?? null,
    rotationDegrees: input.rotationDegrees ?? null,
    nominalLengthMeters: null,
    controlPointsMeters: input.controlPointsMeters ?? null,
    colorKey: null,
    status: 'notPlaced',
    rawMetadata: {},
  };
}

export function makeNoGoZone(input: {
  id?: string;
  polygon: Point2DMeters[];
  warningMarginMeters?: number;
}): NoGoZone {
  return {
    id: input.id ?? 'at:test',
    sourceId: 'test',
    sourceType: 'at',
    label: 'Restricted area',
    polygonPointsMeters: input.polygon,
    warningMarginMeters: input.warningMarginMeters ?? 0.5,
    rawMetadata: {},
  };
}

export function makeCourse(input: {
  designLengthMeters: number;
  designWidthMeters: number;
  obstacles?: CourseObstacle[];
  noGoZones?: NoGoZone[];
  title?: string;
}): CourseData {
  return courseDataSchema.parse({
    id: 'test:course',
    source: 'smarter-agility',
    sourceFileName: null,
    title: input.title ?? 'Test course',
    titleRaw: null,
    units: 'M',
    designLengthMeters: input.designLengthMeters,
    designWidthMeters: input.designWidthMeters,
    canvasWidth: input.designLengthMeters * 10,
    canvasHeight: input.designWidthMeters * 10,
    origin: 'LT',
    metadata: {
      type: '',
      courseType: '',
      grade: '',
      category: '',
      location: '',
      designer: '',
      organization: '',
      date: '',
      exportVersion: null,
      obstacleSummary: null,
    },
    obstacles: input.obstacles ?? [],
    numbers: [],
    noGoZones: input.noGoZones ?? [],
    ignoredLogos: [],
    themeId: 'agilityhub',
    rawMetadata: {},
  });
}

export function makeRing(input: {
  lengthMeters: number;
  widthMeters: number;
  doors?: Ring['doors'];
  noGoZones?: Ring['noGoZones'];
  borderClearanceMeters?: number;
  id?: string;
  label?: string;
  obstacleInventory?: Ring['obstacleInventory'];
}): Ring {
  return ringSchema.parse({
    id: input.id ?? 'ring:test',
    label: input.label ?? 'Test Ring',
    lengthMeters: input.lengthMeters,
    widthMeters: input.widthMeters,
    doors: input.doors ?? [],
    noGoZones: input.noGoZones ?? [],
    borderClearanceMeters: input.borderClearanceMeters ?? 0.5,
    obstacleInventory: input.obstacleInventory ?? {},
  });
}
