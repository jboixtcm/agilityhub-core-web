/**
 * @agilityhub/course-core
 *
 * Phase 1 — Smarter `.txt` importer + CourseData schema.
 * Phase 2 — geometry, placement, and warning engine.
 * Phase 6 — marker domain logic (UIDs, printable SVG, calibration grading).
 *
 * Public surface:
 *   - Schemas (zod + inferred TS types) for the core domain objects.
 *   - `parseSmarterTxt(rawFile)` — Smarter .txt → CourseData.
 *   - `parseSmarterColorsTxt(rawFile)` — Smarter colors .txt → CourseTheme[].
 *   - `summarizeCourse(courseData)` — compact digest for CLI / tests.
 *   - Geometry primitives, units helpers, `Ring` / `CoursePlacement`, transforms.
 *   - `runWarnings(course, placement, ring)` — warning engine + 6 rules.
 *   - `buildMarkerUid` / `renderMarkerSvg` / `gradeCalibration` — Phase 6.
 *
 * Pure TypeScript, no UI dependencies. Designed to be mirrored later in C# for Unity.
 */
export const COURSE_CORE_VERSION = '0.3.0-phase6';

export * from './schema/index.js';
export * from './parser/index.js';
export * from './writer/index.js';
export * from './geometry/index.js';
export * from './warnings/index.js';
export * from './markers/index.js';
