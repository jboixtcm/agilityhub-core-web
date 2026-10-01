/**
 * Writes the committed JSON Schemas (S16 WP-16-A′, ruling E84):
 *   pnpm --filter @agilityhub/shared-types schema:export
 *
 * Run it after any change to `courseDataSchema` or `buildSessionExportV1Schema`; the drift test
 * fails until the files are regenerated.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

import { JSON_SCHEMA_TARGETS, renderJsonSchema } from "./json-schemas.js";

for (const target of JSON_SCHEMA_TARGETS) {
  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, renderJsonSchema(target));
  console.log(`wrote ${relative(process.cwd(), target.path)}`);
}
