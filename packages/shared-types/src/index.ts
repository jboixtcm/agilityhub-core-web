/**
 * @agilityhub/shared-types
 *
 * Cross-app DTOs. Mirrors the C# DTOs that Unity will use later.
 *
 * Phase 3:
 *   - `legacy/db.ts` — hand-written types for every public-schema table in
 *     supabase/migrations/ of the web-planner. Kept for reference only in
 *     agilityhub-core-web (E0-W08): not re-exported, no Supabase runtime
 *     dependency; the core API (OpenAPI) replaces them.
 *
 * Phase 8 — Unity prep:
 *   - `build-session-export.ts` — the canonical Unity-loadable JSON contract
 *     (BuildSessionExportV1). Zod-validated; both the web planner producer
 *     and the Unity C# consumer mirror this shape (D-037).
 *
 * Domain types (CourseData, Warning, Ring, CoursePlacement, …) live in
 * `@agilityhub/course-core` — not here. This package strictly persists at
 * the storage/transport boundary.
 */
export const SHARED_TYPES_VERSION = '0.3.0-phase8';

export * from './build-session-export.js';
