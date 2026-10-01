# `@agilityhub/course-core`

Framework-agnostic course engine of the AgilityHub course platform: Smarter Agility `.txt`
importer, `CourseData` schema (zod), Smarter writer, geometry (ring, placement, transforms,
units, paper presets), the placement warning engine and the AprilTag 36h11 markers
(ids, SVG rendering, calibration). Pure TypeScript, no UI, DOM or Supabase dependency; its only
runtime dependency is `zod` (pinned to `3.25.76`, the version of the origin lockfile).

Recovered from the web-planner monorepo in roadmap task **E0-W08** (WP-16-A′, ADR-013,
S16 §14.5) with its tests and **unchanged behaviour**.

## Provenance

|                                  |                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin repository                | `agilityhub-course-builder` (Jordi's local working copy)                                                                                                                               |
| Origin commit                    | `65126cf96043cd5bad6e94174af75c9453b7ef83` (`main`, 2026-09-21, «Record visual audit of three newly accepted courses»)                                                                 |
| Copied paths                     | `packages/course-core/{src,tests}`, `fixtures/smarter/*.txt` (8), `fixtures/colors/*.txt` (1), `apps/web-planner/route-validation-artifacts/*` (4 `.txt` + README), `LICENSE-apriltag` |
| Local modifications at copy time | none: every copied file matched the origin's git index (`roadmap/evidence/E0-W08/provenance.py`, run 2026-09-24)                                                                       |
| Not copied                       | `node_modules/`, `dist/`, `vitest.config.ts.timestamp-*.mjs`, the `_render-pack.mjs` / `_render-sample.mjs` dev scripts (no test uses them)                                            |

`src/` is byte-identical to the origin except:

- `src/cli/importer-summary.ts`: its default input folder moved from `<repo>/fixtures/smarter` to
  `<package>/fixtures/smarter`.
- `src/markers/marker-svg.ts` (type-only, E0-W08 round 2): the optional properties of the private
  `ChromeFooterArgs` and `RingDiagramOpts` interfaces accept `| undefined`, so the package
  typechecks with `exactOptionalPropertyTypes: true` like the apps that import its sources.

`tests/` is byte-identical except:

- `tests/fixtures.ts`: fixture folders resolve from the package root (`fixtures/`) instead of the
  origin's repo root, and `ROUTE_VALIDATION_FIXTURES_DIR` was added.
- `tests/smarter-writer.test.ts` («supports every physical code…»): the test gave the `t2` tunnel
  5 control points, but the writer (`expectedTunnelControlPointCount`) requires 3 for
  `t2`/`t3s`/`t3`. The test was already failing at the origin commit. The test now follows the
  unchanged writer logic.
- `tests/smarter-fixtures.test.ts` is new (T-16-01): the 4 route-validation files through
  `parseSmarterTxt` (S16 §14.3 header, zero warnings, units, dimensions, obstacle counts by type,
  number labels, raw ↔ parsed obstacle groups, anchors inside the field).
- `tests/course-data-json-schema.test.ts` is new (T-16-03, E9-W01): see «JSON Schemas for the
  core» below.

To keep the files diffable against the origin, they are excluded from Prettier
(`.prettierignore`), and a scoped block in `packages/config/eslint.config.mjs` switches off the
style/strictness rules that were not enforced there. The color rule stays on, except for the two
AprilTag print modules and their tests: fiducials must be pure black on white, and the marker page
is a standalone SVG file.

## Layout

```
src/        schema · parser (parseSmarterTxt, parseSmarterColorsTxt, summarizeCourse)
            writer (Smarter 10.1.2) · geometry · warnings (runWarnings + rules) · markers
            cli/importer-summary.ts (exported as ./cli/importer-summary)
schema/     course-data.v1.schema.json (generated, see below)
tests/      Vitest (node), 19 files
fixtures/   smarter/ (8 real exports, used by the origin tests)
            colors/ (Smarter colour scheme)
            route-validation/ (the 4 verified route files + their README)
```

## Scripts

`pnpm --filter @agilityhub/course-core test | typecheck | lint | build` (`build` emits `dist/`
with declarations; consumers import the TypeScript sources through `exports`).

## JSON Schemas for the core

The core checks a course only against a JSON Schema (S16 R-16-01): the geometry stays here, on
the client. Two files are generated from the zod schemas (E9-W01) and never edited by hand:

| File                                                               | Generated from               | `$id`                                                            |
| ------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------- |
| `schema/course-data.v1.schema.json` (this package)                 | `courseDataSchema`           | `https://schemas.agilitydoghub.com/course-data/v1.json`          |
| `packages/shared-types/schema/build-session-export.v1.schema.json` | `buildSessionExportV1Schema` | `https://schemas.agilitydoghub.com/build-session-export/v1.json` |

- **Format.** JSON Schema draft-07, written by `zod-to-json-schema` with `$refStrategy: "none"`:
  every sub-schema is inlined and there is no `$ref`, so a validator (the core's, in Java) loads
  each file on its own. 2-space JSON with a final newline.
- **Versioning (ruling E84).** `CourseData` has no version field, and adding one would change
  `BuildSessionExportV1`, which embeds it and stays byte for byte (A9). So the version lives in
  the file name and the `$id`, and the core stores it next to the course (`schemaVersion = 1`
  beside `normalizedJson`). A breaking change publishes a `v2` file, with its own `$id`, next to
  the `v1`.
- **Regenerating.** `pnpm --filter @agilityhub/shared-types schema:export` (the generator is
  `packages/shared-types/scripts/`, since shared-types already depends on this package). Run it
  after any change to either zod schema: the drift test
  (`packages/shared-types/tests/json-schemas.test.ts`) compares the committed files with the
  generator's output byte for byte and fails CI until they match. For the same reason both
  `schema/` folders are excluded from Prettier.
- **The api's copy.** The organizer copies both files into the api byte for byte (E9-T01).
- **Two things JSON Schema cannot say.** zod strips unknown keys, while the schema rejects them
  (`additionalProperties: false`, zod-to-json-schema's rendering of zod's default). A
  `.default(…)` field is optional in the schema and carries a `default` annotation, which
  validators do not apply. The web sends zod-parsed values, which have every default and no
  unknown key.
- **Tests (T-16-03).** `tests/course-data-json-schema.test.ts`: every Smarter fixture (the 8 of
  `fixtures/smarter/` and the 4 of `fixtures/route-validation/`) through `parseSmarterTxt` is
  valid; a CourseData without a required field, with an unknown obstacle type or with a negative
  `designLengthMeters` is not, and zod agrees on every case.
  `packages/shared-types/tests/json-schemas.test.ts`: an export built from fixture rows is valid,
  `schemaVersion: 2` is not, plus the drift check.

## Licence

`src/markers/apriltag-36h11-codes.ts` and the bit-layout tables in the renderer are copies of
AprilTag's `tag36h11.c` (BSD-2-Clause, © 2013-2016 The Regents of The University of Michigan).
The notice is in `LICENSE-apriltag`, next to this README. The file header still says
«repo root», as in the origin.

## Pending (not in E0-W08)

- The origin's `importer:summary` script ran with `tsx`, which this monorepo does not ship. The
  module is kept and exported. E9-W01 added the `jiti` runner to shared-types for
  `schema:export`; the summary script could run the same way if a task needs it.
- `COURSE_CORE_VERSION` still reads `0.3.0-phase6` (origin value).
- T-16-01's «unknown obstacle → `OTHER`» and «corrupt file → `errors[]`» come from the S16 v0.1
  hypothesis. The real parser throws `SmarterParseError` on a corrupt file (tested in
  `parse-smarter-txt.test.ts`). It imports unknown groups as `obstacleType: "Unknown"` with a
  warning. S16 §14.4 says the spec adopts the engine's real behaviour.
- `packages/course-ui` (WP-16-B′) and `CoreApiStore` (WP-16-C′) are later tasks.
