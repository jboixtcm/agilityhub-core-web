# App profile access — handoff validation, 2026-11-01

## Authorized result

Jordi decided that the club app stays on its own origin with MEMBER or INSTRUCTOR. ADMIN is management-only and must not cause an automatic handoff. This supersedes the older S01/03b ADMIN choice. The existing 03b visual design and supported remembered choices are retained.

- Filter choices to roles actually held: MEMBER and INSTRUCTOR only.
- A sole app profile opens directly, even when ADMIN was remembered. Two app profiles retain a compatible remembered choice or show 03b. Existing restored sessions with an incompatible ADMIN selection reach 03b before member/instructor data is read.
- ADMIN-only accounts see an explicit explanation and logout. No roles are granted and no automatic cross-origin navigation occurs.
- Instructor routes require INSTRUCTOR in the app. Authentication roles, back-office code, API, and delivery configuration are unchanged.
- Profile switching and remember-choice writes use the existing supported API. App navigation scopes the effective profile without modifying the shared authentication provider used by admin.

## Passed local checks

- `pnpm turbo run lint typecheck test build --concurrency=2`: 38 successful tasks; 3,687 Vitest tests and 20 Node tests. Logs: `05-full-checks.log`, `14-final-checks.log` (final source).
- Real-core spec typecheck, Clubs TypeScript, i18n parity/vocabulary/error keys, API regeneration unchanged, and all bundle-size checks pass (`08`–`13` logs).
- Focused access tests cover remembered ADMIN plus each supported role, two-role choice, compatible remembered MEMBER/INSTRUCTOR, restored sessions, removed roles, failed switch retry, explicit switching, and ADMIN-only routes with no handoff/data reads.
- First complete Docker attempt passed course-ui 4, Clubs 137, and id 1. The unchanged admin suite encountered repeated loading timeouts under four-worker load. It was stopped; this is **not a full browser pass**. The raw log is retained in `06-browser-suite.log` and failure contexts privately.

## Remaining combined-release gate

The parent consolidated points 2 + 4 + 7 + 8 under the delivery-log agent. A second two-worker attempt was stopped at the parent's request before the app suite. There is no separate publication or deployment for this candidate.

The combined owner must run the complete browser suite with two workers, including the four newly added Chromium/WebKit checks in `apps/clubs/e2e/app-profiles.spec.ts`, and inspect the 375/1280 screenshots (chooser and ADMIN-only explanation). These four checks have passed lint/typecheck but **have not yet run in a browser**. Full combined checks, exact-commit CI, production build, guarded activation and hosted verification remain the combined owner's gates.

Source base: `dde3c7179038195434faf093ecc049cf64661912` (published feedback, PWA, grid and dashboard changes preserved). The API and active release remain unchanged by this task. There were no real account role/profile changes and no messages sent.
