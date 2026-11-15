# Competition statistics — web validation

Status: implementation complete; local static, component and complete Docker browser checks passed. This is an executor report, not organizer verification or production acceptance.

## Changes

Added the module-gated member page and profile entry, own-dog/season/year filters, official standings and run summaries, source freshness, loading/error/empty states, and the administrator preview/review/confirm/history flow. Includes Catalan, Spanish and English translations, generated API types, fictional mocks, seven component tests and two browser flows. Instructor-only accounts do not see the member link.

## Request and boundaries

User-requested implementation on separate `feature/competition-statistics` branches. The isolated checkouts are under `implementation/competition-statistics/`. Existing organizer tasks and verification sections remain unchanged. No production deployment, STATS activation, provider mutation, scheduled synchronization, or live result import was performed.

See [behavior, configuration and limitations](../COMPETITION_STATISTICS.md). FCAG HTTP fetch plus parsing returned 57 rows for 2026–2027. Flow's authenticated browser print layout and `_facom_key` cookie were observed, but a real authenticated server request remains unverified: automatic approval rejected Terminal access for session transfer. No provider session was provisioned or committed. Positive Flow point labels still need a live example; the checked run contained `-`.

## Assumptions and review scope

- This feature uses STATS; SOCIAL_LEAGUE remains separate. New screen copy is proposed in Catalan, Spanish and English because no approved import-screen mockup exists.
- FCAG official net totals are preserved. Flow official points are explicit and never inferred from speed or a clear run.
- Each Flow print page represents one run. Its trial identity uses title plus organizer/date because no trial UUID is exposed; consistent reimport is needed after a provider rename.
- The CSV download is our reviewed interchange template, not a native Flow export claim.
- Task-local test identifiers are T-STATS-01 through T-STATS-32. No existing catalog error, audit or notification code was added.

## Visual review

- [Member at 375 px](member-375.png): dog and period selectors, official standings, summaries and details fit the mobile width.
- [Administrator at 1280 px](admin-1280.png): source entry, matched/unmatched licences, explicit selection and replacement review are visible.

The screenshots were inspected visually. Both contain fictional fixture data. Browser-native file input wording follows the browser locale.

## Validation

Run from the feature web checkout on 2026-11-15. The web pipeline passed 38/38 tasks with 4,052 tests across 255 test files. It used valid Turbo results for unchanged inputs (30 cached tasks). Seven new component tests passed. The complete Docker suite passed 404/404 browser tests: clubs 162, administrator 237, identity 1 and course harness 4, with no reported retries/flakes. The two new flows are included. i18n reports 5,690 keys per locale, zero unused keys, and zero missing error or parameter translations.

The Docker runner is a copy of the repository script, archived as [e2e-all.sh](e2e-all.sh). It changes Turbo to `--continue=always` so every project runs after a failure, and forwards two workers plus one retry. Assertions and timeouts are unchanged. Final suite exit code was 0. Earlier runs exposed incorrect selectors in the two new specs; both were corrected and the complete final suite passed. An existing screen-recovery component test timed out once under concurrent checks; its isolated retry and the final sequential pipeline passed (see `earlier-web-flake.log` and `existing-screen-retry.log`).

Screenshots and browser mocks demonstrate local behavior, not a real production member sign-in. The user subsequently authorized a combined production release with Profile/Info, mobile booking and logos; that release is tracked separately under `ops/evidence/2026-11-15-joint-release/`. Stripe was explicitly deferred.

### `pnpm turbo run lint typecheck test build --concurrency=1`

Exit code: `0`. [Complete output](web-checks.log). Last 40 lines:

```text
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 743ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 635ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 818ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 895ms
clubs-admin:test:      ✓ R-12-14 E89: a receipt the admin cancelled before the rollback reads «anul·lat · retrocés» in the list and in its drawer, with its own reason 337ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 1029ms
clubs-admin:test:    ✓ E8-W01 step 10: the D6 literals in ca (mockup V7) and the same keys in es and en (2)
clubs-admin:test:      ✓ E8-W01: D6 in es and en reads its own month titles and never a Catalan literal 375ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 627ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 856ms
clubs-admin:test:    ✓ E11-W08 steps 3–4 (R-12-14, R-12-15, R-12-07, ruling E156): D6 past the collection date and the new incidents (8)
clubs-admin:test:      ✓ R-12-14 (E156): with COLLECTION_DATE_PASSED alone, the rollback asks for FITXER_NO_ENVIAT after «Només si el fitxer no s'ha enviat mai al banc», and sends it 320ms
clubs-admin:test:    ✓ programa un descompte recurrent per a dos abonats i permet retirar-lo 1016ms
clubs-admin:test:    ✓ SEPA-04 (b) bulk returns of a remittance and re-presentation (R-12-17/19, owner decision of 13 Nov 2026) (4)
clubs-admin:test:      ✓ two remitted receipts of September's remittance: [Marca impagats (selecció)] → day, reason and «Torna'ls a presentar…» → one POST /remittances/{id}/returns with a key; both read «impagat (manual)» 736ms
clubs-admin:test:      ✓ left unticked, the request carries no includeInNextRun; the api's 400 {invoiceIds} is named in the dialog 574ms
clubs-admin:test:    ✓ SEPA-05 (S12 R-12-12, decision of 13 Nov 2026): D6 chooses the collection date (6)
clubs-admin:test:      ✓ a day that is not a TARGET business day is refused on the field, which offers the next one (another payload, another key) 312ms
clubs-admin:test: 
clubs-admin:test:  Test Files  78 passed (78)
clubs-admin:test:       Tests  1285 passed (1285)
clubs-admin:test:    Start at  20:55:14
clubs-admin:test:    Duration  66.39s (tests 67%, environment 14%, transform 9%, import 7%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  78 workers spawned · ~1.25s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~4.47s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 
clubs-admin:typecheck: cache miss, executing a4cd36b72cbaf309
clubs-admin:typecheck: 
clubs-admin:typecheck: > clubs-admin@1.0.0 typecheck /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/implementation/competition-statistics/web/apps/clubs-admin
clubs-admin:typecheck: > tsc --noEmit
clubs-admin:typecheck: 

 Tasks:    38 successful, 38 total
Cached:    30 cached, 38 total
  Time:    4m2.871s 

```

### `pnpm i18n:check`

Exit code: `0`. [Complete output](i18n.log). Last 40 lines:

```text

> agilityhub-core-web@1.0.0 i18n:check /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/implementation/competition-statistics/web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5690 keys
es: 5690 keys
en: 5690 keys
4465 statically used keys, 0 unused
253 codes, 0 missing
156 catalog parameters (124 in D11, 32 system-only), 11 blocks, 0 missing
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
  kept auth:recentLogin.title · «Confirma que eres tú» — the «Confirma que ets tu» dialog's title (AUTH-01): an instruction
  kept booking:confirm.swapTitle · «Elige cuál anulas para hacerle sitio» — 06's swap title: an instruction
  kept common:gallery.active · «Activa» — the adjective: the dev gallery's state chip
  kept console:theme.logoAlt.mark · «Marca» — the noun: the alt text of the club's mark
  kept console:theme.logos.mark · «Marca (versión pequeña)» — the noun: a logo slot's name
  kept id:login.title · «Entra en tu cuenta» — the login page's title
  kept id:password.repeat · «Repite la contraseña nueva» — the second password field's label: an instruction
  kept notifications:unsubscribe.toPreferences · «Cambia tus avisos en el perfil» — a navigation link written as a sentence
  kept signup:success.addDogTitle · «Añade un perro» — the add-dog flow's title on its success screen
  KEEP entries this catalog does not need: auth:profile.learnLink
check-es-actions: 0 flagged, 20 kept
```

### `bash /tmp/competition-e2e-all.sh competition-statistics --capture-task=competition-statistics --workers=2 --retries=1`

Exit code: `0`. [Complete output](e2e-all.log). Last 40 lines:

```text
evidence: competition-statistics/admin-D18-registra-1280-light.png
evidence: competition-statistics/student-list-webkit-light-1280.png
evidence: competition-statistics/member-confirm-375-dark.png
evidence: competition-statistics/responsive-admin-billing-menu-0-1280.png
evidence: competition-statistics/admin-D4-recorregut-previst-375-dark.png
evidence: competition-statistics/history-chromium-light-1280.png
evidence: competition-statistics/agenda-selected-webkit-1920.png
evidence: competition-statistics/admin-dashboard-1280-light.png
evidence: competition-statistics/responsive-admin-billing-menu-0-1280.json
evidence: competition-statistics/agenda-selected-chromium-1920.png
evidence: competition-statistics/admin-D18-col-locacio-1280-light.png
evidence: competition-statistics/clubs-23-visio-global-1280-dark.png
evidence: competition-statistics/hours-chromium-375.png
evidence: competition-statistics/admin-D16-geometria-1280-light.png
evidence: competition-statistics/06-confirmada-tornar-inici-375.png
evidence: competition-statistics/donut-chromium-dark-1280-recent.png
evidence: competition-statistics/risk-webkit-dark-1280.png
evidence: competition-statistics/header-chromium-768.png
evidence: competition-statistics/clubs-visor-instructor-3d-1280-light.png
evidence: competition-statistics/word-dogs-chromium-375.png
evidence: competition-statistics/07-espera-375.png
evidence: competition-statistics/member-confirm-768-dark.png
evidence: competition-statistics/responsive-admin-billing-menu-1-1280.json
evidence: competition-statistics/admin-D12-agenda-muntatges-375-light.png
evidence: competition-statistics/student-grid-chromium-dark-1280.png
evidence: competition-statistics/hours-chromium-320.png
evidence: competition-statistics/feedback2-student-webkit-dark.png
evidence: competition-statistics/risk-chromium-light-768.png
evidence: competition-statistics/r2-course-ui-harness-1280-after-nudge.png
evidence: competition-statistics/user-menu-webkit-320.png
evidence: competition-statistics/header-chromium-390.png
evidence: competition-statistics/word-inactivity-chromium-1512.png
evidence: competition-statistics/admin-D7-col-locacions-1280-light.png
evidence: competition-statistics/member-today-768-light.png
evidence: competition-statistics/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: competition-statistics/clubs-visor-alumne-1280-dark.png
evidence: competition-statistics/responsive-admin-create-menu-768.json
evidence: competition-statistics/23-D10-next-invoice-row-375.png
evidence: competition-statistics/member-today-375-light.png
evidence: competition-statistics/responsive-admin-import-768.png
```


## Request envelope regression (T-STATS-33)

The coordinated release also guards the UTF-8 encoded JSON request envelope against the existing 2 MB public gateway limit, including strings expanded by JSON escaping. Oversized content gets the translated size message before any API request. This preserves the gateway limit.

Command: `pnpm --filter clubs-admin exec vitest run src/statistics/competition.test.tsx`

Exit: 0. Four administrator statistics tests passed. Full output: [request-envelope.log](request-envelope.log).

Last 40 lines:

```text

 RUN  v5.0.0 /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/implementation/competition-statistics/web/apps/clubs-admin


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  22:19:59
   Duration  3.64s (transform 41%, environment 22%, import 17%, tests 13%, setup 6%)

```
