/**
 * Top-level Smarter `.txt` → CourseData parser.
 *
 * Pipeline:
 *   1. Extract base64 payload between `+++++++SAD ... SAD+++++++` markers.
 *   2. Base64 decode → outer JSON string.
 *   3. JSON.parse outer → outer object.
 *   4. JSON.parse outer.settings → settings object.
 *   5. Walk settings.obstacles groups:
 *        - known obstacle group   → CourseObstacle
 *        - tunnel groups (t3s..t6s) → also fill controlPointsMeters
 *        - "at" group              → NoGoZone
 *        - unknown group           → CourseObstacle with type "Unknown" + warning
 *   6. Walk every settings.numbers group → CourseNumber (linked via oid)
 *   7. Walk logos (top-level + settings.logos) → IgnoredLogo (counted only)
 *   8. Validate the assembled CourseData against the zod schema.
 *
 * All coordinates are converted from canvas pixels to METERS using the
 * canvas frame `{canvasWidth, canvasHeight, designLengthMeters,
 * designWidthMeters}`. Original pixel values are preserved in each item's
 * `rawMetadata._canvas` so downstream tools can debug.
 *
 * Y-axis convention: Smarter exports use `LT` (left/top) pixel origin — Y
 * grows DOWN on the canvas. The parser flips Y at ingest so every
 * meter-frame field in CourseData (obstacle anchors, control points,
 * no-go polygons, numbers) is in **ring frame**: bottom-left origin, +Y
 * up (D-011). After this flip there is ONE coordinate frame in the
 * system; placement, warning rules, the planner renderer, and the Unity
 * AR reader all work in ring Y-up without further compensation. The
 * `origin` field on `CourseData.source` still reports the source pixel
 * origin (typically `'LT'`) for debugging; it does NOT describe the
 * meter-frame Y direction, which is always ring Y-up.
 *
 * Smarter source files are read-only — the parser never mutates the input.
 */

import { z } from 'zod';
import {
  courseDataSchema,
  type CourseData,
  type CourseSourceMetadata,
  type IgnoredLogo,
} from '../schema/course-data.js';
import type { CourseNumber } from '../schema/course-number.js';
import type { CourseObstacle } from '../schema/course-obstacle.js';
import type { NoGoZone } from '../schema/no-go-zone.js';
import {
  type Origin,
  originSchema,
  unitSystemSchema,
  type UnitSystem,
} from '../schema/primitives.js';
import {
  pxToMetersX,
  pxToRingMetersPoint,
  pxToRingMetersY,
  unitToMetersFactor,
  type CanvasFrame,
} from './coords.js';
import { isKnownObstacleCode, lookupObstacle, NON_OBSTACLE_GROUPS } from './obstacle-mapping.js';
import { decodeSmarterPayload, extractSmarterPayload, SmarterParseError } from './wrapper.js';

// Convenience re-export so callers can import the error class from the same
// module as the parser function.
export { SmarterParseError };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParseSmarterTxtOptions {
  /** Source file name to embed in CourseData. Optional. */
  readonly sourceFileName?: string;
  /** Override the course id (otherwise derived from local_hash_id / uid_date / random). */
  readonly courseId?: string;
  /** Default theme id. Defaults to 'agilityhub'. */
  readonly themeId?: string;
}

export interface ParseSmarterTxtResult {
  readonly courseData: CourseData;
  /** Non-fatal anomalies (unknown obstacle code, malformed entry, etc.). */
  readonly warnings: string[];
}

/**
 * Parse a Smarter Agility `.txt` export into a `CourseData`. Throws
 * `SmarterParseError` on unrecoverable problems (no wrapper, bad JSON,
 * missing dimensions, schema validation failure).
 */
export function parseSmarterTxt(
  rawFile: string,
  options: ParseSmarterTxtOptions = {},
): ParseSmarterTxtResult {
  const warnings: string[] = [];

  // 1–3. wrapper → base64 → outer JSON
  const base64Payload = extractSmarterPayload(rawFile);
  const decoded = decodeSmarterPayload(base64Payload);
  let outer: Record<string, unknown>;
  try {
    outer = JSON.parse(decoded) as Record<string, unknown>;
  } catch (err) {
    throw new SmarterParseError(`Outer JSON.parse failed: ${(err as Error).message}`);
  }

  // 4. settings nested string → object
  const settingsRaw = outer['settings'];
  if (typeof settingsRaw !== 'string') {
    throw new SmarterParseError(
      `Expected outer.settings to be a JSON string, got ${typeof settingsRaw}.`,
    );
  }
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(settingsRaw) as Record<string, unknown>;
  } catch (err) {
    throw new SmarterParseError(`settings JSON.parse failed: ${(err as Error).message}`);
  }

  // 5. canvas frame & dimensions
  const frame = buildCanvasFrame(outer);
  const units = parseUnits(outer['units']);
  const origin = parseOrigin(outer['origin']);

  // 6. obstacle groups
  const obstaclesGroup = (settings['obstacles'] as Record<string, unknown> | undefined) ?? {};
  const obstacles: CourseObstacle[] = [];
  const noGoZones: NoGoZone[] = [];

  for (const [groupKey, groupValueUnknown] of Object.entries(obstaclesGroup)) {
    if (groupValueUnknown == null || typeof groupValueUnknown !== 'object') {
      warnings.push(`obstacles.${groupKey} is not an object — skipped`);
      continue;
    }
    const groupValue = groupValueUnknown as Record<string, unknown>;

    if (NON_OBSTACLE_GROUPS.has(groupKey)) {
      if (groupKey === 'at') {
        noGoZones.push(...extractNoGoZones(groupValue, frame, warnings));
      }
      continue;
    }

    if (!isKnownObstacleCode(groupKey)) {
      warnings.push(
        `Unknown obstacle group "${groupKey}" — entries will be imported with obstacleType=Unknown`,
      );
    }

    obstacles.push(...extractObstaclesFromGroup(groupKey, groupValue, frame, warnings));
  }

  // 7. numbers
  const numberGroups = (settings['numbers'] as Record<string, unknown> | undefined) ?? {};
  const numbers: CourseNumber[] = [];
  for (const [sequenceKey, groupUnknown] of Object.entries(numberGroups)) {
    if (groupUnknown == null || typeof groupUnknown !== 'object') {
      warnings.push(`numbers.${sequenceKey} is not an object — skipped`);
      continue;
    }
    numbers.push(
      ...extractNumbers(groupUnknown as Record<string, unknown>, frame, warnings, sequenceKey),
    );
  }

  // 8. logos (top-level + settings.logos) — ignored, but counted
  const ignoredLogos: IgnoredLogo[] = [
    ...extractLogos(outer['logos']),
    ...extractLogos(settings['logos']),
  ];

  // 9. assemble
  const id = options.courseId ?? deriveCourseId(outer);
  const courseDataDraft = {
    id,
    source: 'smarter-agility' as const,
    sourceFileName: options.sourceFileName ?? null,
    title: asString(outer['title']) ?? '(untitled course)',
    titleRaw: asNullableString(outer['title_raw']),
    units,
    designLengthMeters: frame.designLengthMeters,
    designWidthMeters: frame.designWidthMeters,
    canvasWidth: frame.canvasWidth,
    canvasHeight: frame.canvasHeight,
    origin,
    metadata: buildSourceMetadata(outer),
    obstacles,
    numbers,
    noGoZones,
    ignoredLogos,
    themeId: options.themeId ?? 'agilityhub',
    rawMetadata: {
      outerKeys: Object.keys(outer),
      settingsKeys: Object.keys(settings),
      _localHashId: outer['local_hash_id'] ?? null,
      _uidDate: outer['uid_date'] ?? null,
      _exportVersion: outer['export_version'] ?? null,
    },
  };

  // 10. validate
  const parsed = courseDataSchema.safeParse(courseDataDraft);
  if (!parsed.success) {
    throw new SmarterParseError(
      `Validated CourseData failed schema: ${formatZodError(parsed.error)}`,
    );
  }

  return { courseData: parsed.data, warnings };
}

// ---------------------------------------------------------------------------
// Internals — kept here so the file is self-contained and easy to audit.
// ---------------------------------------------------------------------------

function buildCanvasFrame(outer: Record<string, unknown>): CanvasFrame {
  const sourceUnits = asString(outer['units']) ?? 'M';
  const factor = unitToMetersFactor(sourceUnits);

  const lengthRaw = asFiniteNumber(outer['length']);
  const widthRaw = asFiniteNumber(outer['width']);
  const canvasWidth = asFiniteNumber(outer['canvasWidth']);
  const canvasHeight = asFiniteNumber(outer['canvasHeight']);

  if (lengthRaw == null || widthRaw == null) {
    throw new SmarterParseError(
      `Course is missing length/width (got length=${String(outer['length'])}, width=${String(outer['width'])}).`,
    );
  }
  if (canvasWidth == null || canvasHeight == null) {
    throw new SmarterParseError(
      `Course is missing canvas dimensions (got canvasWidth=${String(outer['canvasWidth'])}, canvasHeight=${String(outer['canvasHeight'])}).`,
    );
  }
  if (lengthRaw <= 0 || widthRaw <= 0) {
    throw new SmarterParseError(
      `Course design dimensions must be > 0 (got ${lengthRaw} x ${widthRaw}).`,
    );
  }
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    throw new SmarterParseError(
      `Course canvas dimensions must be > 0 (got ${canvasWidth} x ${canvasHeight}).`,
    );
  }

  return {
    designLengthMeters: lengthRaw * factor,
    designWidthMeters: widthRaw * factor,
    canvasWidth,
    canvasHeight,
  };
}

function parseUnits(raw: unknown): UnitSystem {
  const candidate = asString(raw)?.toUpperCase();
  if (candidate === 'F' || candidate === 'FEET') return 'FT';
  const result = unitSystemSchema.safeParse(candidate);
  return result.success ? result.data : 'M';
}

function parseOrigin(raw: unknown): Origin {
  const candidate = asString(raw)?.toUpperCase();
  const result = originSchema.safeParse(candidate);
  return result.success ? result.data : 'LT';
}

function extractObstaclesFromGroup(
  groupKey: string,
  group: Record<string, unknown>,
  frame: CanvasFrame,
  warnings: string[],
): CourseObstacle[] {
  const def = lookupObstacle(groupKey);
  const obstacles: CourseObstacle[] = [];

  for (const [sourceId, entryUnknown] of Object.entries(group)) {
    if (entryUnknown == null || typeof entryUnknown !== 'object') {
      warnings.push(`obstacles.${groupKey}.${sourceId} is not an object — skipped`);
      continue;
    }
    const entry = entryUnknown as Record<string, unknown>;

    let xMeters: number | null = null;
    let yMeters: number | null = null;
    let controlPointsMeters: { x: number; y: number }[] | null = null;
    let canvasInfo: Record<string, unknown> = {};

    // Tunnels (and any group with cps[]) use control points instead of x/y.
    const cpsRaw = entry['cps'];
    if (Array.isArray(cpsRaw) && cpsRaw.length > 0) {
      controlPointsMeters = [];
      const canvasPoints: [number, number][] = [];
      for (const cp of cpsRaw) {
        if (Array.isArray(cp) && cp.length >= 2) {
          const cx = asFiniteNumber(cp[0]);
          const cy = asFiniteNumber(cp[1]);
          if (cx != null && cy != null) {
            controlPointsMeters.push(pxToRingMetersPoint(cx, cy, frame));
            canvasPoints.push([cx, cy]);
          }
        }
      }
      if (controlPointsMeters.length === 0) {
        warnings.push(`obstacles.${groupKey}.${sourceId} has cps but no valid points`);
        controlPointsMeters = null;
      } else {
        // Anchor = mean of control points (handy default for labels / pickers).
        const sumX = controlPointsMeters.reduce((acc, p) => acc + p.x, 0);
        const sumY = controlPointsMeters.reduce((acc, p) => acc + p.y, 0);
        xMeters = sumX / controlPointsMeters.length;
        yMeters = sumY / controlPointsMeters.length;
        canvasInfo = { cps: canvasPoints };
      }
    } else {
      const x = asFiniteNumber(entry['x']);
      const y = asFiniteNumber(entry['y']);
      if (x != null && y != null) {
        xMeters = pxToMetersX(x, frame);
        yMeters = pxToRingMetersY(y, frame);
        canvasInfo = { x, y };
      } else {
        warnings.push(
          `obstacles.${groupKey}.${sourceId} has no x/y and no cps — keeping null anchor`,
        );
      }
    }

    const rotationDegrees = asFiniteNumber(entry['angle']);

    obstacles.push({
      id: `${groupKey}:${sourceId}`,
      sourceId,
      sourceCode: groupKey,
      obstacleType: def?.obstacleType ?? 'Unknown',
      xMeters,
      yMeters,
      rotationDegrees: rotationDegrees ?? null,
      nominalLengthMeters: def?.nominalLengthMeters ?? null,
      controlPointsMeters,
      colorKey: def?.colorKey ?? null,
      status: 'notPlaced',
      rawMetadata: {
        _canvas: canvasInfo,
        custom: entry['custom'] ?? null,
        raw: entry,
      },
    });
  }

  return obstacles;
}

function extractNoGoZones(
  group: Record<string, unknown>,
  frame: CanvasFrame,
  warnings: string[],
): NoGoZone[] {
  const zones: NoGoZone[] = [];
  for (const [sourceId, entryUnknown] of Object.entries(group)) {
    if (entryUnknown == null || typeof entryUnknown !== 'object') {
      warnings.push(`obstacles.at.${sourceId} is not an object — skipped`);
      continue;
    }
    const entry = entryUnknown as Record<string, unknown>;
    const pointsRaw = entry['points'];
    if (!Array.isArray(pointsRaw) || pointsRaw.length < 3) {
      warnings.push(`obstacles.at.${sourceId} has < 3 polygon points — skipped (need at least 3)`);
      continue;
    }

    const polygonPointsMeters: { x: number; y: number }[] = [];
    const canvasPoints: [number, number][] = [];
    for (const pt of pointsRaw) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const x = asFiniteNumber(pt[0]);
        const y = asFiniteNumber(pt[1]);
        if (x != null && y != null) {
          polygonPointsMeters.push(pxToRingMetersPoint(x, y, frame));
          canvasPoints.push([x, y]);
        }
      }
    }
    if (polygonPointsMeters.length < 3) {
      warnings.push(`obstacles.at.${sourceId} ended up with < 3 valid points — skipped`);
      continue;
    }

    zones.push({
      id: `at:${sourceId}`,
      sourceId,
      sourceType: 'at',
      label: 'Restricted area',
      polygonPointsMeters,
      warningMarginMeters: 0.5,
      rawMetadata: {
        _canvas: { points: canvasPoints },
        custom: entry['custom'] ?? null,
        raw: entry,
      },
    });
  }
  return zones;
}

function extractNumbers(
  group: Record<string, unknown>,
  frame: CanvasFrame,
  warnings: string[],
  sequenceKey = 'n1',
): CourseNumber[] {
  const numbers: CourseNumber[] = [];
  for (const [sourceId, entryUnknown] of Object.entries(group)) {
    if (entryUnknown == null || typeof entryUnknown !== 'object') {
      warnings.push(`numbers.${sequenceKey}.${sourceId} is not an object — skipped`);
      continue;
    }
    const entry = entryUnknown as Record<string, unknown>;
    const x = asFiniteNumber(entry['x']);
    const y = asFiniteNumber(entry['y']);
    if (x == null || y == null) {
      warnings.push(`numbers.${sequenceKey}.${sourceId} is missing x/y — skipped`);
      continue;
    }
    const textRaw = entry['text'];
    const text = textRaw == null ? '' : String(textRaw);
    const sequenceNumber =
      typeof textRaw === 'number' && Number.isFinite(textRaw)
        ? Math.trunc(textRaw)
        : /^-?\d+$/.test(text)
          ? Number.parseInt(text, 10)
          : null;
    const oidRaw = entry['oid'];
    const linkedObstacleSourceId = oidRaw == null ? null : String(oidRaw);
    const ocp = asNullableString(entry['ocp']);

    numbers.push({
      id: `${sequenceKey}:${sourceId}`,
      text,
      sequenceNumber,
      sequenceKey,
      xMeters: pxToMetersX(x, frame),
      yMeters: pxToRingMetersY(y, frame),
      linkedObstacleSourceId,
      obstacleConnectionPoint: ocp,
      rawMetadata: {
        _canvas: { x, y },
        sequenceKey,
        raw: entry,
      },
    });
  }
  return numbers;
}

function extractLogos(maybeLogos: unknown): IgnoredLogo[] {
  if (!Array.isArray(maybeLogos)) return [];
  const out: IgnoredLogo[] = [];
  for (const item of maybeLogos) {
    if (item != null && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      out.push({
        url: asNullableString(obj['url']),
        rawMetadata: obj,
      });
    }
  }
  return out;
}

function buildSourceMetadata(outer: Record<string, unknown>): CourseSourceMetadata {
  const obstacleSummaryRaw = outer['obstacle_summary'];
  const obstacleSummary = Array.isArray(obstacleSummaryRaw)
    ? obstacleSummaryRaw.filter((x): x is string => typeof x === 'string')
    : null;
  return {
    type: asString(outer['type']) ?? '',
    courseType: asString(outer['course_type']) ?? '',
    grade: asString(outer['grade']) ?? '',
    category: asString(outer['category']) ?? '',
    location: asString(outer['location']) ?? '',
    designer: asString(outer['designer']) ?? '',
    organization: asString(outer['organization']) ?? '',
    date: asString(outer['date']) ?? '',
    exportVersion: asFiniteNumber(outer['export_version']),
    obstacleSummary,
  };
}

function deriveCourseId(outer: Record<string, unknown>): string {
  const hash = asString(outer['local_hash_id']);
  if (hash) return `smarter:${hash}`;
  const uid = asString(outer['uid_date']);
  if (uid) return `smarter:${uid}`;
  return `smarter:${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------------------
// Tiny coercion helpers — kept private so the API surface stays small.
// ---------------------------------------------------------------------------

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asNullableString(v: unknown): string | null {
  const s = asString(v);
  return s === null ? null : s;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}
