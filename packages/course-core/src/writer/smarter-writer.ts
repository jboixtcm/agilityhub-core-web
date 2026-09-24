import { SMARTER_PX_PER_METER, ringMetersToPxPoint, type CanvasFrame } from '../parser/coords.js';
import { lookupObstacle } from '../parser/obstacle-mapping.js';
import { wrapSmarterPayload } from '../parser/wrapper.js';
import {
  SMARTER_EXTRA_CODES,
  type SmarterCourseDraft,
  type SmarterCourseType,
  type SmarterDocument,
  type SmarterNumberDraft,
  type SmarterNumberEntry,
  type SmarterObstacleEntry,
  type SmarterOuterDocument,
  type SmarterPathConfig,
  type SmarterRigidObstacleEntry,
  type SmarterSettingsDocument,
  type SmarterTunnelEntry,
  type SmarterWriterEnvironment,
} from './smarter-types.js';

const METERS_PER_FOOT = 0.3048;
const DEFAULT_CANVAS_RIGHT_CHROME = 46;
const DEFAULT_CANVAS_BOTTOM_CHROME = 73;
const NUMBER_GROUP_RE = /^[nl]\d+$/;
const SOURCE_ID_RE = /^[1-9]\d*$/;
const SMARTER_ORIGINS = new Set(['LT', 'LB', 'RT', 'RB', 'CC', 'LC', 'RC', 'CB']);

export class SmarterSerializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmarterSerializeError';
  }
}

/** Known-safe LT canvas dimensions used by the production Smarter fixtures. */
export function defaultSmarterCanvasDimensions(
  lengthMeters: number,
  widthMeters: number,
): { canvasWidth: number; canvasHeight: number } {
  assertPositiveFinite(lengthMeters, 'field.lengthMeters');
  assertPositiveFinite(widthMeters, 'field.widthMeters');
  return {
    canvasWidth: round(lengthMeters * SMARTER_PX_PER_METER + DEFAULT_CANVAS_RIGHT_CHROME, 6),
    canvasHeight: round(widthMeters * SMARTER_PX_PER_METER + DEFAULT_CANVAS_BOTTOM_CHROME, 6),
  };
}

/** Builds a typed Smarter 10.1.2 document and injects fresh identity/timestamps. */
export function buildSmarterDocument(
  draft: SmarterCourseDraft,
  environment: SmarterWriterEnvironment = {},
): SmarterDocument {
  validateDraft(draft, environment);

  const now = environment.now?.() ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new SmarterSerializeError('Generated metadata clock returned an invalid Date.');
  }

  const localHashId = environment.createLocalHashId?.() ?? defaultLocalHashId(now);
  if (typeof localHashId !== 'string' || localHashId.trim().length === 0) {
    throw new SmarterSerializeError('Generated local_hash_id must be non-empty.');
  }

  const defaults = defaultSmarterCanvasDimensions(
    draft.field.lengthMeters,
    draft.field.widthMeters,
  );
  const canvasWidth = draft.field.canvasWidth ?? defaults.canvasWidth;
  const canvasHeight = draft.field.canvasHeight ?? defaults.canvasHeight;
  const frame: CanvasFrame = {
    canvasWidth,
    canvasHeight,
    designLengthMeters: draft.field.lengthMeters,
    designWidthMeters: draft.field.widthMeters,
  };

  let nextSourceId = environment.sourceIdStart ?? 1;
  const allocateId = (): number => {
    const id = nextSourceId;
    nextSourceId += 1;
    return id;
  };

  const obstacleIdByRef = new Map<string, number>();
  const obstacles: Record<string, Record<string, SmarterObstacleEntry>> = {};

  for (const obstacle of draft.obstacles) {
    const sourceId = allocateId();
    obstacleIdByRef.set(obstacle.ref, sourceId);
    const group = (obstacles[obstacle.code] ??= {});

    if (obstacle.kind === 'tunnel') {
      group[String(sourceId)] = {
        cps: obstacle.controlPointsMeters.map((point) => {
          const canvas = ringMetersToPxPoint(point.x, point.y, frame);
          return [roundSource(canvas.x), roundSource(canvas.y)] as const;
        }),
        custom: { ...(obstacle.custom ?? {}) },
        ...(obstacle.locked === undefined ? {} : { locked: obstacle.locked }),
      };
      continue;
    }

    const canvas = ringMetersToPxPoint(obstacle.xMeters, obstacle.yMeters, frame);
    const includeDefaultCustom = obstacle.code !== 'tib' && obstacle.code !== 'ti';
    group[String(sourceId)] = {
      x: roundSource(canvas.x),
      y: roundSource(canvas.y),
      angle: roundSource(normalizeDegrees(obstacle.angleDegrees)),
      ...(obstacle.custom === undefined && !includeDefaultCustom
        ? {}
        : { custom: { ...(obstacle.custom ?? {}) } }),
    };
  }

  for (const extra of draft.extras ?? []) {
    const sourceId = allocateId();
    const group = (obstacles[extra.code] ??= {});
    const entry: Record<string, unknown> = { ...extra.entry };
    // a `pN` key is the N-th vertex of a polygon (a no-go zone's `points`); any other key is the
    // suffix of an x/y pair (x, x1, x2, ...)
    const polygon: [number, number][] = [];
    for (const [suffix, point] of Object.entries(extra.pointsMeters ?? {})) {
      const canvas = ringMetersToPxPoint(point.x, point.y, frame);
      const vertex = /^p(\d+)$/.exec(suffix);
      if (vertex) polygon[Number(vertex[1])] = [roundSource(canvas.x), roundSource(canvas.y)];
      else {
        entry[`x${suffix}`] = roundSource(canvas.x);
        entry[`y${suffix}`] = roundSource(canvas.y);
      }
    }
    if (polygon.length > 0) entry['points'] = polygon.filter((vertex) => vertex != null);
    group[String(sourceId)] = entry;
  }

  const numbers: Record<string, Record<string, SmarterNumberEntry>> = {};
  for (const [groupCode, groupDraft] of Object.entries(draft.numberGroups ?? {})) {
    if (groupDraft == null) continue;
    const group: Record<string, SmarterNumberEntry> = {};
    for (const numberDraft of groupDraft as readonly SmarterNumberDraft[]) {
      const sourceId = allocateId();
      const obstacleId = obstacleIdByRef.get(numberDraft.attachment.obstacleRef);
      if (obstacleId === undefined) {
        throw new SmarterSerializeError(
          `Number group ${groupCode} references unknown obstacle "${numberDraft.attachment.obstacleRef}".`,
        );
      }
      const canvas = ringMetersToPxPoint(numberDraft.xMeters, numberDraft.yMeters, frame);
      group[String(sourceId)] = {
        text: numberDraft.text,
        x: roundSource(canvas.x),
        y: roundSource(canvas.y),
        oid: obstacleId,
        ocp: numberDraft.attachment.connectionPoint,
        cp1d: roundSource(numberDraft.attachment.cp1Distance),
        cp1a: roundSource(numberDraft.attachment.cp1AngleDegrees),
        cp2d: roundSource(numberDraft.attachment.cp2Distance),
        cp2a: roundSource(numberDraft.attachment.cp2AngleDegrees),
        ...(numberDraft.hideSegment === undefined ? {} : { hideSegment: numberDraft.hideSegment }),
      };
    }
    numbers[groupCode] = group;
  }

  const settings: SmarterSettingsDocument = {
    version: '10.1.2',
    dogs: {},
    handlers: {},
    obstacles,
    numbers,
    lines: [...(draft.lines ?? [])],
    logos: [...(draft.logos ?? [])],
    config: {
      paths: clonePathConfig(draft.pathConfig),
      obstacles: cloneNestedRecord(draft.obstacleConfig),
      course: { hoopersFlybyDistance: 1 },
    },
    discipline: 'AG',
    course_type: draft.courseType,
    datetime: now.getTime(),
  };

  const metadata = draft.metadata ?? {};
  const display = draft.display ?? {};
  const units = draft.field.units ?? 'M';
  const rawDimensionFactor = units === 'F' ? 1 / METERS_PER_FOOT : 1;
  const title = metadata.title ?? '';

  const outer: SmarterOuterDocument = {
    restore_id: null,
    type: metadata.type ?? '',
    course_type: outerCourseType(draft.courseType),
    grade: metadata.grade ?? '',
    category: metadata.category ?? '',
    location: metadata.location ?? '',
    designer: metadata.designer ?? '',
    is_draft: false,
    title,
    title_raw: title,
    hide_title: display.hideTitle === true ? 1 : 0,
    info: metadata.info ?? '',
    keywords: metadata.keywords ?? '',
    labels: { ...(metadata.labels ?? {}) },
    origin: draft.field.origin ?? 'LT',
    canvas_color: '',
    grid_color: '',
    gridLabels_color: '',
    border_color: '',
    frame_color: '',
    color_sheme: display.colorScheme ?? '',
    organization: metadata.organization ?? 'default',
    units,
    length: round(draft.field.lengthMeters * rawDimensionFactor, 6),
    width: round(draft.field.widthMeters * rawDimensionFactor, 6),
    spacing: display.spacing ?? 3,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    hide_spacing: 'auto',
    hide_grid: display.hideGrid === undefined ? 'auto' : display.hideGrid ? 1 : 0,
    show_total_length: display.showTotalLength === false ? 0 : 1,
    show_copyright: display.showCopyright ?? true,
    settings: JSON.stringify(settings),
    date: metadata.date ?? now.toISOString().slice(0, 10),
    is_template: 0,
    canvasWidth,
    canvasHeight,
    _info: '',
    _initial_id: '',
    layout_version: 1,
    public_course_level_2: '',
    course_updated_at: Math.floor(now.getTime() / 1_000),
    local_hash_id: localHashId,
    export_version: 2,
  };

  const document = { outer, settings } satisfies SmarterDocument;
  validateSmarterDocument(document);
  return document;
}

/** Validates and serializes a prebuilt document to the SAD text wrapper. */
export function serializeSmarterDocument(document: SmarterDocument): string {
  validateSmarterDocument(document);
  return wrapSmarterPayload(JSON.stringify(document.outer));
}

/** Convenience entry point: draft → validated Smarter document → wrapped `.txt`. */
export function serializeSmarterTxt(
  draft: SmarterCourseDraft,
  environment: SmarterWriterEnvironment = {},
): string {
  return serializeSmarterDocument(buildSmarterDocument(draft, environment));
}

/** Runtime guard for generated documents and callers that persist intermediate documents. */
export function validateSmarterDocument(document: SmarterDocument): void {
  const { outer, settings } = document;
  if (outer.export_version !== 2 || outer.layout_version !== 1) {
    throw new SmarterSerializeError(
      'Smarter document must use export_version=2 and layout_version=1.',
    );
  }
  if (settings.version !== '10.1.2') {
    throw new SmarterSerializeError('Smarter settings.version must be 10.1.2.');
  }
  if (settings.discipline !== 'AG') {
    throw new SmarterSerializeError('Only the AG discipline is supported.');
  }
  if (!isCourseType(settings.course_type)) {
    throw new SmarterSerializeError(`Unsupported course_type "${String(settings.course_type)}".`);
  }
  if (outer.units !== 'M' && outer.units !== 'F') {
    throw new SmarterSerializeError(`Unsupported units "${String(outer.units)}".`);
  }
  if (!SMARTER_ORIGINS.has(outer.origin)) {
    throw new SmarterSerializeError(`Unsupported origin "${String(outer.origin)}".`);
  }
  if (outer.course_type !== outerCourseType(settings.course_type)) {
    throw new SmarterSerializeError('Outer and settings course types are inconsistent.');
  }
  if (outer.local_hash_id.trim().length === 0) {
    throw new SmarterSerializeError('outer.local_hash_id must be non-empty.');
  }

  assertPositiveFinite(outer.length, 'outer.length');
  assertPositiveFinite(outer.width, 'outer.width');
  assertPositiveFinite(outer.canvasWidth, 'outer.canvasWidth');
  assertPositiveFinite(outer.canvasHeight, 'outer.canvasHeight');
  assertFiniteNumber(outer.course_updated_at, 'outer.course_updated_at');
  assertFiniteNumber(settings.datetime, 'settings.datetime');

  let decodedSettings: unknown;
  try {
    decodedSettings = JSON.parse(outer.settings);
  } catch (error) {
    throw new SmarterSerializeError(
      `outer.settings is not valid JSON: ${(error as Error).message}`,
    );
  }
  if (JSON.stringify(decodedSettings) !== JSON.stringify(settings)) {
    throw new SmarterSerializeError('outer.settings does not match document.settings.');
  }

  const usedIds = new Set<string>();
  const obstacleIds = new Set<string>();
  for (const [code, group] of Object.entries(settings.obstacles)) {
    if ((SMARTER_EXTRA_CODES as readonly string[]).includes(code)) {
      for (const [sourceId, entry] of Object.entries(group)) {
        assertSourceId(sourceId, usedIds, `obstacles.${code}`);
        if (entry == null || typeof entry !== 'object') {
          throw new SmarterSerializeError(`obstacles.${code}.${sourceId} must be an object.`);
        }
      }
      continue;
    }
    const definition = lookupObstacle(code);
    if (definition == null) {
      throw new SmarterSerializeError(`Unsupported physical obstacle code "${code}".`);
    }
    for (const [sourceId, rawEntry] of Object.entries(group)) {
      assertSourceId(sourceId, usedIds, `obstacles.${code}`);
      obstacleIds.add(sourceId);
      const entry = rawEntry as SmarterRigidObstacleEntry | SmarterTunnelEntry;

      if (definition.hasControlPoints) {
        const expectedPoints = expectedTunnelControlPointCount(code);
        if (!('cps' in entry) || !Array.isArray(entry.cps) || entry.cps.length !== expectedPoints) {
          throw new SmarterSerializeError(
            `Tunnel obstacles.${code}.${sourceId} needs exactly ${expectedPoints} cps.`,
          );
        }
        for (const [index, point] of entry.cps.entries()) {
          if (!Array.isArray(point) || point.length < 2) {
            throw new SmarterSerializeError(
              `obstacles.${code}.${sourceId}.cps[${index}] must be an [x,y] pair.`,
            );
          }
          assertFiniteNumber(point[0], `obstacles.${code}.${sourceId}.cps[${index}][0]`);
          assertFiniteNumber(point[1], `obstacles.${code}.${sourceId}.cps[${index}][1]`);
        }
      } else {
        if (!('x' in entry) || !('y' in entry) || !('angle' in entry)) {
          throw new SmarterSerializeError(
            `Rigid obstacles.${code}.${sourceId} needs x, y, and angle.`,
          );
        }
        assertFiniteNumber(entry.x, `obstacles.${code}.${sourceId}.x`);
        assertFiniteNumber(entry.y, `obstacles.${code}.${sourceId}.y`);
        assertFiniteNumber(entry.angle, `obstacles.${code}.${sourceId}.angle`);
      }
    }
  }

  for (const [groupCode, group] of Object.entries(settings.numbers)) {
    if (!NUMBER_GROUP_RE.test(groupCode)) {
      throw new SmarterSerializeError(`Invalid number group "${groupCode}".`);
    }
    for (const [sourceId, entry] of Object.entries(group)) {
      assertSourceId(sourceId, usedIds, `numbers.${groupCode}`);
      if (
        (typeof entry.text !== 'string' && typeof entry.text !== 'number') ||
        (typeof entry.text === 'number' && !Number.isFinite(entry.text))
      ) {
        throw new SmarterSerializeError(
          `numbers.${groupCode}.${sourceId}.text must be a string or finite number.`,
        );
      }
      if (!obstacleIds.has(String(entry.oid))) {
        throw new SmarterSerializeError(
          `numbers.${groupCode}.${sourceId}.oid=${entry.oid} does not reference an obstacle.`,
        );
      }
      if (entry.ocp !== 'cp1' && entry.ocp !== 'cp2') {
        throw new SmarterSerializeError(`numbers.${groupCode}.${sourceId}.ocp must be cp1 or cp2.`);
      }
      assertFiniteNumber(entry.x, `numbers.${groupCode}.${sourceId}.x`);
      assertFiniteNumber(entry.y, `numbers.${groupCode}.${sourceId}.y`);
      assertFiniteNumber(entry.cp1d, `numbers.${groupCode}.${sourceId}.cp1d`);
      assertFiniteNumber(entry.cp1a, `numbers.${groupCode}.${sourceId}.cp1a`);
      assertFiniteNumber(entry.cp2d, `numbers.${groupCode}.${sourceId}.cp2d`);
      assertFiniteNumber(entry.cp2a, `numbers.${groupCode}.${sourceId}.cp2a`);
    }
  }

  for (const groupCode of Object.keys(settings.config.paths)) {
    if (!NUMBER_GROUP_RE.test(groupCode)) {
      throw new SmarterSerializeError(`Invalid path-config group "${groupCode}".`);
    }
  }
}

function validateDraft(draft: SmarterCourseDraft, environment: SmarterWriterEnvironment): void {
  assertPositiveFinite(draft.field.lengthMeters, 'field.lengthMeters');
  assertPositiveFinite(draft.field.widthMeters, 'field.widthMeters');
  if (draft.field.canvasWidth !== undefined) {
    assertPositiveFinite(draft.field.canvasWidth, 'field.canvasWidth');
  }
  if (draft.field.canvasHeight !== undefined) {
    assertPositiveFinite(draft.field.canvasHeight, 'field.canvasHeight');
  }
  if (!isCourseType(draft.courseType)) {
    throw new SmarterSerializeError(`Unsupported courseType "${String(draft.courseType)}".`);
  }
  if (draft.field.units !== undefined && draft.field.units !== 'M' && draft.field.units !== 'F') {
    throw new SmarterSerializeError(`Unsupported units "${String(draft.field.units)}".`);
  }
  if (draft.field.origin !== undefined && !SMARTER_ORIGINS.has(draft.field.origin)) {
    throw new SmarterSerializeError(`Unsupported origin "${String(draft.field.origin)}".`);
  }
  if (draft.obstacles.length === 0) {
    throw new SmarterSerializeError('A Smarter course draft needs at least one physical obstacle.');
  }
  if (
    environment.sourceIdStart !== undefined &&
    (!Number.isInteger(environment.sourceIdStart) || environment.sourceIdStart < 1)
  ) {
    throw new SmarterSerializeError('sourceIdStart must be a positive integer.');
  }

  const obstacleRefs = new Set<string>();
  for (const [index, obstacle] of draft.obstacles.entries()) {
    if (obstacle.ref.trim().length === 0) {
      throw new SmarterSerializeError(`obstacles[${index}].ref must be non-empty.`);
    }
    if (obstacleRefs.has(obstacle.ref)) {
      throw new SmarterSerializeError(`Duplicate obstacle ref "${obstacle.ref}".`);
    }
    obstacleRefs.add(obstacle.ref);

    const definition = lookupObstacle(obstacle.code);
    if (definition == null) {
      throw new SmarterSerializeError(`Unsupported physical obstacle code "${obstacle.code}".`);
    }
    if (obstacle.kind === 'tunnel') {
      if (!definition.hasControlPoints) {
        throw new SmarterSerializeError(`${obstacle.code} is not a tunnel code.`);
      }
      const expectedPoints = expectedTunnelControlPointCount(obstacle.code);
      if (obstacle.controlPointsMeters.length !== expectedPoints) {
        throw new SmarterSerializeError(
          `${obstacle.code} needs exactly ${expectedPoints} control points.`,
        );
      }
      for (const [pointIndex, point] of obstacle.controlPointsMeters.entries()) {
        assertFiniteNumber(point.x, `obstacles[${index}].controlPointsMeters[${pointIndex}].x`);
        assertFiniteNumber(point.y, `obstacles[${index}].controlPointsMeters[${pointIndex}].y`);
      }
    } else {
      if (definition.hasControlPoints) {
        throw new SmarterSerializeError(`${obstacle.code} must use kind="tunnel".`);
      }
      assertFiniteNumber(obstacle.xMeters, `obstacles[${index}].xMeters`);
      assertFiniteNumber(obstacle.yMeters, `obstacles[${index}].yMeters`);
      assertFiniteNumber(obstacle.angleDegrees, `obstacles[${index}].angleDegrees`);
    }
  }

  for (const [groupCode, group] of Object.entries(draft.numberGroups ?? {})) {
    if (!NUMBER_GROUP_RE.test(groupCode)) {
      throw new SmarterSerializeError(`Invalid number group "${groupCode}".`);
    }
    if (group == null) continue;
    for (const [index, entry] of (group as readonly SmarterNumberDraft[]).entries()) {
      if (
        (typeof entry.text !== 'string' && typeof entry.text !== 'number') ||
        (typeof entry.text === 'number' && !Number.isFinite(entry.text))
      ) {
        throw new SmarterSerializeError(
          `numbers.${groupCode}[${index}].text must be a string or finite number.`,
        );
      }
      if (!obstacleRefs.has(entry.attachment.obstacleRef)) {
        throw new SmarterSerializeError(
          `numbers.${groupCode}[${index}] references unknown obstacle "${entry.attachment.obstacleRef}".`,
        );
      }
      assertFiniteNumber(entry.xMeters, `numbers.${groupCode}[${index}].xMeters`);
      assertFiniteNumber(entry.yMeters, `numbers.${groupCode}[${index}].yMeters`);
      assertFiniteNumber(
        entry.attachment.cp1Distance,
        `numbers.${groupCode}[${index}].cp1Distance`,
      );
      assertFiniteNumber(
        entry.attachment.cp1AngleDegrees,
        `numbers.${groupCode}[${index}].cp1AngleDegrees`,
      );
      assertFiniteNumber(
        entry.attachment.cp2Distance,
        `numbers.${groupCode}[${index}].cp2Distance`,
      );
      assertFiniteNumber(
        entry.attachment.cp2AngleDegrees,
        `numbers.${groupCode}[${index}].cp2AngleDegrees`,
      );
    }
  }

  for (const groupCode of Object.keys(draft.pathConfig ?? {})) {
    if (!NUMBER_GROUP_RE.test(groupCode)) {
      throw new SmarterSerializeError(`Invalid path-config group "${groupCode}".`);
    }
  }
}

function clonePathConfig(
  source: SmarterCourseDraft['pathConfig'],
): Record<string, SmarterPathConfig> {
  const result: Record<string, SmarterPathConfig> = {};
  for (const [group, config] of Object.entries(source ?? {})) {
    if (config !== undefined) result[group] = { ...config };
  }
  return result;
}

function cloneNestedRecord(
  source: SmarterCourseDraft['obstacleConfig'],
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(source ?? {})) result[key] = { ...value };
  return result;
}

function assertSourceId(sourceId: string, usedIds: Set<string>, path: string): void {
  if (!SOURCE_ID_RE.test(sourceId)) {
    throw new SmarterSerializeError(`${path} has invalid numeric source ID "${sourceId}".`);
  }
  if (usedIds.has(sourceId)) {
    throw new SmarterSerializeError(`Duplicate obstacle/number source ID "${sourceId}".`);
  }
  usedIds.add(sourceId);
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SmarterSerializeError(`${path} must be a finite number.`);
  }
}

function assertPositiveFinite(value: unknown, path: string): asserts value is number {
  assertFiniteNumber(value, path);
  if (value <= 0) throw new SmarterSerializeError(`${path} must be greater than zero.`);
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function roundSource(value: number): number {
  return round(value, 2);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isCourseType(value: unknown): value is SmarterCourseType {
  return value === 'A_A' || value === 'A_J' || value === 'A_ZZ';
}

function outerCourseType(courseType: SmarterCourseType): string {
  if (courseType === 'A_A') return 'Agility';
  if (courseType === 'A_J') return 'Jumping';
  return '';
}

function expectedTunnelControlPointCount(code: string): number {
  if (code === 't2' || code === 't3s' || code === 't3') return 3;
  if (code === 't4s' || code === 't4') return 4;
  return 5;
}

function defaultLocalHashId(now: Date): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `agilityhub-${now.getTime().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
