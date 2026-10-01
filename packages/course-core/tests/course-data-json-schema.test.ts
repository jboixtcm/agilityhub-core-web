/**
 * T-16-03 (R-16-01, ruling E84) — the committed `schema/course-data.v1.schema.json` is the JSON
 * Schema the core validates a course's `normalizedJson` with. Every Smarter fixture, parsed by
 * `parseSmarterTxt`, must be valid against it; a CourseData without a required field, with an
 * unknown obstacle type or with a negative `designLengthMeters` must not.
 *
 * The file is generated from `courseDataSchema` by `@agilityhub/shared-types`'s `schema:export`
 * (its drift test keeps both in step). Here it is loaded as the core would: on its own, draft-07,
 * with formats. Every case also asserts that zod agrees, so the schema says what zod says.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { courseDataSchema, parseSmarterTxt, type CourseData } from '../src/index.js';

import {
  listSmarterFixtures,
  PACKAGE_ROOT,
  ROUTE_VALIDATION_FIXTURES_DIR,
} from './fixtures.js';

const SCHEMA_FILE = 'course-data.v1.schema.json';
const SCHEMA_PATH = resolve(PACKAGE_ROOT, 'schema', SCHEMA_FILE);

type JsonObject = Record<string, unknown>;

function loadSchema(): JsonObject {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as JsonObject;
}

/** A fresh draft-07 Ajv with formats and nothing else registered: the file must stand alone. */
function compileSchema(): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  return ajv.compile(loadSchema());
}

/** What the core receives: the CourseData after a JSON round trip. */
function asJson(course: CourseData): JsonObject {
  return JSON.parse(JSON.stringify(course)) as JsonObject;
}

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

/** Every Smarter fixture of the package: `fixtures/smarter/` (8) and `fixtures/route-validation/` (4). */
function allSmarterFixtures(): { name: string; raw: string }[] {
  const routeValidation = readdirSync(ROUTE_VALIDATION_FIXTURES_DIR)
    .filter((name) => name.endsWith('.txt'))
    .sort()
    .map((name) => ({
      name: `route-validation/${name}`,
      raw: readFileSync(resolve(ROUTE_VALIDATION_FIXTURES_DIR, name), 'utf-8'),
    }));
  const smarter = listSmarterFixtures().map(({ name, raw }) => ({ name: `smarter/${name}`, raw }));
  return [...smarter, ...routeValidation];
}

describe('T-16-03 course-data.v1.schema.json — the file the core loads', () => {
  const schema = loadSchema();

  it('is draft-07 and carries its version in the file name and $id (ruling E84)', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.$id).toBe('https://schemas.agilitydoghub.com/course-data/v1.json');
    expect(SCHEMA_FILE).toMatch(/\.v1\.schema\.json$/);
  });

  it('is a valid draft-07 schema that compiles on its own, with no $ref at all', () => {
    const ajv = new Ajv({ strict: true, allowUnionTypes: true });
    addFormats(ajv);
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(() => ajv.compile(schema)).not.toThrow();
    expect(collectRefs(schema)).toEqual([]);
  });
});

describe('T-16-03 every Smarter fixture → parseSmarterTxt → CourseData is valid', () => {
  const validate = compileSchema();
  const fixtures = allSmarterFixtures();

  it('covers the 12 Smarter fixtures of the package', () => {
    expect(fixtures).toHaveLength(12);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture.raw] as const))('%s', (name, raw) => {
    const { courseData } = parseSmarterTxt(raw, { sourceFileName: name });
    const valid = validate(asJson(courseData));
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('includes fixtures with no-go zones and ignored logos, so those branches are validated too', () => {
    const courses = fixtures.map(({ name, raw }) => parseSmarterTxt(raw, { sourceFileName: name }).courseData);
    expect(courses.some((course) => course.noGoZones.length > 0)).toBe(true);
    expect(courses.some((course) => course.ignoredLogos.length > 0)).toBe(true);
    expect(courses.some((course) => course.obstacles.some((o) => o.controlPointsMeters !== null))).toBe(true);
  });
});

describe('T-16-03 invalid CourseData → invalid against the schema (and against zod)', () => {
  const validate = compileSchema();
  const first = listSmarterFixtures()[0]!;
  const base = (): JsonObject =>
    asJson(parseSmarterTxt(first.raw, { sourceFileName: first.name }).courseData);

  function errorsOf(document: JsonObject): ErrorObject[] {
    expect(validate(document)).toBe(false);
    expect(courseDataSchema.safeParse(document).success).toBe(false);
    return validate.errors ?? [];
  }

  it('the base document is valid in both, so each case below fails only for its own change', () => {
    expect(validate(base())).toBe(true);
    expect(courseDataSchema.safeParse(base()).success).toBe(true);
  });

  it('a CourseData without a required field (obstacles) → invalid', () => {
    const document = base();
    delete document.obstacles;
    expect(errorsOf(document)).toContainEqual(
      expect.objectContaining({
        instancePath: '',
        keyword: 'required',
        params: { missingProperty: 'obstacles' },
      }),
    );
  });

  it('each top-level field zod requires is required by the schema too (and only those)', () => {
    for (const key of Object.keys(base())) {
      const document = Object.fromEntries(Object.entries(base()).filter(([name]) => name !== key));
      expect({ key, schema: validate(document) }).toEqual({
        key,
        schema: courseDataSchema.safeParse(document).success,
      });
    }
  });

  it('an obstacle with an unknown obstacle type → invalid', () => {
    const document = base();
    const obstacles = document.obstacles as JsonObject[];
    expect(obstacles.length).toBeGreaterThan(0);
    obstacles[0] = { ...obstacles[0], obstacleType: 'Hurdle' };
    expect(errorsOf(document)).toContainEqual(
      expect.objectContaining({ instancePath: '/obstacles/0/obstacleType', keyword: 'enum' }),
    );
  });

  it('a negative designLengthMeters → invalid (zero too: zod says positive)', () => {
    expect(errorsOf({ ...base(), designLengthMeters: -40 })).toContainEqual(
      expect.objectContaining({ instancePath: '/designLengthMeters', keyword: 'exclusiveMinimum' }),
    );
    expect(errorsOf({ ...base(), designLengthMeters: 0 })).toContainEqual(
      expect.objectContaining({ instancePath: '/designLengthMeters', keyword: 'exclusiveMinimum' }),
    );
  });

  it('an unknown key → invalid; zod strips it instead (zod-to-json-schema renders strip as additionalProperties: false)', () => {
    const document = { ...base(), unexpected: true };
    expect(validate(document)).toBe(false);
    expect(validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: '',
        keyword: 'additionalProperties',
        params: { additionalProperty: 'unexpected' },
      }),
    );
    const parsed = courseDataSchema.safeParse(document);
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'unexpected' in parsed.data).toBe(false);
  });
});
