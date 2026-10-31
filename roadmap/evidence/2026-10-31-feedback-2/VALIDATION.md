# Josep feedback 20263010-2 — executor validation

Source: `Proves/20263010-2_Josep.docx` in SOFTWARE_CANIC; all text and five embedded screenshots reviewed. This extends the already published 20263010-1 changes.

## Implemented

- Ring-block dates include the month, including a month boundary.
- Ring selection precedes the date/time fields in visual and keyboard order; the layout wraps at 375 px.
- Hour separators are 2 px with theme-based contrast, checked in light and dark themes.
- Active students retain server-side search and pagination; an explicit dog-name/member-surname sort clarifies ordering. Sorting resets pagination and rejects stale results.
- Student records always identify the member by full name. Administrators can open the member record; instructors retain their existing permissions and see the name as text.

All new copy is translated into ca/es/en. No backend contract or permissions changed. The API already supports the selected sort fields.

## Results

Full lint/typecheck/unit/build: 38/38 tasks, 3,669 tests. Full Docker browser suite: 327 tests (189 clubs-admin, 133 clubs, 1 id, 4 course-ui), no failures. The final change after that suite only scrolls the student heading into view for its screenshot; all four affected Chromium/WebKit light/dark tests and final lint passed again. Twelve dedicated screenshots are included; agenda, mobile wrapping, and student header were visually inspected. Admin bundle 683.62 kB, within the unchanged 684 kB budget.

Earlier attempts: one ambiguous test locator fixed; one non-null assertion in a new browser test removed for lint; Docker was started after the initial browser attempt. Complete attempt logs remain attached. No production activation has occurred at this report's publication; final hosted checks belong in SOFTWARE_CANIC deployment evidence.

## Commands

### 04-i18n.log

Command: `pnpm i18n:check`

Exit code: 0. Full output: [04-i18n.log](04-i18n.log). Last 40 lines:

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/dev/agilityhub/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5268 keys
es: 5268 keys
en: 5268 keys
4071 statically used keys, 0 unused
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

### 05-full-checks.log

Command: `bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh pnpm turbo run lint typecheck test build --concurrency=2`

Exit code: 0. Full output: [05-full-checks.log](05-full-checks.log). Last 40 lines:

```text
clubs:build: dist/assets/CoursesRoute-L7D6m7jL.js                      134.46 kB │ gzip:  37.39 kB
clubs:build: dist/assets/screens-BSfiAzNn.js                           225.93 kB │ gzip:  57.68 kB
clubs:build: dist/assets/shared-CKU_rXPk.js                            244.83 kB │ gzip:  74.82 kB
clubs:build: dist/assets/index-B834T0j_.js                             254.85 kB │ gzip:  77.42 kB
clubs:build: dist/assets/CourseViewer3D-d3UO2FQ1.js                    582.82 kB │ gzip: 151.71 kB
clubs:build: 
clubs:build: ✓ built in 245ms
clubs:build: 
clubs:build: PWA v1.3.0
clubs:build: Building src/sw.ts service worker ("es" format)...
clubs:build: [plugin builtin:vite-reporter] 
clubs:build: (!) Some chunks are larger than 500 kB after minification. Consider:
clubs:build: - Using dynamic import() to code-split the application
clubs:build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
clubs:build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
clubs:build: vite v8.2.2 building client environment for production...
clubs:build: 
clubs:build:  WARN  inlineDynamicImports option is deprecated, please use codeSplitting: false instead.
clubs:build: 
clubs:build: transforming...
clubs:build: ✓ 60 modules transformed.
clubs:build: rendering chunks...
clubs:build: computing gzip size...
clubs:build: dist/sw.mjs  17.90 kB │ gzip: 6.01 kB
clubs:build: 
clubs:build: ✓ built in 14ms
clubs:build: 
clubs:build: PWA v1.3.0
clubs:build: mode      injectManifest
clubs:build: format:   es
clubs:build: precache  62 entries (1258.63 KiB)
clubs:build: files generated
clubs:build:   dist/sw.js
clubs:build: check-clubs-bundle: 57 chunks in apps/clubs/dist/assets, no admin-*, console or id namespace (by name or contents)
clubs:build: check-initial-budget: «clubs initial JavaScript» counts the 3 scripts apps/clubs/dist/index.html loads

 Tasks:    38 successful, 38 total
Cached:    28 cached, 38 total
  Time:    1m28.168s 

```

### 06-browser-tests.log

Command: `bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh pnpm e2e:docker 2026-10-31-feedback-2 --capture-task=2026-10-31-feedback-2`

Exit code: 0. Full output: [06-browser-tests.log](06-browser-tests.log). Last 40 lines:

```text
evidence: 2026-10-31-feedback-2/responsive-admin-import-1280.png
evidence: 2026-10-31-feedback-2/admin-D16-geometria-375-light.png
evidence: 2026-10-31-feedback-2/word-home-chromium-1512.png
evidence: 2026-10-31-feedback-2/62-D6-submission-due-1280.png
evidence: 2026-10-31-feedback-2/responsive-admin-member-1280.png
evidence: 2026-10-31-feedback-2/clubs-visor-instructor-2d-375-light.png
evidence: 2026-10-31-feedback-2/admin-D18-registra-1280-light.png
evidence: 2026-10-31-feedback-2/member-confirm-375-dark.png
evidence: 2026-10-31-feedback-2/responsive-admin-billing-menu-0-1280.png
evidence: 2026-10-31-feedback-2/admin-D4-recorregut-previst-375-dark.png
evidence: 2026-10-31-feedback-2/agenda-selected-webkit-1920.png
evidence: 2026-10-31-feedback-2/admin-dashboard-1280-light.png
evidence: 2026-10-31-feedback-2/responsive-admin-billing-menu-0-1280.json
evidence: 2026-10-31-feedback-2/agenda-selected-chromium-1920.png
evidence: 2026-10-31-feedback-2/admin-D18-col-locacio-1280-light.png
evidence: 2026-10-31-feedback-2/clubs-23-visio-global-1280-dark.png
evidence: 2026-10-31-feedback-2/hours-chromium-375.png
evidence: 2026-10-31-feedback-2/admin-D16-geometria-1280-light.png
evidence: 2026-10-31-feedback-2/06-confirmada-tornar-inici-375.png
evidence: 2026-10-31-feedback-2/header-chromium-768.png
evidence: 2026-10-31-feedback-2/clubs-visor-instructor-3d-1280-light.png
evidence: 2026-10-31-feedback-2/word-dogs-chromium-375.png
evidence: 2026-10-31-feedback-2/07-espera-375.png
evidence: 2026-10-31-feedback-2/member-confirm-768-dark.png
evidence: 2026-10-31-feedback-2/responsive-admin-billing-menu-1-1280.json
evidence: 2026-10-31-feedback-2/admin-D12-agenda-muntatges-375-light.png
evidence: 2026-10-31-feedback-2/hours-chromium-320.png
evidence: 2026-10-31-feedback-2/feedback2-student-webkit-dark.png
evidence: 2026-10-31-feedback-2/r2-course-ui-harness-1280-after-nudge.png
evidence: 2026-10-31-feedback-2/user-menu-webkit-320.png
evidence: 2026-10-31-feedback-2/header-chromium-390.png
evidence: 2026-10-31-feedback-2/word-inactivity-chromium-1512.png
evidence: 2026-10-31-feedback-2/admin-D7-col-locacions-1280-light.png
evidence: 2026-10-31-feedback-2/member-today-768-light.png
evidence: 2026-10-31-feedback-2/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: 2026-10-31-feedback-2/clubs-visor-alumne-1280-dark.png
evidence: 2026-10-31-feedback-2/responsive-admin-create-menu-768.json
evidence: 2026-10-31-feedback-2/23-D10-next-invoice-row-375.png
evidence: 2026-10-31-feedback-2/member-today-375-light.png
evidence: 2026-10-31-feedback-2/responsive-admin-import-768.png
```

### 07-format.log

Command: `pnpm exec prettier --check <the 15 changed source and changelog files>`

Exit code: 0. Full output: [07-format.log](07-format.log). Last 40 lines:

```text
Checking formatting...
All matched files use Prettier code style!
```

### 08-size-limit.log

Command: `pnpm exec size-limit`

Exit code: 0. Full output: [08-size-limit.log](08-size-limit.log). Last 40 lines:

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       317.54 kB gzipped
  
  clubs courses JavaScript (viewer, «Registra què hi ha muntat», build session; lazy, COURSES only)
  Size limit: 40 kB
  Size:       36.84 kB gzipped
  
  clubs course 3D viewer JavaScript (the viewer's 3D tab, lazy, three.js)
  Size limit: 167 kB
  Size:       149.27 kB gzipped
  
  clubs-admin initial JavaScript
  Size limit: 460 kB
  Size:       450.23 kB gzipped
  
  clubs-admin all JavaScript
  Size limit: 684 kB
  Size:       683.62 kB gzipped
  
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

### 09-visual-captures.log

Command: `bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh pnpm e2e:docker 2026-10-31-feedback-2 --capture-task=2026-10-31-feedback-2 --grep='second feedback' --pass-with-no-tests`

Exit code: 0. Full output: [09-visual-captures.log](09-visual-captures.log). Last 40 lines:

```text
clubs:e2e: 
clubs:e2e: [WebServer] (node:836) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs:e2e: 
clubs:e2e: 
clubs-admin:e2e: cache bypass, force executing 6a3251ba134e8b4b
clubs-admin:e2e: 
clubs-admin:e2e: > clubs-admin@0.0.0 e2e /work/apps/clubs-admin
clubs-admin:e2e: > playwright test --workers\=4 '--grep=second feedback' --pass-with-no-tests
clubs-admin:e2e: 
clubs-admin:e2e: [WebServer] (node:1059) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
clubs-admin:e2e: [WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
clubs-admin:e2e: 
clubs-admin:e2e: Running 4 tests using 2 workers
clubs-admin:e2e: ····
clubs-admin:e2e:   4 passed (13.5s)
id:e2e: cache bypass, force executing 9679b2f7b24f14f8
id:e2e: 
id:e2e: > id@0.0.0 e2e /work/apps/id
id:e2e: > playwright test --workers\=4 '--grep=second feedback' --pass-with-no-tests
id:e2e: 
id:e2e: 
id:e2e: 

 Tasks:    10 successful, 10 total
Cached:    0 cached, 10 total
  Time:    40.256s 

evidence: 2026-10-31-feedback-2/feedback2-student-chromium-dark.png
evidence: 2026-10-31-feedback-2/feedback2-agenda-webkit-light.png
evidence: 2026-10-31-feedback-2/feedback2-agenda-webkit-dark.png
evidence: 2026-10-31-feedback-2/feedback2-ring-mobile-webkit-light.png
evidence: 2026-10-31-feedback-2/feedback2-agenda-chromium-light.png
evidence: 2026-10-31-feedback-2/feedback2-ring-mobile-webkit-dark.png
evidence: 2026-10-31-feedback-2/feedback2-student-webkit-light.png
evidence: 2026-10-31-feedback-2/feedback2-ring-mobile-chromium-dark.png
evidence: 2026-10-31-feedback-2/feedback2-ring-mobile-chromium-light.png
evidence: 2026-10-31-feedback-2/feedback2-agenda-chromium-dark.png
evidence: 2026-10-31-feedback-2/feedback2-student-chromium-light.png
evidence: 2026-10-31-feedback-2/feedback2-student-webkit-dark.png
```

### 10-final-lint.log

Command: `pnpm --filter clubs-admin lint`

Exit code: 0. Full output: [10-final-lint.log](10-final-lint.log). Last 40 lines:

```text

> clubs-admin@0.0.0 lint /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin
> eslint . --max-warnings 0 --config ../../eslint.config.mjs

```
