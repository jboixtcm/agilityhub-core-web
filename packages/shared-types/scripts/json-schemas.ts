/**
 * The JSON Schemas the core validates courses with (S16 R-16-01, WP-16-A′, ruling E84).
 *
 * The zod schemas stay the single source of truth and are never changed for this export (E84,
 * A9). The version lives in each file name and `$id`: a breaking change publishes a `v2` file next
 * to the `v1`, and the core stores the version next to the course.
 *
 * `renderJsonSchema` is the only generator: `export-json-schemas.ts` writes its output, and the
 * drift test (`tests/json-schemas.test.ts`) compares it with the committed files byte for byte.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { courseDataSchema } from "@agilityhub/course-core";
import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { buildSessionExportV1Schema } from "../src/build-session-export.js";

const PACKAGES_DIR = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

export interface JsonSchemaTarget {
  /** The schema's `$id`; its last path segment carries the version. */
  readonly id: string;
  readonly title: string;
  /** Absolute path of the committed file. */
  readonly path: string;
  readonly schema: ZodType;
}

export const COURSE_DATA_V1: JsonSchemaTarget = {
  id: "https://schemas.agilitydoghub.com/course-data/v1.json",
  title: "CourseData",
  path: resolve(PACKAGES_DIR, "course-core", "schema", "course-data.v1.schema.json"),
  schema: courseDataSchema,
};

export const BUILD_SESSION_EXPORT_V1: JsonSchemaTarget = {
  id: "https://schemas.agilitydoghub.com/build-session-export/v1.json",
  title: "BuildSessionExportV1",
  path: resolve(PACKAGES_DIR, "shared-types", "schema", "build-session-export.v1.schema.json"),
  schema: buildSessionExportV1Schema,
};

export const JSON_SCHEMA_TARGETS: readonly JsonSchemaTarget[] = [
  COURSE_DATA_V1,
  BUILD_SESSION_EXPORT_V1,
];

/**
 * Draft-07, every sub-schema inlined (`$refStrategy: "none"`): no `$ref` at all, so a Java
 * validator loads each file on its own. Output is 2-space JSON with a final newline.
 */
export function renderJsonSchema(target: JsonSchemaTarget): string {
  const { $schema, ...body } = zodToJsonSchema(target.schema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  });
  const document = { $schema, $id: target.id, title: target.title, ...body };
  return `${JSON.stringify(document, null, 2)}\n`;
}
