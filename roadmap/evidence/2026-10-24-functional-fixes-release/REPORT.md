# Functional fixes release review — 24 October 2026

Work resumed on 26 October. INC-92, INC-93, INC-95, INC-97 and the subsequent INC-100 mobile billing issue are implemented. The final focused responsive group passes 13/13 and lint/format checks pass on 946 unchanged inputs. Root's current forced CI40 passes 38/38 tasks with 3,636 tests and no cached tasks; browser41 passes 266/266 cases. The final D11/E11 and compiled three-SPA HTTPS r3 groups pass all seven unique cases on the same 946-input source manifest, plus nine compiled-test harness files. All owned test resources are cleaned. Earlier attempts remain historical evidence and are not counted again. The security lane owns the 26 October exact-image refresh; the 24 October scan below is explicitly historical. Root owns the aggregate release decision and other profile groups.

Independent review of root's complete mock run 06b inspected all five `visual-index/admin-gallery-01..05.jpg` contact sheets (43 admin/course/theme captures) and the full-size `admin-D18-biblioteca-375-light.png`, `admin-D12-agenda-muntatges-375-dark.png`, `admin-D18-importa-375-light.png`, and `admin-D18-registra-1280-light.png`. The desktop example is legible; mobile images exposed page-wide overflow rather than a contained table: a nominal 375px library capture is 595px wide, and its create button extends to 421px. The instructor agenda capture is 797px wide. Root independently found the same symptom in billing/member captures. These are discovery evidence from a passing suite, not proof that the mobile layout passed. INC-97 is authorized for a responsive-shell fix, with a new browser regression measuring document width, actual control bounds, keyboard navigation and preserved role gates at 375/768/1280px. Baseline screenshots remain unchanged; red and green runtime evidence will be retained separately.

| Incident | Result implemented | Regression coverage |
| --- | --- | --- |
| INC-92 | ERASURES and RETENTION_SWEEP have ca/es/en labels. | Runtime test reads the actual verified OpenAPI job enum and checks all 12 names in all three locales. D11 and compiled-app assertions also check the two names. |
| INC-93 | Mandatory legal-duty jobs have no unsupported switch; optional job switches and existing run/dry-run/history remain. A defensive handler guard also refuses the unsupported action. | Runtime tests require no switch and usable run/dry-run controls for mandatory jobs, but preserve optional switches. Compiled regression records zero unsupported PUT requests. No mandatory process is actually executed by that browser check. |
| INC-95 | Preparing follows the requested export ID and only its current QUEUED/RUNNING state. A failed read, missing requested job or READY/FAILED/EXPIRED state cannot retain it. The member card acknowledges the request with neutral text. | Six drawer state tests, three localized acknowledgement assertions and existing export workflows; E11 checks READY download then absence of stale preparing text. |

| Evidence | Exact outcome |
| --- | --- |
| 01-focused-red | exit 1; all nine new cases fail before the fixes. Earlier real compiled-app red evidence remains unchanged in the 23-October folder. |
| 02-focused-green | exit 1; 214/217 pass. The three failures were one outdated ten-job catalog expectation and two mocks that returned a newly-created export ID but never listed it in GET /exports. |
| 03-focused-rerun | exit 0; 42/42 pass after narrowly fixing those three test fixtures/assertions. There are 217 unique tests across the final relevant runs, not 214+42 distinct tests. Product code did not change between 02 and 03. |
| 04-focused-lint / 05-focused-lint | exit 1 then exit 0; corrected only test callback style and unknown resource typing. The successful lint log is empty. |
| 06-compiled-list | exit 0; all four compiled-SPA cases discovered. No browser started. |
| 07-https-config | exit 0; exact proxy trust, static proxy address and source mount verified from merged Compose. No container started. |
| Root full web gate 01 | build exit 2 exposed a TypeScript fixture widening (`theme.mode` inferred string). Corrected JobsCardRuntime fixture with the existing `as Branding` pattern; rerun is owned by root. This was a test compilation issue, not a product failure. |

The source-level permission review is in [ROLE_COVERAGE.md](ROLE_COVERAGE.md). It links API and browser assertions for all principal roles, borrowed sessions, denied operations and tenant ownership. Root added the concrete E10 support-locale/export/erasure assertions identified in that review. Independent review strengthened the support fixture to use device es versus real actor ca, then assert ca during support and es after revocation/self-exit; normal console language and four restricted-route probes are preserved. Light eslint passes (08); their new-image execution remains pending.

The compiled harness uses separately built production bundles for all three SPAs on distinct HTTPS hosts with independent host-only refresh cookies. It verifies deep-link reload, ID logout isolation, member permission denial, delayed loading/offline recovery, retry after a branding503 and both mandatory job rows. The local proxy strips forwarded headers and is the one exact trusted proxy. Its test certificate trust does not establish hosted Caddy/public-CA TLS or live DNS. The API still uses its local test profile. The new demo seed disables club Learn-link exposure and replaces club payment destinations; the production club seed is retained. A separately authorized demo improvement makes ID Clubs navigation configurable with VITE_CLUBS_URL and hides its Learn card with VITE_LEARN_ENABLED=false; production defaults remain unchanged. Two focused App tests cover override/hide/account navigation, while the existing test asserts both original default destinations. The compiled build sets a local app URL and hides Learn; it asserts these actual built DOM results. Lint09 and the no-build Turbo environment/cache-key check10 pass; browser/unit execution of this addition is pending the coordinated gates. No Learn endpoint is navigated or authenticated.

No push, deployment, provider operation or real export is part of this work. Private test TLS keys remain outside the repository/evidence. The previous 22-October cached scan is historical evidence only; the prepared image-scan runner will record one update attempt for each advisory database and scan the new exact image, with update status/timestamps and retained raw output.

Final successful focused commands and their final output (up to 40 lines) follow. Earlier failures remain preserved as complete .log/.exit files. The .command files were written from the recorded executed commands after resumption; their content does not imply a rerun.

`03-focused-rerun` — exit 0

```sh
env HEAVY_WAIT_MIN=120 /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh pnpm --filter clubs-admin exec vitest run src/catalogs/JobsCard.test.tsx src/audit/AuditPage.test.tsx
```

```text
heavy.sh: 09:04 waiting for the host lock, held by: 09:04 agilityhub-core-web: bash -c pnpm --filter @agilityhub/auth exec vitest run src/account-locale.test.tsx && pnpm --filter clubs exec vitest run src/App.test.tsx -t "INC-96|CONVENCIONS_I18N" && pnpm --filter clubs-admin exec vitest run src/App.test.tsx -t "INC-96|CONVENCIONS_I18N" && pnpm exec eslint packages/auth/src/account-locale.ts packages/auth/src/account-locale.test.tsx apps/clubs/src/App.tsx apps/clubs/src/App.test.tsx apps/clubs-admin/src/UserMenu.tsx apps/clubs-admin/src/App.test.tsx --max-warnings 0 && pnpm --filter @agilityhub/auth typecheck

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin


 Test Files  2 passed (2)
      Tests  42 passed (42)
   Start at  09:04:39
   Duration  3.57s (tests 64%, transform 19%, environment 8%, import 7%, setup 2%)

```

`05-focused-lint` — exit 0

```sh
pnpm exec eslint apps/clubs-admin/src/catalogs/JobsCard.tsx apps/clubs-admin/src/catalogs/JobsCardRuntime.test.tsx apps/clubs-admin/src/audit/ExportsDrawer.tsx apps/clubs-admin/src/audit/ExportsDrawer.test.tsx apps/clubs-admin/src/census/MemberPrivacyCard.tsx apps/clubs-admin/src/census/MemberPrivacyCard.test.tsx e2e/core/d11-core.spec.ts e2e/core/e11-core.spec.ts --max-warnings 0 --config eslint.config.mjs
```

```text
(no output)
```

`06-compiled-list` — exit 0

```sh
E1_CORE_PASSWORD=fixture-only-list CORE_EVIDENCE_DIRECTORY=/tmp/agilityhub-functional-list pnpm exec playwright test --config=roadmap/evidence/2026-10-24-functional-fixes-release/playwright.production.config.ts --list
```

```text
Listing tests:
  production-functional.spec.ts:32:5 › compiled three-SPA HTTPS: independent host-only sessions, deep reloads and ID logout isolation
  production-functional.spec.ts:109:5 › compiled member UI: delayed loading, offline stale copy, disabled writes and online recovery
  production-functional.spec.ts:139:5 › compiled cold boot: readable server-failure state and retry recover from a transient branding outage
  production-functional.spec.ts:155:5 › D11 mandatory privacy processes have translated labels and no unusable disable action
Total: 4 tests in 1 file
```

`07-https-config` — exit 0

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-release/check-https-config.py
```

```text
{
  "exitCode": 0,
  "trustedProxyPattern": "172\\.31\\.247\\.11",
  "proxyNetwork": {
    "default": {
      "ipv4_address": "172.31.247.11"
    }
  },
  "network": {
    "ipam": {
      "config": [
        {
          "subnet": "172.31.247.0/24"
        }
      ]
    },
    "name": "agilityhub-e1-w04_default"
  },
  "sourceMount": "/Users/jordib/dev/agilityhub/agilityhub-core-web"
}
```

Demo content/configuration still required before hosted sharing: replace the demo example.test privacy-policy URL with the intended legal page, set VITE_CLUBS_URL to the intended demo member origin and VITE_LEARN_ENABLED=false when building ID, and configure VITE_CONSOLE_URL if offering the console. See docs/DEPLOYMENT.md. The club Learn-link module is separately disabled; configuring product cards is not shared-identity verification.


Fresh exact-image advisory scan (40–44) finished on 24 October at 08:18 UTC, exit 0 for both database update checks, the scan and the HIGH/CRITICAL policy. Image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9` is Linux arm64. There are **59 package findings / 48 distinct IDs: 55 MEDIUM, 4 LOW, 0 HIGH, 0 CRITICAL**. The vulnerability database was downloaded 24 October and updated at 07:11 UTC; the Java-index update check considered its 22 October dataset current and did not download a newer version. Raw inventory and every command/exit are preserved; no remote registry push or provider operation occurred.

| Follow-up | Shipped component and applicability review | Priority/action |
| --- | --- | --- |
| CVE-2026-113730 | OGNL 3.3.4 through Thymeleaf; fixed 3.4.13. The described bypass requires evaluation of attacker-controlled OGNL expressions with permissive reflection access. Both configured engines use ClassLoaderTemplateResolver and fixed `email/system` / `email/notification` templates; message bodies are context values. No untrusted expression evaluator was found in this source review. | Dependency maintenance: test a compatible upgrade and rerun renderer/security tests. This is a reduced observed attack surface, not proof that the library is invulnerable. |
| CVE-2026-85091 | zlib1g `1:1.3.dfsg+really1.3.1-1ubuntu3.1`; Ubuntu fix `...ubuntu3.2` is listed. Advisory concerns a native nonblocking gzwrite/gzprintf stale-buffer path; no such calls were found in application source. Native transitive reachability was not exhaustively traced. | Refresh the runtime base/package and rescan in the next image maintenance change; preserve exact-image regression. |
| New CVE-2026-88648 | libgnutls30t64 `3.8.12-2ubuntu1.1`, MEDIUM, no distro fixed version listed. Advisory concerns cross-domain X.509 restrictions with attacker-controlled subordinate CA. No application shell execution or native GnuTLS integration was found; this does not establish absence of all native consumers. | Track Ubuntu's fix and refresh the base. It is the single added advisory versus the prior image/feed comparison. |
| Remaining OS findings | OS utilities/libraries shipped in the Temurin Ubuntu 26.04 runtime; current report lists no fixed distro version for these. Core starts Java directly as UID 10001; the unused Pebble supervisor remains absent. | Retain package inventory and periodically rebuild/rescan. Do not suppress findings merely because no application usage was found. |

No concrete serious reachable exposure was established by this source-focused triage. A clean HIGH/CRITICAL threshold is not a claim of vulnerability-free software, exhaustive exploit testing, or multi-architecture coverage.


## INC-97 — responsive administration (resumed 26 October)

Visual review of the complete 261-case mock suite found page-wide overflow at a 375 px viewport: library 595 px, billing 632 px, member 558 px and instructor agenda 797 px. The new five-case browser probe reproduces the widths, captures geometry before assertions, and checks administrator 375/768/1280 plus instructor 375/1280. `13-responsive-red` exited 1 on unchanged source; original captures are retained under `2026-10-24-functional-fixes-responsive-red`.

The shell now uses a mobile disclosure with the existing translated administration-navigation label, keyboard Escape/focus restoration and route-change closure. Its existing role/module-filtered navigation remains intact. Mobile content occupies the viewport width; inner billing/week-agenda grid tracks can shrink, header/filter controls wrap, and wide tables/calendars retain their own scrolling containers. No body overflow suppression hides content.

`15-responsive-green` (26 October) passed four cases and failed one real remaining geometry assertion: the course-creation menu extended to x=-87.6 px when its button wrapped to the left. All 17 page-width measurements already fit their viewport with zero body scroll; the internal-scroller, keyboard and role checks passed. The attempt's wrapper also reports an unrelated census test-fixture edit while the container ran; its copied product source did not change. The 375 px dropdown is now left-aligned and bounded within a full-width menu row below 40rem. `16-responsive-menu-lint` exits 0 (lint and formatting). `17-responsive-green` exits 0: all five cases pass, 944 source inputs unchanged. All 17 measured page states have document width equal to viewport (375/768/1280) and body scroll zero. Internal table/agenda scrolling, menu bounds, keyboard Escape/focus/route closure, desktop navigation and instructor role filters pass. New captures are in `2026-10-26-functional-fixes-responsive-final`. Original-size 375 px dropdown, navigation and instructor agenda images were visually reviewed: text/actions fit and the calendar has a contained horizontal scroll area.

Exact commands, complete output, source manifests and exit summaries are in each numbered `.command`, `.log`, `-tested-inputs.json` and `.summary.json`. Root owns the complete final CI and mock-browser suites after all correction lanes freeze their source.

Final responsive command (exit 0):

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-release/run-check.py 17-responsive-green -- bash scripts/e2e-docker.sh INC-97 --capture-task=2026-10-26-functional-fixes-responsive-final --grep=INC-97 --pass-with-no-tests --workers=1 --trace=off
```

The complete output is `17-responsive-green.log`; its last 40 lines are preserved in `17-responsive-green-tail.txt`. The other projects receive an explicit no-match filter for this focused probe; this is five-case coverage, not the complete three-app suite.

Independent review: root also inspected the final 375 px creation-dropdown and instructor-agenda originals, confirming readable actions, intended contained table scrolling and no additional blocker in these images.


## Final real-image run ledger (26 October)

Each stage starts a fresh fictional safe-demo stack and verifies exact image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9` after acquiring the shared host lock. The retained runner now snapshots source after acquisition and checks that its own containers, networks and volumes are removed. No unrelated service is stopped.

- `01-core-d11`: exit 0, **1/1 case passed**, 944 inputs unchanged, cleanup empty, 83.38 seconds. The page reads more than 50 real block/parameter/job labels with no raw keys; ERASURES and RETENTION_SWEEP have translated names, enabled manual simulation/run actions and no switch; the optional risk-review switch remains enabled. Evidence: `core-d11/`, `.command`, `.log` and `.summary.json`.
- `02-core-e11`: exit 0, **2/2 cases passed**, 944 inputs unchanged, cleanup empty, 91.52 seconds. Member ZIP download and N-50 reopen from a fresh launch, impersonation refusal, admin package download, terminal READY notice removal, neutral acknowledgement after closing the drawer, consent history and erasure scheduling/cancellation all pass. Original-size mobile READY profile and desktop admin ZIP drawer were visually inspected; no stale preparation text or duplicate preferences card remains in these captures.
- `03-core-production`: exit 0, **4/4 cases passed**, 953 source and harness inputs unchanged, cleanup empty, 101.97 seconds. Distinct secure host-only refresh cookies, compiled bundles on all three HTTPS hosts, deep-route reload, member403, ID logout isolation, delayed/offline member recovery, branding-error retry and mandatory-job behavior pass. Local product links point to the demo origin and Learn is absent. This run preceded the final dashboard/D4 CSS additions; all three release stages will be repeated against the final frozen source rather than represented as final-source proof.


### Broader-gallery follow-up to INC-97

Root's full-suite capture inventory found two additional uncontained states outside the first focused routes: D1 dashboard (491 px at viewport 375) and D4 selected class (409 px). The full suite also caught four existing `e11-w05.spec.ts` helper failures: it required the mobile sidebar link to be visible before opening the new disclosure. Its business assertions were not reached. The helper now opens the actual mobile navigation, verifies its calendar link, closes it and checks collapse; the eight original desktop/mobile cases remain intact.

The responsive matrix was extended, without reducing the original assertions, to measure dashboard and selected D4 at all three widths, exercise actual contained chart/calendar scrolling and require every visible selected-class action to fit the mobile viewport. `19-responsive-extended-green` retained a meaningful negative result: 12 cases passed and the admin 375 case still failed. Source was unchanged during the run. Grid/card sizing was already corrected, but the chart's visually hidden accessible table remained positioned against the viewport and the planned-course select retained its intrinsic minimum width. The follow-up gives the scrollable chart its own positioning context (keeping its accessible table), and lets calendar chip/select widths shrink inside their card. `21-responsive-extended-green` exits 0: all **13/13** focused cases pass, 944 inputs unchanged. All 23 measured states fit their 375/768/1280 viewport with zero body scroll; every visible selected-class control fits at 375. Actual chart and calendar scrolling remains contained. Original-size 375 px dashboard and selected D4 were reviewed again; the labels/actions fit. `20-responsive-containment-lint` also exits 0 for lint and formatting. Final images: `2026-10-26-functional-fixes-responsive-extended-final` instead of overwriting any earlier attempt.

The previous 17 focused pass was therefore limited to its original measured routes, not a claim that every administration screen was fully checked. Root's broader image inventory is retained as the evidence that found the remaining states.

Extended responsive final command (exit 0):

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-release/run-check.py 21-responsive-extended-green -- bash scripts/e2e-docker.sh INC-97 --capture-task=2026-10-26-functional-fixes-responsive-extended-final --grep='INC-97|E11-W05: the back office' --pass-with-no-tests --workers=1 --trace=off
```

The complete log is retained; `21-responsive-extended-green-tail.txt` preserves its last 40 lines. The five responsive test cases expand their observations; the eight historical E11-W05 cases remain separate. Retries are not counted as additional unique cases.


### Final frozen-source repetitions

- `01-core-d11-r2`: exit 0, **1/1**, 944 source inputs unchanged, exact image unchanged, owned resources cleaned, 84.42 seconds. This supersedes the first D11 run for final-source evidence; it does not add a second unique test case.
- `02-core-e11-r2`: exit 0, **2/2**, 944 source inputs unchanged, exact image unchanged, owned resources cleaned, 89.62 seconds. This supersedes the first E11 run for final-source evidence.
- `03-core-production-r2`: exit 0, **4/4**, 953 source and harness inputs unchanged, exact image unchanged, owned resources cleaned, 103.88 seconds. It was queued after root's E1 group acquired the lock, preserving shared-host serialization and giving another pending group its turn. Its 944 common inputs exactly match both D11-r2 and E11-r2; its nine additional inputs are the retained compiled-HTTPS runner/configuration files. These repetitions establish seven unique final-source cases, not fourteen by counting the earlier passes again.

The final compiled mandatory-job viewport and ID-products originals were visually reviewed: both mandatory processes have readable translated names and usable run/simulate controls without switches, while optional processes retain switches; the ID page shows the single intended Clubs product. The final mobile offline-training capture shows a readable retry notice and disabled confirmation; the final E11 READY-profile capture shows the download action without stale preparation text. These original-size images are in `core-production-r2` and `core-e11-r2`.

Root's `21-web-gates-final` passes all 38 tasks. `22-full-browser-final` passes **266/266 cases** (course-ui 4, ID 1, admin 150, member 111), all ten tasks. This supersedes root's earlier full attempt, whose four old mobile helper failures stopped the member suite from running. The retained final full-suite captures are in `2026-10-26-functional-fixes-final-r2`. Independent original-size review of its dashboard 375, selected D4 light 375, course-placement dark 375 and D16 booking-cancellation dialog 375 confirms readable actions inside the viewport. The dashboard and calendar retain contained horizontal scrolling; this review is scoped to these images and the measured focused states, not a claim to have inspected every screenshot.

### INC-100 — mobile billing open menus and cash rows

The evidence-only `22-mobile-menu-probe` ran on 944 unchanged inputs, exit 1: the billing case failed while the instructor icon case passed. At a 375px viewport, visible Columns spans x=-127.203 to 215.797, Views x=-41.203 to 301.797 and Excel/PDF x=-13.203 to 130.797. Filter correctly spans 16 to 359. Document width remains 375 throughout: document-wide overflow alone would miss this left-side clipping. Original open-state images and every visible control's geometry are retained in `2026-10-26-functional-fixes-mobile-menu-probe`.

The cash-active table ends at x=372 while its card ends at 359, and both record actions end at 364. The separate incident table already fits. The instructor X icon is visible after assets/fonts settle, has a nonempty SVG bounding box and closes with Escape while returning focus; no icon change is indicated.

The narrow INC-100 patch anchors mobile UniversalList popups to their existing positioned toolbar and limits them to its width; it allows billing row-header names to wrap below 40rem. Existing desktop layout remains unchanged. The permanent responsive matrix now opens each of the four billing menus at 375/768/1280, asserts visible panel/control bounds and verifies that each billing simulation table/action remains within its card. Verification `23-inc100-responsive-green` exits 2 before any browser case: the separate INC-99 fixture has a Testing Library `getByRole` option `exact` unsupported by its TypeScript type. All 945 inputs were unchanged. That test-only correction belongs to the profile lane; no responsive product change was indicated by this attempt. `24-inc100-lint` passes lint and formatting on 945 unchanged inputs. The coordinated focused rerun will use a new stem; no earlier evidence is overwritten.

`25-inc100-responsive-green` reaches the browser and passes 12/13 cases on 945 unchanged inputs. Both mobile 375 fixes and desktop 1280 pass; the newly measured 768 state exposes the same menu clipping because the initial popup rule only applies through 40rem. All 35 page-width observations still fit their viewport, showing why explicit open-control bounds are necessary. This is retained as an actual negative tablet result. The proposed follow-up extends popup anchoring to the shell's 60rem mobile/tablet breakpoint; cash-name wrapping stays at 40rem. No assertion is removed or weakened.

The 60rem follow-up is applied. `26-inc100-responsive-final` passes **13/13**, exit 0, 946 inputs unchanged, 77.09 seconds. All 35 measured page states have document width equal to viewport and zero body scroll; all visible panels/controls for Filter, Columns, Views and Excel/PDF fit at 375/768/1280, and simulation tables/actions remain inside the card. Existing selected-D4, dashboard, instructor and keyboard/navigation regressions pass unchanged. `27-inc100-final-lint` passes lint and formatting on the same 946 inputs. Final originals are in `2026-10-26-functional-fixes-inc100-responsive-final`; a visual review of the tablet Columns image confirms the panel starts within the left margin, and cash actions are contained. A new full-suite and final real-image pass follow this freeze; source changes require renewed evidence rather than reusing earlier passes.

All eight 375/768 open-menu originals were reviewed. `inc100-menu-review-manifest.json` in that final folder retains SHA-256 hashes, PNG dimensions and width/scroll measurements. Exact visible-control containment is established by the permanent passing browser assertions; positive control coordinates are not individually persisted. The viewing tool downsamples these tall original pages, a limitation recorded in the manifest.

Root's current `40-final-ci` forced execution passes 38/38 tasks, 3,636 tests, 0 cached; `41-full-browser-final` passes 266/266 cases (course-ui 4, ID 1, member 111, admin 150). Both retain 946 unchanged inputs. Final full-suite images are in `2026-10-26-functional-fixes-final-r3`. The D11/E11/compiled r3 repeats below also completed; earlier r2 passes are not substituted for them.

### Final current-source real-image evidence, r3

- `01-core-d11-r3`: exit 0, **1/1 passed**, 91.01 seconds. All 946 inputs remained unchanged and exactly match both forced CI40 and full browser41. Exact image unchanged; owned containers, networks and volumes cleaned. The required-job names/actions and optional switches pass again after INC-100.
- `02-core-e11-r3`: exit 0, **2/2 passed**, 99.68 seconds. All 946 inputs remained unchanged and exactly match D11-r3, forced CI40 and full browser41. Exact image unchanged; owned resources cleaned. ZIP downloads, fresh-launch member access, impersonation denial, READY notice handling, consent history and erasure schedule/cancel pass again. The final READY-profile original was reviewed and shows its download action without stale preparation text.
- `03-core-production-r3`: exit 0, **4/4 passed**, 111.08 seconds. All 955 inputs remained unchanged: the same 946 common product/test inputs plus nine retained compiled-HTTPS harness files. Exact image unchanged; owned resources cleaned. Independent secure host-only sessions, deep-route reload, ID logout isolation, member permission denial, loading/offline recovery, branding-error retry, configured demo product links and mandatory-process behavior all pass. The final mandatory-process viewport and ID-products originals were reviewed; labels/actions are readable and only the intended Clubs product is offered.

`final-r3-source-equivalence.json` records exact equality of every common input across forced CI40, full browser41, D11-r3, E11-r3 and compiled-r3, the nine harness extras and the exact Linux arm64 image ID. The final count is **seven unique real cases**, not a sum of earlier repeats. Each stage retains its exact command, complete output, summary, source manifest and last40-line tail file. All runs were local and used fictional data; no deploy, push, Learn authentication or provider operation occurred.
