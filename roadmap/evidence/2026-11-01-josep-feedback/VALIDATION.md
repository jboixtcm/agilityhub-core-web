# Josep feedback — 1 November 2026

## Result and scope

The 1 November document adds password visibility, acknowledged password recovery, profile switching from the administrator menu, class times and clearer cancellations in history, and an explanation of the weekly booking limit. All new copy is available in Catalan, Spanish and English. The counted-class explanation uses the API's additive `bookingState` field; it shows late cancellations without attendance. The existing two-hour setting is for training: the live class-cancellation threshold remains four hours.

This candidate starts from published web `1d80fe9348579b19bde16758f9c326d74938e917`, retaining its risk review and donut chart, the student grid/search/filters, and the member-only PWA changes. An isolated source directory prevents the shared checkout's older risk files from reverting the published implementation. The exact build-input manifest and published Git tree are compared before packaging.

The browser needs a user gesture and permission for notifications; installing a PWA cannot grant permission. The live branding endpoint also currently reports no push public key, so delivery is an explicit operational pending item. This change does not configure or activate push delivery, send recovery mail, change real consents, book/cancel classes, or create impersonation grants. All mutation-flow tests use fictional fixtures.

## Verification

Final complete validation passed (exit 0): 351 browser cases, 3,683 Vitest cases and 20 Node tests; all 38 lint/typecheck/test/build tasks, core E2E typecheck, translation checks and size budgets passed. Login/recovery, history, weekly-limit and profile-menu captures were visually reviewed at 375 and 1280 pixels. A capture-only SVG painting race was fixed by explicitly waiting for the visible eye geometry; no application change was needed.

- API: 51 focused tests passed in API evidence `roadmap/evidence/2026-11-01-josep-feedback`; published additive contract commit `525e5f5895e9eba80ffe22469739633eee15663f`. Full CI remains a deployment gate.
- Integrated web validation: 3,683 Vitest cases plus 20 Node script tests passed; all 38 lint/typecheck/test/build tasks passed (`12-isolated-full-checks.log`). Translation checks passed.
- Exact password input selectors replace substring queries in browser tests: the new accessible visibility button also includes the word password. No assertion or browser coverage was removed.
- Existing console usage test now pins only `Date` to its October fixture, restores real timers, and explicitly checks the selected month; it no longer depends on the machine's current month.
- Total administrator JavaScript: 687.10 kB gzip. Budget changes from 686 to 688 kB for the translated access/profile additions; the initial-load 460 kB limit remains unchanged (452.75 kB measured). Other budgets remain unchanged.

## Earlier attempts

- `01-focused-tests.log`: two old history date expectations updated for the new time.
- `03-full-checks.log`: fixed two void-expression lint findings.
- `06-full-checks.log`: Spanish recovery heading changed to the permitted neutral wording.
- `08-full-checks.log`: exact mock contract expectations updated for bookingState.
- `10-full-checks.log`: exposed the existing month-rollover-dependent console fixture assertion.
- `11-full-checks.log`: corrected the test-only clock value after an unavailable fixture export.
- `12-isolated-full-checks.log`: all tests/build/lint/types and translations passed; total admin size exceeded the previous budget by 1.10 kB.
- `13-browser-suite.log`: new visibility button made a substring password locator ambiguous; selectors now require an exact label.
- `14-browser-suite.log`: stopped this task's Docker container before browser tests to fix the remaining Spanish and locale-dependent versions of the same selector.

- `15-final-validation.log`: four settings scenarios still used a dynamic substring password locator; made it exact.
- `16-final-validation.log`: 349 browser cases passed; two settings tests still expected the old training-threshold label. Updated the expected label in ca/es/en.
- `17-generated-types.log`: API regeneration exit 0; generated file SHA-256 unchanged.
- `18-visible-eye-captures.log`: four Chromium/WebKit password/recovery cases passed with the explicit SVG geometry assertion.

## Release status

Prepared; not yet declared deployed. Production activation requires successful CI for the exact selected source, a fresh expected-current guard, verified backup/restore and off-host escrow, HTTPS/static-asset readback, and read-only data comparison.

## Final complete command

Run from the isolated source directory. Exit code: **0**. Full output: `19-final-validation.log`.

```sh
HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' sh -c 'pnpm e2e:docker feedback-20261101 -- --capture-task=2026-11-01-josep-feedback --workers=2 && pnpm turbo run lint typecheck test build --concurrency=2 && pnpm typecheck:e2e-core && pnpm i18n:check && pnpm size-limit'
```

Last 40 lines:

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       320.4 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.87 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       452.75 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 688 kB
  Size:       687.1 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.2 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.76 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       103.19 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       133.62 kB gzipped
  
```

The 986 build inputs have SHA-256 `c755480e69e2cc6f5ee1091d184a5afd897cdf6c04125731fef64a78f8068503`. The publication helper rejects input changes and upstream movement.
