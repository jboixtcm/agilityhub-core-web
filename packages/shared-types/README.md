# `@agilityhub/shared-types`

Transport contracts of the course platform, validated with zod. The main one is
**`BuildSessionExportV1`** (`src/build-session-export.ts`), the JSON the Unity AR app loads
(web-planner decision D-037). Domain types (`CourseData`, `Ring`, `CoursePlacement`, warnings…) live
in `@agilityhub/course-core`.

Recovered from the web-planner monorepo in roadmap task **E0-W08** (WP-16-A′, ADR-013,
S16 §14.5) with its tests and unchanged behaviour.

## Provenance

|                                  |                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Origin repository                | `agilityhub-course-builder` (Jordi's local working copy)                                |
| Origin commit                    | `65126cf96043cd5bad6e94174af75c9453b7ef83` (`main`, 2026-09-21)                         |
| Copied paths                     | `packages/shared-types/{src,tests}`                                                     |
| Local modifications at copy time | none (see `packages/course-core/README.md` and `roadmap/evidence/E0-W08/provenance.py`) |
| Not copied                       | `node_modules/`, `dist/`, `vitest.config.ts.timestamp-*.mjs`                            |

Changes against the origin:

- `src/db.ts` → `src/legacy/db.ts`. These are the hand-written Supabase row types
  (`DBVenue`, `DBRing`, `DBCourse`, `DBBuildSession`…). They are kept **for reference only**: not
  re-exported from `src/index.ts`, and there is no Supabase runtime dependency. The core API (OpenAPI,
  `packages/api-client`) replaces them. They still typecheck.
- `src/index.ts` no longer re-exports `./db.js`; its header says so.
- `tests/build-session-export.test.ts` reads the Smarter fixture from
  `packages/course-core/fixtures/smarter/` instead of the origin's `<repo>/fixtures/smarter/`.

## Preserved contract

`BuildSessionExportV1` is kept byte-identical to the origin: `schemaVersion: 1`, `producer`,
`assetProfile`, the 6 canonical ring markers A–F with their AprilTag physical sizes, and the
per-obstacle build status. The core will serve it from `GET /build-sessions/{id}/export`
(S16 §14.1). Any breaking change needs a `schemaVersion: 2` schema next to it, as the origin
header says.

## Pending

- JSON Schema publication of `BuildSessionExportV1` for core-side validation (S16 §14.5).
- `producer` is a free string passed by the caller. The schema comment still documents the
  web-planner form (`"agilityhub-web-planner@<version>"`). The core picks its own value when it
  produces the export (WP-16-C′).
