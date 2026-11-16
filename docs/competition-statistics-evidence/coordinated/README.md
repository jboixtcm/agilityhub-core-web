# Coordinated web validation

These results cover the integrated tree from release commit 2b0775b, also merged as ff0d4b2, with the subsequent CI-only time allowance at 33b684a (main 13f04dda). They include the separate Info/Profile and mobile booking agents’ changes; the feature branch itself remains focused on statistics. This is local validation, not a production or complete official CI acceptance claim.

The initial Docker installation failed with a Corepack network socket error before any test ran. A new attempt completed every project. The full local run had nine visibility/navigation timeouts; the focused recheck passed every affected case. Official main CI with unchanged assertions remains the deployment gate. The first main run hit the 45-minute total job limit; the final candidate allows 75 minutes.

Screenshots show fictional fixtures, with Profile checked at 375 and 1280 pixels and the booking list at 375. The complete run also passed all mobile booking scenarios. The workflow wrapper is retained as `run-integrated-e2e.sh`; source roots are specific to this execution workspace.

## web-integrated-final.log

Command: `pnpm turbo run lint typecheck test build --concurrency=1`

Exit: 0. 38 tasks; 4,069 tests in 256 files. Complete output: [web-integrated-final.log](web-integrated-final.log).

Last 40 lines:

```text
id:build: > tsc --noEmit && vite build
id:build:
id:build: vite v8.2.2 building client environment for production...
id:build: transforming...
id:build: ✓ 275 modules transformed.
id:build: rendering chunks...
id:build: computing gzip size...
id:build: dist/robots.txt                                           0.02 kB │ gzip:   0.04 kB
id:build: dist/version.json                                         0.03 kB │ gzip:   0.05 kB
id:build: dist/content-security-policy.txt                          0.17 kB │ gzip:   0.12 kB
id:build: dist/favicon.svg                                          0.43 kB │ gzip:   0.27 kB
id:build: dist/index.html                                           0.45 kB │ gzip:   0.29 kB
id:build: dist/assets/sprite-CB0BjrsS.svg                           8.35 kB │ gzip:   1.97 kB
id:build: dist/assets/montserrat-latin-600-normal-UVxSCcoG.woff2   18.68 kB
id:build: dist/assets/montserrat-latin-500-normal-DRFEGfly.woff2   18.74 kB
id:build: dist/assets/montserrat-latin-400-normal-BLhwKU8k.woff2   18.78 kB
id:build: dist/assets/montserrat-latin-700-normal-BdjcYUrC.woff2   18.82 kB
id:build: dist/assets/montserrat-latin-600-normal-CdhFl4lI.woff    20.54 kB
id:build: dist/assets/montserrat-latin-500-normal-Dok2oTci.woff    20.60 kB
id:build: dist/assets/montserrat-latin-400-normal-xItZbAXg.woff    20.64 kB
id:build: dist/assets/montserrat-latin-700-normal-BWkrl476.woff    20.67 kB
id:build: dist/assets/index-CI3yuPkm.css                           58.78 kB │ gzip:  10.59 kB
id:build: dist/assets/id-CJRZp3mw.js                                3.27 kB │ gzip:   1.43 kB
id:build: dist/assets/id-BJYjKe-T.js                                3.45 kB │ gzip:   1.58 kB
id:build: dist/assets/id-DjSSeJdO.js                                3.52 kB │ gzip:   1.59 kB
id:build: dist/assets/common-B1j-oU_u.js                            3.59 kB │ gzip:   1.66 kB
id:build: dist/assets/common-n9mbifgF.js                            3.73 kB │ gzip:   1.82 kB
id:build: dist/assets/common-CcELndgu.js                            3.82 kB │ gzip:   1.85 kB
id:build: dist/assets/errors-DbO3skLp.js                           22.27 kB │ gzip:   7.29 kB
id:build: dist/assets/errors-DjchtCZd.js                           23.57 kB │ gzip:   7.69 kB
id:build: dist/assets/errors-CWUelEMY.js                           23.60 kB │ gzip:   7.66 kB
id:build: dist/assets/PrivacyPage-CUTY7F5Q.js                      33.69 kB │ gzip:  12.12 kB
id:build: dist/assets/index-huxx8Oty.js                           346.56 kB │ gzip: 106.55 kB
id:build:
id:build: ✓ built in 174ms

 Tasks:    38 successful, 38 total
Cached:    17 cached, 38 total
  Time:    4m10.227s

```

## web-i18n.log

Command: `pnpm i18n:check`

Exit: 0. Locale parity and unused-key checks passed. Complete output: [web-i18n.log](web-i18n.log).

Last 40 lines:

```text

> agilityhub-core-web@1.0.0 i18n:check /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/implementation/joint-release-20261115/web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5691 keys
es: 5691 keys
en: 5691 keys
4467 statically used keys, 0 unused
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

## web-integrated-e2e.log

Command: `bash /tmp/joint-e2e-all.sh joint-release-20261115 --capture-task=joint-release-20261115 --workers=2`

Exit: 1. 430 cases executed; 421 passed and nine visibility/navigation timeouts. Complete output: [web-integrated-e2e.log](web-integrated-e2e.log).

Last 40 lines:

```text
evidence: joint-release-20261115/student-list-webkit-light-1280.png
evidence: joint-release-20261115/member-confirm-375-dark.png
evidence: joint-release-20261115/responsive-admin-billing-menu-0-1280.png
evidence: joint-release-20261115/admin-D4-recorregut-previst-375-dark.png
evidence: joint-release-20261115/history-chromium-light-1280.png
evidence: joint-release-20261115/admin-dashboard-1280-light.png
evidence: joint-release-20261115/responsive-admin-billing-menu-0-1280.json
evidence: joint-release-20261115/agenda-selected-chromium-1920.png
evidence: joint-release-20261115/admin-D18-col-locacio-1280-light.png
evidence: joint-release-20261115/clubs-23-visio-global-1280-dark.png
evidence: joint-release-20261115/hours-chromium-375.png
evidence: joint-release-20261115/admin-D16-geometria-1280-light.png
evidence: joint-release-20261115/06-confirmada-tornar-inici-375.png
evidence: joint-release-20261115/donut-chromium-dark-1280-recent.png
evidence: joint-release-20261115/risk-webkit-dark-1280.png
evidence: joint-release-20261115/header-chromium-768.png
evidence: joint-release-20261115/clubs-visor-instructor-3d-1280-light.png
evidence: joint-release-20261115/word-dogs-chromium-375.png
evidence: joint-release-20261115/07-espera-375.png
evidence: joint-release-20261115/member-confirm-768-dark.png
evidence: joint-release-20261115/responsive-admin-billing-menu-1-1280.json
evidence: joint-release-20261115/admin-D12-agenda-muntatges-375-light.png
evidence: joint-release-20261115/student-grid-chromium-dark-1280.png
evidence: joint-release-20261115/hours-chromium-320.png
evidence: joint-release-20261115/feedback2-student-webkit-dark.png
evidence: joint-release-20261115/risk-chromium-light-768.png
evidence: joint-release-20261115/r2-course-ui-harness-1280-after-nudge.png
evidence: joint-release-20261115/user-menu-webkit-320.png
evidence: joint-release-20261115/header-chromium-390.png
evidence: joint-release-20261115/word-inactivity-chromium-1512.png
evidence: joint-release-20261115/admin-D7-col-locacions-1280-light.png
evidence: joint-release-20261115/member-today-768-light.png
evidence: joint-release-20261115/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: joint-release-20261115/clubs-visor-alumne-1280-dark.png
evidence: joint-release-20261115/info-faq-webkit-ui-375-dark.png
evidence: joint-release-20261115/profile-webkit-ui-1280-light.png
evidence: joint-release-20261115/responsive-admin-create-menu-768.json
evidence: joint-release-20261115/23-D10-next-invoice-row-375.png
evidence: joint-release-20261115/member-today-375-light.png
evidence: joint-release-20261115/responsive-admin-import-768.png
```

## web-timeout-recheck.log

Command: `bash /tmp/joint-e2e-all.sh joint-release-recheck-20261115 --capture-task=joint-release-recheck-20261115 --workers=1 --pass-with-no-tests '--grep=T-16-15|captures inactivity, leave, payment and plan states at 1280|mobile review: census actions and settings remain usable|student grid: view preference and search light|renames and retires a template at 375|mobile review: readable admin header 768|UI closure instructor attendance is readable 1920|Profile information fits 412px in light'`

Exit: 0. 18 selected cases passed, including every case that failed in the full run. No assertion or per-test timeout changes. Complete output: [web-timeout-recheck.log](web-timeout-recheck.log).

Last 40 lines:

```text
evidence: joint-release-recheck-20261115/admin-D7-col-locacions-375-light.png
evidence: joint-release-recheck-20261115/admin-D16-geometria-1280-dark.png
evidence: joint-release-recheck-20261115/admin-D18-registra-375-light.png
evidence: joint-release-recheck-20261115/student-list-chromium-light-375.png
evidence: joint-release-recheck-20261115/student-grid-chromium-light-375.png
evidence: joint-release-recheck-20261115/add-dog-bottom-webkit-375.png
evidence: joint-release-recheck-20261115/user-menu-webkit-768.png
evidence: joint-release-recheck-20261115/user-menu-chromium-768.png
evidence: joint-release-recheck-20261115/admin-D7-col-locacions-1280-dark.png
evidence: joint-release-recheck-20261115/add-dog-bottom-chromium-375.png
evidence: joint-release-recheck-20261115/student-grid-chromium-light-1280.png
evidence: joint-release-recheck-20261115/page-calendari-webkit-375.png
evidence: joint-release-recheck-20261115/page-calendari-chromium-375.png
evidence: joint-release-recheck-20261115/student-list-chromium-light-1280.png
evidence: joint-release-recheck-20261115/admin-D18-recorregut-2d-375-dark.png
evidence: joint-release-recheck-20261115/admin-D18-col-locacio-1280-dark.png
evidence: joint-release-recheck-20261115/merge-chromium-375.png
evidence: joint-release-recheck-20261115/admin-D18-recorregut-3d-1280-light.png
evidence: joint-release-recheck-20261115/admin-D18-registra-1280-dark.png
evidence: joint-release-recheck-20261115/page-tauler-webkit-375.png
evidence: joint-release-recheck-20261115/admin-D18-recorregut-3d-375-light.png
evidence: joint-release-recheck-20261115/admin-D18-col-locacio-375-dark.png
evidence: joint-release-recheck-20261115/admin-D18-biblioteca-375-dark.png
evidence: joint-release-recheck-20261115/page-abonats-chromium-375.png
evidence: joint-release-recheck-20261115/admin-D18-importa-375-dark.png
evidence: joint-release-recheck-20261115/admin-D18-biblioteca-375-light.png
evidence: joint-release-recheck-20261115/admin-D18-importa-1280-light.png
evidence: joint-release-recheck-20261115/student-grid-webkit-light-1280.png
evidence: joint-release-recheck-20261115/admin-D18-biblioteca-1280-dark.png
evidence: joint-release-recheck-20261115/page-parametres-chromium-375.png
evidence: joint-release-recheck-20261115/admin-D18-recorregut-2d-1280-light.png
evidence: joint-release-recheck-20261115/admin-D16-geometria-375-light.png
evidence: joint-release-recheck-20261115/admin-D18-registra-1280-light.png
evidence: joint-release-recheck-20261115/student-list-webkit-light-1280.png
evidence: joint-release-recheck-20261115/agenda-selected-webkit-1920.png
evidence: joint-release-recheck-20261115/agenda-selected-chromium-1920.png
evidence: joint-release-recheck-20261115/admin-D18-col-locacio-1280-light.png
evidence: joint-release-recheck-20261115/admin-D16-geometria-1280-light.png
evidence: joint-release-recheck-20261115/header-chromium-768.png
evidence: joint-release-recheck-20261115/admin-D7-col-locacions-1280-light.png
```

## bundles

Command: `node scripts/check-production-bundles.mjs`

Exit: 0. Complete output: [web-bundles.log](web-bundles.log).

Last 40 lines:

```text
check-production-bundles: 91 files in apps/clubs/dist, no mock data
check-production-bundles: 114 files in apps/clubs-admin/dist, no mock data
check-production-bundles: 26 files in apps/id/dist, no mock data
```

## bundle-files

Command: `node scripts/check-bundle-files.mjs`

Exit: 0. Complete output: [web-bundle-files.log](web-bundle-files.log).

Last 40 lines:

```text
check-bundle-files: apps/clubs/dist carries its bundle files
check-bundle-files: apps/clubs-admin/dist carries its bundle files
check-bundle-files: apps/id/dist carries its bundle files
```

## core-types

Command: `pnpm typecheck:e2e-core`

Exit: 0. Complete output: [web-core-types.log](web-core-types.log).

Last 40 lines:

```text

> agilityhub-core-web@1.0.0 typecheck:e2e-core /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/implementation/joint-release-20261115/web
> tsc -p e2e/core/tsconfig.json --noEmit

```

## sizes

Command: `pnpm size-limit`

Exit: 0. Complete output: [web-sizes.log](web-sizes.log).

Last 40 lines:

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       340.67 kB gzipped

  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.85 kB gzipped

  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped

  clubs-admin initial JavaScript
  Size limit: 465 kB
  Size:       331.22 kB gzipped

  clubs-admin all JavaScript
  Size limit: 690 kB
  Size:       572.82 kB gzipped

  clubs-admin courses JavaScript (D18, D16 «Geometria», lazy, COURSES only)
  Size limit: 66 kB
  Size:       63.15 kB gzipped

  clubs-admin course 3D viewer JavaScript (D18's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.28 kB gzipped

  clubs-admin platform console JavaScript (D19, lazy, AGILITYHUB_ADMIN only)
  Size limit: 58 kB
  Size:       52.86 kB gzipped

  id initial JavaScript
  Size limit: 110 kB
  Size:       105.06 kB gzipped

  id all JavaScript
  Size limit: 310 kB
  Size:       149.37 kB gzipped

```

## Official merged release CI

The complete main CI passed on `13f04dda`: 430 browser cases (237 administration, 188 members, 4 courses and 1 identity), zero failures. Production bundles also succeeded. See [official-ci.json](official-ci.json) and the linked official run. This supersedes the earlier 45-minute job timeout; no individual assertion or test timeout was relaxed.
