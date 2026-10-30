# Josep evening feedback — web validation

Source: `20263010-1_Josep.docx`, 14 screenshots reviewed. `20263010-2_Josep.docx` is empty. No production writes, commit or push. Existing photo, mobile and recovery changes are preserved.

Status: final web verification PASS, including the complete browser rerun after the photo coordinator reported a pre-existing blank handler name in the desktop student heading. The heading now falls back to the member name when handlerName is empty/whitespace; its existing header/photo regression exercises that case. No production data changed. API verification and coordinated production deployment remain separate.

Scope: planning dates accept `dd/mm`, `dd/mm/yy` and `dd/mm/yyyy` using the club-local current year; Active excludes cancelled classes. Onboarding preserves existing image permission, only requires pending privacy acceptance, explains/highlights that choice and bypasses personal consent in impersonation. Exit revokes the temporary grant and closes its tab. Booking confirmation includes the home action. Empty notification filters resolve member names independently. Generated API types come from the API snapshot. Catalan, Spanish and English copy are included.

The administration total JavaScript budget increased from 683 to 684 kB for these changes (683.21 kB measured); all initial-load and other budgets remain unchanged. No additional runtime dependencies.

Passing web CI includes 3,668 unit/component/contract tests (38 Turbo tasks). After that run, the only runtime change was a CSS outline on the invalid privacy row; the final browser build includes it. The subsequent E11-W05 browser test adjustment selects Cancelled before inspecting a cancelled class, and has its own lint/format check.

Earlier attempts: initial pnpm invocation corrected; active-calendar expectations updated across unit/mocks/browser tests; mocked window.close in the profile test to avoid destroying jsdom; strict lint fixes. First browser run had four timeouts under concurrent compilation; the next admin run had 183 passes and two outdated cancelled-class expectations. Both expectations are corrected. Final complete browser suite passed with 323 tests (4 course UI, 1 ID, 185 administration, 133 member app), no retries or skipped failures.

## Initial full web CI

Command: `pnpm turbo run lint typecheck test build`. Exit: **0**. Full log: `17-web-ci.log`.

```text
clubs-admin:test:    ✓ T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28) (3)
clubs-admin:test:      ✓ T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES] 894ms
clubs-admin:test:      ✓ T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance 992ms
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 6769ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others 351ms
clubs-admin:test:      ✓ R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY) 317ms
clubs-admin:test:      ✓ T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it 341ms
clubs-admin:test:      ✓ T-12-25 / E87: a receipt cancelled by a rollback lists only under CANCELLED, reads «anul·lat · retrocés» and its drawer offers no action but the PDF 341ms
clubs-admin:test:      ✓ R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal 305ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 801ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 755ms
clubs-admin:test:      ✓ T-12-25 / T-14-26 / R-12-26 / E8-W07 #2: EXPORT_LIMIT keeps the accounting kind in the exports drawer 307ms
clubs-admin:test:      ✓ R-12-13: the poll stops after two minutes of CHARGING with [Actualitza], which polls again 347ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5518ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5413ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 647ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 519ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 667ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 712ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 850ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 554ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 679ms
clubs-admin:test: 
clubs-admin:test:  Test Files  69 passed (69)
clubs-admin:test:       Tests  1115 passed (1115)
clubs-admin:test:    Start at  20:17:03
clubs-admin:test:    Duration  93.39s (tests 67%, transform 15%, environment 11%, import 5%, setup 2%)
clubs-admin:test: 
clubs-admin:test:     Isolate  69 workers spawned · ~2.15s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~6.59s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    30 cached, 38 total
  Time:    1m36.982s 

```

## i18n and catalogs

Command: `pnpm i18n:check`. Exit: **0**. Full log: `11-i18n.log`.

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5263 keys
es: 5263 keys
en: 5263 keys
4066 statically used keys, 0 unused
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

## Bundle budgets

Command: `pnpm size-limit`. Exit: **0**. Full log: `19-size-limit.log`.

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       317.31 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.84 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       450.04 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 684 kB
  Size:       683.21 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.19 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.76 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       102.07 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       132.11 kB gzipped
  
```

Visual review: `06-confirmada-tornar-inici-375.png`, `admin-onboarding-1280.png`, `D4-calendari-actives-1280.png`, and `D4-calendari-anullades-1280.png` inspected. Final `benvinguda-privacy-error-375.png` inspected after the passing browser run: the required checkbox row has a visible red outline, the error is explicit, and image permission remains optional.

## Initial complete browser suite

Command: `pnpm e2e:docker 2026-10-30-evening-feedback --capture-task=2026-10-30-evening-feedback --workers=2 --output=/evidence/2026-10-30-evening-feedback/browser-results-22`. Exit: **0**. Full log: `22-e2e-docker.log`.

```text
evidence: 2026-10-30-evening-feedback/admin-D18-recorregut-2d-1280-light.png
evidence: 2026-10-30-evening-feedback/responsive-admin-import-1280.png
evidence: 2026-10-30-evening-feedback/admin-D16-geometria-375-light.png
evidence: 2026-10-30-evening-feedback/word-home-chromium-1512.png
evidence: 2026-10-30-evening-feedback/62-D6-submission-due-1280.png
evidence: 2026-10-30-evening-feedback/responsive-admin-member-1280.png
evidence: 2026-10-30-evening-feedback/clubs-visor-instructor-2d-375-light.png
evidence: 2026-10-30-evening-feedback/admin-D18-registra-1280-light.png
evidence: 2026-10-30-evening-feedback/member-confirm-375-dark.png
evidence: 2026-10-30-evening-feedback/responsive-admin-billing-menu-0-1280.png
evidence: 2026-10-30-evening-feedback/admin-D4-recorregut-previst-375-dark.png
evidence: 2026-10-30-evening-feedback/agenda-selected-webkit-1920.png
evidence: 2026-10-30-evening-feedback/admin-dashboard-1280-light.png
evidence: 2026-10-30-evening-feedback/responsive-admin-billing-menu-0-1280.json
evidence: 2026-10-30-evening-feedback/agenda-selected-chromium-1920.png
evidence: 2026-10-30-evening-feedback/admin-D18-col-locacio-1280-light.png
evidence: 2026-10-30-evening-feedback/clubs-23-visio-global-1280-dark.png
evidence: 2026-10-30-evening-feedback/hours-chromium-375.png
evidence: 2026-10-30-evening-feedback/admin-D16-geometria-1280-light.png
evidence: 2026-10-30-evening-feedback/06-confirmada-tornar-inici-375.png
evidence: 2026-10-30-evening-feedback/header-chromium-768.png
evidence: 2026-10-30-evening-feedback/clubs-visor-instructor-3d-1280-light.png
evidence: 2026-10-30-evening-feedback/word-dogs-chromium-375.png
evidence: 2026-10-30-evening-feedback/07-espera-375.png
evidence: 2026-10-30-evening-feedback/member-confirm-768-dark.png
evidence: 2026-10-30-evening-feedback/responsive-admin-billing-menu-1-1280.json
evidence: 2026-10-30-evening-feedback/admin-D12-agenda-muntatges-375-light.png
evidence: 2026-10-30-evening-feedback/hours-chromium-320.png
evidence: 2026-10-30-evening-feedback/r2-course-ui-harness-1280-after-nudge.png
evidence: 2026-10-30-evening-feedback/user-menu-webkit-320.png
evidence: 2026-10-30-evening-feedback/header-chromium-390.png
evidence: 2026-10-30-evening-feedback/word-inactivity-chromium-1512.png
evidence: 2026-10-30-evening-feedback/admin-D7-col-locacions-1280-light.png
evidence: 2026-10-30-evening-feedback/member-today-768-light.png
evidence: 2026-10-30-evening-feedback/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: 2026-10-30-evening-feedback/clubs-visor-alumne-1280-dark.png
evidence: 2026-10-30-evening-feedback/responsive-admin-create-menu-768.json
evidence: 2026-10-30-evening-feedback/23-D10-next-invoice-row-375.png
evidence: 2026-10-30-evening-feedback/member-today-375-light.png
evidence: 2026-10-30-evening-feedback/responsive-admin-import-768.png
```

## Final CSS and browser-test static checks

Command: `pnpm exec eslint packages/auth/src/onboarding.css apps/clubs-admin/e2e/e11-w05.spec.ts; pnpm exec prettier --check packages/auth/src/onboarding.css apps/clubs-admin/e2e/e11-w05.spec.ts .size-limit.json`. Exit: **0**. Full log: `23-final-static.log`.

```text
Checking formatting...
All matched files use Prettier code style!
```


Final follow-up validation: the existing student header regression now supplies a whitespace handler name and checks the member title and photo/fallback. During the full rerun, an unrelated screen test timed out once (24); a template test read the URL before its React effect completed (26), so it now waits for the same expected URL. Strict lint required explicit blank-string handling and a braced waitFor callback (25, 27). No production behavior or assertion was weakened. The passing final CI contains 38 tasks and the same 3,668 tests. The browser rerun includes all final runtime changes; the only edit after its source copy was braces in that unit-test callback.

## Final complete web CI

Command: `PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm turbo run lint typecheck test build --concurrency=1`. Exit: **0**. Full log: `29-web-ci.log`.

```text
clubs-admin:build: dist/assets/instructor-BDzhTZj9.js                          9.94 kB │ gzip:   3.64 kB
clubs-admin:build: dist/assets/instructor-DJ8c2w9D.js                         10.08 kB │ gzip:   3.66 kB
clubs-admin:build: dist/assets/admin-billing-CZFSME4s.js                      10.24 kB │ gzip:   3.63 kB
clubs-admin:build: dist/assets/admin-billing-DCRzb_Gs.js                      10.45 kB │ gzip:   3.96 kB
clubs-admin:build: dist/assets/enums-CWQyt4Yf.js                              10.50 kB │ gzip:   4.36 kB
clubs-admin:build: dist/assets/admin-billing-BYH6Z6c6.js                      10.66 kB │ gzip:   4.00 kB
clubs-admin:build: dist/assets/enums-BXPvt30r.js                              10.87 kB │ gzip:   4.57 kB
clubs-admin:build: dist/assets/enums-CfRepzh0.js                              10.93 kB │ gzip:   4.57 kB
clubs-admin:build: dist/assets/admin-courses-Ck0h_Li2.js                      12.87 kB │ gzip:   4.91 kB
clubs-admin:build: dist/assets/admin-courses-DuWn-ntx.js                      13.75 kB │ gzip:   5.24 kB
clubs-admin:build: dist/assets/admin-courses-CqAy07HT.js                      14.07 kB │ gzip:   5.28 kB
clubs-admin:build: dist/assets/console-y2Qd044H.js                            20.25 kB │ gzip:   7.94 kB
clubs-admin:build: dist/assets/console-itJKmAP_.js                            21.48 kB │ gzip:   8.63 kB
clubs-admin:build: dist/assets/admin-census-CCIyIFc6.js                       21.77 kB │ gzip:   8.00 kB
clubs-admin:build: dist/assets/errors-BK9wXSkI.js                             21.98 kB │ gzip:   7.17 kB
clubs-admin:build: dist/assets/console-CghUU9LZ.js                            22.15 kB │ gzip:   8.73 kB
clubs-admin:build: dist/assets/admin-census-D0tUKWPE.js                       23.18 kB │ gzip:   8.69 kB
clubs-admin:build: dist/assets/errors-hleDn1V_.js                             23.24 kB │ gzip:   7.54 kB
clubs-admin:build: dist/assets/errors-B_xAcX5p.js                             23.27 kB │ gzip:   7.53 kB
clubs-admin:build: dist/assets/admin-census-CsyL8b0h.js                       23.65 kB │ gzip:   8.72 kB
clubs-admin:build: dist/assets/admin-settings-C5DlaZuI.js                     27.56 kB │ gzip:   9.29 kB
clubs-admin:build: dist/assets/admin-settings-BmrqxkTJ.js                     29.77 kB │ gzip:  10.05 kB
clubs-admin:build: dist/assets/admin-settings-D5gwmV9F.js                     30.36 kB │ gzip:  10.11 kB
clubs-admin:build: dist/assets/ConsolePage-nO8wlhet.js                       116.95 kB │ gzip:  27.87 kB
clubs-admin:build: dist/assets/list-helpers-CfJdt6U1.js                      228.98 kB │ gzip:  71.15 kB
clubs-admin:build: dist/assets/CoursesRoute-C0aKmHnQ.js                      231.55 kB │ gzip:  64.15 kB
clubs-admin:build: dist/assets/CourseViewer3D-Dk94yQGd.js                    582.83 kB │ gzip: 151.71 kB
clubs-admin:build: dist/assets/index-CswY68aT.js                           1,116.37 kB │ gzip: 376.70 kB
clubs-admin:build: 
clubs-admin:build: [plugin builtin:vite-reporter] 
clubs-admin:build: (!) Some chunks are larger than 500 kB after minification. Consider:
clubs-admin:build: - Using dynamic import() to code-split the application
clubs-admin:build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
clubs-admin:build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
clubs-admin:build: ✓ built in 518ms

 Tasks:    38 successful, 38 total
Cached:    34 cached, 38 total
  Time:    2m39.912s 

```

## Final bundle budgets

Command: `PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm size-limit`. Exit: **0**. Full log: `30-size-limit.log`.

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       317.31 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.84 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       450.04 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 684 kB
  Size:       683.21 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.19 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.76 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       102.07 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       132.11 kB gzipped
  
```

## Final follow-up formatting

Command: `PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm exec prettier --check apps/clubs-admin/src/instructor/StudentRecordPage.tsx apps/clubs-admin/src/instructor/student-record.test.tsx apps/clubs-admin/src/planning/TemplatesPage.test.tsx`. Exit: **0**. Full log: `31-final-format.log`.

```text
Checking formatting...
All matched files use Prettier code style!
```

## Final complete browser suite

Command: `PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm e2e:docker 2026-10-30-evening-feedback --capture-task=2026-10-30-evening-feedback --workers=2 --output=/evidence/2026-10-30-evening-feedback/browser-results-28`. Exit: **0**. Full log: `28-e2e-docker.log`. All 323 tests passed, no failures or retries.

```text
@agilityhub/course-ui:e2e:   4 passed (20.9s)
id:e2e:   1 passed (6.3s)
clubs:e2e:   133 passed (4.7m)
clubs-admin:e2e:   185 passed (6.4m)
 Tasks:    10 successful, 10 total
```

Last 40 lines:

```text
evidence: 2026-10-30-evening-feedback/admin-D18-recorregut-2d-1280-light.png
evidence: 2026-10-30-evening-feedback/responsive-admin-import-1280.png
evidence: 2026-10-30-evening-feedback/admin-D16-geometria-375-light.png
evidence: 2026-10-30-evening-feedback/word-home-chromium-1512.png
evidence: 2026-10-30-evening-feedback/62-D6-submission-due-1280.png
evidence: 2026-10-30-evening-feedback/responsive-admin-member-1280.png
evidence: 2026-10-30-evening-feedback/clubs-visor-instructor-2d-375-light.png
evidence: 2026-10-30-evening-feedback/admin-D18-registra-1280-light.png
evidence: 2026-10-30-evening-feedback/member-confirm-375-dark.png
evidence: 2026-10-30-evening-feedback/responsive-admin-billing-menu-0-1280.png
evidence: 2026-10-30-evening-feedback/admin-D4-recorregut-previst-375-dark.png
evidence: 2026-10-30-evening-feedback/agenda-selected-webkit-1920.png
evidence: 2026-10-30-evening-feedback/admin-dashboard-1280-light.png
evidence: 2026-10-30-evening-feedback/responsive-admin-billing-menu-0-1280.json
evidence: 2026-10-30-evening-feedback/agenda-selected-chromium-1920.png
evidence: 2026-10-30-evening-feedback/admin-D18-col-locacio-1280-light.png
evidence: 2026-10-30-evening-feedback/clubs-23-visio-global-1280-dark.png
evidence: 2026-10-30-evening-feedback/hours-chromium-375.png
evidence: 2026-10-30-evening-feedback/admin-D16-geometria-1280-light.png
evidence: 2026-10-30-evening-feedback/06-confirmada-tornar-inici-375.png
evidence: 2026-10-30-evening-feedback/header-chromium-768.png
evidence: 2026-10-30-evening-feedback/clubs-visor-instructor-3d-1280-light.png
evidence: 2026-10-30-evening-feedback/word-dogs-chromium-375.png
evidence: 2026-10-30-evening-feedback/07-espera-375.png
evidence: 2026-10-30-evening-feedback/member-confirm-768-dark.png
evidence: 2026-10-30-evening-feedback/responsive-admin-billing-menu-1-1280.json
evidence: 2026-10-30-evening-feedback/admin-D12-agenda-muntatges-375-light.png
evidence: 2026-10-30-evening-feedback/hours-chromium-320.png
evidence: 2026-10-30-evening-feedback/r2-course-ui-harness-1280-after-nudge.png
evidence: 2026-10-30-evening-feedback/user-menu-webkit-320.png
evidence: 2026-10-30-evening-feedback/header-chromium-390.png
evidence: 2026-10-30-evening-feedback/word-inactivity-chromium-1512.png
evidence: 2026-10-30-evening-feedback/admin-D7-col-locacions-1280-light.png
evidence: 2026-10-30-evening-feedback/member-today-768-light.png
evidence: 2026-10-30-evening-feedback/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: 2026-10-30-evening-feedback/clubs-visor-alumne-1280-dark.png
evidence: 2026-10-30-evening-feedback/responsive-admin-create-menu-768.json
evidence: 2026-10-30-evening-feedback/23-D10-next-invoice-row-375.png
evidence: 2026-10-30-evening-feedback/member-today-375-light.png
evidence: 2026-10-30-evening-feedback/responsive-admin-import-768.png
```


## Deployment CI browser installation

CI run 41121817101 passed lint, type checks, all unit/component tests, builds, translations and generated-client checks. Playwright failed 14 WebKit mobile cases because the workflow installed only Chromium (`webkit-2359/pw_run.sh` missing); the existing local Docker run had all 323 tests green with both engines present. Install Chromium and WebKit with their system dependencies before the unchanged full browser suite. Application code, assertions, browser projects and test coverage are unchanged. The next CI run validates the workflow on Ubuntu.
