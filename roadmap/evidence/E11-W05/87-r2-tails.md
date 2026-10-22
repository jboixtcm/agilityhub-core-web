##### `80-r2-lint.log` (last 40 of 70 lines)
```
id:lint: > eslint . --max-warnings 0 --config ../../eslint.config.mjs
id:lint: 
@agilityhub/course-core:lint: cache hit, replaying logs 983b4c192821f2d7
@agilityhub/course-core:lint: 
@agilityhub/course-core:lint: > @agilityhub/course-core@0.0.1 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/course-core
@agilityhub/course-core:lint: > eslint src tests --max-warnings 0 --config ../../eslint.config.mjs
@agilityhub/course-core:lint: 
@agilityhub/i18n:lint: 
@agilityhub/i18n:lint: > @agilityhub/i18n@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/i18n
@agilityhub/i18n:lint: > eslint src --max-warnings 0 --config ../../eslint.config.mjs
@agilityhub/i18n:lint: 
clubs:lint: 
clubs:lint: > clubs@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/apps/clubs
clubs:lint: > eslint . --max-warnings 0 --config ../../eslint.config.mjs
clubs:lint: 
@agilityhub/ui:lint: 
@agilityhub/ui:lint: > @agilityhub/ui@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/ui
@agilityhub/ui:lint: > eslint src --max-warnings 0 --config ../../eslint.config.mjs
@agilityhub/ui:lint: 
@agilityhub/api-client:lint: 
@agilityhub/api-client:lint: > @agilityhub/api-client@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/api-client
@agilityhub/api-client:lint: > eslint src --ignore-pattern src/generated/** --max-warnings 0 --config ../../eslint.config.mjs
@agilityhub/api-client:lint: 
@agilityhub/auth:lint: 
@agilityhub/auth:lint: > @agilityhub/auth@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/auth
@agilityhub/auth:lint: > eslint src --max-warnings 0 --config ../../eslint.config.mjs
@agilityhub/auth:lint: 
clubs-admin:lint: 
clubs-admin:lint: > clubs-admin@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/apps/clubs-admin
clubs-admin:lint: > eslint . --max-warnings 0 --config ../../eslint.config.mjs
clubs-admin:lint: 
@agilityhub/course-ui:lint: 
@agilityhub/course-ui:lint: > @agilityhub/course-ui@0.0.1 lint /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/course-ui
@agilityhub/course-ui:lint: > eslint src tests harness e2e playwright.config.ts vite.harness.config.ts --max-warnings 0 --config ../../eslint.config.mjs
@agilityhub/course-ui:lint: 

 Tasks:    11 successful, 11 total
Cached:    4 cached, 11 total
  Time:    27.303s 

```

##### `81-r2-typecheck.log` (last 40 of 70 lines)
```
@agilityhub/i18n:typecheck: cache miss, executing 283149b191c99553
@agilityhub/i18n:typecheck: 
@agilityhub/i18n:typecheck: > @agilityhub/i18n@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/i18n
@agilityhub/i18n:typecheck: > tsc --noEmit
@agilityhub/i18n:typecheck: 
@agilityhub/course-ui:typecheck: cache miss, executing e00b9ae911dbce98
@agilityhub/course-ui:typecheck: 
@agilityhub/course-ui:typecheck: > @agilityhub/course-ui@0.0.1 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/course-ui
@agilityhub/course-ui:typecheck: > tsc --noEmit
@agilityhub/course-ui:typecheck: 
@agilityhub/api-client:typecheck: cache miss, executing d8bc32591607d54b
@agilityhub/api-client:typecheck: 
@agilityhub/api-client:typecheck: > @agilityhub/api-client@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/api-client
@agilityhub/api-client:typecheck: > tsc --noEmit
@agilityhub/api-client:typecheck: 
@agilityhub/auth:typecheck: cache miss, executing d98a11990da9e279
@agilityhub/auth:typecheck: 
@agilityhub/auth:typecheck: > @agilityhub/auth@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/packages/auth
@agilityhub/auth:typecheck: > tsc --noEmit
@agilityhub/auth:typecheck: 
clubs-admin:typecheck: cache miss, executing e133b0fb2ce2ac0c
clubs:typecheck: cache miss, executing 356d0998c4a3e026
id:typecheck: cache miss, executing 12939f78dd005dba
id:typecheck: 
id:typecheck: > id@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/apps/id
id:typecheck: > tsc --noEmit
id:typecheck: 
clubs:typecheck: 
clubs:typecheck: > clubs@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/apps/clubs
clubs:typecheck: > tsc --noEmit
clubs:typecheck: 
clubs-admin:typecheck: 
clubs-admin:typecheck: > clubs-admin@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web-c/apps/clubs-admin
clubs-admin:typecheck: > tsc --noEmit
clubs-admin:typecheck: 

 Tasks:    11 successful, 11 total
Cached:    3 cached, 11 total
  Time:    19.143s 

```

##### `82-r2-i18n-check.log` (last 40 of 34 lines)
```

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web-c
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5176 keys
es: 5176 keys
en: 5176 keys
4000 statically used keys, 0 unused
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

##### `83-r2-test.log` (last 40 of 2003 lines)
```
clubs-admin:test:      ✓ E8-W04 6b: a drawer payment drops a selected receipt even when the Pendents filter removes its row 396ms
clubs-admin:test:    ✓ T-12-25 the receipt drawer: the actions each state allows (R-12-16…R-12-20) (6)
clubs-admin:test:      ✓ T-12-25: PENDING cash, COLLECTING and FAILED direct debits, a PAID and a CANCELLED receipt 906ms
clubs-admin:test:      ✓ T-12-25: [Marca cobrat] sends the paid date, the channel and the receipt's version; the drawer and the list read PAID 422ms
clubs-admin:test:      ✓ T-12-25: 409 STALE_VERSION reads «El rebut ha canviat. Torna a obrir-lo.» in the drawer and the receipt is read again 361ms
clubs-admin:test:      ✓ E8-W01 round 2 #6: a failed drawer refetch stays beside the cached receipt, unlocks its actions and recovers through [Torna-ho a provar] 367ms
clubs-admin:test:      ✓ T-12-25: [Descarrega el justificant] opens the PDF in a new tab without parsing it 308ms
clubs-admin:test:    ✓ T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28) (3)
clubs-admin:test:      ✓ T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES] 306ms
clubs-admin:test:      ✓ T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance 368ms
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 5958ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 631ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 353ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5431ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5418ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 643ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 527ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 675ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 700ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 805ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 544ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 687ms
clubs-admin:test: 
clubs-admin:test:  Test Files  64 passed (64)
clubs-admin:test:       Tests  1047 passed (1047)
clubs-admin:test:    Start at  08:16:53
clubs-admin:test:    Duration  50.71s (tests 59%, environment 20%, transform 13%, import 5%, setup 4%)
clubs-admin:test: 
clubs-admin:test:     Isolate  64 workers spawned · ~1.71s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~4.74s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    17 successful, 17 total
Cached:    9 cached, 17 total
  Time:    51.228s 

```

##### `84-r2-build.log` (last 40 of 317 lines)
```
clubs-admin:build: dist/assets/instructor-CpdiqaXy.js                          9.72 kB │ gzip:   3.55 kB
clubs-admin:build: dist/assets/instructor-8JG2zFvJ.js                          9.85 kB │ gzip:   3.57 kB
clubs-admin:build: dist/assets/admin-billing-CLyVkSI5.js                      10.17 kB │ gzip:   3.61 kB
clubs-admin:build: dist/assets/admin-billing-Dq6bL_Vf.js                      10.38 kB │ gzip:   3.93 kB
clubs-admin:build: dist/assets/enums-DopLl6s1.js                              10.43 kB │ gzip:   4.34 kB
clubs-admin:build: dist/assets/admin-billing-5Sorj7ha.js                      10.58 kB │ gzip:   3.97 kB
clubs-admin:build: dist/assets/enums-CxnCKcnc.js                              10.79 kB │ gzip:   4.55 kB
clubs-admin:build: dist/assets/enums-CsmP2mhU.js                              10.84 kB │ gzip:   4.54 kB
clubs-admin:build: dist/assets/admin-courses-5_CYUaBP.js                      12.87 kB │ gzip:   4.89 kB
clubs-admin:build: dist/assets/admin-courses-DPAqiOVq.js                      13.72 kB │ gzip:   5.24 kB
clubs-admin:build: dist/assets/admin-courses-n3Oh8PG4.js                      14.03 kB │ gzip:   5.28 kB
clubs-admin:build: dist/assets/admin-census-uqXXpNcQ.js                       19.91 kB │ gzip:   7.29 kB
clubs-admin:build: dist/assets/console-CFxOET8L.js                            20.26 kB │ gzip:   7.95 kB
clubs-admin:build: dist/assets/admin-census-BJkj5Enf.js                       21.09 kB │ gzip:   7.86 kB
clubs-admin:build: dist/assets/console-BBhiAsNg.js                            21.47 kB │ gzip:   8.64 kB
clubs-admin:build: dist/assets/admin-census-B2ONh3EE.js                       21.62 kB │ gzip:   7.94 kB
clubs-admin:build: dist/assets/errors-DLyAknxo.js                             21.99 kB │ gzip:   7.18 kB
clubs-admin:build: dist/assets/console-D-HzZUrn.js                            22.14 kB │ gzip:   8.74 kB
clubs-admin:build: dist/assets/errors-DkLdTdjL.js                             23.25 kB │ gzip:   7.55 kB
clubs-admin:build: dist/assets/errors-BxXLPi5_.js                             23.29 kB │ gzip:   7.54 kB
clubs-admin:build: dist/assets/admin-settings-C2S0yznb.js                     27.24 kB │ gzip:   9.15 kB
clubs-admin:build: dist/assets/admin-settings-KoQZaOjh.js                     29.41 kB │ gzip:   9.91 kB
clubs-admin:build: dist/assets/admin-settings-CaIltuWg.js                     29.99 kB │ gzip:   9.96 kB
clubs-admin:build: dist/assets/ConsolePage-CPXuQBir.js                       116.88 kB │ gzip:  27.83 kB
clubs-admin:build: dist/assets/list-helpers-r7Mjcpc8.js                      224.27 kB │ gzip:  69.69 kB
clubs-admin:build: dist/assets/CoursesRoute-DyvFztTJ.js                      231.03 kB │ gzip:  63.95 kB
clubs-admin:build: dist/assets/CourseViewer3D-B61PCxcH.js                    582.83 kB │ gzip: 151.71 kB
clubs-admin:build: dist/assets/index-CcHW1XrM.js                           1,089.92 kB │ gzip: 370.79 kB
clubs-admin:build: 
clubs-admin:build: ✓ built in 251ms
clubs-admin:build: [plugin builtin:vite-reporter] 
clubs-admin:build: (!) Some chunks are larger than 500 kB after minification. Consider:
clubs-admin:build: - Using dynamic import() to code-split the application
clubs-admin:build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
clubs-admin:build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

 Tasks:    6 successful, 6 total
Cached:    2 cached, 6 total
  Time:    10.327s 

```

##### `85-r2-size.log` (last 40 of 49 lines)
```
  clubs all JavaScript
  Size limit: 420 kB
  Size:       311.47 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.69 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       442.2 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 675 kB
  Size:       670.52 kB gzipped
  
  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63 kB gzipped
  
  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped
  
  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.78 kB gzipped
  
  id initial JavaScript
  Size limit: 110 kB
  Size:       100.82 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       130.99 kB gzipped
  
```

##### `86-r2-e2e-docker.log` (last 40 of 544 lines)
```
clubs:e2e: 
clubs:e2e: > clubs@0.0.0 e2e /work/apps/clubs
clubs:e2e: > playwright test --workers\=4
clubs:e2e: 
clubs:e2e: [WebServer] (node:4816) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs:e2e: 
clubs:e2e: Running 109 tests using 4 workers
clubs:e2e: ······················°°°°°°°°·································°°···············
clubs:e2e: ·····························
clubs:e2e:   10 skipped
clubs:e2e:   99 passed (1.1m)
id:e2e: cache bypass, force executing 368b328a5539e976
id:e2e: 
id:e2e: > id@0.0.0 e2e /work/apps/id
id:e2e: > playwright test --workers\=4
id:e2e: 
id:e2e: 
id:e2e: Running 1 test using 1 worker
id:e2e: ·
id:e2e:   1 passed (3.6s)

 Tasks:    10 successful, 10 total
Cached:    0 cached, 10 total
  Time:    3m29.118s 

evidence: E11-W05/50-D16-ring-bookings-375.png
evidence: E11-W05/50-D5-unlabelled-channel-1280.png
evidence: E11-W05/50-chunk-failure-1280.png
evidence: E11-W05/50-D16-ring-bookings-1280.png
evidence: E11-W05/50-D4-review-0800-375.png
evidence: E11-W05/50-D5-unlabelled-channel-375.png
evidence: E11-W05/50-28-id-document-ca-375.png
evidence: E11-W05/50-28-id-document-ca-1280.png
evidence: E11-W05/50-28-id-document-es-375.png
evidence: E11-W05/50-21-empty-375.png
evidence: E11-W05/50-chunk-failure-375.png
evidence: E11-W05/50-D4-review-0800-1280.png
evidence: E11-W05/50-28-id-document-es-1280.png
evidence: E11-W05/50-21-empty-1280.png
```
