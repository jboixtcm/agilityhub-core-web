# Josep feedback — 11 November 2026

Direct user request: apply both reviewed feedback documents, leave consents unchecked, and test the changes. No roadmap task state or organizer verification was modified.

## Behavior

- The administrator dashboard uses sent class notices rather than the live risk projection. The count and first six rows are limited to the club's current day. View more opens all notices newest first, with 20 rows per page. API aggregation groups administrator copies by event, code and class, preserving separate risk and cancellation occurrences. Frozen class labels retain the sent wording; the notice timestamp gives the historical date. Missing legacy event ids remain separate to avoid merging unrelated events. No recipient/contact data is exposed.
- Level percentages are rounded to whole numbers in both active and recently-booked populations.
- Public identity checks return MEMBER_ALREADY_EXISTS for existing members and send no recognition email. The form explains how to sign in, update details and use My dogs / Add a dog. Authenticated additional-dog signup, pending requests and readmission retain their existing paths. Queued legacy recognition events can still drain safely.
- Privacy and image consent start unchecked. Existing accepted drafts are preserved according to the current consent-version rules.
- Counted/non-swappable weekly classes appear before the remaining swap options, once only, and the block is absent when empty.
- Member notification links retain dogId/taskId. The page focuses only a task belonging to the specified accessible dog, falling back to that dog's card. A visible completion button uses the existing task completion API and busy/error handling.
- Transfer/cash copy belongs to club configuration, not generic product code. Instance seeds and mock cash text are updated. The narrow production configuration payload is in SOFTWARE_CANIC `ops/evidence/2026-11-11-josep-feedback/configuration-change.json`.

## Investigation and unchanged rules

The preceding read-only production investigation found ten administrator cancellation emails plus three instructor copies delivered to the affected administrator on November 11. The screenshot's conversation count was 13. All active administrators were included; no resend or audience change is needed. Private recipient evidence remains outside the source repositories.

The amount actually received in signup review records a manual upfront payment and reduces the outstanding amount. Explicitly confirming zero allows validation while keeping the balance due. Entering this value does not debit a bank account. These billing rules were retained.

## Verification

Final verification passes. The full suite was run, and only affected cases were rerun after correcting stale text expectations and restoring two unchanged backoffice cases caught during the final diff audit. No test was skipped and no timeout was increased.

| Check | Final result | Evidence |
| --- | --- | --- |
| `pnpm turbo run lint typecheck test build` | 38/38 tasks; 3,722 tests pass | `web-final.log` |
| `pnpm size` | All budgets pass; admin initial 459.42/460 kB, total 685.8/690 kB | `web-final.log` |
| `pnpm i18n:check` | Exit 0; 5,409 keys per locale, 0 unused/missing | `i18n.log` |
| `pnpm typecheck:e2e-core` | Exit 0 | `e2e-types.log` |
| `pnpm api:generate` | Exit 0; regenerated schema unchanged; API/web snapshot byte equality checked | `api-generate.log` |
| Docker Playwright complete suite + affected rechecks | 389 unique cases pass: members 160, admin 224, identity 1, course-ui 4 | `e2e-full.log`, `e2e-final-recheck.log`, `e2e-backoffice-final.log` |
| `git diff --check` | Exit 0; no output | Final working tree check |

The first complete browser run exited 1: members 159/160, admin 222/222, identity 1/1 and course-ui 4/4. Its only failing case expected the old task-row text before the new visible completion button. After updating that assertion, all five member-self-service cases passed. Four history screenshot cases also passed after the heading/style adjustment. The final diff audit restored two unrelated existing D10/D11 cases and all seven cases in their backoffice file passed; this accounts for the final 224 admin cases. The successful rechecks each exited 0. The original failure log is retained rather than presented as a green run.

Host checks use Node 22 and pnpm 9.15.9. Browser suites use the official Playwright v1.63.0-noble Docker image (bundled Node 24, which prints an engine warning) with two workers and the repository's existing browser configuration. Build/type checking passed separately on the supported Node 22 runtime. All heavy runs were serialized with the shared `heavy.sh` lock.

Visual review: history and notices inspected at 375/1280 px; dashboard screenshots also cover 768/1920 px and 320 px long-copy stress, Chromium/WebKit and light/dark themes. Counted-class ordering and correct-dog/task focus were inspected at 375/1280 px. Fictional fixtures only.

Representative screenshots: `history-chromium-dark-375.png`, `history-chromium-dark-1280.png`, `risk-webkit-light-1280.png`, `counted-before-swap-chromium-375.png`, `task-focus-chromium-375.png`, `task-focus-chromium-1280.png`.

Final host command (exit 0):

```sh
PATH=/opt/homebrew/opt/node@22/bin:/Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261109/toolbin:$PATH HEAVY_WAIT_MIN=120 /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh sh -c 'pnpm turbo run lint typecheck test build && pnpm size'
```

Final host checks — exit 0; last 40 lines of `web-final.log`:

```text
  clubs all JavaScript
  Size limit: 420 kB
  Size:       324.43 kB gzipped
  
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
  Size:       685.8 kB gzipped
  
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

pnpm i18n:check — exit 0; last 40 lines of `i18n.log`:

```text

> agilityhub-core-web@0.0.0 i18n:check /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> node scripts/i18n-check.mjs && node scripts/check-error-codes.mjs && node scripts/check-parameter-keys.mjs && node scripts/check-es-actions.mjs

i18n check passed
ca: 5409 keys
es: 5409 keys
en: 5409 keys
4208 statically used keys, 0 unused
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
  kept signup:success.addDogTitle · «Añade un perro» — the add-dog flow's title on its success screen
  KEEP entries this catalog does not need: auth:profile.learnLink
check-es-actions: 0 flagged, 19 kept
```

pnpm typecheck:e2e-core — exit 0; last 40 lines of `e2e-types.log`:

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

pnpm api:generate — exit 0; last 40 lines of `api-generate.log`:

```text

> agilityhub-core-web@0.0.0 api:generate /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web
> pnpm --filter @agilityhub/api-client api:generate


> @agilityhub/api-client@0.0.0 api:generate /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client
> node scripts/generate.mjs

Generated /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client/src/generated/schema.d.ts from /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client/openapi/openapi.json merged with /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/packages/api-client/openapi/pending.json

Generated output unchanged: True
```

pnpm --filter clubs e2e e2e/member-self-service.spec.ts --workers=2; pnpm --filter clubs-admin e2e e2e/dashboard-risk.spec.ts --workers=2 — exit 0; last 40 lines of `e2e-final-recheck.log`:

```text
dist/assets/common-DOXH6BOI.js                              2.75 kB │ gzip:   1.30 kB
dist/assets/common-Cd1WrW5f.js                              2.91 kB │ gzip:   1.44 kB
dist/assets/common-BrNJzFhB.js                              2.98 kB │ gzip:   1.46 kB
dist/assets/id-B7fN0oKw.js                                  3.01 kB │ gzip:   1.33 kB
dist/assets/id-DUR_B-8l.js                                  3.17 kB │ gzip:   1.47 kB
dist/assets/id-C-7TeTu2.js                                  3.25 kB │ gzip:   1.48 kB
dist/assets/errors-BD0o9-MR.js                             22.04 kB │ gzip:   7.20 kB
dist/assets/errors-J4nrc9kO.js                             23.31 kB │ gzip:   7.58 kB
dist/assets/errors-B1L438oL.js                             23.35 kB │ gzip:   7.57 kB
dist/assets/index-CDVTSWZI.js                             340.81 kB │ gzip: 104.69 kB
dist/assets/browser-CikNBEtH.js                         1,278.85 kB │ gzip: 490.54 kB

[33m[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 175ms[39m
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:1121) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs@0.0.0 e2e /work/apps/clubs
> playwright test e2e/member-self-service.spec.ts --workers\=2


Running 5 tests using 1 worker
·····
  5 passed (10.8s)
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:1366) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs-admin@0.0.0 e2e /work/apps/clubs-admin
> playwright test e2e/dashboard-risk.spec.ts --workers\=2


Running 4 tests using 2 workers
····
  4 passed (4.1s)
```

pnpm --filter clubs-admin e2e e2e/e5-backoffice.spec.ts --workers=2 — exit 0; last 40 lines of `e2e-backoffice-final.log`:

```text
dist/assets/montserrat-latin-400-normal-xItZbAXg.woff      20.64 kB
dist/assets/montserrat-latin-700-normal-BWkrl476.woff      20.67 kB
dist/assets/index-D3JxLz0F.css                             57.31 kB │ gzip:  10.33 kB
dist/assets/common-DOXH6BOI.js                              2.75 kB │ gzip:   1.30 kB
dist/assets/common-Cd1WrW5f.js                              2.91 kB │ gzip:   1.44 kB
dist/assets/common-BrNJzFhB.js                              2.98 kB │ gzip:   1.46 kB
dist/assets/id-B7fN0oKw.js                                  3.01 kB │ gzip:   1.33 kB
dist/assets/id-DUR_B-8l.js                                  3.17 kB │ gzip:   1.47 kB
dist/assets/id-C-7TeTu2.js                                  3.25 kB │ gzip:   1.48 kB
dist/assets/errors-BD0o9-MR.js                             22.04 kB │ gzip:   7.20 kB
dist/assets/errors-J4nrc9kO.js                             23.31 kB │ gzip:   7.58 kB
dist/assets/errors-B1L438oL.js                             23.35 kB │ gzip:   7.57 kB
dist/assets/index-CDVTSWZI.js                             340.81 kB │ gzip: 104.69 kB
dist/assets/browser-CikNBEtH.js                         1,278.85 kB │ gzip: 490.54 kB

[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 178ms
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v24.20.0","pnpm":"9.15.9"})
(node:1123) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)

> clubs-admin@0.0.0 e2e /work/apps/clubs-admin
> playwright test e2e/e5-backoffice.spec.ts --workers\=2


Running 7 tests using 1 worker

  ✓  1 [chromium] › e2e/e5-backoffice.spec.ts:71:3 › E5-W03 D4 · the registrants of the selected class (S08 §6, R-08-16) › an ADMIN sees who is booked and who waits, and removes a waiting entry (1.2s)
  ✓  2 [chromium] › e2e/e5-backoffice.spec.ts:108:3 › E5-W03 D4 · the registrants of the selected class (S08 §6, R-08-16) › an INSTRUCTOR reads the same panel without actions (A22 c) (814ms)
  ✓  3 [chromium] › e2e/e5-backoffice.spec.ts:119:3 › E5-W03 «Entrenaments» · the ring-usage register (S09 §2, §13-8, no mockup) › an ADMIN lists the week's training bookings and the ring blocks, exports and cancels a block (2.0s)
  ✓  4 [chromium] › e2e/e5-backoffice.spec.ts:160:3 › E5-W03 «Entrenaments» · the ring-usage register (S09 §2, §13-8, no mockup) › an INSTRUCTOR reads the register without exports nor block actions (1.5s)
  ✓  5 [chromium] › e2e/e5-backoffice.spec.ts:174:3 › E5-W03 D10 · «Reserves» of the member (S08 §2, R-08-19) › shows the class and training bookings, read-only (1.6s)
  ✓  6 [chromium] › e2e/e5-backoffice.spec.ts:206:3 › E5-W03 D11 · «Processos automàtics» (S15 §2, no mockup) › T-15-32 lists the processes and simulates, runs and switches one (2.0s)
  ✓  7 [chromium] › e2e/e5-backoffice.spec.ts:252:3 › T-11-26 D1 class notice history › opens the full history with the latest notices first (987ms)

  7 passed (10.5s)
```

Docker setup/commands are preserved in `e2e-complete-recipe.sh`, `e2e-final-recheck.sh` and `e2e-backoffice-final.sh` beside this report. Complete run executes `pnpm --filter <app> e2e --workers=2` for clubs, clubs-admin, id and @agilityhub/course-ui. Rechecks use the commands above after the same isolated install/build/server setup. Source mounted read-only; evidence mounted writable.


## Release handoff

No commit, push, deployment, production data change or message send occurred. Publish API and web together because the web consumes the new class-notices endpoint and identity-check outcome. For an already provisioned club, seed changes alone do not update its settings: read current versions and update only MANUAL.instructions and signup.text.cashConditions via the supported APIs, preserving enabled state and all other configuration. Do not apply a full seed or replay notifications.
