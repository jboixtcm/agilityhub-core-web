# November 6 signup feedback — executor report

Status: implemented and locally checked; not published. Direct user request, outside the task queue. Source snapshot from the November 5-3 publication checkout; no organizer status or verification section changed.

## Result

- S04: independent monthly (direct debit/cash) and upfront (card/transfer/cash) choices. A manual submission with a balance shows a yellow pending-payment message; card confirmation continues to use the provider result. Initial method appears in administrator review.
- S04/S05: selected-language plan preview, one entry-fee mention, vaccination guidance directly below the upload control, explicit `?lang=es` signup link. Consent checkboxes stay unchecked initially.
- Catalan, Spanish and English copy and generated API types updated together. No club banking details in product code. Transfer instructions are prepared in the API club seed and the operations evidence, for a separate configuration update.

## Validation

3,711 unit/component tests passed; all 38 lint/typecheck/test/build tasks passed. Locale parity, unused keys, error codes and parameter keys passed. The final change after these checks updated only the catalog E2E expectation for the removed duplicate text; targeted ESLint passed and the complete browser suite then passed.

Browser suite: course-ui 4, clubs 157, clubs-admin 217, ID 1 = 379. One existing WebKit profile-navigation test passed on its single retry; all six new signup browser tests passed on the first attempt. Mobile 375px and desktop 1280px screenshots were inspected; the initial payment controls fit without horizontal scrolling. The original calendar/course-navigation failures did not recur in this final run.

The browser environment used the repository's official Playwright 1.63.0 image. Its installed dependencies were saved locally after a slow registry download, then reused with the corrected catalog E2E file; the execution script is archived in the operations evidence. No test was excluded from the final run.

Earlier failures and their corrections are recorded in `ops/evidence/2026-11-06-josep-feedback/attempts.json` with compressed logs in the documentation workspace. The `REPORT.md` source and patches are portable; runtime screenshots and logs are also retained in that operations folder.

## Screenshots

- `payment-chromium-375.png`, `payment-chromium-1280.png`
- `payment-webkit-ui-375.png`, `payment-webkit-ui-1280.png`
- `pending-{chromium,webkit-ui}-{375,1280}.png`

## Commands

### `pnpm turbo run lint typecheck test build`

Exit: 0. Complete output: `03-full-checks.log`.

```text
clubs-admin:test:      ✓ R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others 634ms
clubs-admin:test:      ✓ R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY) 348ms
clubs-admin:test:      ✓ T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it 571ms
clubs-admin:test:      ✓ T-12-25 / E87: a receipt cancelled by a rollback lists only under CANCELLED, reads «anul·lat · retrocés» and its drawer offers no action but the PDF 425ms
clubs-admin:test:      ✓ R-12-13 / R-12-18: a withdrawn card reads «sense targeta vàlida» (never NO_PAYMENT_METHOD); [Reintenta amb targeta] → 409 MAX_ATTEMPTS shows the api's attempts 355ms
clubs-admin:test:      ✓ R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal 480ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 1069ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 976ms
clubs-admin:test:      ✓ T-12-25 / T-14-26 / R-12-26 / E8-W07 #2: EXPORT_LIMIT keeps the accounting kind in the exports drawer 375ms
clubs-admin:test:      ✓ R-12-13: the poll stops after two minutes of CHARGING with [Actualitza], which polls again 423ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5642ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5462ms
clubs-admin:test:      ✓ T-12-25 / R-12-13 / E8-W07 #1: a completed detail refreshes a stale CHARGING period once while its answer is slow 352ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 743ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 622ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 789ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 849ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 976ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 630ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 836ms
clubs-admin:test:    ✓ E11-W08 steps 3–4 (R-12-14, R-12-15, R-12-07, ruling E156): D6 past the collection date and the new incidents (8)
clubs-admin:test:      ✓ R-12-14 (E156): with COLLECTION_DATE_PASSED alone, the rollback asks for FITXER_NO_ENVIAT after «Només si el fitxer no s'ha enviat mai al banc», and sends it 348ms
clubs-admin:test:    ✓ programa un descompte recurrent per a dos abonats i permet retirar-lo 1033ms
clubs-admin:test: 
clubs-admin:test:  Test Files  69 passed (69)
clubs-admin:test:       Tests  1134 passed (1134)
clubs-admin:test:    Start at  12:47:26
clubs-admin:test:    Duration  101.53s (tests 67%, transform 13%, environment 12%, import 6%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  69 workers spawned · ~2.54s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~7.78s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    31 cached, 38 total
  Time:    1m54.027s 

```

### `pnpm i18n:check`

Exit: 0. Complete output: `04-i18n.log`.

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/feedback-20261106/web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5389 keys
es: 5389 keys
en: 5389 keys
4190 statically used keys, 0 unused
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
  kept signup:person.reviewEmailTitle · «Revisa el correo» — the signup's heading after the verification mail: an instruction
  kept signup:success.addDogTitle · «Añade un perro» — the add-dog flow's title on its success screen
  KEEP entries this catalog does not need: auth:profile.learnLink
check-es-actions: 0 flagged, 20 kept
```

### `docker run with archived e2e-reuse.sh: pnpm exec turbo run e2e --continue=always --concurrency=1 -- --workers=2 --timeout=60000 --retries=1`

Exit: 0. Complete output: `05-browser-final.log`.

```text
clubs:e2e:     Error Context: ../../test-results/clubs/word-feedback-text-size-is-0b923-ly-on-a-phone-and-a-desktop-webkit-ui/error-context.md
clubs:e2e: 
clubs:e2e:     attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
clubs:e2e:     ../../test-results/clubs/word-feedback-text-size-is-0b923-ly-on-a-phone-and-a-desktop-webkit-ui/trace.zip
clubs:e2e:     Usage:
clubs:e2e: 
clubs:e2e:         pnpm exec playwright show-trace ../../test-results/clubs/word-feedback-text-size-is-0b923-ly-on-a-phone-and-a-desktop-webkit-ui/trace.zip
clubs:e2e: 
clubs:e2e:     ────────────────────────────────────────────────────────────────────────────────────────────────
clubs:e2e: 
clubs:e2e:   1 flaky
clubs:e2e:     [webkit-ui] › e2e/word-feedback.spec.ts:140:1 › text size is remembered separately on a phone and a desktop 
clubs:e2e:   156 passed (5.6m)
clubs-admin:e2e: cache bypass, force executing 352cab4bf7100a92
clubs-admin:e2e: 
clubs-admin:e2e: > clubs-admin@0.0.0 e2e /work/apps/clubs-admin
clubs-admin:e2e: > playwright test --workers\=2 --timeout\=60000 --retries\=1
clubs-admin:e2e: 
clubs-admin:e2e: [WebServer] (node:7046) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs-admin:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs-admin:e2e: 
clubs-admin:e2e: Running 217 tests using 2 workers
clubs-admin:e2e: ················································································
clubs-admin:e2e: ················································································
clubs-admin:e2e: ·························································
clubs-admin:e2e:   217 passed (8.4m)
id:e2e: cache bypass, force executing a1216c0454505c52
id:e2e: 
id:e2e: > id@0.0.0 e2e /work/apps/id
id:e2e: > playwright test --workers\=2 --timeout\=60000 --retries\=1
id:e2e: 
id:e2e: 
id:e2e: Running 1 test using 1 worker
id:e2e: ·
id:e2e:   1 passed (5.5s)

 Tasks:    10 successful, 10 total
Cached:    0 cached, 10 total
  Time:    15m4.115s 

```
