# Functional incident fixes · web · 2026-10-24

User authorization: fix the six recorded incidents, run extensive local regression for all roles, preserve prior evidence, and do not deploy. This lane owns F06 / INC-96 plus browser assertions for API-owned F01 / INC-91 and safe-demo F04 / INC-94. Root owns complete web gates; API owns the newly built review image. No commit, push, provider call or production change.

## Current status · 26 October 2026

**Complete: 59/59 unique real-API browser cases passed, with zero failed, skipped or not-run cases in the selected final runs.** All seven stages used fresh fictional data, the reviewed API image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`, unchanged recorded inputs and complete removal of their owned containers, networks and volumes. Prior attempts are retained and are not double-counted. No deploy, push or real-provider operation was performed.

| Final stage | Scope | Passed | Inputs | Result |
| --- | --- | ---: | ---: | --- |
| `e2-r5` | Census, catalogs and consent/record transitions | 5 | 946 | Exit 0; unchanged inputs; cleanup complete |
| `e3-r5` | Public signup, validation, activation, rejection and add-dog | 5 | 948 | Exit 0; unchanged inputs; cleanup complete |
| `e4` | Planning, activities and permissions | 7 | 946 | Exit 0; unchanged inputs; cleanup complete |
| `e5` | Booking, training and capacity flows | 11 | 946 | Exit 0; unchanged inputs; cleanup complete |
| `e6` | Attendance, follow-up, instructor concurrency and tasks | 14 | 948 | Exit 0; unchanged inputs; cleanup complete |
| `e7` | Communication, preferences, reminders and locales | 11 | 948 | Exit 0; unchanged inputs; cleanup complete |
| `e8-r3` | Inactivity, leave, packs, billing and privacy | 6 | 948 | Exit 0; unchanged inputs; cleanup complete |

`FINAL_CORE_RESULTS.json` is the strict collected result. `FINAL_CORE_COMMANDS.md` contains every shared-lock invocation, executed stage command and last 40 log lines. The collector rejects missing cases, skipped branches, source drift, incomplete cleanup, the wrong image or an unexecuted family branch.

The final application/API source is identical across these stages. Three explicit harness baselines are retained: E2/E4/E5 use the 946-input product freeze; E3/E6/E7 use the 948-input local outbox readiness barrier; E8 uses the same 948 files with only its passwordless-owner test helper and atomic-mailbox filter revised. The final E8 manifest exactly matches the coordinator's `54-final-browser-tested-inputs.json`. The permitted deltas are documented in `outbox-readiness-source-delta.json` and `e8-final-harness-delta.json`; earlier runs are not claimed as reruns of a later harness.

E7's local clock returned 200 and was restored with 200; all clock-dependent cases executed with no skipped markers. E8's actual normal owner requested a magic link (202), exchanged the newly delivered link (200), changed/restored its language and completed the borrowed Spanish flow. Its foreign-member invoice, leave and inactivity operations returned 404. The same-family branch actually ran (`familyPartnerChecked=true`): it checked inactivity PATCH and leave cancellation POST, both 404, then verified the records were unchanged. A separate same-family invoice-URL check is not claimed.

The observed E3 seed-backlog failure is causally documented: after the read-only readiness barrier, N-02 was marked SENT 961 ms after validation and was observed in the local mailbox by 1,918 ms; the unchanged 15-second assertion and the complete signup flow passed. Six helper regressions plus focused lint/type/format checks passed. The E8 401 was a passwordless-fixture assumption; its original financial/permission follow-on failures and successful full repetitions remain documented below.

Visual scope is recorded separately in `final-member-visual-review.json`, `final-member-delta-visual-review.json` and `inc99-final-visual-review.json`: 46 exact-byte member captures reuse their earlier review scope; 10 changed originals and three settled real-API E9 originals were inspected. No persistent product defect was demonstrated by the three blank-glyph mock captures. Local fake mail/payment evidence and communication intents do not establish delivery through real email/SMS/push/payment providers. Hosted checks belong to the later demo deployment.

## Historical work log · 24–26 October

Everything below preserves the sequence of fixes, intermediate source freezes, failed attempts, queued cancellations and the evidence available at each point. Older wording such as “will run”, “remaining”, “final” or “waiting” describes that historical point; the current completion status and selected final runs are the section above.

## F06 behavior

Borrowed impersonation/support sessions now use the authenticated account language temporarily, matching API catalog localization. `useAccountLocale` retains the previous UI language in memory, leaves device storage untouched during borrowing and restores the previous language on exit, expiry or unmount. A direct return to a normal account applies that account's normal persistence behavior. Normal account/club locale precedence remains unchanged. Deferred borrowed-language loading checks whether its effect is still active, preventing a late load from changing the restored UI after exit.

For a borrowed account whose supported product language is not offered by the club, the temporary UI still follows that language, and the disabled selector includes its value. This follows the current API JWT precedence. The existing normal-account club-locale rule is deliberately unchanged; the future Learn/Clubs integration table in S01 §14 has a narrower-club fallback nuance, which this fix does not redefine.

Both shared shell language selectors are disabled during borrowed sessions, with an explicit event guard before language changes, storage writes or `/me` PATCH. The admin menu's focus order skips its disabled selector. Existing member-profile impersonation language restrictions remain.

Files: `packages/auth/src/account-locale.ts`, new `account-locale.test.tsx`, member `App.tsx`/`App.test.tsx`, admin `UserMenu.tsx`/`App.test.tsx`. No API locale policy change or new product copy.

## Focused evidence

- `01-locale-red.log`: new hook regressions against prior product, exit 1, **5 failed / 2 passed**, reproducing both borrowed modes, restored mount and restoration transitions.
- `02-locale-green.log`: initial implementation, exit 0, **7 passed**.
- `03-focused-locale.log`: delayed-load regression passed in the 8-case hook run; member App focused run had **1 failed / 4 passed / 81 filtered**. Its test looked for the shared selector on `/inici`, whose approved layout deliberately has no shared header. Corrected the test to a route retaining the header; product logic was unchanged for this correction.
- `04-focused-locale.log`: final focused command **exit 0**, hook **8 passed**, member App **5 passed / 81 filtered**, admin App **4 passed / 39 filtered**; selected-source ESLint and auth typecheck also passed. Filtered cases are not full-suite coverage; root runs the complete gate.

Final focused command: **exit 0**, `07-final-focused.log`, hook **10 passed**, member App **6 passed / 81 filtered**, admin App **4 passed / 39 filtered**; all selected-source ESLint, auth typecheck and complete Core harness typecheck passed. The log's "skipped" counts are filtered cases from `-t`, not full-suite coverage. Root owns complete regression.

Exact command:

```sh
HEAVY_WAIT_MIN=120 bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh bash -c 'pnpm --filter @agilityhub/auth exec vitest run src/account-locale.test.tsx && pnpm --filter clubs exec vitest run src/App.test.tsx -t "INC-96|CONVENCIONS_I18N" && pnpm --filter clubs-admin exec vitest run src/App.test.tsx -t "INC-96|CONVENCIONS_I18N" && pnpm exec eslint packages/auth/src/account-locale.ts packages/auth/src/account-locale.test.tsx apps/clubs/src/App.tsx apps/clubs/src/App.test.tsx apps/clubs-admin/src/UserMenu.tsx apps/clubs-admin/src/App.test.tsx e2e/core/e2-core.spec.ts e2e/core/e3-signup.spec.ts e2e/core/e8-core.spec.ts e2e/core/e10-core.spec.ts --max-warnings 0 && pnpm --filter @agilityhub/auth typecheck && pnpm typecheck:e2e-core'
```

Last 40 lines:

```text
heavy.sh: 09:41 waiting for the host lock, held by: 09:41 agilityhub-core-api: python3 roadmap/evidence/2026-10-24-functional-fixes-api/run-full-verify.py 5
heavy.sh: 10:13 got the host lock after 32 min 47 s

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/auth


 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  10:13:59
   Duration  779ms (environment 66%, import 15%, transform 10%, tests 8%)


 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs

Not implemented: Window's scrollTo() method

 Test Files  1 passed (1)
      Tests  6 passed | 81 skipped (87)
   Start at  10:14:00
   Duration  1.58s (transform 43%, tests 19%, import 17%, environment 15%, setup 5%)


 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin


 Test Files  1 passed (1)
      Tests  4 passed | 39 skipped (43)
   Start at  10:14:02
   Duration  1.82s (transform 57%, import 15%, environment 13%, tests 11%, setup 3%)


> @agilityhub/auth@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/auth
> tsc --noEmit


> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

The delayed-load regression holds the actual `loadLanguages` promise used by the hook, exits the borrowed session, releases that promise, and checks the actor language remains active with no persisted preference. It tests the asynchronous boundary rather than only a mocked language-call count.

## Real-Core assertions prepared

- E2: seed members 6 (true) and 7 (false), real detail/history `granted` booleans and statuses, translated D10 history badge and current warning; sanitized `consent-consistency.json` plus two desktop captures. API tests separately cover supported legacy data normalization.
- E3: the visible manual-payment instructions must state that the demonstration uses fictional data and prohibit real transfer/Bizum/payment. IBAN and phone-number patterns are rejected. Production seed remains separate and unchanged; root wires the disposable demo definition.
- E8: a normal account session changes the actual target account to Spanish through the profile control (real PATCH/status/request/response/html assertions), then a new borrowed grant is opened on a Catalan device. Verify target `/me` locale, Spanish shell, Spanish `LEARNED_ENOUGH` catalog label, no borrowed locale PATCH or device preference write; exit restores Catalan. The real account preference is restored in `finally`. Existing lifecycle, receipt and monetary assertions remain intact.

`source-tested-inputs.json` records this lane's current source hashes. Final focused updates: `05-core-harness.log` stopped on three root-owned E10 redundant fallbacks and an E2 generic-helper lint rule. All were corrected. `06-final-focused.log` has **10 hook / 6 member App / 4 admin App cases passed**, then caught two redundant optional chains and the E2 generic signature rule. These syntax-only lint items are corrected; `07-final-focused.log` subsequently passed against the exact final source (results above).

Real-Core runs use `agilityhub-core-api:review-fixes-20261024`, exact ID `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`. The first E2 run passed; remaining stages and a final E2 rerun wait for the coordinated INC-97/INC-98 source freeze. Prior 23-October evidence remains unchanged and is not presented as proof of the new fixes.

## Root full-mock gallery visual review

The six `../2026-10-24-functional-fixes-root/visual-index/member-gallery-01.jpg` through `member-gallery-06.jpg` overview sheets were inspected as review aids. They cover 52 member/course light/dark desktop/mobile captures; the overview does not constitute a full-size inspection of every capture.

Original full-size images additionally inspected (all in the root dated evidence folder):

- `clubs-08-entrenaments-375-dark.png` (375 × 1080): training slots, unavailable states, quota, confirmation and bottom navigation fit without overlap.
- `clubs-23-visio-global-375-light.png` (375 × 812): compact agenda cells, occupancy/attendance labels and instructor navigation remain legible; no clipped columns.
- `clubs-registra-muntat-375-light.png` (375 × 1061): wrapped chips, image preview, level selector, date and submit controls fit. The plain floor/border preview is the intended `ringPhoto` fixture, not a missing upload.
- `clubs-07-reserva-personal-1280-light.png` (1280 × 900): centered mobile shell, booking detail, course links and staff action are contained; the wide side margins are intentional.
- `clubs-sessio-muntatge-375-dark.png` (375 × 1261): obstacle numbers, including shared 4/10, coordinates and status badges fit; final action remains above navigation.
- `clubs-visor-instructor-3d-375-light.png` (375 × 812): course canvas, changed-geometry notice, session-code control and instructor actions fit without overlap.

No new actionable layout defect was found in these inspected images. This is a visual check of the full mock run; it does not replace real-Core integration or prove real provider delivery.

## Full-gate feedback and retained preliminary Core run

Root's `05-web-gates-final.log` found five failures that the filtered tests did not cover. Four App tests were affected by an unintended normal-session behavior change: removing the old same-language no-op guard created a device preference when the account/UI were already Catalan. The stored value then superseded later browser-language fixtures. `08-normal-noop-red.log` reproduces that regression directly: **exit 1, 1 failed / 10 filtered**, expected no preference but received `ca`. The ordinary no-op guard is restored; only a direct borrowed-to-normal return explicitly applies the resumed account preference. Existing normal and borrowed assertions remain.

The fifth failure was in `NoticesCard.test.tsx`: an earlier test's real mock `PATCH /me` persisted its account locale as Spanish. Its cleanup removed the UI locale but left the mock server account locale, so a later borrowed-session test correctly became Spanish despite expecting Catalan. The file now starts each test with fresh browser storage; all push-subscription and notification-saving assertions remain unchanged. `09-normal-and-borrowed-final.log` passed against frozen final source: **exit 0, hook 11/11, complete App + Notices 114/114**, no filtered tests, focused ESLint, auth typecheck and Core harness typecheck all passed.

Preliminary `core-e2`: **5 passed, 0 failed, 0 skipped**, Playwright/command **exit 0**, wrapper **exit 99** only because the unrelated new responsive-shell test file appeared during inventory. The exact delta is recorded in `core-e2.summary.json`; all owned containers/networks/volumes were removed. No product source changed during that run. Final E2 will be repeated after INC-97/INC-98 changes.

`core-e2/consent-consistency.json` records both real detail/history responses at 200: member6 true/true and member7 false/false. Both original 1280px screenshots were inspected. The grant and refusal warning/history now agree, with translated consent labels. The member7 screenshot also exposed duplicate notification-preference cards and the previous member's booking-success message after SPA navigation. This is INC-98, handed to the API agent for a narrow CensusRecordPage fix and test. E2 now asserts a single preferences block and absence of the old success message on member7; the original passing run is retained, not overwritten.

Exact final regression command:

```sh
HEAVY_WAIT_MIN=120 bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh bash -c 'pnpm --filter @agilityhub/auth exec vitest run src/account-locale.test.tsx && pnpm --filter clubs exec vitest run src/App.test.tsx src/profile/NoticesCard.test.tsx && pnpm exec eslint packages/auth/src/account-locale.ts packages/auth/src/account-locale.test.tsx apps/clubs/src/profile/NoticesCard.test.tsx e2e/core/e2-core.spec.ts --max-warnings 0 && pnpm --filter @agilityhub/auth typecheck && pnpm typecheck:e2e-core'
```

Last 40 lines:

```text

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  10:23:30
   Duration  476ms (environment 58%, transform 15%, tests 14%, import 13%)


 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs

Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: navigation to another Document
Not implemented: navigation to another Document

 Test Files  2 passed (2)
      Tests  114 passed (114)
   Start at  10:23:30
   Duration  23.21s (tests 93%, transform 4%, environment 2%, import 1%)


> @agilityhub/auth@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/packages/auth
> tsc --noEmit


> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

## Continuation on 26 October 2026

The correction session resumed on 26 October. Earlier attempts remain in this dated folder; fresh runs will use unique stage names and record the exact image and unchanged source inputs. The prepared E2–E8 inventory contains **59 tests in seven files**: 5 census/catalogs, 5 signup, 7 planning/activities, 11 booking/training, 14 attendance/follow-up, 11 communication and 6 lifecycle/billing cases. Listing is preparation, not execution evidence. The final E2 run is `e2-r3`, including INC-98's unique preference-card and old-feedback assertions; `e2-r2` preceded the last common-shell CSS correction.

The anchor preview for 26 October gives E4 week 26 October, E5/E6/E7 week 2 November and E8 week 23 November. Each actual stage computes and logs its current anchors. E7's three optional no-clock paths must execute on this local review image; final results will explicitly report any skipped case. The runner requires the reviewed image ID, acquires source manifests after the shared heavy lock, starts a fresh fictional demo and checks owned-container/network/volume cleanup.

At resumption Docker was stopped; the coordinator started it locally and verified the exact image. No browser run is represented as successful on the basis of the prepared inventory or prior-day result. The coordinator confirmed the common INC-97/INC-98 source freeze before final execution.

## Historical execution ledger · first final-stage completion

All stages below use the exact reviewed image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`, with a new fictional demo stack per stage. Each `.command` retains the complete invocation; `.log` retains full output; `.summary.json` includes exit code, source-integrity and owned-resource cleanup. Final commands and the last 40 log lines are also collected in `FINAL_CORE_COMMANDS.md` when this lane finishes.

| Stage | Passed / failed / skipped | Exit | Source and cleanup | Evidence |
| --- | --- | --- | --- | --- |
| E2 final rerun | 5 / 0 / 0 | 0 | 946 inputs unchanged; no owned containers, networks or volumes remain | `core-e2-r5.log`, `core-e2-r5.summary.json` |

Final E2 full-size `D10-consent-6-core-1280.png` and `D10-consent-7-core-1280.png` were inspected. Each has one preference card. The second member has no previous-member success banner and its own booking-block action; the accepted/revoked history badges agree with the current image-consent warning. This validates INC-98's real SPA transition as well as INC-91's canonical consent behavior. Legacy consent formats remain covered by the API regression rather than this canonical seed.


The first queued E3 continuation was cancelled before it acquired the shared lock: root's full mock-gallery review found additional INC-97 overflow on dashboard/calendar routes. No E3 browser, seed, source manifest or verification command ran in that wait. `core-e3-queued-cancelled.json` records the cancellation; E3 will start only after the next common freeze. E2-r2 remains valid evidence for the unchanged consent and record-transition logic, with its exact earlier shell source manifest.

The final E2-r3 repetition passed on the last common-shell source, with the same consent and record-transition assertions. Earlier E2 and E2-r2 repetitions are retained but are not added to the final unique test total.


## Final member gallery review · 26 October

Root's final 266-case mock suite produced the member gallery in `../2026-10-26-functional-fixes-final-r2`. All six member overview sheets (52 captures) were reviewed, together with six original-size images: training 375 dark, global agenda 375 light, mounted-course form 375 light, staff booking detail 1280 light, build-session list 375 dark and instructor 3D viewer 375 light. The controls, form fields, compact agenda, geometry viewer and bottom navigation remain contained and legible in those inspected states. The centered desktop member shell is intentional. No new actionable visual defect was found. `final-member-visual-review.json` lists the exact files and original hashes; overview review is distinguished from full-size inspection. Real API workflow testing is separate.


## Retained E3 first attempt · date-dependent harness assumption

The first final E3 execution (`core-e3`) finished **1 passed / 1 failed / 3 not run** (serial), command/wrapper exit 1, with 944 source inputs unchanged and no owned resources remaining. The add-dog phase received one eligible start option on 26 October. Its shared `expectQuoteCard` helper incorrectly expected one radio; product `SignupPage` deliberately renders a sole option as a plain quote line, with an existing day-26 regression for that behavior. No product defect is asserted from this failure. `e3-harness-prepared/` holds a test-only correction for the coordinated patch window; no active source was changed while the remaining frozen Core groups ran. This attempt is retained and will not count as a successful E3 result.


## Coordinated patch window · 26 October

E4 was cancelled before acquiring the heavy lock, exit 143, at the coordinator's request to apply the prepared E1/E3/E10 harness corrections and INC-99 before remaining runs. No E4 command, source snapshot, seed or browser started; `core-e4-queued-cancelled.json` retains the exact phase.

INC-99 reuses the existing `agilityhubLevelLabel` helper in the mounted-course library selector, translating EASY/MEDIUM/HARD in Catalan, Spanish and English while preserving club labels such as C–D and absent levels. The new actual-app regression covers those distinctions in all three locales. The gallery/source evidence confirmed the defect; this new test was applied together with the product correction, so no pre-fix unit red run is claimed. E3's prepared single-option helper correction is also applied. Focused validation and remaining fresh Core stages will follow the final common freeze.


## INC-99 and E3 focused validation

`10-inc99-and-e3-focused` passed all 35 tests, then found two shorthand cleanup-hook lint errors in the new fixture. The concurrent build also identified a redundant unsupported `exact` option on `getByRole`; all three were corrected in a coordinated test-only patch window. No product behavior changed. The preserved first attempt is not claimed as a complete gate.

`11-inc99-and-e3-focused-r2` passed **35/35 tests**, focused ESLint, clubs typecheck, Core harness typecheck and formatting, exit 0; all 945 source inputs remained unchanged. This includes the three locale regressions and the complete existing course UI suite.

Exact commands:

```sh
pnpm --filter clubs exec vitest run src/courses/register-level-labels.test.tsx src/courses/courses.test.tsx
pnpm exec eslint apps/clubs/src/courses/RegisterSetupPage.tsx apps/clubs/src/courses/register-level-labels.test.tsx e2e/core/e3-signup.spec.ts --max-warnings 0
pnpm --filter clubs typecheck
pnpm typecheck:e2e-core
pnpm exec prettier --check apps/clubs/src/courses/RegisterSetupPage.tsx apps/clubs/src/courses/register-level-labels.test.tsx e2e/core/e3-signup.spec.ts
```

Last 40 lines:

```text
$ pnpm --filter clubs exec vitest run src/courses/register-level-labels.test.tsx src/courses/courses.test.tsx

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs

Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method

 Test Files  2 passed (2)
      Tests  35 passed (35)
   Start at  09:21:46
   Duration  15.19s (tests 86%, transform 8%, environment 3%, import 3%, setup 1%)

$ pnpm exec eslint apps/clubs/src/courses/RegisterSetupPage.tsx apps/clubs/src/courses/register-level-labels.test.tsx e2e/core/e3-signup.spec.ts --max-warnings 0
$ pnpm --filter clubs typecheck

> clubs@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs
> tsc --noEmit

$ pnpm typecheck:e2e-core

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

$ pnpm exec prettier --check apps/clubs/src/courses/RegisterSetupPage.tsx apps/clubs/src/courses/register-level-labels.test.tsx e2e/core/e3-signup.spec.ts
Checking formatting...
All matched files use Prettier code style!
```

The coordinator added INC-100's common UI correction during the patch window. Final integration evidence will therefore use E2-r4, E3-r2 and E4–E8 on this post-patch source; preceding repetitions remain documented and are not double-counted.


The first post-INC-100 E2 repetition (`core-e2-r4`) passed **5/5, zero skips**, exit 0, 945 inputs unchanged and complete cleanup. Its member7 original image was re-inspected: one preferences block, no stale success message, correct booking-block control and refusal/history. The consent JSON again records 200/200 detail/history and true/true for member6, false/false for member7.

The responsive lane subsequently found a tablet-width menu case outside the initial mobile breakpoint. E3-r2 had already acquired its lock, so it was allowed to finish; E4–E8 will wait for that coordinated CSS correction. Earlier post-patch runs remain tied to their recorded manifests; they are not silently relabelled as later-source evidence.


E3-r2 passed **5/5, zero skips**, command/wrapper exit 0, 945 inputs unchanged and complete owned-resource cleanup. The original `19-add-dog-core-375.png` was inspected: one plain TODAY option on 26 October, entry €100 plus additional-dog €45, total €145. `signup-quote-add-dog-core.json` confirms the submitted total and additional-dog option exactly match the API quote. The fictional-demo instructions explicitly prohibit real payment. A cosmetic improvement remains available: the €45 value's currency symbol wraps to a second line beside the long label at 375 px; it remains readable and does not block the workflow. No functional defect is inferred from that wrap.


## Final INC-99 visual proof

After the final forced CI and 266-case full browser pass, both original Spanish library screenshots in `../2026-10-26-functional-fixes-final-r3` were inspected at 375 and 1280: `50-registrar-montado-biblioteca-es-375.png` and `50-registrar-montado-biblioteca-es-1280.png`. The shared levels render “nivel Medio” and “nivel Fácil”; custom C–D is preserved; an absent level produces no level label. Both layouts remain contained. `inc99-final-visual-review.json` records the exact hashes and separates this Spanish visual scope from the three-locale/all-level unit coverage.


## Final member gallery delta review

`final-member-delta-visual-review.json` records original-size review of 10 changed member/course captures from final-r3: home and reserve, the empty mounted form, three completed-build views, two mobile member viewers and the two Spanish library states. The 46 byte-identical member-gallery captures retain the earlier overview/six-selected-original review scope; they were compared by bytes and are not claimed as newly inspected originals. No new persistent layout defect was found.

Capture improvement: the just-completed build views can capture the rotate button before its external-sprite icon paints, while the settled viewer captures show it. The completion banner can precede the async viewer, and the current icon-box readiness poll can finish before that icon mounts. This is documented as a capture-readiness limitation, not a reproduced persistent product failure.


The final real-API E9-r2 follow-up inspected `core-visor-alumne-muntatge-375.png`, `core-visor-instructor-375.png` and `core-registrat-375.png` in the root lane. All three show the rotate glyph, including the newly registered setup, and contained controls. Their hashes are added to `final-member-delta-visual-review.json`. Thus the blank glyph is bounded to three mock gallery captures; asynchronous capture readiness is a plausible explanation, not a proven cause, and no persistent product defect is demonstrated.


## E3-r3 delivery timeout retained

On the final 946-input freeze, E3-r3 completed **1 passed / 1 failed / 3 not run**, exit 1, unchanged inputs and complete cleanup. The failure occurred after admin validation and the refreshed dashboard had passed: `waitForMessage` did not find the local fake-mail N-02 activation message for the accepted applicant within its unchanged 15-second assertion. This precedes the add-dog phase and differs from the earlier single-option helper issue. The prior E3-r2 success does not erase this later failure.

Normal stage teardown removed the mailbox volume, so that attempt does not preserve message contents or outbox state and cannot establish a root cause. Read-only source review shows a one-second outbox dispatcher with retries/backoff and an atomic local mailbox writer. No timeout or product change was made. `run-e3-observed.py` prepares a fresh E3-r4 with the same spec/timeout and a local observer that preserves mailbox metadata (no bodies or activation query values), notification/outbox states and redacted Core logs before teardown. Other frozen profile groups continue independently.


## Local seed outbox readiness correction

Observed E3-r4 reproduced the timeout with unchanged source and the unchanged 15-second assertion. Its sanitized timeline shows the accepted `MemberValidated` event unclaimed for at least 16.66 seconds: attempts 0, no processed consumers, no welcome token/N-02/mail. Older pending work drained from 941 to 82 events during that interval. Account/membership were active and the app domain verified. The delay is therefore upstream of rendering, mailbox writing and the browser predicate in this observed run. E3-r3 lacked that instrumentation; the shared cause is supported but is not retroactively proven.

The completed demo seed produces its events with scheduling disabled; Core health can become ready before the dispatcher drains them. The harness now waits read-only for all PENDING and FAILED domain events after seed/Core health and before browsers. FAILED or an invalid/unavailable count stops the stage; PENDING includes leases and future retries. Three empty samples spanning at least two seconds are required, with a 180-second overall bound and a five-second maximum read. No event is deleted or changed, no job is disabled, and E3's delivery assertion remains 15 seconds.

Only `scripts/e2e-core.sh` and the new readiness helper/test changed; `outbox-readiness-source-delta.json` compares final CI's 946 inputs with the 948-input harness version. Product/API/browser-spec source is unchanged. Earlier successful runs retain their baseline provenance. The helper's six meaningful regression cases, ESLint, formatting and shell syntax passed (`12-outbox-readiness-checks.log`, exit 0). E3-r5 will repeat the complete affected browser stage with delivery observation, followed by E6–E8.


E3-r5 passed **5/5, zero failed/skipped/not-run**, exit 0, 948 inputs unchanged and complete owned-resource cleanup. The readiness barrier drained 1,126 initial pending events, recorded zero failed events, and accepted three empty samples spanning 2,504 ms after 46,773 ms total. The observed accepted-applicant `MemberValidated` then produced an N-02 marked SENT **961 ms** after the event; the first sanitized mailbox observation followed by 1,918 ms. The browser used its unchanged 15-second assertion and completed activation/login plus every remaining signup/add-dog case. `core-e3-r5-observation/analysis.json` preserves the compact timeline, evidence hashes and limitations. This confirms local fake-mail delivery after the causal harness correction; it does not measure real providers or large production backlog latency.


## E8 passwordless-owner fixture correction

The first E8 final attempt completed **3 passed / 3 failed / zero skipped**, exit 1, with 948 inputs unchanged and complete cleanup. The first failure was a 401 while the new locale fixture tried to sign in with the common seed password, before submitting any leave. The selected family member is Gala Fictici023, member number 23 / seed ordinal 22 (`D10-calaix-inactivitat-core-1280.png`). Only the first 15 accounts have seed passwords; later accounts are intentionally passwordless. `DemoIdentityService.link` inserts them with no password and onboardingPending=false. The normal account language helper had assumed every selected member shared the login password.

The later billing assertion and missing-ID permission failure follow from the leave never being submitted/approved; this attempt does not demonstrate a financial-calculation defect. The independent inactivity, pack and fake-card cases passed. `e8-passwordless-owner-source-delta.json` records the diagnosis and exact one-file test-only delta. The helper now uses the real login UI's magic link, recipient-specific fresh local mailbox evidence, the expected app host and a successful magic-link grant, then verifies the normal owner identity before changing/restoring language. The family-member selection, financial assertions and borrowed-language checks are preserved. ESLint, Core typecheck and formatting passed in `13-e8-passwordless-owner-checks.log`; the entire E8 stage is being repeated as E8-r2.


E8-r2 passed **6/6, zero skipped**, exit 0, 948 unchanged inputs and full cleanup. The selected passwordless owner requested its link through the UI (202), exchanged the actual locally delivered link (200), and entered as its normal account. The complete leave/billing flow passed, and `familyPartnerChecked=true` confirms the optional family branch actually ran. An independent review then found an avoidable helper race: the local sink creates `.pending-*.json` before atomic publication. After E8-r2 completed, one line excluded those unpublished files. ESLint, Core typecheck and formatting passed again (`14-e8-atomic-mailbox-checks.log`); E8-r3 repeats all six cases on the final helper. `e8-final-harness-delta.json` compares the final one-file spec change with E7's preceding 948-input manifest. E8-r2 remains intermediate evidence and is not double-counted.


E8-r3 is the selected final E8 proof: **6/6 passed, zero failed/skipped/not-run**, exit 0, 948 unchanged inputs, exact coordinator baseline54 match and complete cleanup. It preserves normal passwordless-owner login, all financial cases and the executed same-family inactivity/leave privacy branch. The complete lane collector finished at **59/59 unique passed**; no source or test edits followed this freeze.
