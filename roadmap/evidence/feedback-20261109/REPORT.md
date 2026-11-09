# Member record and home feedback — 9 November 2026

Direct user request. No roadmap task state or organizer verification changed. Publication and live activation are recorded separately in SOFTWARE_CANIC operations evidence.

The member summary always offers the billing-plan editor, including an empty or unresolved plan. Internal notes use the existing member editor and are visible only in the backoffice; matching API regression tests verify privacy in member and impersonated profiles. Home no longer displays the per-dog weekly training summary; the training screen retains its own summary. Public club image failures get one retry, then an accessible branded initial. Manual free-training explanation was removed in all three locales.

Screenshots reviewed at 1280 and 375 px: member-notes-1280.png and member-notes-375.png. Home checked in Chromium and WebKit at 375 and 1512 px: word-home-*.png. Fixtures contain fictional people.

Earlier attempts:

- Import-order lint and an unrelated TemplatesPage timing failure: `web-checks.log`; import sorting corrected and the final serialized host check passed.
- Remaining import-order lint: `web-checks-final.log`; corrected before the passing host check.
- Compiled member app omitted development-only gallery: `e2e-full.log`; stopped the first run and used the required member dev server.
- Four old Home counter assertions: `e2e-verified.log`; now assert absence on Home and continued availability on Training.
- One WebKit text-size reload timeout with no HTTP or console errors: `e2e-final.log`; all 157 member tests passed on the full same-source member recheck (`e2e-member-recheck.log`). The other workspaces passed in the full run.
- An exploratory app-local tsconfig.e2e.json command referenced a nonexistent file; the actual pnpm typecheck:e2e-core command passed (`web-e2e-update.log`).

No tests skipped or timeouts increased.

The full Docker suite uses the official Playwright image (bundled Node 24); production artifacts and host checks use Node 22. Admin and ID use VITE_MOCK builds with preview; members use the dev server required by gallery coverage. All four workspaces run sequentially.

## Totals

```json
{
  "exitCode": 0,
  "turboTasks": 38,
  "vitest": {
    "@agilityhub/ui": 207,
    "@agilityhub/course-core": 378,
    "@agilityhub/i18n": 162,
    "@agilityhub/shared-types": 38,
    "@agilityhub/course-ui": 56,
    "@agilityhub/api-client": 801,
    "@agilityhub/auth": 129,
    "id": 20,
    "clubs": 790,
    "clubs-admin": 1146
  },
  "nodeTests": {
    "@agilityhub/i18n": 10,
    "clubs": 10
  },
  "vitestTotal": 3727,
  "nodeTotal": 20,
  "playwright": {
    "clubs": 157,
    "clubs-admin": 224,
    "id": 1,
    "course-ui": 4,
    "total": 386,
    "allLatestWorkspaceRunsPassed": true,
    "priorFullRun": {
      "exitCode": 1,
      "failure": "WebKit text-size reload timeout; no HTTP or console errors",
      "passed": 385
    },
    "memberFullRecheckExitCode": 0
  }
}
```

## `pnpm turbo run lint typecheck test build --concurrency=2`

Exit code: 0. Complete output: `web-checks-verified.log`.

```text
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 8534ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others 1718ms
clubs-admin:test:      ✓ R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY) 1087ms
clubs-admin:test:      ✓ R-12-07: [1 · SIMULA EL MES] refused with 409 BILLING_BUSY reads its toast, and a 400 on another field is not «tres mesos» 699ms
clubs-admin:test:      ✓ T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it 1788ms
clubs-admin:test:      ✓ T-12-25 / E87: a receipt cancelled by a rollback lists only under CANCELLED, reads «anul·lat · retrocés» and its drawer offers no action but the PDF 2546ms
clubs-admin:test:      ✓ R-12-13 / R-12-18: a withdrawn card reads «sense targeta vàlida» (never NO_PAYMENT_METHOD); [Reintenta amb targeta] → 409 MAX_ATTEMPTS shows the api's attempts 1548ms
clubs-admin:test:      ✓ R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal 1714ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 2551ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 2698ms
clubs-admin:test:      ✓ T-12-25 / T-14-26 / R-12-26 / E8-W07 #2: EXPORT_LIMIT keeps the accounting kind in the exports drawer 715ms
clubs-admin:test:      ✓ R-12-13: the poll stops after two minutes of CHARGING with [Actualitza], which polls again 714ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5976ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5649ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 636ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 545ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 704ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 730ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 854ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 562ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 716ms
clubs-admin:test:    ✓ programa un descompte recurrent per a dos abonats i permet retirar-lo 977ms
clubs-admin:test: 
clubs-admin:test:  Test Files  69 passed (69)
clubs-admin:test:       Tests  1146 passed (1146)
clubs-admin:test:    Start at  19:34:00
clubs-admin:test:    Duration  78.94s (tests 66%, environment 16%, import 7%, transform 7%, setup 4%)
clubs-admin:test: 
clubs-admin:test:     Isolate  69 workers spawned · ~2.55s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~7.79s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    30 cached, 38 total
  Time:    2m19.89s 

```

## `pnpm i18n:check`

Exit code: 0. Complete output: `i18n.log`.

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5405 keys
es: 5405 keys
en: 5405 keys
4206 statically used keys, 0 unused
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

## `pnpm typecheck:e2e-core`

Exit code: 0. Complete output: `e2e-types.log`.

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

## `pnpm size`

Exit code: 0. Complete output: `web-size.log`.

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       324.49 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.86 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       459.42 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 690 kB
  Size:       685.64 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.19 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.26 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       103.19 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       133.73 kB gzipped
  
```

## `pnpm exec prettier --check apps/clubs/e2e/word-feedback.spec.ts && pnpm --filter clubs exec eslint e2e/word-feedback.spec.ts && pnpm typecheck:e2e-core`

Exit code: 0. Complete output: `web-e2e-update.log`.

```text
Checking formatting...
All matched files use Prettier code style!

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

## `pnpm api:generate && git diff --exit-code -- packages/api-client/src/generated`

Exit code: 0. Complete output: `api-types.log`.

```text

> agilityhub-core-web@0.0.0 api:generate /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> pnpm --filter @agilityhub/api-client api:generate


> @agilityhub/api-client@0.0.0 api:generate /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client
> node scripts/generate.mjs

Generated /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client/src/generated/schema.d.ts from /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client/openapi/openapi.json merged with /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client/openapi/pending.json
```

## `Playwright v1.63.0-noble: full four-workspace suite, --workers=2; see e2e-recipe.sh`

Exit code: 1 (the member reload timeout described above). Complete output: `e2e-final.log`.

```text
    [webkit-ui] › e2e/word-feedback.spec.ts:146:1 › text size is remembered separately on a phone and a desktop 
  156 passed (4.9m)
/work/apps/clubs:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  clubs@0.0.0 e2e: `playwright test --workers\=2`
Exit status 1
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:6303) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs-admin@0.0.0 e2e /work/apps/clubs-admin
> playwright test --workers\=2


Running 224 tests using 2 workers
················································································
················································································
································································
  224 passed (4.7m)
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:13883) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> id@0.0.0 e2e /work/apps/id
> playwright test --workers\=2


Running 1 test using 1 worker
·
  1 passed (2.1s)
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:14013) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> @agilityhub/course-ui@0.0.1 e2e /work/packages/course-ui
> playwright test --workers\=2


Running 4 tests using 1 worker
····
  4 passed (7.8s)
```

## `Playwright v1.63.0-noble: repeat complete member suite after one WebKit reload timeout, --workers=2; see e2e-member-recheck.sh`

Exit code: 0. Complete output: `e2e-member-recheck.log`.

```text
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:169) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs@0.0.0 e2e /work/apps/clubs
> playwright test --workers\=2


Running 157 tests using 2 workers
················································································
·············································································
  157 passed (4.2m)
```

## `git diff --check`

Exit code: 0. Complete output: `web-diff-check.log`.

```text
```
