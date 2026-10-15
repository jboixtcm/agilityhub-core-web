# `@agilityhub/course-ui`

React 19 course-planner components recovered from
`agilityhub-course-builder/apps/web-planner` at commit
`65126cf96043cd5bad6e94174af75c9453b7ef83` (21 September 2026).

The E9-W02 port preserves the source planner geometry and Three.js 0.160 rendering while removing
Next.js and Supabase coupling. Navigation is supplied through `PlanStepper.renderLink`, persistence
through `configurePlannerStore`, and every user-visible label through component props so consuming
apps can use the `courses` and `admin-courses` i18n namespaces.

Shared texts come from `@agilityhub/i18n`: `useCourseTexts()` gives `errorText` (every api failure
by its `errors:<CODE>`, for the `error` label of `UploadCourse`, `RingDoorEditor` and
`RingInventoryEditor`) and `warningRule` (the `WarningsPanel` `rule` label). Components that show
lengths (`PlacementControls`, `WarningsPanel`, `RingMarkerDiagram`) take the club's `locale`. A
consuming app's Tailwind entry must scan this package (`@source` on `packages/course-ui/src`).

Obstacle headings follow one convention: `placedObstacleHeadingDegrees` in `course-core` turns the
Smarter Y-down angle into the ring's Y-up heading; `CoreApiStore` persists it and both planners
render it, so the saved AR geometry and the preview agree.

`pnpm --filter @agilityhub/course-ui harness` serves a dev-only page (`harness/`) that mounts the
components with the FBX models; `pnpm --filter @agilityhub/course-ui e2e` checks it in Chromium at
1280 px (part of `pnpm e2e`).

`assets/obstacle-models` contains the nine recovered FBX models. A consuming app must publish those
files at `/obstacle-models`, or pass the corresponding public base URL to `Planner3D.assetBaseUrl`.
All drawing colours resolve through `--ah-color-course-*` tokens declared by `@agilityhub/ui`.

`CoreApiStore` lives at `@agilityhub/api-client/core-api-store` and is the production `PlannerStore`
implementation. It uses only generated S16 OpenAPI types. The current club is injected as the sole
planner venue because S16 exposes club rings but no venue-list endpoint.

The store covers ring geometry and inventory, course upload, placements (with the ADMIN's `force`
for critical warnings), markers, calibration logs, and build sessions (obstacle state and
`finishBuildSession`). Door saves carry the geometry version the user edited; an upload retried
under the same key resends the same body. Its `subscribeBuildEvents` option is the authenticated SSE boundary:
the published OpenAPI currently describes `/build-sessions/{id}/events` as an untyped
`text/event-stream`, so the consuming app supplies the authorized stream transport and cleanup while
the store keeps the `PlannerStore` callback shape stable.
