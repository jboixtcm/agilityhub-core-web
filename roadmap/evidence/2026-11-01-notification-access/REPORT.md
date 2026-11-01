# Combined notification and app-access validation

Feedback points 2, 4, 7 and 8, 2026-11-01. This report covers the exact source candidate, local checks and fictional browser fixtures. Publication, hosted verification and production/provider writes have separate release receipts.

## Behavior

- The club app offers member/instructor profiles and explains ADMIN-only access without automatically redirecting to administration. Administration remains a separate management surface.
- The existing ADMIN sending log has a direct navigation entry, recipient/code/safe-subject search and a safe access/password-recovery label for N-25. It distinguishes provider acceptance from confirmed delivery, masks recipient fallback addresses and shows platform attempt counts, local timestamps and classified temporary rejection history. Credential-bearing access-email content remains absent. Exports retain technical status; temporary history is available in the detail view.
- The home bell has a larger reachable target and finite animation. An important unread notice appears on entering the app without marking it read; the existing feed controls reading. Reduced motion is respected. A cold notification namespace cannot suspend the app shell.
- All new text is translated into Catalan, Spanish and English. Existing branding/PWA configuration is preserved for the production build. No new runtime dependency, send, retry, preference change or SMS activation is introduced.

## Validation

- `pnpm exec turbo run lint typecheck test build --concurrency=2`: exit 0, 38/38 tasks; 3,694 Vitest tests and 20 Node tests passed (`01-native-checks.log`).
- `pnpm typecheck:e2e-core`, `pnpm i18n:check`, `pnpm api:generate`, `pnpm size-limit`: exit 0; generation leaves all captured inputs unchanged (`02`–`05` logs).
- `pnpm e2e:docker 2026-11-01-notification-access --workers=2 --capture-task=2026-11-01-notification-access`: course UI 4/4 and clubs 144/145 passed. The sole failure was an ambiguous old attendance text selector after the banner reused the same cancellation title (`06-browser-initial.log`).
- The attendance assertion now selects the class's alert explicitly. The serial Docker continuation uses the same versioned Playwright image and two workers: corrected attendance 1/1; app profile/attention captures 8/8; administration 209/213; complete identity 1/1 (`07-browser-continuation.log`). The four administration failures were solely the new test's exact-text selector for N-25: the accessible link also contains its safe subject. It now selects that complete link name; all four corrected delivery-log cases pass (`07b-delivery-browser-final.log`), with focused lint/format checks in `07c`/`07d`. No product code changed. The remaining 144 club tests and four course tests use unchanged inputs; total unique browser coverage is 363/363. The eight recapture cases repeat already passing checks solely to retain the visual artifacts.
- The only difference between the passed native inventory (`08b-native-tested-inputs.json`) and the final inventory (`08-tested-inputs.json`) is that delivery-log browser-test selector. Its focused lint and all four browser cases pass; the already valid unit/build checks are retained.
- 28 relevant screenshots cover 375/1280px and Chromium/WebKit. The attention captures additionally cover dark/light and reduced motion. Visual review and immutable file hashes are in `09-visual-review.json` and `10-screenshots.json`.
- Admin total JavaScript is 689.05 kB gzip (+1.95 kB from the published 687.10 kB baseline), with a proportional 690 kB total budget. Initial load remains 453.23/460 kB. Test performance and initial-load budgets are unchanged.

Earlier native failure: the new notification namespace could suspend the entire shell; useSuspense:false with a readiness guard and a namespace-loading regression test fixed it. An existing status selector was narrowed to the saved-note confirmation. Earlier logs retain their failures; inline fixture image data and capability strings are omitted. No assertion was removed and no performance budget was relaxed.

The API contract and backend have separate clean-verify evidence: 5,007 unit tests plus 2,357 integration tests passed, with coverage gates enforced. Tenant/ADMIN authorization, safe metadata, soft rejection followed by delivery, duplicate/late callbacks, search/facets/export and global unscoped SYSTEM exclusion are covered there.
