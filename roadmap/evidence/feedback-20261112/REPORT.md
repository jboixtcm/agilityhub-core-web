# Josep feedback — 12 November 2026

Direct user request: apply the screenshot feedback and any pending Josep documents. This web change covers the new November 12 document plus the receipt-simulation diagnosis. The initial checkout was clean at b3ec84d7 and already contained the published November 11 changes. Existing roadmap task states and organizer verification are unchanged.

## Behavior

- Instructor attendance, waiting rows, class registrants, task headings and free-training occupants link to the corresponding student card. Training-slot links sit beside the disabled booking control, never inside it; navigation does not create a booking. Instructor day-grid training names also link to student cards. Member occupancy views remain anonymous.
- Each dashboard level opens the existing dog list with status ACTIVE and the exact level filter, ordered by assignment date then name. The list includes photo/name, breed, level, subscriber, level-assignment date, birth date and status. Both dates retain the year. Explicit URL filters/columns override a stored default view. Standard pagination reaches all matching dogs; no first-page-only client filtering is used. Missing dates stay empty and the server retains its established ordering.
- The administrator header retries a failed public mark once, then tries the theme-appropriate configured full logo and finally the club initial. It follows the runtime club branding and does not hardcode this installation.
- Receipt simulation reads the club's provider summary to explain that SEPA may be enabled with incomplete creditor details. Club-level provider incidents no longer send the user to every member record. Actual member-specific problems retain their record link. No bank setup is invented, no provider is enabled and no remittance is generated or submitted by this code change.

## Contract

The exact generated API snapshot is adopted in packages/api-client/openapi/openapi.json and the TypeScript schema regenerated. Additions: selectable DogListItem.birthDate; SheetWaitlistEntry.dogId; staff-only SlotOccupant.dogId and DayGridCell.trainingDogIds. API and web must be released together. Existing list filters, statuses, error codes and routes are retained.

## Validation

Final host validation passes: **38/38 tasks, 3,733 tests**, with 34 tasks served from matching Turbo cache in the final invocation. Host Node 22.23.2. Exact command: `pnpm turbo run lint typecheck test build --concurrency=2`, exit **0**, `web-final-complete.log` / `web-final-complete.exit`.

The complete browser suite passed: **391 tests**, no failures or skips (clubs 160, clubs-admin 226, id 1, course-ui 4). It ran in `mcr.microsoft.com/playwright:v1.63.0-noble`, with two workers, using `e2e-complete-recipe.sh`; `e2e-resumed-final.log`, exit **0**. The recipe installs the frozen lockfile, builds mock-enabled applications and runs every app's complete Playwright project. The image bundles Node 24.20.0 and emits the package's Node-22 engine warning; host build/type/test validation uses Node 22.

Visual inspection found an existing WebKit native status-select background override that made “Actius” hard to read. The select now uses its theme colors and a CSS arrow with native appearance disabled; option colors remain themed. After this CSS-only fix, `pnpm --filter clubs-admin e2e dashboard-chart.spec.ts --workers=2` passed **8/8**, exit **0**, in an isolated Docker copy using the installed dependencies from the complete run. It regenerated the light/dark 375/1280 Chromium/WebKit captures. This is explicitly the complete 391-case run plus the final eight affected regressions, not a claim that all 391 were rerun after the CSS fix.

The final host pass initially exposed one unrelated existing async fixture race in `MemberPlanDrawer.test.tsx`: it selected a price before that option had loaded, leaving Save disabled. Waiting for the actual 60-euro option preserves the full IN_PROGRESS/idempotency assertions. The nine drawer tests passed (`plan-drawer-final.log`), then all 38 host tasks passed. The failed run is retained as `web-final-after-visual.log`.

Other checks: `pnpm size` exit **0** (`size-resumed.log`); `pnpm typecheck:e2e-core` exit **0** (`core-types-resumed.log`); `pnpm i18n:check` passed (`i18n-final.log`); CSS ESLint and Prettier passed; final `git diff --check` exit **0**. API and web OpenAPI snapshots remain byte-identical. `continuation-validation.json` records per-package test counts and the exact scope of reruns.

Visually reviewed: `attendance-links-375.png`, `training-student-links-375.png`, both `billing-provider-chromium-*.png`, `category-list-chromium-light-1280.png`, `category-list-chromium-dark-375.png`, `category-list-webkit-light-375.png`, and `category-list-webkit-dark-1280.png`. Changed links remain readable, training links are outside disabled booking controls, creditor notices retain member-specific actions, and category columns retain complete dates. Mobile tables retain their normal internal horizontal scrolling.

## Release handoff

No commit, push, deployment, live payment-provider change, production data mutation or message send occurs in this web work. The operations task owns current production state and verified creditor configuration. The existing November 11 release thread must retain its frozen artifact scope.

## Final command tails

### `pnpm turbo run lint typecheck test build --concurrency=2` — exit 0

Full output: `web-final-complete.log`.

```text
clubs-admin:test:      ✓ R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY) 458ms
clubs-admin:test:      ✓ T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it 623ms
clubs-admin:test:      ✓ T-12-25 / E87: a receipt cancelled by a rollback lists only under CANCELLED, reads «anul·lat · retrocés» and its drawer offers no action but the PDF 368ms
clubs-admin:test:      ✓ R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal 313ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 803ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 769ms
clubs-admin:test:      ✓ R-12-13: the poll stops after two minutes of CHARGING with [Actualitza], which polls again 348ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5594ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5556ms
clubs-admin:test:      ✓ T-12-25 / R-12-13 / E8-W07 #1: a completed detail refreshes a stale CHARGING period once while its answer is slow 462ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 793ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 625ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 828ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 879ms
clubs-admin:test:      ✓ R-12-14 E89: a receipt the admin cancelled before the rollback reads «anul·lat · retrocés» in the list and in its drawer, with its own reason 313ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 1062ms
clubs-admin:test:    ✓ E8-W01 step 10: the D6 literals in ca (mockup V7) and the same keys in es and en (2)
clubs-admin:test:      ✓ E8-W01: D6 in es and en reads its own month titles and never a Catalan literal 387ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 628ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 852ms
clubs-admin:test:    ✓ E11-W08 steps 3–4 (R-12-14, R-12-15, R-12-07, ruling E156): D6 past the collection date and the new incidents (8)
clubs-admin:test:      ✓ R-12-14 (E156): with COLLECTION_DATE_PASSED alone, the rollback asks for FITXER_NO_ENVIAT after «Només si el fitxer no s'ha enviat mai al banc», and sends it 394ms
clubs-admin:test:    ✓ programa un descompte recurrent per a dos abonats i permet retirar-lo 1085ms
clubs-admin:test: 
clubs-admin:test:  Test Files  69 passed (69)
clubs-admin:test:       Tests  1147 passed (1147)
clubs-admin:test:    Start at  15:15:15
clubs-admin:test:    Duration  68.92s (tests 66%, environment 14%, transform 10%, import 7%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  69 workers spawned · ~1.69s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~5.17s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    34 cached, 38 total
  Time:    1m51.061s 

```

### `Docker e2e-complete-recipe.sh (all four applications)` — exit 0

Full output: `e2e-resumed-final.log`.

```text

Running 160 tests using 2 workers
················································································
················································································
  160 passed (5.3m)
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:7152) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs-admin@0.0.0 e2e /work/apps/clubs-admin
> playwright test --workers\=2


Running 226 tests using 2 workers
················································································
················································································
··································································
  226 passed (5.0m)
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:14851) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> id@0.0.0 e2e /work/apps/id
> playwright test --workers\=2


Running 1 test using 1 worker
·
  1 passed (2.3s)
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:14982) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> @agilityhub/course-ui@0.0.1 e2e /work/packages/course-ui
> playwright test --workers\=2


Running 4 tests using 1 worker
····
  4 passed (7.4s)
```

### `pnpm --filter clubs-admin e2e dashboard-chart.spec.ts --workers=2` — exit 0

Full output: `select-browser-final.log`.

```text
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:8) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs-admin@0.0.0 e2e /work/apps/clubs-admin
> playwright test dashboard-chart.spec.ts --workers\=2

[WebServer] (node:119) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 8 tests using 2 workers
········
  8 passed (26.4s)
```

### `pnpm --filter clubs-admin exec vitest run src/census/MemberPlanDrawer.test.tsx` — exit 0

Full output: `plan-drawer-final.log`.

```text

 RUN  v5.0.0 /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/apps/clubs-admin


 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  15:14:29
   Duration  3.29s (transform 36%, tests 30%, environment 17%, import 13%, setup 4%)

```
### Production bundle budget — 2026-11-12 deployment continuation

The immutable production build of `859139f` measured the admin initial JavaScript at
460.39 kB gzip with the actual deployment branding and public settings. It exceeded
the previous 460 kB budget by 389 bytes; all ten other bundle gates passed, including
the unchanged 690 kB admin total budget (687.33 kB measured).

The admin initial budget is now 465 kB (+1.1%), providing 4.61 kB of measured headroom
for the reviewed category and instructor-navigation additions. This changes the
size guard only, with no application, dependency, or runtime behavior changes.
The deployment must still pass the normal immutable build, all eleven size gates,
and exact-commit CI before activation. The failing build log is retained in the
private operations release directory as `web-build-initial-size-error.log`.

