# November 13 direct feedback

Jordi requested application of the November 12-2 and November 13 feedback, with five-minute planning increments and freely typed manual start/end times. No roadmap task/status or Organizer verification is changed.

## Changes

- Typed class start/end inputs with suggestions; independent end editing, opening-hour and conflict validation retained. API adoption is required for free manual times and saved receipt previews.
- Census date inputs and inclusive day/range filters in the club time zone, including DST.
- Empty-pack expiry rendering, blank-handler fallback and themed orange student links; compact tables and class notices.
- Explain rejected, never-validated applications and money already received. New explanatory copy is authored for the feedback in ca/es/en; no club literal is introduced.
- Display saved billing preview details with search, concepts and pagination, separately from issued invoices. Reading it generates no invoices or remittances.

## Investigation limits

The reported identity currently passes production validation; the rejection was not reproduced and no speculative validator change was made. The rejected application needs normal signup/validation, not lifecycle reactivation of a former member. The booking failure came from a null expiry, not the future leave date; normal lack-of-credit restrictions remain. Personal data and production response bodies are kept only in the private operations directory.

## Validation

Host checks: 38/38 tasks, 3742 tests.

### `pnpm turbo run lint typecheck test build --concurrency=2` — exit 0

Full output: `web-final.log`. Last 40 lines:

```text
clubs-admin:test:      ✓ R-12-13 / R-12-18: a withdrawn card reads «sense targeta vàlida» (never NO_PAYMENT_METHOD); [Reintenta amb targeta] → 409 MAX_ATTEMPTS shows the api's attempts 334ms
clubs-admin:test:      ✓ R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal 363ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 923ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 909ms
clubs-admin:test:      ✓ T-12-25 / T-14-26 / R-12-26 / E8-W07 #2: EXPORT_LIMIT keeps the accounting kind in the exports drawer 362ms
clubs-admin:test:      ✓ R-12-13: the poll stops after two minutes of CHARGING with [Actualitza], which polls again 397ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5643ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5539ms
clubs-admin:test:      ✓ T-12-25 / R-12-13 / E8-W07 #1: a completed detail refreshes a stale CHARGING period once while its answer is slow 394ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 847ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 663ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 884ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 957ms
clubs-admin:test:      ✓ R-12-14 E89: a receipt the admin cancelled before the rollback reads «anul·lat · retrocés» in the list and in its drawer, with its own reason 381ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 1203ms
clubs-admin:test:      ✓ R-12-26: «Exporta per a comptabilitat» → GET /billing/exports?period=2026-09&format=csv, saved as facturacio-2026-09.csv 341ms
clubs-admin:test:    ✓ E8-W01 step 10: the D6 literals in ca (mockup V7) and the same keys in es and en (2)
clubs-admin:test:      ✓ E8-W01: D6 in es and en reads its own month titles and never a Catalan literal 437ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 637ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 884ms
clubs-admin:test:    ✓ E11-W08 steps 3–4 (R-12-14, R-12-15, R-12-07, ruling E156): D6 past the collection date and the new incidents (8)
clubs-admin:test:      ✓ R-12-14 (E156): with COLLECTION_DATE_PASSED alone, the rollback asks for FITXER_NO_ENVIAT after «Només si el fitxer no s'ha enviat mai al banc», and sends it 387ms
clubs-admin:test:    ✓ programa un descompte recurrent per a dos abonats i permet retirar-lo 1038ms
clubs-admin:test: 
clubs-admin:test:  Test Files  70 passed (70)
clubs-admin:test:       Tests  1151 passed (1151)
clubs-admin:test:    Start at  12:23:01
clubs-admin:test:    Duration  76.75s (tests 66%, transform 13%, environment 12%, import 6%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  70 workers spawned · ~1.59s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~4.96s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    15 cached, 38 total
  Time:    3m42.24s 

```

### `pnpm i18n:check` — exit 0

Full output: `i18n-check-final.log`. Last 40 lines:

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5425 keys
es: 5425 keys
en: 5425 keys
4225 statically used keys, 0 unused
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
  kept booking:confirm.swapTitle · «Elige cuál anulas para hacerle sitio» — 06's swap title: an instruction
  kept common:gallery.active · «Activa» — the adjective: the dev gallery's state chip
  kept console:theme.logoAlt.mark · «Marca» — the noun: the alt text of the club's mark
  kept console:theme.logos.mark · «Marca (versión pequeña)» — the noun: a logo slot's name
  kept id:login.title · «Entra en tu cuenta» — the login page's title
  kept id:password.repeat · «Repite la contraseña nueva» — the second password field's label: an instruction
  kept notifications:unsubscribe.toPreferences · «Cambia tus avisos en el perfil» — a navigation link written as a sentence
  kept signup:success.addDogTitle · «Añade un perro» — the add-dog flow's title on its success screen
  KEEP entries this catalog does not need: auth:profile.learnLink
check-es-actions: 0 flagged, 19 kept
```

### `pnpm typecheck:e2e-core` — exit 0

Full output: `core-typecheck.log`. Last 40 lines:

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

### `pnpm size-limit` — exit 0

Full output: `size-limit.log`. Last 40 lines:

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       324.91 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.86 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 465 kB
  Size:       461.2 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 690 kB
  Size:       689.19 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.21 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.29 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       103.19 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       133.73 kB gzipped
  
```

The 236 administrator browser cases and 10 focused Chromium/WebKit cases have passed. Visual review at 375/1280 in light/dark found and fixed narrow mobile preview columns by keeping each member, amount, method and concepts together. The complete suite passed: 401 browser cases (236 administration, 160 student/instructor, 4 course UI, 1 identity). Publication and deployment are separate operations; this report does not claim production activation.

Earlier attempts: updated the accessibility test to match an aria-describedby token list; kept optional pack expiry null in mocks; made absent preview serialization backward compatible; corrected lint/import details. A partial browser attempt stopped at the same TypeScript fixture mismatch before the application suites.

### Full browser suite — exit 0

`pnpm exec turbo run e2e --continue=always --concurrency=1 -- --workers=2` in Playwright v1.63.0-noble. Full output: `e2e-final.log`. Last 40 lines:

```text
id:build: [32m✓ built in 229ms[39m
clubs-admin:e2e: cache bypass, force executing 9e7b04b367e709e2
clubs-admin:e2e: 
clubs-admin:e2e: > clubs-admin@0.0.0 e2e /work/apps/clubs-admin
clubs-admin:e2e: > playwright test --workers\=2
clubs-admin:e2e: 
clubs-admin:e2e: [WebServer] (node:5994) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs-admin:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs-admin:e2e: 
clubs-admin:e2e: Running 236 tests using 2 workers
clubs-admin:e2e: ················································································
clubs-admin:e2e: ················································································
clubs-admin:e2e: ············································································
clubs-admin:e2e:   236 passed (9.7m)
clubs:e2e: cache bypass, force executing 4c941c6cc907f771
clubs:e2e: 
clubs:e2e: > clubs@0.0.0 e2e /work/apps/clubs
clubs:e2e: > playwright test --workers\=2
clubs:e2e: 
clubs:e2e: [WebServer] (node:15111) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs:e2e: 
clubs:e2e: Running 160 tests using 2 workers
clubs:e2e: ················································································
clubs:e2e: ················································································
clubs:e2e:   160 passed (5.3m)
id:e2e: cache bypass, force executing da1bea361e7d72ea
id:e2e: 
id:e2e: > id@0.0.0 e2e /work/apps/id
id:e2e: > playwright test --workers\=2
id:e2e: 
id:e2e: 
id:e2e: Running 1 test using 1 worker
id:e2e: ·
id:e2e:   1 passed (6.4s)

 Tasks:    10 successful, 10 total
Cached:    0 cached, 10 total
  Time:    16m5.541s 

```

Focused responsive coverage: `e2e-responsive-final.log`, 10 passed (Chromium/WebKit, 375/1280, light/dark); `lint-responsive-corrected.log`, exit 0. Final full suite rebuilt the latest responsive CSS. Two unrelated five-second timeouts from a four-worker attempt passed at two workers without code changes and passed again in the full suite. The earlier detached-DOM timing issue in the new screenshot test was fixed by waiting for the saved heading before checking fields.
