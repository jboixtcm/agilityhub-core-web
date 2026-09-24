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

`src/` is byte-identical to the origin except `src/cli/importer-summary.ts`: its default input folder
moved from `<repo>/fixtures/smarter` to `<package>/fixtures/smarter`. `tests/` is byte-identical
except:

- `tests/fixtures.ts`: fixture folders resolve from the package root (`fixtures/`) instead of the
  origin's repo root, and `ROUTE_VALIDATION_FIXTURES_DIR` was added.
- `tests/smarter-writer.test.ts` («supports every physical code…»): the test gave the `t2` tunnel
  5 control points, but the writer (`expectedTunnelControlPointCount`) requires 3 for
  `t2`/`t3s`/`t3`. The test was already failing at the origin commit. The test now follows the
  unchanged writer logic.
- `tests/smarter-fixtures.test.ts` is new (T-16-01): the 4 route-validation files through
  `parseSmarterTxt` (S16 §14.3 header, zero warnings, units, dimensions, obstacle counts by type,
  number labels, raw ↔ parsed obstacle groups, anchors inside the field).

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
tests/      Vitest (node), 18 files
fixtures/   smarter/ (8 real exports, used by the origin tests)
            colors/ (Smarter colour scheme)
            route-validation/ (the 4 verified route files + their README)
```

## Scripts

`pnpm --filter @agilityhub/course-core test | typecheck | lint | build` (`build` emits `dist/`
with declarations; consumers import the TypeScript sources through `exports`).

## Licence

`src/markers/apriltag-36h11-codes.ts` and the bit-layout tables in the renderer are copies of
AprilTag's `tag36h11.c` (BSD-2-Clause, © 2013-2016 The Regents of The University of Michigan).
The notice is in `LICENSE-apriltag`, next to this README. The file header still says
«repo root», as in the origin.

## Pending (not in E0-W08)

- The origin's `importer:summary` script ran with `tsx`, which this monorepo does not ship. The
  module is kept and exported. Running it needs a TS runner (proposal: add one when a task needs it).
- JSON Schema publication of `CourseData` / `BuildSessionExportV1` for core validation
  (S16 §14.5 WP-16-A′). `zod-to-json-schema` is not a dependency yet.
- `COURSE_CORE_VERSION` still reads `0.3.0-phase6` (origin value).
- T-16-01's «unknown obstacle → `OTHER`» and «corrupt file → `errors[]`» come from the S16 v0.1
  hypothesis. The real parser throws `SmarterParseError` on a corrupt file (tested in
  `parse-smarter-txt.test.ts`). It imports unknown groups as `obstacleType: "Unknown"` with a
  warning. S16 §14.4 says the spec adopts the engine's real behaviour.
- `packages/course-ui` (WP-16-B′) and `CoreApiStore` (WP-16-C′) are later tasks.
