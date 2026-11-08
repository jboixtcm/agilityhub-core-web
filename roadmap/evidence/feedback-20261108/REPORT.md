# Josep feedback — 8 November 2026

Status: locally implemented and validated. No commit, push or deployment.

Source: SOFTWARE_CANIC `Proves/202608-1_Josep.docx`. Direct user request; no existing roadmap task or organizer verification was changed.

Compact usable navigation, distinct icons, direct license editing, separate federation categories, direct administrator leave action, themed family links, and account/tenant/list-scoped browser page-size preferences. Explicit URLs win; default saved views still apply. The preference remains local to each browser.

3,722 Vitest tests and 10 i18n Node tests passed. Browser coverage: all 384 distinct cases passed across the completed member/access/course suites and the final 222-case admin suite. The earlier complete run passed 382 cases and failed a new heading selector plus one WebKit load. The selector now accepts the member count in the heading; the final admin suite uses compiled mock previews, with no timeout or skip changes. Full command results are recorded below. Screenshots cover 1280 px and 375 px.

## `pnpm turbo run lint typecheck test build`

Exit code: 0. Complete output: `web-verified-final.log`.

```text
clubs-admin:test:      ✓ T-12-25: [Descarrega el justificant] opens the PDF in a new tab without parsing it 922ms
clubs-admin:test:    ✓ T-12-32 (D6 half) button 2 and the KPIs follow the club's providers (R-12-28) (3)
clubs-admin:test:      ✓ T-12-32: SEPA_XML + MANUAL (the Cànic) → «2 · GENERA REMESA SEPA (XML)», no card KPI nor [COBRA LES TARGETES] 789ms
clubs-admin:test:      ✓ T-12-32 billingManualOnly: «2 · GENERA ELS REBUTS»; the run issues every receipt by hand and makes no remittance 861ms
clubs-admin:test:      ✓ T-12-32 billingStripe: «2 · GENERA ELS REBUTS I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → 202, the 5 s poll while CHARGING and «impagat (targeta)» 6800ms
clubs-admin:test:    ✓ E8-W01 review follow-ups: where errors land, what the admin sees, what the api decides (14)
clubs-admin:test:      ✓ R-12-07: the run's skipped members are not repeated under the incidents; «Omesos de la generació» lists only the others 463ms
clubs-admin:test:      ✓ R-12-07: [Simula de nou] waits for its simulation and shows its refusal inside the modal (409 BILLING_BUSY) 313ms
clubs-admin:test:      ✓ T-12-25: a selection is counted beside [Marcar cobrat (selecció)], and another chip (other receipts) drops it 466ms
clubs-admin:test:      ✓ R-12-20: a refund over what was paid → 422 REFUND_EXCEEDS_PAID inside the refund modal 308ms
clubs-admin:test:      ✓ R-12-19: 422 CURRENCY_MISMATCH reads inside the manual receipt modal 706ms
clubs-admin:test:      ✓ R-12-26 / E8-W04 round 2: a queued accounting export (202 ACCOUNTING job) is followed in the exports drawer to its download 493ms
clubs-admin:test:      ✓ E8-W01 round 2 #3: a CHARGING period starts bounded monitoring when the first run read fails, shows retry and settles on a later poll 5467ms
clubs-admin:test:      ✓ E8-W04 6b: a CHARGING period refreshes after detail moves GENERATED to COMPLETED 5392ms
clubs-admin:test:      ✓ T-12-25 / R-12-13 / E8-W07 #1: a completed detail refreshes a stale CHARGING period once while its answer is slow 305ms
clubs-admin:test:    ✓ E8-W01 second review (01-10): the manual receipt's member and errors, the earliest collection date, a rolled-back receipt (7)
clubs-admin:test:      ✓ R-12-19: a new search drops the chosen member, so the receipt never goes to a member the list no longer shows 649ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: the manual adjustment search has no ACTIVE filter, shows a LEFT member's display status and creates their receipt 505ms
clubs-admin:test:      ✓ E8-W01 round 2 #2: 409 MEMBER_ERASED is mapped to the manual receipt's member field 670ms
clubs-admin:test:      ✓ R-12-19: the api's 400 on a line's member (lines[0].description) sits on that line, and on includeInNextRun under its checkbox, with no second generic alert 771ms
clubs-admin:test:    ✓ R-12-19 and R-12-26: the manual receipt and the accounting export (2)
clubs-admin:test:      ✓ R-12-19: [Rebut manual] finds the member, sends the lines in minor units, and the api's numbering blocks the rollback (MANUAL_INVOICE_AFTER) 867ms
clubs-admin:test:    ✓ E11-W07 step 6 (R-12-19): the manual receipt's period (2)
clubs-admin:test:      ✓ R-12-19: the period defaults to the page's month, is bounded to three months around the club's month and is sent 551ms
clubs-admin:test:      ✓ R-12-19: the api's 400 {field: period} sits on the month field, with no second alert 639ms
clubs-admin:test:    ✓ programa un descompte recurrent per a dos abonats i permet retirar-lo 943ms
clubs-admin:test: 
clubs-admin:test:  Test Files  69 passed (69)
clubs-admin:test:       Tests  1143 passed (1143)
clubs-admin:test:    Start at  14:04:10
clubs-admin:test:    Duration  82.23s (tests 68%, environment 14%, transform 10%, import 5%, setup 3%)
clubs-admin:test: 
clubs-admin:test:     Isolate  69 workers spawned · ~2.31s startup each (spawn + environment, per file)
clubs-admin:test:              at least ~7.08s faster with isolate: false — reuses workers across files instead of one per file
clubs-admin:test: 

 Tasks:    38 successful, 38 total
Cached:    16 cached, 38 total
  Time:    1m50.126s 

```

## `pnpm i18n:check`

Exit code: 0. Complete output: `i18n-verified.log`.

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5406 keys
es: 5406 keys
en: 5406 keys
4207 statically used keys, 0 unused
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

## `pnpm size`

Exit code: 0. Complete output: `size-verified.log`.

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       324.55 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.86 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       459.33 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 690 kB
  Size:       685.6 kB gzipped
  
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

## `pnpm typecheck:e2e-core`

Exit code: 0. Complete output: `core-types-verified.log`.

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

## `pnpm exec eslint apps/clubs-admin/e2e/feedback-20261108.spec.ts apps/clubs-admin/e2e/feedback-prices-20261105.spec.ts`

Exit code: 0. Complete output: `e2e-lint-verified.log`.

```text

```

## `pnpm --filter clubs-admin exec vitest run src/census/CensusListPage.test.tsx src/billing/BillingPage.test.tsx`

Exit code: 0. Complete output: `preference-regression.log`.

```text

 RUN  v5.0.0 /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/apps/clubs-admin


 Test Files  2 passed (2)
      Tests  83 passed (83)
   Start at  14:02:27
   Duration  56.73s (tests 78%, transform 14%, environment 5%, import 2%, setup 1%)

```

## `python3 roadmap/tools/check.py --render`

Exit code: 0. Complete output: `web-roadmap.log`.

```text
STATUS.md rendered (97 tasks)
```

## `docker exec canic-feedback-20261108 pnpm exec turbo run e2e --concurrency=1 --continue -- --workers=1`

Exit code: 1. Complete output: `browser-verified.log`.

```text
clubs-admin:e2e:     Test timeout of 30000ms exceeded.
clubs-admin:e2e: 
clubs-admin:e2e:     Error: locator.click: Test timeout of 30000ms exceeded.
clubs-admin:e2e:     Call log:
clubs-admin:e2e:       - waiting for getByRole('button', { name: 'Edita Horari d\'obertura', exact: true })
clubs-admin:e2e: 
clubs-admin:e2e: 
clubs-admin:e2e:       121 |     await login(page);
clubs-admin:e2e:       122 |     await page.goto(`${baseUrl}/parametres`);
clubs-admin:e2e:     > 123 |     await page.getByRole("button", { name: "Edita Horari d'obertura", exact: true }).click();
clubs-admin:e2e:           |                                                                                      ^
clubs-admin:e2e:       124 |     const dialog = page.getByRole("dialog");
clubs-admin:e2e:       125 |     await expect(dialog).toBeVisible();
clubs-admin:e2e:       126 |     await capture(page, `hours-${browserName}-${String(width)}.png`);
clubs-admin:e2e:         at /work/apps/clubs-admin/e2e/mobile-review.spec.ts:123:86
clubs-admin:e2e: 
clubs-admin:e2e:     Error Context: ../../test-results/clubs-admin/mobile-review-T-02-14-mobi-c467d-ening-hours-editor-fits-375-webkit-ui/error-context.md
clubs-admin:e2e: 
clubs-admin:e2e:     attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
clubs-admin:e2e:     ../../test-results/clubs-admin/mobile-review-T-02-14-mobi-c467d-ening-hours-editor-fits-375-webkit-ui/trace.zip
clubs-admin:e2e:     Usage:
clubs-admin:e2e: 
clubs-admin:e2e:         pnpm exec playwright show-trace ../../test-results/clubs-admin/mobile-review-T-02-14-mobi-c467d-ening-hours-editor-fits-375-webkit-ui/trace.zip
clubs-admin:e2e: 
clubs-admin:e2e:     ────────────────────────────────────────────────────────────────────────────────────────────────
clubs-admin:e2e: 
clubs-admin:e2e:   2 failed
clubs-admin:e2e:     [chromium] › e2e/feedback-20261108.spec.ts:34:1 › T-03-38 collapsed navigation and persistent list size 
clubs-admin:e2e:     [webkit-ui] › e2e/mobile-review.spec.ts:116:3 › T-02-14 mobile review: opening hours editor fits 375 
clubs-admin:e2e:   220 passed (14.9m)
clubs-admin:e2e:  ELIFECYCLE  Command failed with exit code 1.
clubs-admin#e2e:  WARNING  command finished with error, but continuing...
clubs-admin#e2e:  ERROR  command (/work/apps/clubs-admin) /usr/bin/pnpm run e2e --workers=1 exited (1)

 Tasks:    9 successful, 10 total
Cached:    0 cached, 10 total
  Time:    23m33.74s 
Failed:    clubs-admin#e2e

 ERROR  run failed: command  exited (1)
```

## `VITE_MOCK=1 pnpm --filter clubs exec vite build && VITE_MOCK=1 pnpm --filter clubs-admin exec vite build (Playwright container)`

Exit code: 0. Complete output: `browser-preview-build-final.log`.

```text
dist/assets/enums-5tmQZ5iM.js                               9.59 kB │ gzip:   3.74 kB
dist/assets/admin-scheduling-mRAezlio.js                    9.79 kB │ gzip:   3.56 kB
dist/assets/admin-scheduling-C8jxBiIA.js                    9.82 kB │ gzip:   3.56 kB
dist/assets/enums-D7UN6K9f.js                               9.96 kB │ gzip:   3.98 kB
dist/assets/enums-DBZptYCs.js                              10.02 kB │ gzip:   3.97 kB
dist/assets/instructor-Cy-kNWH7.js                         10.54 kB │ gzip:   3.61 kB
dist/assets/instructor-ZnADTepI.js                         11.12 kB │ gzip:   3.90 kB
dist/assets/instructor-BYvTK6fc.js                         11.27 kB │ gzip:   3.90 kB
dist/assets/admin-billing-B_9zsbB1.js                      11.55 kB │ gzip:   3.94 kB
dist/assets/admin-billing-CEiHb28m.js                      11.81 kB │ gzip:   4.27 kB
dist/assets/admin-billing-CQpvVvFH.js                      12.05 kB │ gzip:   4.33 kB
dist/assets/admin-courses-CZecHWtL.js                      13.27 kB │ gzip:   4.81 kB
dist/assets/admin-courses-ppXzK63q.js                      14.15 kB │ gzip:   5.16 kB
dist/assets/admin-courses-BAo-G3ig.js                      14.47 kB │ gzip:   5.17 kB
dist/assets/errors-BJsGxbPj.js                             14.91 kB │ gzip:   5.02 kB
dist/assets/errors-DJZXerLt.js                             16.18 kB │ gzip:   5.36 kB
dist/assets/errors-BoPU6Kvb.js                             16.22 kB │ gzip:   5.35 kB
dist/assets/console-C3kIcMmm.js                            20.89 kB │ gzip:   7.77 kB
dist/assets/console-D5exOSZl.js                            22.11 kB │ gzip:   8.46 kB
dist/assets/console-DyFH_iOR.js                            22.79 kB │ gzip:   8.55 kB
dist/assets/admin-census-D_th4xDg.js                       24.11 kB │ gzip:   8.34 kB
dist/assets/admin-census-KET95ZTH.js                       25.64 kB │ gzip:   9.07 kB
dist/assets/admin-census-XNo5nLu2.js                       26.12 kB │ gzip:   9.09 kB
dist/assets/admin-settings-C5PIG77M.js                     27.90 kB │ gzip:   9.13 kB
dist/assets/admin-settings-pb4_v07S.js                     30.12 kB │ gzip:   9.88 kB
dist/assets/admin-settings-PQ2A-aKY.js                     30.70 kB │ gzip:   9.91 kB
dist/assets/src-DgZgIURo.js                                91.64 kB │ gzip:  25.74 kB
dist/assets/ConsolePage-CQhNJZw0.js                       116.99 kB │ gzip:  27.87 kB
dist/assets/CoursesRoute-BqBvQFaC.js                      139.79 kB │ gzip:  38.76 kB
dist/assets/list-helpers-B3oxAsqc.js                      233.00 kB │ gzip:  72.62 kB
dist/assets/CourseViewer3D-B57JyCZM.js                    582.83 kB │ gzip: 151.71 kB
dist/assets/browser-Djajw40I.js                         1,019.20 kB │ gzip: 327.51 kB
dist/assets/index-BXT0yhwZ.js                           1,148.45 kB │ gzip: 385.66 kB

[33m[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 413ms[39m
```

## `docker exec -w /work canic-feedback-20261108 pnpm --filter clubs-admin exec playwright test --workers=2 (compiled mock previews on ports 4173/4174)`

Exit code: 0. Complete output: `browser-admin-final.log`.

```text
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:16190) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

Running 222 tests using 2 workers
················································································
················································································
······························································
  222 passed (4.7m)
```

## `docker exec -w /work canic-feedback-20261108 pnpm --filter clubs-admin exec playwright test feedback-20261108.spec.ts --workers=1 --output=/work/test-results/feedback-final`

Exit code: 0. Complete output: `browser-feedback-final.log`.

```text
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:11934) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

Running 3 tests using 1 worker
···
  3 passed (18.7s)
```

## `pnpm exec eslint apps/clubs-admin/e2e/feedback-20261108.spec.ts`

Exit code: 0. Complete output: `e2e-lint-final.log`.

```text

```

## Earlier attempts

An initial full Docker run passed 154/157 member tests and failed three route-heading assertions; the subsequent complete run used one worker and the three failures did not recur. The second complete run recorded a count-sensitive heading selector and a WebKit loading timeout in `browser-verified.log`; final results are in `browser-admin-final.log`. The targeted feedback run initially selected a mock dog without licences; selecting the licensed fixture fixed that test. A saved-view regression initially selected an unsupported test page size; corrected to the supported value. No assertions were skipped or timeouts relaxed. Logs: `earlier-browser-all.log`, `earlier-browser-feedback.log`, `earlier-web-verified.log`. Earlier compile/lint attempts corrected test prop/import types, a nullable session guard and the expected Actions list; logs: `earlier-web-checks.log`, `earlier-web-checks-2.log`, `earlier-web-checks-3.log`, `earlier-web-checks-4.log`.
