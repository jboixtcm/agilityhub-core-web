# RSCE point and grade progress

User-authorized follow-up on the separate `feature/flow-weekly-imports` branch. The authoritative API snapshot adds per-licence grade provenance, all-history promotion progress and calendar-year championship targets under RSCE's consolidated 2026-07-01 regulation (articles 60–63 and 71).

The member screen shows Agility P / PV / PA and Jumping P / PV / PA separately. G1 shows both G2 promotion routes and the outstanding two-judge condition; G2 shows remaining PA for G3 and standard championship progress; G3 shows its four-PV-per-discipline route. The championship total counts a PA / PV round once. Licences are selectable and never pooled for progress. Current grade uses the registered licence, with a labelled last-result fallback and conflict message. No automatic promotion or official eligibility declaration occurs.

All copy is available in ca/es/en. Additional wording comes from the user-supplied regulation; there is no earlier mockup for these new progress panels. Missing history, judges, prior promotion notices, demotions and exceptional qualification routes are explained with the official source link.

Validation: 8 focused statistics tests passed. Locale/catalog checks passed. The final workspace `corepack pnpm turbo run lint typecheck test build --concurrency=1` passed all 38 tasks (exit 0). Complete `corepack pnpm e2e:docker flow-weekly --capture-task=flow-weekly --workers=2` passed 430 browser cases (4 course, 188 member, 237 administration, 1 identity; exit 0). Logs are committed in `roadmap/evidence/flow-weekly/workspace-checks.log` and `browser-checks.log`. Final 375/1280 statistics captures are included alongside them.

The initial CI attempt exposed an existing calendar test race: it edited times before the selected day's asynchronous defaults finished loading. The test now waits for the actual loaded 07:00/08:00 defaults and enabled control before editing; application behavior is unchanged. That case and the full workspace suite passed afterward. An initial four-worker local browser run had unrelated navigation timing failures under concurrent build load; the complete two-worker rerun passed without application changes.

Grade conflicts and inferred grades are labelled explicitly, historical dates include the year, and progress bars use club theme tokens. This is point progress using available imports, not automatic promotion or official championship eligibility.

Commands above: exit 0. Last 40 output lines:

```text
clubs:build: PWA v1.3.0
clubs:build: Building src/sw.ts service worker ("es" format)...
clubs:build: vite v8.2.2 building client environment for production...
clubs:build:
clubs:build:  WARN  inlineDynamicImports option is deprecated, please use codeSplitting: false instead.
clubs:build:
clubs:build: transforming...
clubs:build: ✓ 60 modules transformed.
clubs:build: rendering chunks...
clubs:build: computing gzip size...
clubs:build: dist/sw.mjs  17.95 kB │ gzip: 6.02 kB
clubs:build:
clubs:build: ✓ built in 34ms
clubs:build:
clubs:build: PWA v1.3.0
clubs:build: mode      injectManifest
clubs:build: format:   es
clubs:build: precache  67 entries (1348.86 KiB)
clubs:build: files generated
clubs:build:   dist/sw.js
clubs:build: warnings
clubs:build:   One of the glob patterns doesn't match any files. Please remove or fix the following: {
clubs:build:   "globDirectory": "/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/implementation/flow-weekly/web/apps/clubs/dist",
clubs:build:   "globPattern": "pwa/*.{png,webmanifest}",
clubs:build:   "globIgnores": [
clubs:build:     "**/browser-*.js",
clubs:build:     "**/mockServiceWorker.js",
clubs:build:     "**/CourseViewer3D-*.js",
clubs:build:     "sw.js",
clubs:build:     "sw.js"
clubs:build:   ]
clubs:build: }
clubs:build:
clubs:build: check-clubs-bundle: 61 chunks in apps/clubs/dist/assets, no admin-*, console or id namespace (by name or contents)
clubs:build: check-initial-budget: «clubs initial JavaScript» counts the 3 scripts apps/clubs/dist/index.html loads

 Tasks:    38 successful, 38 total
Cached:    17 cached, 38 total
  Time:    6m49.895s

```

```text
evidence: flow-weekly/member-confirm-375-dark.png
evidence: flow-weekly/responsive-admin-billing-menu-0-1280.png
evidence: flow-weekly/admin-D4-recorregut-previst-375-dark.png
evidence: flow-weekly/history-chromium-light-1280.png
evidence: flow-weekly/agenda-selected-webkit-1920.png
evidence: flow-weekly/admin-dashboard-1280-light.png
evidence: flow-weekly/responsive-admin-billing-menu-0-1280.json
evidence: flow-weekly/agenda-selected-chromium-1920.png
evidence: flow-weekly/admin-D18-col-locacio-1280-light.png
evidence: flow-weekly/clubs-23-visio-global-1280-dark.png
evidence: flow-weekly/hours-chromium-375.png
evidence: flow-weekly/admin-D16-geometria-1280-light.png
evidence: flow-weekly/06-confirmada-tornar-inici-375.png
evidence: flow-weekly/donut-chromium-dark-1280-recent.png
evidence: flow-weekly/risk-webkit-dark-1280.png
evidence: flow-weekly/header-chromium-768.png
evidence: flow-weekly/clubs-visor-instructor-3d-1280-light.png
evidence: flow-weekly/word-dogs-chromium-375.png
evidence: flow-weekly/07-espera-375.png
evidence: flow-weekly/member-confirm-768-dark.png
evidence: flow-weekly/responsive-admin-billing-menu-1-1280.json
evidence: flow-weekly/admin-D12-agenda-muntatges-375-light.png
evidence: flow-weekly/student-grid-chromium-dark-1280.png
evidence: flow-weekly/hours-chromium-320.png
evidence: flow-weekly/feedback2-student-webkit-dark.png
evidence: flow-weekly/risk-chromium-light-768.png
evidence: flow-weekly/r2-course-ui-harness-1280-after-nudge.png
evidence: flow-weekly/user-menu-webkit-320.png
evidence: flow-weekly/header-chromium-390.png
evidence: flow-weekly/word-inactivity-chromium-1512.png
evidence: flow-weekly/admin-D7-col-locacions-1280-light.png
evidence: flow-weekly/member-today-768-light.png
evidence: flow-weekly/clubs-visor-sense-muntatge-personal-1280-light.png
evidence: flow-weekly/clubs-visor-alumne-1280-dark.png
evidence: flow-weekly/info-faq-webkit-ui-375-dark.png
evidence: flow-weekly/profile-webkit-ui-1280-light.png
evidence: flow-weekly/responsive-admin-create-menu-768.json
evidence: flow-weekly/23-D10-next-invoice-row-375.png
evidence: flow-weekly/member-today-375-light.png
evidence: flow-weekly/responsive-admin-import-768.png
```
