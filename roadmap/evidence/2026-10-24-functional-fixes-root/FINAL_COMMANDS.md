# Final command evidence

Commands run in `/Users/jordib/dev/agilityhub/agilityhub-core-web`. Heavy executions use the shared host lock; their full logs and input manifests are retained beside this file. API and the other browser lanes retain their own command appendices.

## 40-final-ci

```sh
corepack pnpm turbo run lint typecheck test build --force
```

Exit: 0. Inputs: 946, unchanged. Full output: [40-final-ci.log](40-final-ci.log).

```text
clubs-admin:test:      ✓ E8-W04 6b: a drawer payment drops a selected receipt even when the Pendents filter removes its row 520ms
clubs-admin:test:    ✓ T-12-25 the receipt drawer: the actions each state allows (R-12-16…R-12-20) (6)
clubs-admin:test:      ✓ T-12-25: PENDING cash, COLLECTING and FAILED direct debits, a PAID and a CANCELLED receipt 1818ms
clubs-admin:test:      ✓ T-12-25: [Marca cobrat] sends the paid date, the channel and the receipt's version; the drawer and the list read PAID 815ms
clubs-admin:test:      ✓ T-12-25: 409 STALE_VERSION reads «El rebut ha canviat. Torna a obrir-lo.» in the drawer and the receipt is read again 669ms
clubs-admin:test:      ✓ E8-W01 round 2 #6: a failed drawer refetch stays beside the cached receipt, unlocks its actions and recovers through [Torna-ho a provar] 715ms
clubs-admin:test:      ✓ T-12-25: [Descarrega el justificant] opens the PDF in a new tab without parsing it 527ms
clubs-admin:test:    ✓ T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28) (3)
clubs-admin:test:      ✓ T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES] 491ms
clubs-admin:test:      ✓ T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance 767ms
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 6292ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 695ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 523ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5472ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5384ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 638ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 499ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 668ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 689ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 820ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 549ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 664ms
clubs-admin:test: 
clubs-admin:test:  Test Files  68 passed (68)
clubs-admin:test:       Tests  1086 passed (1086)
clubs-admin:test:    Start at  09:37:01
clubs-admin:test:    Duration  62.33s (tests 68%, environment 13%, transform 10%, import 5%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  68 workers spawned · ~1.46s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~4.38s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    0 cached, 38 total
  Time:    1m35.878s 

```

## 41-full-browser-final

```sh
corepack pnpm e2e:docker 2026-10-26-functional-fixes-final-r3 --capture-task=2026-10-26-functional-fixes-final-r3 --trace=off
```

Exit: 0. Inputs: 946, unchanged. Full output: [41-full-browser-final.log](41-full-browser-final.log).

```text
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-importa-375-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/50-user-menu-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/22-D6-rollback-file-not-sent-375.png
evidence: 2026-10-26-functional-fixes-final-r3/50-28-id-document-es-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-calendar-selected-375.json
evidence: 2026-10-26-functional-fixes-final-r3/50-21-empty-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-dashboard-768.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-sessio-muntatge-375-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-biblioteca-375-light.png
evidence: 2026-10-26-functional-fixes-final-r3/22-D6-rollback-file-not-sent-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-importa-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-import-768.json
evidence: 2026-10-26-functional-fixes-final-r3/r2-course-ui-harness-1280-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-biblioteca-1280-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/50-03b-admin-landing-375.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-10-avui-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-recorregut-2d-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-import-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D16-geometria-375-light.png
evidence: 2026-10-26-functional-fixes-final-r3/62-D6-submission-due-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-member-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-visor-instructor-2d-375-light.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-registra-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-billing-menu-0-1280.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D4-recorregut-previst-375-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-billing-menu-0-1280.json
evidence: 2026-10-26-functional-fixes-final-r3/admin-D18-col-locacio-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-23-visio-global-1280-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D16-geometria-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-visor-instructor-3d-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/07-espera-375.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-billing-menu-1-1280.json
evidence: 2026-10-26-functional-fixes-final-r3/admin-D12-agenda-muntatges-375-light.png
evidence: 2026-10-26-functional-fixes-final-r3/r2-course-ui-harness-1280-after-nudge.png
evidence: 2026-10-26-functional-fixes-final-r3/admin-D7-col-locacions-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: 2026-10-26-functional-fixes-final-r3/clubs-visor-alumne-1280-dark.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-create-menu-768.json
evidence: 2026-10-26-functional-fixes-final-r3/23-D10-next-invoice-row-375.png
evidence: 2026-10-26-functional-fixes-final-r3/responsive-admin-import-768.png
```

## 43-final-bundle-size

```sh
corepack pnpm size
```

Exit: 0. Inputs: 946, unchanged. Full output: [43-final-bundle-size.log](43-final-bundle-size.log).

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       312.98 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.86 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       444.85 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 675 kB
  Size:       673.49 kB gzipped
  
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
  Size:       102.05 kB gzipped
  
  id all JavaScript
  Size limit: 310 kB
  Size:       132.22 kB gzipped
  
```

## 44-final-literals

```sh
node scripts/qa-literals.mjs --check
```

Exit: 0. Inputs: 946, unchanged. Full output: [44-final-literals.log](44-final-literals.log).

```text
docs/qa/LITERALS_QA.md is up to date
```

## 45-final-format

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-root/check-changed-format.py
```

Exit: 0. Inputs: 946, unchanged. Full output: [45-final-format.log](45-final-format.log).

```text
Checking formatting...
All matched files use Prettier code style!
```

## 29-i18n-postfix

```sh
corepack pnpm i18n:check
```

Exit: 0. Inputs: 945, unchanged. Full output: [29-i18n-postfix.log](29-i18n-postfix.log).

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5182 keys
es: 5182 keys
en: 5182 keys
4003 statically used keys, 0 unused
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

## core-e1-r3

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-root-e1-r3 pnpm e2e:core 2026-10-24-functional-fixes-root/core-e1-r3 'e1-core.spec.ts --trace=off'
```

Exit: 0. Inputs: 946, unchanged. Full output: [core-e1-r3.log](core-e1-r3.log).

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
Done in 4.7s using pnpm v9.15.9
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


Running 8 tests using 1 worker

[1/8] e2e/core/e1-core.spec.ts:157:5 › T-01-18 password login reaches the seeded account
[2/8] e2e/core/e1-core.spec.ts:194:5 › T-11-11 E11-W06 W1 · a member screen opened signed out is the one the password login opens
[3/8] e2e/core/e1-core.spec.ts:219:5 › T-01-21 seeded administrator opens the real backoffice
[4/8] e2e/core/e1-core.spec.ts:239:5 › T-01-20 club session is restored by the core
[5/8] e2e/core/e1-core.spec.ts:262:5 › T-01-19 magic link is delivered and exchanged end to end
[6/8] e2e/core/e1-core.spec.ts:284:5 › T-01-26 published seed enters without pending onboarding
[7/8] e2e/core/e1-core.spec.ts:294:5 › T-01-22 apps/id resumes a real authorize flow through oauth2/session
[8/8] e2e/core/e1-core.spec.ts:401:5 › T-02-07 E3-W12 step 5 · the public footer of 01 shows /branding's identity and registered office (S02 R-02-02)
  8 passed (12.7s)
```

## core-e4w16-r2

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-root-e4w16-r2 pnpm e2e:core 2026-10-24-functional-fixes-root/core-e4w16-r2 'e4w16-core.spec.ts --trace=off'
```

Exit: 0. Inputs: 946, unchanged. Full output: [core-e4w16-r2.log](core-e4w16-r2.log).

```text
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
Done in 4.1s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:389) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 5 tests using 1 worker

[1/5] e2e/core/e4w16-core.spec.ts:231:5 › T-03-40 E4-W16 step 11 · screen 13 lists the task rows, the done ones struck through
[2/5] e2e/core/e4w16-core.spec.ts:352:5 › T-01-19 E4-W16 step 10 · a RESET link sets the new password once without `current`
[3/5] e2e/core/e4w16-core.spec.ts:434:5 › T-01-11 E4-W16 step 1 · «Entra com l'abonat» opens the club app through the one-time code, once; E5-W05 step 24 · its banner names the member record, not the account
[4/5] e2e/core/e4w16-core.spec.ts:639:5 › T-14-26 E4-W16 step 5 · a READY export downloads from the drawer through GET /exports/{id} and the bearer
[5/5] e2e/core/e4w16-core.spec.ts:694:5 › T-03-34 (front) E4-W16 step 7 · D10 keeps the block, «Inactivitat», «Baixa» and the audit whatever BILLING says
  5 passed (14.6s)
```

## core-e9-r2

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-root-e9-r2 pnpm e2e:core 2026-10-24-functional-fixes-root/core-e9-r2 'e9-core.spec.ts --trace=off'
```

Exit: 0. Inputs: 946, unchanged. Full output: [core-e9-r2.log](core-e9-r2.log).

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
Done in 4.2s using pnpm v9.15.9

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

Running 3 tests using 1 worker

[1/3] e2e/core/e9-core.spec.ts:451:5 › E9-W04 · T-16-16 against the core: the member's viewer, registering, and a build session on two phones (R-16-09, R-16-07, R-16-11) @critical-muntatge
[2/3] e2e/core/e9-core.spec.ts:636:5 › E9-W05 · T-16-15 against the core: D18's library and import wizard, the course page, the placement editor, the stored build sheet and «Registra-ho com a muntat» (R-16-02, R-16-05, R-16-10, R-16-07) @critical-muntatge
[3/3] e2e/core/e9-core.spec.ts:1268:5 › E9-W05 · T-16-16 against the core: a planned placement built from 07 on the phone, joined from a ring with no setup (R-16-13, R-16-11, WP-16-F′) @critical-muntatge
  3 passed (20.3s)
```

## core-e10-r2

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-root-e10-r2 pnpm e2e:core 2026-10-24-functional-fixes-root/core-e10-r2 'e10-core.spec.ts --trace=off'
```

Exit: 0. Inputs: 946, unchanged. Full output: [core-e10-r2.log](core-e10-r2.log).

```text
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 3.9s using pnpm v9.15.9
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

[WebServer] (node:582) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:677) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:772) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 6 tests using 1 worker

[1/6] e2e/core/e10-core.spec.ts:309:5 › R-17-09 · the platform account gives a club admin AGILITYHUB_ADMIN through the api (PUT /platform/accounts/{id}/platform-roles)
[2/6] e2e/core/e10-core.spec.ts:329:5 › E10-W02 · the console's entry: the product host's branding and boot, the platform account signed in on the ID host, its card and its token on the product host (S17 §2, R-01-17, T-17-12)
[3/6] e2e/core/e10-core.spec.ts:453:5 › E11-W08 · the platform account signs in to the console on the product host (password and magic link) and lands on D19; an account without the platform role gets 403 PLATFORM_ONLY (S17 §2 «Entrada», S01 R-01-02, ruling E157)
[4/6] e2e/core/e10-core.spec.ts:577:5 › E10-W01 · D19 against the core: the list, the Identitat tab and the «Nou club» wizard (T-17-12)
[5/6] e2e/core/e10-core.spec.ts:725:5 › E10-W03 · «Dominis» (positive and negative fake DNS, the primary choice, /branding before and after), allowed host and support access against the core (T-17-03, T-17-12, T-17-09)
[6/6] e2e/core/e10-core.spec.ts:1171:5 › E10-W02 · a second club in under an hour: the manual script, step by step against the core, with its times (T-17-12)
  6 passed (39.3s)
```

## core-auth-r2

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-root-auth-r2 pnpm e2e:core 2026-10-24-functional-fixes-root/core-auth-r2 'functional-auth.spec.ts --trace=off'
```

Exit: 0. Inputs: 946, unchanged. Full output: [core-auth-r2.log](core-auth-r2.log).

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
Done in 4.1s using pnpm v9.15.9
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

[1/3] e2e/core/functional-auth.spec.ts:54:5 › T-01-04 R-01-06 functional: three real browser tabs restore and rotate twice without revoking the family
[2/3] e2e/core/functional-auth.spec.ts:105:5 › T-01-04 T-01-22 functional: logout invalidates the shared family and another tab cannot restore it
[3/3] e2e/core/functional-auth.spec.ts:154:5 › T-01-20 functional: one transient refresh503 preserves the route and recovers without another login
  3 passed (13.3s)
```

The i18n check ran before the additional booking test file (945 inputs). The subsequently changed files are unrelated to translations or its validator; the final CI gate tests the same translation sources. The 946-input manifest covers these complete CI/mock-browser gates and earlier passing real-browser groups. E3-r5/E6/E7 use948 inputs after the three-file test-runner readiness correction (48-harness-only-delta.json). E8-r3 uses the final948-input manifest54 after the single E8 passwordless-owner fixture correction (54-e8-fixture-delta.json). Application code and API image remain identical; E8 preserves all financial, locale and permission assertions while using the supported login method of its selected owner. The six additional readiness-helper tests are recorded separately in the web lane.
