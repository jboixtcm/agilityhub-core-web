# Student grid, list and filters — 31 October 2026

Requested by Jordi in the feedback deployment chat and the referenced grid chat. This final candidate extends the original grid handoff with level and active/inactive/all filters. The original partial validation is superseded by the complete results below.

- Default responsive grid with circular photos, guide/dog name, owner when different and level badge. List toggle preserves results and paging. Browser preference survives reload; blocked storage degrades to session-only behavior.
- Debounced search combines with server-side level and status filters, dog/member sorting and pagination. Changing a filter resets to page zero and discards stale responses. Reset clears search/level and restores active status, while preserving the selected view and sort.
- Level options use the existing API facet. Disabled levels hide the control; a temporary failure offers retry. Inactive results carry a visible badge. Existing mobile callers retain active-only defaults.
- Accessible labels, pressed state and keyboard record navigation. Themes and ca/es/en copy follow the existing product conventions. New filter and view literals are the requested UI extension.
- The production build measures 685.06 kB total administration JavaScript; budget 686 kB. Initial-load budget stays 460 kB, measured 451.38 kB. No dependency was added.

## Final validation

3,672 unit/component tests across 38 successful tasks. The full Docker Playwright suite passes 331 tests: administration 193, clubs 133, ID 1, course UI 4. Four durable grid/filter tests cover Chromium and WebKit, light and dark themes, 320/375/1280 widths, combined filters, reset, pagination, retained view/search/sort, 44 px controls and keyboard navigation. The final source inventory has 978 files and matches the Docker-tested source exactly.

Earlier attempts are retained as evidence: invalid test-fixture import corrected (17); synchronous effect state update removed for lint (20); test-only Branding typing and unsupported RTL exact option corrected (22/23/27). The four-worker run (30) was stopped with exit 137 after widespread navigation/screenshot timeouts under host load; the complete two-worker rerun (33) uses unchanged assertions and timeouts. The first production size check (32) exceeded 685 kB by 57 bytes; the measured total budget was adjusted by 1 kB and the complete production build/size check passed (34/37). Initial-load budgets were not increased.

## Commands and evidence

### 29-full-checks-final.log

Command: `bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh pnpm turbo run lint typecheck test build`. Exit: **0**. Full output: `29-full-checks-final.log`. Last 40 lines:

```text
clubs-admin:build: dist/assets/admin-billing-CZFSME4s.js                      10.24 kB │ gzip:   3.63 kB
clubs-admin:build: dist/assets/instructor-v6vTZynZ.js                         10.42 kB │ gzip:   3.82 kB
clubs-admin:build: dist/assets/admin-billing-DCRzb_Gs.js                      10.45 kB │ gzip:   3.96 kB
clubs-admin:build: dist/assets/enums-CWQyt4Yf.js                              10.50 kB │ gzip:   4.36 kB
clubs-admin:build: dist/assets/instructor-Dt50-DwX.js                         10.57 kB │ gzip:   3.83 kB
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
clubs-admin:build: dist/assets/ConsolePage-XE8swk8Q.js                       116.95 kB │ gzip:  27.87 kB
clubs-admin:build: dist/assets/list-helpers-BTqAijgQ.js                      229.13 kB │ gzip:  71.23 kB
clubs-admin:build: dist/assets/CoursesRoute-Dk-OffT_.js                      231.55 kB │ gzip:  64.15 kB
clubs-admin:build: dist/assets/CourseViewer3D-DTd-15TB.js                    582.83 kB │ gzip: 151.71 kB
clubs-admin:build: dist/assets/index-CH2RUsIZ.js                           1,120.41 kB │ gzip: 377.57 kB
clubs-admin:build: 
clubs-admin:build: ✓ built in 337ms
clubs-admin:build: [plugin builtin:vite-reporter] 
clubs-admin:build: (!) Some chunks are larger than 500 kB after minification. Consider:
clubs-admin:build: - Using dynamic import() to code-split the application
clubs-admin:build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
clubs-admin:build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

 Tasks:    38 successful, 38 total
Cached:    30 cached, 38 total
  Time:    1m35.274s 

```

### 21-filter-i18n.log

Command: `pnpm i18n:check`. Exit: **0**. Full output: `21-filter-i18n.log`. Last 40 lines:

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5280 keys
es: 5280 keys
en: 5280 keys
4083 statically used keys, 0 unused
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

### 33-browser-two-workers.log

Command: `bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh pnpm e2e:docker 2026-10-31-student-grid --capture-task=2026-10-31-student-grid --workers=2`. Exit: **0**. Full output: `33-browser-two-workers.log`. Last 40 lines:

```text
evidence: 2026-10-31-student-grid/word-home-chromium-1512.png
evidence: 2026-10-31-student-grid/62-D6-submission-due-1280.png
evidence: 2026-10-31-student-grid/responsive-admin-member-1280.png
evidence: 2026-10-31-student-grid/clubs-visor-instructor-2d-375-light.png
evidence: 2026-10-31-student-grid/admin-D18-registra-1280-light.png
evidence: 2026-10-31-student-grid/student-list-webkit-light-1280.png
evidence: 2026-10-31-student-grid/member-confirm-375-dark.png
evidence: 2026-10-31-student-grid/responsive-admin-billing-menu-0-1280.png
evidence: 2026-10-31-student-grid/admin-D4-recorregut-previst-375-dark.png
evidence: 2026-10-31-student-grid/agenda-selected-webkit-1920.png
evidence: 2026-10-31-student-grid/admin-dashboard-1280-light.png
evidence: 2026-10-31-student-grid/responsive-admin-billing-menu-0-1280.json
evidence: 2026-10-31-student-grid/agenda-selected-chromium-1920.png
evidence: 2026-10-31-student-grid/admin-D18-col-locacio-1280-light.png
evidence: 2026-10-31-student-grid/clubs-23-visio-global-1280-dark.png
evidence: 2026-10-31-student-grid/hours-chromium-375.png
evidence: 2026-10-31-student-grid/admin-D16-geometria-1280-light.png
evidence: 2026-10-31-student-grid/06-confirmada-tornar-inici-375.png
evidence: 2026-10-31-student-grid/header-chromium-768.png
evidence: 2026-10-31-student-grid/clubs-visor-instructor-3d-1280-light.png
evidence: 2026-10-31-student-grid/word-dogs-chromium-375.png
evidence: 2026-10-31-student-grid/07-espera-375.png
evidence: 2026-10-31-student-grid/member-confirm-768-dark.png
evidence: 2026-10-31-student-grid/responsive-admin-billing-menu-1-1280.json
evidence: 2026-10-31-student-grid/admin-D12-agenda-muntatges-375-light.png
evidence: 2026-10-31-student-grid/student-grid-chromium-dark-1280.png
evidence: 2026-10-31-student-grid/hours-chromium-320.png
evidence: 2026-10-31-student-grid/feedback2-student-webkit-dark.png
evidence: 2026-10-31-student-grid/r2-course-ui-harness-1280-after-nudge.png
evidence: 2026-10-31-student-grid/user-menu-webkit-320.png
evidence: 2026-10-31-student-grid/header-chromium-390.png
evidence: 2026-10-31-student-grid/word-inactivity-chromium-1512.png
evidence: 2026-10-31-student-grid/admin-D7-col-locacions-1280-light.png
evidence: 2026-10-31-student-grid/member-today-768-light.png
evidence: 2026-10-31-student-grid/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: 2026-10-31-student-grid/clubs-visor-alumne-1280-dark.png
evidence: 2026-10-31-student-grid/responsive-admin-create-menu-768.json
evidence: 2026-10-31-student-grid/23-D10-next-invoice-row-375.png
evidence: 2026-10-31-student-grid/member-today-375-light.png
evidence: 2026-10-31-student-grid/responsive-admin-import-768.png
```

### 34-production-budget-final.log

Command: `bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh python3 /Users/jordib/.config/agilityhub-clubs/production/student-grid-20261031/filter-preview-build.py`. Exit: **0**. Full output: `34-production-budget-final.log`. Last 40 lines:

```text
heavy.sh: 16:56 waiting for the host lock, held by: 16:56 agilityhub-core-web: pnpm e2e:docker 2026-10-31-student-grid --capture-task=2026-10-31-student-grid --workers=2
heavy.sh: 17:08 got the host lock after 12 min 31 s
{
  "release": "20261031T153924Z-grid-filter-preview",
  "sourceSha256": "8815f88cd8e5d11b03125e620940fdb9242d130b58f255b3cab50ac96f41e848",
  "sourceFiles": 978,
  "buildExecuted": true,
  "manifest": "/Users/jordib/.config/agilityhub-clubs/production/artifacts/20261031T153924Z-grid-filter-preview/manifest.json"
}
```

### 36-format-final.log

Command: `pnpm exec prettier --check .size-limit.json apps/clubs-admin/src/instructor/StudentsPage.tsx apps/clubs-admin/src/instructor/student-filters.test.tsx apps/clubs-admin/src/instructor/students-page.css apps/clubs-admin/src/instructor/student-record.css apps/clubs-admin/e2e/mobile-review.spec.ts packages/api-client/src/student-search.ts packages/i18n/src/locales/ca/instructor.json packages/i18n/src/locales/es/instructor.json packages/i18n/src/locales/en/instructor.json`. Exit: **0**. Full output: `36-format-final.log`. Last 40 lines:

```text
Checking formatting...
All matched files use Prettier code style!
```

## Visual review and scope

Final `student-{grid,list}-{chromium,webkit}-{light,dark}-{375,1280}.png` captures contain fictional MSW data. Original `visual-results.json` describes the initial 24 layout checks, before filters; it is historical supporting evidence. The durable final suite covers the filter extension.

The publication allowlist includes only this feature, its translations, tests, budget and evidence. Existing root `.gitignore`, `roadmap/MESSAGES.md`, unrelated feedback captures and original obsolete patch are excluded. No roadmap verification state is changed. Production activation and hosted verification are tracked separately in `SOFTWARE_CANIC/ops/evidence/2026-10-31-student-grid-deployment`.
