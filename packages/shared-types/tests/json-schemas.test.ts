/**
 * The JSON Schemas published for the core (S16 WP-16-A′, ruling E84).
 *
 * 1. Drift check: `renderJsonSchema` (the generator behind `schema:export`) is run in memory and
 *    compared with the committed files byte for byte, so a zod change without a regenerated
 *    schema fails CI, like the api's OpenAPI snapshot test.
 * 2. T-16-03 (R-16-01): a BuildSessionExportV1 built from fixture rows, as the export tests do,
 *    is valid against `build-session-export.v1.schema.json`; with `schemaVersion: 2` it is not.
 *    The CourseData half of T-16-03 lives in course-core (`course-data-json-schema.test.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import {
  centerCourseInRing,
  parseSmarterTxt,
  runWarnings,
  type Ring,
} from '@agilityhub/course-core';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import {
  BUILD_SESSION_EXPORT_V1,
  COURSE_DATA_V1,
  JSON_SCHEMA_TARGETS,
  renderJsonSchema,
} from '../scripts/json-schemas.js';
import {
  buildBuildSessionExportV1,
  buildSessionExportV1Schema,
  type BuildSessionExportV1,
} from '../src/build-session-export.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SMARTER_FIXTURES_DIR = resolve(REPO_ROOT, 'packages', 'course-core', 'fixtures', 'smarter');

type JsonObject = Record<string, unknown>;

function collectRefs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value);
      collectRefs(value, found);
    }
  }
  return found;
}

describe('JSON Schema drift check — the committed files are what schema:export writes', () => {
  it('publishes exactly the two versioned files at their paths (ruling E84)', () => {
    expect(
      JSON_SCHEMA_TARGETS.map((target) => [relative(REPO_ROOT, target.path), target.id]),
    ).toEqual([
      [
        'packages/course-core/schema/course-data.v1.schema.json',
        'https://schemas.agilitydoghub.com/course-data/v1.json',
      ],
      [
        'packages/shared-types/schema/build-session-export.v1.schema.json',
        'https://schemas.agilitydoghub.com/build-session-export/v1.json',
      ],
    ]);
  });

  it.each(JSON_SCHEMA_TARGETS.map((target) => [relative(REPO_ROOT, target.path), target] as const))(
    '%s regenerates byte for byte',
    (_path, target) => {
      const committed = readFileSync(target.path, 'utf-8');
      // On failure: pnpm --filter @agilityhub/shared-types schema:export
      expect(renderJsonSchema(target)).toBe(committed);
    },
  );

  it.each(JSON_SCHEMA_TARGETS.map((target) => [relative(REPO_ROOT, target.path), target] as const))(
    '%s is deterministic 2-space JSON with a final newline, draft-07, and has no $ref',
    (_path, target) => {
      const first = renderJsonSchema(target);
      expect(renderJsonSchema(target)).toBe(first);
      const document = JSON.parse(first) as JsonObject;
      expect(first).toBe(`${JSON.stringify(document, null, 2)}\n`);
      expect(document.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(document.$id).toBe(target.id);
      expect(collectRefs(document)).toEqual([]);
    },
  );
});

function demoRing(): Ring {
  return {
    id: 'ring-demo',
    label: 'Ring 1',
    lengthMeters: 40,
    widthMeters: 30,
    borderClearanceMeters: 0.5,
    doors: [],
    noGoZones: [],
    obstacleInventory: {
      Jump: 50,
      DoubleJump: 10,
      Tunnel3m: 10,
      Tunnel4m: 10,
      Tunnel5m: 10,
      Tunnel6m: 10,
      DogWalk: 5,
      AFrame: 5,
      Seesaw: 5,
      Weave: 5,
      LongJump: 5,
      Wall: 5,
      Tire: 5,
    },
  };
}

/** The export tests' fixture rows, plus a door, a ring no-go zone and AprilTag ids. */
function buildExport(fixtureName: string): BuildSessionExportV1 {
  const raw = readFileSync(resolve(SMARTER_FIXTURES_DIR, fixtureName), 'utf-8');
  const { courseData: course } = parseSmarterTxt(raw, { sourceFileName: fixtureName });
  const ring = demoRing();
  const placement = centerCourseInRing(course, ring);
  const warnings = runWarnings(course, placement, ring);
  return buildBuildSessionExportV1({
    producer: 'agilityhub-web-planner@e9-w01-test',
    exportedAt: '2026-10-01T09:00:00.000Z',
    assetProfile: { profileId: 'generic-fci' },
    buildSession: {
      id: 'session-demo',
      placement_id: 'placement-demo',
      judge_id: 'judge-demo',
      status: 'in_progress',
      selected_strategy: 'equipment_type',
      last_known_marker_id: 'marker-A',
      started_at: '2026-10-01T08:30:00.000Z',
      completed_at: null,
      local_cache_version: 1,
    },
    obstacleStatuses: course.obstacles.map((o, i) => ({
      course_obstacle_id: o.id,
      status: i === 0 ? ('placed' as const) : ('not_placed' as const),
      updated_at: i === 0 ? '2026-10-01T08:45:00.000Z' : null,
    })),
    placement: {
      id: 'placement-demo',
      course_id: 'course-demo',
      venue_id: 'venue-demo',
      ring_id: ring.id,
      name: null,
      placement_mode: placement.placementMode,
      offset_x_m: placement.offsetXMeters,
      offset_y_m: placement.offsetYMeters,
      rotation_deg: placement.rotationDegrees,
      warning_threshold_m: 0.5,
      warnings_json: warnings,
      status: 'ready_to_build',
      course_type: 'Agility',
      grades: ['2', '3'],
      sizes: ['M'],
    },
    course: {
      id: 'course-demo',
      title: course.title,
      title_raw: course.titleRaw,
      source: 'smarter-agility',
      source_version: null,
      units: course.units === 'M' ? 'm' : 'ft',
      design_length_m: course.designLengthMeters,
      design_width_m: course.designWidthMeters,
      canvas_width: course.canvasWidth,
      canvas_height: course.canvasHeight,
      origin: course.origin,
      normalized_json: course,
    },
    theme: { id: null, palette_key: 'agilityhub', theme_json: {} },
    venue: {
      id: 'venue-demo',
      slug: 'demo-venue',
      name: 'Demo Partner Venue',
      country: 'ES',
      city: 'Demo Town',
      surface: 'artificial turf',
      indoor_outdoor: 'outdoor',
    },
    ring: {
      id: ring.id,
      venue_id: 'venue-demo',
      name: ring.label,
      length_m: ring.lengthMeters,
      width_m: ring.widthMeters,
      border_clearance_m: ring.borderClearanceMeters,
      surface: 'artificial turf',
      doors: [
        {
          id: 'door-1',
          label: 'Entrance',
          kind: 'entrance',
          polygon_points_m: [
            { x: 10, y: 29.5 },
            { x: 12, y: 29.5 },
            { x: 12, y: 30 },
            { x: 10, y: 30 },
          ],
          clearance_m: 1,
          side: 'north',
          start_m: 10,
          end_m: 12,
        },
      ],
      no_go_zones: [
        {
          id: 'zone-1',
          label: 'Column',
          kind: 'column',
          polygon_points_m: [
            { x: 1, y: 1 },
            { x: 1.5, y: 1 },
            { x: 1.5, y: 1.5 },
          ],
          warning_margin_m: 0.5,
        },
      ],
      markers: ['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) => ({
        id: `marker-${label}`,
        label,
        marker_uid: `marker-uid-${label}`,
        role: 'reference',
        x_m: i < 3 ? 0.5 + i * 19.5 : 0.5 + (i - 3) * 19.5,
        y_m: i < 3 ? 29.5 : 0.5,
        z_m: 0,
        rotation_y_deg: 0,
        physical_width_m: 0.19,
        physical_height_m: 0.19,
        is_fixed: true,
        is_active: true,
        april_tag_id: i === 5 ? null : i,
      })),
    },
  });
}

describe('T-16-03 BuildSessionExportV1 from fixture rows → valid against build-session-export.v1.schema.json', () => {
  const schemaDocument = JSON.parse(
    readFileSync(BUILD_SESSION_EXPORT_V1.path, 'utf-8'),
  ) as JsonObject;
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const validate: ValidateFunction = ajv.compile(schemaDocument);
  const fixtures = readdirSync(SMARTER_FIXTURES_DIR)
    .filter((name) => name.endsWith('.txt'))
    .sort();

  it('is a valid draft-07 schema with its version in the file name and $id (ruling E84)', () => {
    expect(ajv.validateSchema(schemaDocument)).toBe(true);
    expect(schemaDocument.$id).toBe('https://schemas.agilitydoghub.com/build-session-export/v1.json');
    expect(BUILD_SESSION_EXPORT_V1.path).toMatch(/build-session-export\.v1\.schema\.json$/);
    expect(COURSE_DATA_V1.path).toMatch(/course-data\.v1\.schema\.json$/);
  });

  it.each(fixtures)('the export of %s is valid (after a JSON round trip)', (fixtureName) => {
    const document = JSON.parse(JSON.stringify(buildExport(fixtureName))) as JsonObject;
    const valid = validate(document);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('the export carries the branches the schema checks (door edge, ring zone, AprilTag ids, warnings)', () => {
    const exportV1 = buildExport(fixtures[0]!);
    expect(exportV1.ring.doors[0]).toMatchObject({ side: 'north', start_m: 10, end_m: 12 });
    expect(exportV1.ring.no_go_zones).toHaveLength(1);
    expect(exportV1.ring.markers.map((m) => m.april_tag_id)).toEqual([0, 1, 2, 3, 4, null]);
    const withWarnings = fixtures.some((name) => buildExport(name).placement.warnings_json.length > 0);
    expect(withWarnings).toBe(true);
  });

  it('schemaVersion: 2 → invalid (and zod refuses it too)', () => {
    const document = {
      ...(JSON.parse(JSON.stringify(buildExport(fixtures[0]!))) as JsonObject),
      schemaVersion: 2,
    };
    expect(validate(document)).toBe(false);
    expect(validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: '/schemaVersion',
        keyword: 'const',
        params: { allowedValue: 1 },
      }),
    );
    expect(buildSessionExportV1Schema.safeParse(document).success).toBe(false);
  });

  it('a CourseData embedded in the export is checked too (unknown obstacle type → invalid)', () => {
    const document = JSON.parse(JSON.stringify(buildExport(fixtures[0]!))) as {
      course: { normalized_json: { obstacles: JsonObject[] } };
    };
    document.course.normalized_json.obstacles[0]!.obstacleType = 'Hurdle';
    expect(validate(document)).toBe(false);
    expect(validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: '/course/normalized_json/obstacles/0/obstacleType',
        keyword: 'enum',
      }),
    );
    expect(buildSessionExportV1Schema.safeParse(document).success).toBe(false);
  });
});
