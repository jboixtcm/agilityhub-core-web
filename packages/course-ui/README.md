# `@agilityhub/course-ui`

React 19 course-planner components recovered from
`agilityhub-course-builder/apps/web-planner` at commit
`65126cf96043cd5bad6e94174af75c9453b7ef83` (21 September 2026).

The E9-W02 port preserves the source planner geometry and Three.js 0.160 rendering while removing
Next.js and Supabase coupling. Navigation is supplied through `PlanStepper.renderLink`, persistence
through `configurePlannerStore`, and every user-visible label through component props so consuming
apps can use the `courses` and `admin-courses` i18n namespaces.

`assets/obstacle-models` contains the nine recovered FBX models. A consuming app must publish those
files at `/obstacle-models`, or pass the corresponding public base URL to `Planner3D.assetBaseUrl`.
All drawing colours resolve through `--ah-color-course-*` tokens declared by `@agilityhub/ui`.

`CoreApiStore` lives in `@agilityhub/api-client` and is the production `PlannerStore`
implementation. It uses only generated S16 OpenAPI types. The current club is injected as the sole
planner venue because S16 exposes club rings but no venue-list endpoint.
