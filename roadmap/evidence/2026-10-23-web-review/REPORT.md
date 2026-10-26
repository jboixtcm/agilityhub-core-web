# Web completion and independent review · 2026-10-23

Scope: the user's requested team review of SOFTWARE_CANIC, now clarified as a DEMO-first launch. Reviewed the actual web checkout at `5502767`, its `AGENTS.md`, roadmap instructions, status, recent organizer messages and incidents against the source. The 97/97 task count is historical organizer status, not evidence that every behavior is complete. No task has been marked verified, no commit/push/deployment was performed, and the existing untracked `E11-W08-org/` and `E11-W08-org2/` evidence was preserved.

## Changes and reproducible findings

1. **Stale authentication replies could resurrect or replace accounts.** Delayed refresh, `/me`, password, magic-link and account/impersonation handoff replies could write session state after logout or after a newer login. A session generation now protects identity changes and their asynchronous success/error paths; token generation additionally protects refresh answers. Old failures cannot clear the replacement account. Cross-review also reproduced an old handoff response invalidating a newer password login while its token was still pending, and a rejected old magic link causing cookie restoration after logout. The guards cover these transitions too. Cookie-producing token grants, refresh, token revocation, and account-session deletion are also ordered under a shared Web Lock keyed by identity origin (different client IDs share it), with a same-page serial queue when Web Locks are unavailable. Logout invalidates the identity immediately and waits for an already dispatched grant, then revokes its actual session; an unreadable successful body is recovered through one refresh/revoke. A later queued grant or revoke is cancelled before dispatch when superseded. Web Locks coordinate same-origin tabs; the fallback only coordinates this page, and independent frontend origins do not share browser Web Locks.
   - Reproductions: `02-auth-race-red.log` (initial four failures), `15-auth-reviewed-red.log` (14 failures against original HEAD), `25-auth-transition-red.log` (four additional failures against the first correction).
   - Focused checks expanded through cross-review: `60-auth-final.log`, 118 passing auth tests, including 27 added cookie/response-boundary cases beyond the earlier 91. `34-account-operation-races-red.log` reproduces 18 stale account/redirect/replay failures; `38-handoff-single-flight-red.log` reproduces a new handoff joining an old confirmation; `42-dispatch-identity-red.log` reproduces initial mutations escaping across locale/token/middleware awaits. The generic API client now captures an optional request guard before its middleware awaits and rechecks at dispatch. Authenticated clients provide a session guard, and the interceptor checks it before its initial fetch as well as recovery/replay. Lost guards fail closed. Starting a new identity clears the previous bearer/account immediately and blocks API dispatch while its grant is pending. A guard around generated-client operations also rejects stale results after JSON/text/blob/arrayBuffer parsing; a received response header alone is insufficient. Same-session refresh coalescing remains tested. The parent and release agent independently reviewed the final boundaries.

2. **D17 could assign a role to the wrong homonym.** Name-only datalist selection chose the first matching account. Choices now display the existing name/dog label and the unique club member number; only an exact unique choice sets a member ID. Bare names cannot submit. Existing team names are loaded across all census pages, including LEFT members, and retry reloads the census as well as the role catalogs. `INSTRUCTOR_IN_USE` uses the already approved explanation with its class count. Missing member numbers display a neutral dash, and indistinguishable missing-number choices remain unselected. `45-missing-member-number-red.log` reproduces literal null; `46-final-team.log` checks the correction. No new self-deactivation copy was invented.
   - `19-team-red-confirmed.log`: all four regression cases fail against original D17 source. `18-team-green.log`: all four pass after correction (then fixture typing/lint was normalized for the full gate).

3. **INC-86 tunnel geometry now freezes in the stored placement.** `course-core` resolves tunnel control points into ring coordinates; the API store serializes them; the member viewer consumes the stored points even when the source course is changed or an obstacle deleted. `[]` explicitly means no curve; null/absence keeps the existing legacy fallback. An independent numeric oracle covers flip + rotation + translation, and viewer tests cover changed/deleted sources and legacy rows.
   - The API agent supplied a freshly generated additive `ResolvedObstacle.controlPointsMeters?: PointM[] | null` contract. Snapshot copied without hand editing and types generated with `pnpm api:generate`.
   - Initial geometry snapshot SHA-256: `28f258335fb64c7f41f8a960c8c2e35e0e399d8c876e16f21e6c1bcd2d39d46d`. Final adopted API snapshot also includes the S18 migration report operation/ReportLink; SHA-256 `ba7a26b3aba270b51d04bf8ab3091142cf21a7be3b2ac050002900ef401e8a79`, generated by the owning API test and copied without hand editing (`56-final-openapi.log`).
   - `04-inc86-payload-red.log` and `05-inc86-viewer-red.log` reproduce the missing persistence/frozen view; `06-inc86-payload-green.log` and `07-inc86-viewer-green.log` pass after implementation. Backend persistence and immutability tests are owned by the API review.

4. **INC-80 W16 production mock worker.** The three Vite apps copy their public directory only for mock builds. Each current public directory contains only `mockServiceWorker.js`; production obstacle models are emitted by a separate plugin. Production and mock behavior are checked in the verification below.

5. **INC-85 E6 harness false positive and E10 handwritten schemas.** E6 previously identified any N19 subject OR the same date as Nil's notice, so another member's delayed first-run mail could appear to be a duplicate sent by the second run. It now resolves Nil's contact addresses from the real member resource, waits for his actual mail delivery, and matches recipient + N19 subject + class date. It retains both the zero second-run job effects assertion and the no-new-Nil-mail assertion. The actual N19 template contains neither member nor dog name. E10 now consumes generated OpenAPI response types, including explicit narrowing of a domain's optional verification challenge. The final E6 run exposed a separate old harness assumption: anonymous localStorage language was expected to override the signed-in account. The Spanish pass now uses the real profile selector, verifies PATCH /me and its returned locale, and restores both accounts in nested finally blocks. All original Spanish assertions remain; product language precedence is unchanged.

6. **Docker runner failed on macOS Bash 3 with no extra arguments.** Its empty array expansion under `set -u` failed before Docker started. The portable expansion now preserves the intended default `--workers=4`. `11-docker-playwright.log` records the failure; `12-docker-playwright.log` proves the default complete suite launches and passes. The parent also made the real-core runner accept `CORE_IMAGE` for a freshly reviewed local image while retaining the historical default; both Compose services match (`core-image-config.log`).

7. **ID logout used the wrong OIDC endpoint.** The parent corrected `LogoutPage` to restore a cold cookie-backed session before revoking its family, then navigate to `/login`. Password/magic login has no ID-token hint, so the former `/connect/logout` navigation could only fail its real contract. Errors use existing localized retry copy instead of claiming logout succeeded. The real-core identity flow now checks direct `/logout`, successful revocation, no invalid RP logout request, and a protected page requiring login afterward. Parent-focused unit/lint/typecheck evidence is retained separately; the final shared gate covers these source changes; the final real-core E1 stage passed all eight cases, including that cold-logout scenario.

## Review of other recorded incidents

- INC-56: current E7 harness requires the intended N08a delivery, asserts settled SKIPPED rows and restores state in `finally`; the old broad waiting issues are not present in source.
- INC-59: deterministic marker and wrapped timers are already present.
- INC-60: current code includes polling/cache cleanup, stale geometry protection and warning union drift checks.
- INC-41: the material D17 selection/retry/pagination gaps above were still real; other historical items are not reopened based only on stale incident text.
- Accepted/deferred observations remain: home TTI around 4.0–4.2 s within the accepted 4.5 s target; sidebar full-document navigation; bundle size close to its existing ceiling; dedicated self-deactivation UX copy. These are not silently declared fixed.

## Independent staged-import cross-review

At the parent agent’s request, the web reviewer also read the current API `MigrationStagedImporter` and `PlayoffCommand`, their domain/repository boundaries, census/billing/identity writers, and new staged integration tests. The initial pass found no blocker in the transaction/CLI boundaries. A follow-up found a selective billing dependency gap: the full plan could recognize a new source alias for an existing person while the effective census (without stage 3) lacked that alias, allowing its receipt to be silently skipped. The parent added a fail-before-writes check using the effective stored/selected source identifiers; the web reviewer re-read and accepted its exact scope. The API agent owns the regression execution, so the final test disposition belongs to the API report. The review traced exact-input lineage, repeated authorization under the lease, transaction/checkpoint fencing, partial 100-row batch recovery, planned-leave and access-account reuse, final-step completion atomicity, and separate report recovery after a committed import. The API lane owns execution of those new tests; this read-only review is not an API test result. No Java source was edited by this reviewer.

## Verification

The final combined gate passed all 38 tasks (22 cached), with 3,580 Vitest tests in 216 files plus the existing 20 node:test checks. The final complete mock browser suite passed 235 tests with 26 existing skips (10/10 tasks, zero cache). Final fresh-seed real-core stages passed **31/31 tests with no skips** on the reviewed API image: E1 8, E6 14, E9 3 and E10 6. The sole subsequent source delta from the complete product/mock gates is E6 test setup for the real account locale; focused lint/typecheck and the full E6 stage cover it. No bundle budget was raised: clubs-admin totals 672.95/675 kB gzipped, ID totals 132.2/310 kB. Production mock workers are absent in all three apps; the earlier explicit mock-mode build retained its worker (`33-mock-worker.log`). The earlier complete mock browser baseline in `12-docker-playwright.log` passed 235 tests with 26 existing skips, but predates the final auth/D17 changes. Intermediate failures in logs 51–53 were old test barriers that awaited a newly serialized operation before releasing its predecessor, and the distinction between refused token responses (no new cookie) and unreadable successful bodies. They were corrected without weakening the cookie-order assertions.

No hosted demo, live provider, real charge, production mailbox or production data was exercised by this web review. These selected core-browser stages use the exact local API image below; this is not a claim that every historical real-core stage was rerun.

The first final combined attempt (`63-final-combined-gate.log`) stopped on two ID lint diagnostics introduced by the parent's final guard tests; both were corrected, and `66-final-combined-gate.log` is the passing full rerun. `59-barrier-auth-final.log` additionally verified that preserving original 401 refusals is required when recovery deliberately expires a session; the final post-parse guard applies to successful results and the normal refusal contract remains intact.

### Final local gate

Command (exit **0**):

```sh
pnpm turbo run lint typecheck test build
```

Full output: [66-final-combined-gate.log](66-final-combined-gate.log). Last 40 lines (or complete shorter output):

```text
clubs-admin:test:      ✓ T-12-25: 409 STALE_VERSION reads «El rebut ha canviat. Torna a obrir-lo.» in the drawer and the receipt is read again 880ms
clubs-admin:test:      ✓ E8-W01 round 2 #6: a failed drawer refetch stays beside the cached receipt, unlocks its actions and recovers through [Torna-ho a provar] 1134ms
clubs-admin:test:      ✓ T-12-25: [Descarrega el justificant] opens the PDF in a new tab without parsing it 1004ms
clubs-admin:test:    ✓ T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28) (3)
clubs-admin:test:      ✓ T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES] 795ms
clubs-admin:test:      ✓ T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance 1102ms
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 6988ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others 321ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 625ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 423ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5578ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5699ms
clubs-admin:test:      ✓ T-12-25 / R-12-13 / E8-W07 #1: a completed detail refreshes a stale CHARGING period once while its answer is slow 401ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 745ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 596ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 738ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 779ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 885ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 584ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 774ms
clubs-admin:test:    ✓ E11-W08 steps 3–4 (R-12-14, R-12-15, R-12-07, ruling E156): D6 past the collection date and the new incidents (8)
clubs-admin:test:      ✓ R-12-14 (E156): with COLLECTION_DATE_PASSED alone, the rollback asks for FITXER_NO_ENVIAT after «Només si el fitxer no s'ha enviat mai al banc», and sends it 322ms
clubs-admin:test: 
clubs-admin:test:  Test Files  66 passed (66)
clubs-admin:test:       Tests  1070 passed (1070)
clubs-admin:test:    Start at  22:04:12
clubs-admin:test:    Duration  73.99s (tests 68%, environment 13%, transform 9%, import 6%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  66 workers spawned · ~1.99s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~5.73s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    22 cached, 38 total
  Time:    1m28.481s 

```

### Final contract generation

Command (exit **0**):

```sh
pnpm api:generate
shasum -a 256 packages/api-client/openapi/openapi.json
```

Full output: [56-final-openapi.log](56-final-openapi.log). Last 40 lines (or complete shorter output):

```text

> agilityhub-core-web@0.0.0 api:generate /Users/jordib/dev/agilityhub/agilityhub-core-web
> pnpm --filter @agilityhub/api-client api:generate


> @agilityhub/api-client@0.0.0 api:generate /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client
> node scripts/generate.mjs

Generated /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client/src/generated/schema.d.ts from /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client/openapi/openapi.json merged with /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client/openapi/pending.json
ba7a26b3aba270b51d04bf8ab3091142cf21a7be3b2ac050002900ef401e8a79  packages/api-client/openapi/openapi.json
```

### Translation and catalog checks

Command (exit **0**):

```sh
pnpm i18n:check
```

Full output: [64-final-i18n.log](64-final-i18n.log). Last 40 lines (or complete shorter output):

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5180 keys
es: 5180 keys
en: 5180 keys
4002 statically used keys, 0 unused
251 codes, 0 missing
150 catalog parameters (118 in D11, 32 system-only), 11 blocks, 0 missing
check-es-actions: packages/i18n/src/locales/es
  kept admin-billing:confirm.rollbackKeywordLabel · «Escribe {keyword} para confirmarlo» — D6's rollback field label: an instruction
  kept admin-catalogs:common.active · «Activa» — the adjective: a catalog switch's state («Active»)
  kept admin-catalogs:plans.columns.active · «Activa» — the adjective: D8's column header («Active»)
  kept admin-census:common.choose · «Elige una opción» — a select's empty option: an instruction
  kept admin-census:signupReview.confirmNothingPaid · «Confirma que no se ha cobrado ningún importe» — D2's checkbox statement, not an action
  kept admin-courses:import.file · «Elige el archivo .txt que exporta Smarter» — a file input's label: an instruction
  kept admin-courses:doors.active · «Activa» — the adjective: the door in use
  kept admin-messaging:templates.choose · «Elige una plantilla» — D9's empty-state title: an instruction
  kept admin-scheduling:templates.gridFooter · «Haz clic en el nombre de un día para verlo por pista o por instructor · color = pista · gris = sin pista» — D3's grid legend: an instruction
  kept auth:profile.pushDenied · «Activa las notificaciones en el navegador para recibirlas en el móvil» — 12's hint to allow notifications: an instruction
  kept auth:profile.iosInstall · «Añade la app a la pantalla de inicio para recibir notificaciones» — 12's hint to add the app to the home screen: an instruction
  kept auth:profile.learnLink · «Aprende con AgilityHub» — 12's row to the AgilityHub learning site: a call to another product
  kept booking:confirm.swapTitle · «Elige cuál anulas para hacerle sitio» — 06's swap title: an instruction
  kept common:gallery.active · «Activa» — the adjective: the dev gallery's state chip
  kept console:theme.logoAlt.mark · «Marca» — the noun: the alt text of the club's mark
  kept console:theme.logos.mark · «Marca (versión pequeña)» — the noun: a logo slot's name
  kept id:login.title · «Entra en AgilityHub» — the login page's title
  kept id:password.repeat · «Repite la contraseña nueva» — the second password field's label: an instruction
  kept notifications:unsubscribe.toPreferences · «Cambia tus avisos en el perfil» — a navigation link written as a sentence
  kept signup:person.reviewEmailTitle · «Revisa el correo» — the signup's heading after the verification mail: an instruction
  kept signup:success.addDogTitle · «Añade un perro» — the add-dog flow's title on its success screen
check-es-actions: 0 flagged, 21 kept
```

### Real-core harness types

Command (exit **0**):

```sh
pnpm typecheck:e2e-core
```

Full output: [65-final-core-typecheck.log](65-final-core-typecheck.log). Last 40 lines (or complete shorter output):

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

### Production bundle limits

Command (exit **0**):

```sh
pnpm size
```

Full output: [67-final-size.log](67-final-size.log). Last 40 lines (or complete shorter output):

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       312.85 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.85 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       444.41 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 675 kB
  Size:       672.95 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.16 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.81 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       102.03 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       132.2 kB gzipped
  
```

### Production mock-worker exclusion

Command (exit **0**):

```sh
python3 - <<'PY'
from pathlib import Path
for app in ['clubs','clubs-admin','id']:
    path=Path('apps')/app/'dist'/'mockServiceWorker.js'
    assert not path.exists(), path
    print(f'{app}: production mockServiceWorker.js absent')
PY
```

Full output: [68-final-production-workers.log](68-final-production-workers.log). Last 40 lines (or complete shorter output):

```text
clubs: production mockServiceWorker.js absent
clubs-admin: production mockServiceWorker.js absent
id: production mockServiceWorker.js absent
```

### Final complete mock browser suite

Command (exit **0**; acquired/released the shared host lock):

```sh
E2E_EVIDENCE_TASK=2026-10-23-web-review HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:docker 2026-10-23-web-review
```

Playwright 1.63.0 ran in its matching Noble Docker image. Results: course-ui 4 passed; clubs-admin 129 passed/16 existing skips; ID 1 passed; clubs 101 passed/10 existing skips. Total **235 passed, 26 existing skips**, **10/10 tasks**, zero cache, 3m51.213s excluding dependency installation and the lock wait. No skips were added for this review. Source manifest `reviewed-source-tested-inputs.json` contains only 27 verified source SHA-256 values (renamed byte-for-byte to the existing tested-inputs evidence convention). Source integrity check `70-final-source-integrity.log` confirms all 27 reviewed source hashes still match the passing local gate.

Full output: [69-final-mock-docker.log](69-final-mock-docker.log). Last 40 lines:

```text
clubs-admin:e2e: > clubs-admin@0.0.0 e2e /work/apps/clubs-admin
clubs-admin:e2e: > playwright test --workers\=4
clubs-admin:e2e: 
clubs-admin:e2e: [WebServer] (node:1006) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs-admin:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs-admin:e2e: 
clubs-admin:e2e: Running 145 tests using 4 workers
clubs-admin:e2e: ···································°°°°°°°°°°°°·································
clubs-admin:e2e: ············°°°°·················································
clubs-admin:e2e:   16 skipped
clubs-admin:e2e:   129 passed (2.0m)
id:e2e: cache bypass, force executing ef0f6fdb530feb93
id:e2e: 
id:e2e: > id@0.0.0 e2e /work/apps/id
id:e2e: > playwright test --workers\=4
id:e2e: 
id:e2e: 
id:e2e: Running 1 test using 1 worker
id:e2e: ·
id:e2e:   1 passed (4.6s)
clubs:e2e: cache bypass, force executing 6ad666b5ad631734
clubs:e2e: 
clubs:e2e: > clubs@0.0.0 e2e /work/apps/clubs
clubs:e2e: > playwright test --workers\=4
clubs:e2e: 
clubs:e2e: [WebServer] (node:5204) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs:e2e: 
clubs:e2e: Running 111 tests using 4 workers
clubs:e2e: ······················°°°°°°°°··································°°··············
clubs:e2e: ·······························
clubs:e2e:   10 skipped
clubs:e2e:   101 passed (1.3m)

 Tasks:    10 successful, 10 total
Cached:    0 cached, 10 total
  Time:    3m51.213s 

evidence: 2026-10-23-web-review/D17-member-identity-1280.png
evidence: 2026-10-23-web-review/member-standing-course-375.png
```

### Final pinned-image real-core browser suites

All four commands below exited **0**, acquired/released the shared heavy lock and created separate disposable Compose projects, Mongo volumes and fictional seed data. They used `agilityhub-core-api:review-20261023`, image ID `sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e` (also tagged `ghcr.io/jboixtcm/agilityhub-core-api:review-20261023`). The final fingerprint check confirms that image did not change. No historical `main` tag was replaced or pulled.

| Stage | Result | Browser duration | Evidence |
|---|---|---|---|
| E1 identity/access | 8 passed | 13.3 s | `core-e1/`, `71-final-core-e1.log` |
| E6 attendance/follow-up | 14 passed | 37.9 s | `core-e6-final/`, `78-final-core-e6-locale.log` |
| E9 courses/placements/build sessions | 3 passed | 20.7 s | `core-e9/`, `74-final-core-e9.log` |
| E10 platform console/new club/support | 6 passed | 31.5 s | `core-e10/`, `75-final-core-e10.log` |

Total: **31 passed, zero failed, zero skipped** in these final stages. E1 checks the cold ID logout and the subsequent refusal of protected access. E6 checks N19 recipient-specific delivery plus empty effects/no duplicate on rerun, concurrent attendance edits, tasks, permissions, Spanish save round trips and the final closed attendance window. E9 checks the stored placement, mobile viewer and two-phone build flow. E10 exercises platform-only access, support and the complete second-club creation/activation flow using fake DNS.

Every evidence subdirectory retains the image's seed YAML and `seed-files.log`. Week anchors were `E4_WEEK_START=2026-10-19`, `E5_WEEK_START=2026-10-26`, `E8_WEEK_START=2026-11-23`; E6 seeds the future E5 week before moving Core's test clock. Browser clocks remain real. Playwright runs in the prescribed Docker image; the install logs retain its Node 24 versus workspace Node 22 engine warning and the dependency `url.parse()` warning. These warnings did not fail the recorded runs.

The initial final-image E6 attempt is preserved in `73-final-core-e6.log` and `core-e6/`: 12 passed, one Spanish-heading failure, one serial case not run. The product correctly applied `Account.locale` ahead of anonymous localStorage (already covered by `App.test.tsx`). The test now changes the account through the existing profile UI and restores each original locale in `finally`; no product code or Spanish assertion was weakened. Root independently reviewed this harness-only correction. The passing full E6 rerun below covers it, including the downstream Catalan case.

#### E1 command and result

Command (exit **0**):

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-web-review/core-e1 e1-core.spec.ts
```

Full output: [71-final-core-e1.log](71-final-core-e1.log). Last 40 lines:

```text
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 7.1s using pnpm v9.15.9

[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:193) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 8 tests using 1 worker

[1/8] e2e/core/e1-core.spec.ts:157:5 › T-01-18 password login reaches the seeded account
[2/8] e2e/core/e1-core.spec.ts:190:5 › T-11-11 E11-W06 W1 · a member screen opened signed out is the one the password login opens
[3/8] e2e/core/e1-core.spec.ts:215:5 › T-01-21 seeded administrator opens the real backoffice
[4/8] e2e/core/e1-core.spec.ts:231:5 › T-01-20 club session is restored by the core
[5/8] e2e/core/e1-core.spec.ts:254:5 › T-01-19 magic link is delivered and exchanged end to end
[6/8] e2e/core/e1-core.spec.ts:276:5 › T-01-26 published seed enters without pending onboarding
[7/8] e2e/core/e1-core.spec.ts:286:5 › T-01-22 apps/id resumes a real authorize flow through oauth2/session
[8/8] e2e/core/e1-core.spec.ts:393:5 › T-02-07 E3-W12 step 5 · the public footer of 01 shows /branding's identity and registered office (S02 R-02-02)
  8 passed (13.3s)
```

#### E6 command and result

Command (exit **0**):

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-web-review/core-e6-final e6-core.spec.ts
```

Full output: [78-final-core-e6-locale.log](78-final-core-e6-locale.log). Last 40 lines:

```text
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 7.2s using pnpm v9.15.9

[WebServer] (node:117) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:197) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:295) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:393) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:488) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 14 tests using 1 worker

[1/14] e2e/core/e6-core.spec.ts:1202:5 › E6-W04 step 2 · preflight (S10 answers), the processes off, POST /test/clock to Monday 04:00 and the parameters the flows read @critical-llista
[2/14] e2e/core/e6-core.spec.ts:1318:7 › Monday 04:00 › T-10-28 (f) 22 · the seeded month gives the card's metrics (86%, 7 classes, 2,3 a week) and its three blocks, before anything is marked
[3/14] e2e/core/e6-core.spec.ts:1377:7 › Monday 04:00 › T-10-27 T-10-23 (a)(c) 20 → 21 · the seeded class, Rita present and Nil «no presentat» against the second instructor's save: 409 STALE_VERSION, the merge keeps them, the second [DESA] saves @critical-llista
[4/14] e2e/core/e6-core.spec.ts:1511:7 › Monday 04:00 › T-10-11 T-10-27 (b) R-10-05 · «ha avisat» more than 4 h ahead: CANCELLED, the seat released, the waitlist notified; the row stays, final and inert @critical-llista
[5/14] e2e/core/e6-core.spec.ts:1597:7 › Monday 04:00 › T-10-29 (d) D12 · the week with the class, a training at half height and a block; the panel cycles Martí to «present» through the same contract; the week PDF
[6/14] e2e/core/e6-core.spec.ts:1722:7 › Monday 04:00 › T-10-28 T-10-15 (f) 26 → D13 → 13 · a task with a real signed upload, edited, done and reopened; D13 shows it with the counters; Rita sees it on her screens, completes it as a member, and no /me answer carries DOG_OBSERVATIONS
[7/14] e2e/core/e6-core.spec.ts:1992:7 › Monday 04:00 › T-10-30 T-10-18 (h) D14 · per-account unread marks: instructor A reads the member's note, unread for instructor B too, and then everything; B still has them unread (the note after A's read as well), never the task she wrote; D14's filter values and search on the core
[8/14] e2e/core/e6-core.spec.ts:2210:7 › Monday 04:00 › T-10-02 T-10-15 T-10-22 E6-W04 step 5 · the core's statuses for ATTENDANCE_NOTIFIED_FINAL, TASK_ALREADY_DONE (a second completion), TASK_NOT_DONE and a member's read of the instructor card
[9/14] e2e/core/e6-core.spec.ts:2257:7 › Monday 04:00 › T-10-01 T-10-11 T-10-22 E6-W04 review #3 · the core's statuses for ATTENDANCE_NOT_OPEN (Tuesday's class), ATTENDANCE_BOOKING_NOT_ACTIVE (a late-cancelled booking, as ADMIN), INSTRUCTOR_NOTICE_DISABLED (the parameter off) and IMPERSONATION_DENIED (an impersonated GET /instructor/day and GET /followup)
[10/14] e2e/core/e6-core.spec.ts:2402:5 › (e) P8 at 09:46 from D11: the dry run plans the class and the waiting entry and writes nothing; the run finishes it, the sheet stays markable and the entry leaves the waitlist @critical-llista
[11/14] e2e/core/e6-core.spec.ts:2518:5 › T-10-26 (e) P3 at Tuesday 08:00 from D11: Nil's row says «avís ja enviat», one N-19, and a second run sends nothing new
[12/14] e2e/core/e6-core.spec.ts:2716:5 › T-10-31 (g) 25 · Rita's history: the Monday class «feta», the seeded no-show, the club's cancellation with its message, the late cancellation; Alba's notice never on her account; an activity row with its activityId links the activity's page @critical-llista
[13/14] e2e/core/e6-core.spec.ts:2785:5 › (i) es · T-10-32 on real data: 20 and 21 in Spanish (a save round trip that leaves the states), and 25's badges and detail lines
[14/14] e2e/core/e6-core.spec.ts:2842:5 › T-10-01 T-10-27 E6-W04 review #3 · at Wednesday 00:00 the Monday sheet is closed to an instructor: 21's circles inert, and a PUT answers 422 ATTENDANCE_WINDOW_CLOSED with its editableUntil; nothing changes
  14 passed (37.9s)
e6 notifications: /Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-23-web-review/core-e6-final/e6-notifications.json
```

#### E9 command and result

Command (exit **0**):

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-web-review/core-e9 e9-core.spec.ts
```

Full output: [74-final-core-e9.log](74-final-core-e9.log). Last 40 lines:

```text
+ eslint-plugin-jsx-a11y 6.10.2
+ eslint-plugin-react 7.37.5
+ eslint-plugin-react-hooks 7.1.1
+ globals 17.12.0
+ husky 9.1.7
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 6.1s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 3 tests using 1 worker

[1/3] e2e/core/e9-core.spec.ts:451:5 › E9-W04 · T-16-16 against the core: the member's viewer, registering, and a build session on two phones (R-16-09, R-16-07, R-16-11) @critical-muntatge
[2/3] e2e/core/e9-core.spec.ts:636:5 › E9-W05 · T-16-15 against the core: D18's library and import wizard, the course page, the placement editor, the stored build sheet and «Registra-ho com a muntat» (R-16-02, R-16-05, R-16-10, R-16-07) @critical-muntatge
[3/3] e2e/core/e9-core.spec.ts:1268:5 › E9-W05 · T-16-16 against the core: a planned placement built from 07 on the phone, joined from a ring with no setup (R-16-13, R-16-11, WP-16-F′) @critical-muntatge
  3 passed (20.7s)
```

#### E10 command and result

Command (exit **0**):

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-web-review/core-e10 e10-core.spec.ts
```

Full output: [75-final-core-e10.log](75-final-core-e10.log). Last 40 lines:

```text
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 7.1s using pnpm v9.15.9

[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:291) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:582) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:677) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:772) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 6 tests using 1 worker

[1/6] e2e/core/e10-core.spec.ts:306:5 › R-17-09 · the platform account gives a club admin AGILITYHUB_ADMIN through the api (PUT /platform/accounts/{id}/platform-roles)
[2/6] e2e/core/e10-core.spec.ts:326:5 › E10-W02 · the console's entry: the product host's branding and boot, the platform account signed in on the ID host, its card and its token on the product host (S17 §2, R-01-17, T-17-12)
[3/6] e2e/core/e10-core.spec.ts:450:5 › E11-W08 · the platform account signs in to the console on the product host (password and magic link) and lands on D19; an account without the platform role gets 403 PLATFORM_ONLY (S17 §2 «Entrada», S01 R-01-02, ruling E157)
[4/6] e2e/core/e10-core.spec.ts:574:5 › E10-W01 · D19 against the core: the list, the Identitat tab and the «Nou club» wizard (T-17-12)
[5/6] e2e/core/e10-core.spec.ts:724:5 › E10-W03 · «Dominis» (positive and negative fake DNS, the primary choice, /branding before and after), allowed host and support access against the core (T-17-03, T-17-12, T-17-09)
[6/6] e2e/core/e10-core.spec.ts:1104:5 › E10-W02 · a second club in under an hour: the manual script, step by step against the core, with its times (T-17-12)
  6 passed (31.5s)
```

### E6 harness delta checks

Commands (both exit **0**):

```sh
pnpm exec eslint e2e/core/e6-core.spec.ts --max-warnings 0
pnpm typecheck:e2e-core
```

Complete output of `76-e6-locale-lint.log`: empty (no diagnostics). Last 40 lines (complete shorter output) of `77-e6-locale-typecheck.log`:

```text
> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit
```

`reviewed-source-tested-inputs.json` is the unchanged original 27-file manifest from the passing complete product/mock gates. `final-source-tested-inputs.json` captures the same 27 files after the E6-only correction. The final verification recomputed each SHA-256, required exact equality with the final manifest, required the only original-to-final delta to be `e2e/core/e6-core.spec.ts`, checked the image ID and ran `git diff --check` (exit **0**). Exact verification command (exit **0**):

```sh
python3 - <<'PY_INTEGRITY'
from pathlib import Path
import hashlib,json,subprocess
base=Path('roadmap/evidence/2026-10-23-web-review')
original=json.loads((base/'reviewed-source-tested-inputs.json').read_text())
final=json.loads((base/'final-source-tested-inputs.json').read_text())
current={name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in original}
assert current==final
changed=[name for name in original if current[name]!=original[name]]
assert changed==['e2e/core/e6-core.spec.ts'], changed
print(f'Final manifest: {len(final)} current source hashes match final-source-tested-inputs.json')
print(f'Delta from full product/mock gates: {changed[0]} only (test harness account-locale setup/restoration)')
image=subprocess.check_output(['docker','image','inspect','agilityhub-core-api:review-20261023','--format','{{.Id}}'],text=True).strip()
assert image=='sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e'
print('Final API image unchanged: '+image)
subprocess.run(['git','diff','--check'],check=True)
print('git diff --check: exit 0')
print('Heavy lock present: '+str(Path('/tmp/agilityhub-heavy.lock').exists()))
PY_INTEGRITY
```

Complete output (`79-final-source-integrity.log`):

```text
Final manifest: 27 current source hashes match final-source-tested-inputs.json
Delta from full product/mock gates: e2e/core/e6-core.spec.ts only (test harness account-locale setup/restoration)
Final API image unchanged: sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e
git diff --check: exit 0
Heavy lock present: False
```

### OpenAPI actually served by the final image

While E1's isolated **local-profile** container was running, a request to `GET http://127.0.0.1:18080/api/v1/openapi.json` with `Host: id.example.test` and no Authorization returned **200**. The container image ID matched the pinned image above. The actual response is retained as `core-e1/openapi-served.json`; capture metadata is in `72-final-served-openapi.log`. Production docs were not enabled or accessed.

A recursive parsed-JSON comparison with the API's final `docs/openapi/openapi.json` is **equal**, ignoring object-key order but preserving arrays. Raw hashes differ because serialization differs; canonical hashes match. The API-owned snapshot and generated frontend types were not regenerated after this equal comparison.

Reproducible artifact comparison (exit **0**, `80-final-openapi-artifact-compare.log`):

```sh
python3 - <<'PY_COMPARE'
import hashlib,json
from pathlib import Path
actual=Path('roadmap/evidence/2026-10-23-web-review/core-e1/openapi-served.json')
expected=Path('/Users/jordib/dev/agilityhub/agilityhub-core-api/docs/openapi/openapi.json')
a=json.loads(actual.read_text())
b=json.loads(expected.read_text())
assert a==b
print('Parsed JSON equal: True (object order ignored, arrays preserved)')
for label,path,data in [('actual',actual,a),('snapshot',expected,b)]:
    print(label+' SHA-256: '+hashlib.sha256(path.read_bytes()).hexdigest())
    print(label+' canonical SHA-256: '+hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest())
PY_COMPARE
```

Complete output:

```text
Parsed JSON equal: True (object order ignored, arrays preserved)
actual SHA-256: b75c50d15260f2dc15217b81a490f4c043647f00e6174462bdc1fb573290c23c
actual canonical SHA-256: c403ce6a9bf18be6b6f09c13c63bdcdbd0042b67465081738238a1ac9b6a5a29
snapshot SHA-256: ba7a26b3aba270b51d04bf8ab3091142cf21a7be3b2ac050002900ef401e8a79
snapshot canonical SHA-256: c403ce6a9bf18be6b6f09c13c63bdcdbd0042b67465081738238a1ac9b6a5a29
```

### Screenshots actually inspected

The reviewer opened the following PNGs with `view_image`; only these captures are claimed as visually inspected:

- [D17-member-identity-1280.png](D17-member-identity-1280.png): at 1280 px, the instructor dialog clearly shows “Laura Serra Vidal (Duna) · 87”, preserving the member/dog label and distinguishing member number. The dialog, field, colors and buttons fit without clipping. The underlying instructor/administrator structure was compared with `docs/pantalles/escriptori/D17-configuracio-instructors-i-administradors.png`; this is a focused visual review, not a pixel-equivalence claim. The same browser scenario proves an exact numbered choice enables save and editing it to a bare name disables save.
- [member-standing-course-375.png](member-standing-course-375.png): the mobile read-only viewer shows the standing course, obstacle labels, 2D/3D toggle and zoom controls within 375 px, with the member navigation present and no horizontal overflow. This mock fixture checks the viewer presentation; frozen tunnel geometry correctness is evidenced by the numeric payload/viewer unit cases and owning API persistence tests, not by this screenshot alone.

- [core-e1/id-logout-core-1280.png](core-e1/id-logout-core-1280.png): the cold logout ends on the signed-out ID login screen, with readable form and no previous identity, error, overlay or clipping. Root independently opened the same screenshot and confirmed that result.
- [core-e9/core-D18-col-locacio-1280.png](core-e9/core-D18-col-locacio-1280.png): the placement editor renders obstacles and curved tunnels, ring selection, movement/rotation controls and saved confirmation without overlap. The material/out-of-ring warnings belong to the intentionally oversized scenario; this is not a claim that its course fits that ring.
- [core-e9/core-visor-alumne-muntatge-375.png](core-e9/core-visor-alumne-muntatge-375.png): the stored mounted course, curved tunnel, view toggles, zoom controls and bottom member navigation fit the mobile width. Geometry immutability remains established by the numeric/persistence tests, not pixels alone.
- [core-e10/core-W02-14-estat-actiu-1280.png](core-e10/core-W02-14-estat-actiu-1280.png): the fictional second club is visibly active with checklist 7/7, a successful state-change notice, and readable support controls; no error overlay or clipping.
- [core-e6-final/25-historic-core-es-375.png](core-e6-final/25-historic-core-es-375.png): Spanish history controls and attendance/cancellation badges render without horizontal overflow. The historical free-text club cancellation retains the fictional Catalan seed text as intended; it is not UI translation copy.

These are local browser captures. No hosted visual verification is claimed.

## Learn integration boundary — current user decision

After the read-only integration review, Jordi explicitly chose an **isolated Clubs demo**; Learn integration is for later. No Learn source, live service, provider, user database or deployment was changed. The completed E1/E6/E9/E10 browser checks and served-OpenAPI comparison concern the final local Core image and do not claim joint Learn verification.

### Current source evidence

The owning Learn workspace is `/Users/jordib/Dropbox/Documents/Agility/AgilityHub/AH_LearnPlatform`:

- `agilityhub-api` (Laravel 10): inspected HEAD `11f3a4e`; its tree matched the locally fetched `origin/main` merge `7131b46`. `app/Http/Api/Auth/Services/AuthService.php:107` still calls the local JWT guard. `UsersService.php:174`/`:244` and `ResetPasswordController.php:40` hash/store passwords locally. Searches of owning application, routes, configuration, migrations and tests found no `AgilityHubIdClient`, `SyncAccountToAgilityHubId`, `agilityhub_account_id`, `AGILITYHUB_ID_SYNC` or OIDC/PKCE adapter. The feature flag is absent, not an implemented disabled adapter. `.env.example:25` uses `QUEUE_CONNECTION=sync`; the future nonblocking adapter needs an actual queue/worker. Current mail configuration uses Brevo, so the September specification's SendGrid inventory is historical.
- `agilityhub-front` (Vue 3): inspected main `5619b65`. Existing course-converter working changes were preserved. `src/stores/auth/auth.js:93` calls Learn's `auth/login`, then stores its JWT locally; its auth router has no shared-ID callback. `src/config/api.js:24` defaults to `https://app.agilitydoghub.com/api/v1`. That existing Laravel origin must not be replaced by Core as an incidental demo change.
- Core's historical A30 decision (`docs/DECISIONS_PENDENTS.md:137`) deferred activation; E1-T08 remains `not_open`. Actual inspected Learn code corroborates the missing adapter. The current user decision above independently confirms the isolated-demo scope.
- Clubs `apps/clubs/src/App.tsx:1498` and ID `apps/id/src/App.tsx:831` expose ordinary external Learn links, with no token transfer or shared session. Opening Learn is not evidence of SSO or synchronized credentials.

This was a local source review, including the available remote-tracking refs; no fresh remote fetch, hosted inspection or live credential check was performed.

### Future coordinated test matrix — not run in this review

| Boundary | Required evidence before Learn activation |
|---|---|
| Contract and authorization | Exact Core paths, payloads, scopes/client authentication and response IDs match the Laravel adapter; cross-client/tenant access is refused. |
| Disabled integration | Flag off dispatches no sync job and sends no Core requests; ordinary Learn login/register/reset continue working. |
| Account mapping | Existing Learn user, new signup, same-email existing Core account, changed email and retries map to the intended stable identity without duplicate accounts or lost product access. |
| Password lifecycle | Successful login/register/reset/update synchronization, explicit password-authority rules for changes originating in either product, and reordered/retried old jobs cannot restore an obsolete password. |
| Outage and recovery | Timeout/unavailable Core does not delay or break Learn login; real asynchronous workers retry safely, preserve pending state and avoid passwords/hashes in logs. |
| SSO, if included later | Real Vue/Laravel authorization-code callback with state, nonce and PKCE; issuer/audience checks, cookie behavior, refresh, logout/revocation, abandoned flows and return URLs across both products. |
| Regression and rollback | Learn courses, subscriptions and content permissions remain intact; isolated mail/payment doubles; flag-off rollback and existing sessions are explicitly tested. |

Suggested future order: agree the Core contract and password authority; implement/test Core and the disabled Learn adapter locally with fictional data; deploy Core, then Learn API, then the Learn frontend if SSO is included; only then activate the reviewed integration in its approved environment. This matrix is preparation, not authorization for that deployment, account import or any provider action.
