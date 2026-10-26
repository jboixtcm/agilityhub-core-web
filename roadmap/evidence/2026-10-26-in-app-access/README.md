# In-app access and neutral presentation — 2026-10-26

## Request and implementation

Jordi requested password login inside the club application and no visible AgilityHub branding for this instance. This request supersedes the old branded mockup text; no roadmap task status is changed by this report.

- The existing `/entrar` forms keep their same-origin password grant (`clubs-app` / `clubs-admin`). Team entry points are `app.agilitycanic.cat/entrar` and `admin.agilitycanic.cat/entrar`. They do not require an identity-site visit.
- `VITE_EMAIL_LOGIN_ENABLED=false` hides email-link and recovery actions while delivery is disabled, and shows the backoffice password form immediately. The backend remains responsible for email disabling.
- Large access-screen branding uses the club's full logo/fallback. `VITE_PLATFORM_BRAND_NAME` replaces only product-host presentation (`club.slug === null`), clearing product logos under that explicit override. Real tenant identity, roles, modules, signup and permissions are preserved.
- User-facing text, initial HTML titles, accessible labels, account chrome, theme presets, support labels and course exports are neutral in ca/es/en. Technical package identifiers, OAuth grants and role codes are unchanged.
- Product-host instance configuration is `Club Agility Cànic`. Deployment and source-data overrides are owned by the deployment chat; they are not asserted as applied on the server by this frontend report.

## Validation

The final unit/component run passed **3,623 tests across 221 files** and all 32 lint/typecheck/test tasks. All local checks below returned exit 0. `git diff --check` also returned 0. The final source-only changes after the production build are test expectations and formatting; the deployment workflow rebuilds the published commit.

**Full Playwright E2E is pending CI.** No local full-suite pass, roadmap verification, hosted login, QA provisioning, DNS or HTTPS verification is claimed. Updated E2E copy expectations remain part of the CI gate before deployment.

Earlier local attempts failed only on old copy expectations (marker wordmark, theme language, library and support labels) and one async test lookup; those assertions were corrected to the intended copy without removing permission/behavior checks.

## Chrome review via cua_repl

Local Vite + MSW fixtures, not the deployed API:

| Check | Observation |
| --- | --- |
| Club login, 375×812 | Club logo, email, password and submit visible; no old brand or email-link actions; no horizontal overflow. |
| Backoffice login, 1280×800 | Full club logo; password visible immediately; no identity-site link or email-link action. |
| Direct backoffice login | Fictional credentials entered on `/entrar`, then `/tauler` on the same localhost origin. |
| Logout | Returned to `/entrar` on the same localhost origin. |
| Dashboard | Title `Club Agility Cànic`; no visible `AgilityHub`; document width and scroll width both 1280. |

The first local app login used the default ADMIN mock and followed the supported club-to-backoffice handoff. Its fixture destination was port 4174; starting the preview there completed it. This is a local fixture route, not a production redirect defect. These screenshots contain fictional seeded records. The mobile signup link is from the fixture; production signup is configured separately. Real ADMIN/INSTRUCTOR/MEMBER QA verification remains pending deployment.

Screenshots: `club-app-password-login-mobile.png`, `club-admin-password-login.png`, `club-admin-logout-local.png`, `club-admin-session-local.png`.

## Commands and output tails

### `pnpm exec turbo run lint typecheck test --concurrency=3`

Exit: 0. Complete output: `access-final-gates.txt`.

```text
clubs-admin:test:      ✓ T-12-25: 409 STALE_VERSION reads «El rebut ha canviat. Torna a obrir-lo.» in the drawer and the receipt is read again 448ms
clubs-admin:test:      ✓ E8-W01 round 2 #6: a failed drawer refetch stays beside the cached receipt, unlocks its actions and recovers through [Torna-ho a provar] 575ms
clubs-admin:test:      ✓ T-12-25: [Descarrega el justificant] opens the PDF in a new tab without parsing it 412ms
clubs-admin:test:    ✓ T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28) (3)
clubs-admin:test:      ✓ T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES] 688ms
clubs-admin:test:      ✓ T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance 648ms
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 6171ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others 470ms
clubs-admin:test:      ✓ R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY) 360ms
clubs-admin:test:      ✓ T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it 376ms
clubs-admin:test:      ✓ T-12-25 / E87: a receipt cancelled by a rollback lists only under CANCELLED, reads «anul·lat · retrocés» and its drawer offers no action but the PDF 300ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 692ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 508ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5438ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5403ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 626ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 509ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 678ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 696ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 800ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 550ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 662ms
clubs-admin:test: 
clubs-admin:test:  Test Files  68 passed (68)
clubs-admin:test:       Tests  1087 passed (1087)
clubs-admin:test:    Start at  20:28:33
clubs-admin:test:    Duration  44.68s (tests 70%, environment 12%, transform 8%, import 7%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  68 workers spawned · ~901ms startup each (spawn + environment, per file)
clubs-admin:test:              at least ~2.70s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    32 successful, 32 total
Cached:    16 cached, 32 total
  Time:    1m20.151s 

```

### `pnpm exec turbo run lint typecheck --concurrency=3`

Exit: 0. Complete output: `access-static-final2.txt`.

```text
@agilityhub/i18n:typecheck: 
@agilityhub/course-ui:typecheck: cache hit, replaying logs 2840f4612b73c660
@agilityhub/course-ui:typecheck: 
@agilityhub/course-ui:typecheck: > @agilityhub/course-ui@0.0.1 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/course-ui
@agilityhub/course-ui:typecheck: > tsc --noEmit
@agilityhub/course-ui:typecheck: 
@agilityhub/api-client:typecheck: cache hit, replaying logs 4d9f2cfff4b38a42
@agilityhub/api-client:typecheck: 
@agilityhub/api-client:typecheck: > @agilityhub/api-client@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client
@agilityhub/api-client:typecheck: > tsc --noEmit
@agilityhub/api-client:typecheck: 
@agilityhub/auth:typecheck: cache hit, replaying logs 6a6ffa8790d46c2c
@agilityhub/auth:typecheck: 
@agilityhub/auth:typecheck: > @agilityhub/auth@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/auth
@agilityhub/auth:typecheck: > tsc --noEmit
@agilityhub/auth:typecheck: 
clubs-admin:typecheck: cache miss, executing 890a58310b172e5c
clubs:typecheck: cache hit, replaying logs abe5108949d76bcd
clubs:typecheck: 
clubs:typecheck: > clubs@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs
clubs:typecheck: > tsc --noEmit
clubs:typecheck: 
id:typecheck: cache hit, replaying logs 7c349837cf855ec2
id:typecheck: 
id:typecheck: > id@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/id
id:typecheck: > tsc --noEmit
id:typecheck: 
clubs-admin:lint: 
clubs-admin:lint: > clubs-admin@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin
clubs-admin:lint: > eslint . --max-warnings 0 --config ../../eslint.config.mjs
clubs-admin:lint: 
clubs-admin:typecheck: 
clubs-admin:typecheck: > clubs-admin@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin
clubs-admin:typecheck: > tsc --noEmit
clubs-admin:typecheck: 

 Tasks:    22 successful, 22 total
Cached:    20 cached, 22 total
  Time:    31.361s 

```

### `pnpm i18n:check`

Exit: 0. Complete output: `access-i18n-final.txt`.

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5181 keys
es: 5181 keys
en: 5181 keys
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

### `VITE_MOCK=0 VITE_EMAIL_LOGIN_ENABLED=false VITE_PLATFORM_BRAND_NAME='Club Agility Cànic' VITE_LEARN_ENABLED=false pnpm exec turbo run build --env-mode=loose --concurrency=3 --force`

Exit: 0. Complete output: `access-build.txt`.

```text
clubs-admin:build: dist/assets/instructor-CpdiqaXy.js                          9.72 kB │ gzip:   3.55 kB
clubs-admin:build: dist/assets/instructor-8JG2zFvJ.js                          9.85 kB │ gzip:   3.57 kB
clubs-admin:build: dist/assets/admin-billing-CZFSME4s.js                      10.24 kB │ gzip:   3.63 kB
clubs-admin:build: dist/assets/admin-billing-DCRzb_Gs.js                      10.45 kB │ gzip:   3.96 kB
clubs-admin:build: dist/assets/enums-CWQyt4Yf.js                              10.50 kB │ gzip:   4.36 kB
clubs-admin:build: dist/assets/admin-billing-BYH6Z6c6.js                      10.66 kB │ gzip:   4.00 kB
clubs-admin:build: dist/assets/enums-BXPvt30r.js                              10.87 kB │ gzip:   4.57 kB
clubs-admin:build: dist/assets/enums-CfRepzh0.js                              10.93 kB │ gzip:   4.57 kB
clubs-admin:build: dist/assets/admin-courses-Ck0h_Li2.js                      12.87 kB │ gzip:   4.91 kB
clubs-admin:build: dist/assets/admin-courses-DuWn-ntx.js                      13.75 kB │ gzip:   5.24 kB
clubs-admin:build: dist/assets/admin-courses-CqAy07HT.js                      14.07 kB │ gzip:   5.28 kB
clubs-admin:build: dist/assets/admin-census-DaAP5dqK.js                       19.90 kB │ gzip:   7.29 kB
clubs-admin:build: dist/assets/console-y2Qd044H.js                            20.25 kB │ gzip:   7.94 kB
clubs-admin:build: dist/assets/admin-census-CPFHe1al.js                       21.10 kB │ gzip:   7.87 kB
clubs-admin:build: dist/assets/console-itJKmAP_.js                            21.48 kB │ gzip:   8.63 kB
clubs-admin:build: dist/assets/admin-census-D9k4hbbc.js                       21.62 kB │ gzip:   7.94 kB
clubs-admin:build: dist/assets/errors-DLyAknxo.js                             21.99 kB │ gzip:   7.18 kB
clubs-admin:build: dist/assets/console-CghUU9LZ.js                            22.15 kB │ gzip:   8.73 kB
clubs-admin:build: dist/assets/errors-DkLdTdjL.js                             23.25 kB │ gzip:   7.55 kB
clubs-admin:build: dist/assets/errors-BxXLPi5_.js                             23.29 kB │ gzip:   7.54 kB
clubs-admin:build: dist/assets/admin-settings-BTQHDijY.js                     27.29 kB │ gzip:   9.18 kB
clubs-admin:build: dist/assets/admin-settings-DYgN7vJr.js                     29.47 kB │ gzip:   9.94 kB
clubs-admin:build: dist/assets/admin-settings-BG1q3P23.js                     30.05 kB │ gzip:   9.99 kB
clubs-admin:build: dist/assets/ConsolePage-DgjZs-4E.js                       116.95 kB │ gzip:  27.87 kB
clubs-admin:build: dist/assets/list-helpers-BjMPhWxo.js                      225.00 kB │ gzip:  69.96 kB
clubs-admin:build: dist/assets/CoursesRoute-CK-tzm1s.js                      231.56 kB │ gzip:  64.11 kB
clubs-admin:build: dist/assets/CourseViewer3D-B9MlWsCN.js                    582.83 kB │ gzip: 151.71 kB
clubs-admin:build: dist/assets/index-CgD8l2jQ.js                           1,099.63 kB │ gzip: 373.02 kB
clubs-admin:build: 
clubs-admin:build: [plugin builtin:vite-reporter] 
clubs-admin:build: (!) Some chunks are larger than 500 kB after minification. Consider:
clubs-admin:build: - Using dynamic import() to code-split the application
clubs-admin:build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
clubs-admin:build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
clubs-admin:build: ✓ built in 984ms

 Tasks:    6 successful, 6 total
Cached:    0 cached, 6 total
  Time:    32.782s 

```

### `pnpm size-limit`

Exit: 0. Complete output: `access-size.txt`.

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       312.94 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.86 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       445 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 675 kB
  Size:       673.46 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.16 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.8 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       101.99 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       132.06 kB gzipped
  
```

### `pnpm typecheck:e2e-core`

Exit: 0. Complete output: `access-e2e-types.txt`.

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

### `pnpm exec prettier --check <all changed source files from git diff --name-only>`

Exit: 0. Complete output: `access-format-final.txt`.

```text
Checking formatting...
All matched files use Prettier code style!
```
