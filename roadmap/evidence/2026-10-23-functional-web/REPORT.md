# Additional local functional web review · 2026-10-23

The user requested further functional testing and documented incidents/improvements before any deployment. This review preserves the previous evidence and frozen product. Its only initial metadata edit is a narrow `.gitignore` exception for these evidence logs. No product change, provider operation, production data access or deployment is authorized in this lane. Fictional people and simulated transactions, local mail sinks and fake payment/DNS providers; the seed retains existing club configuration, including public manual-payment instructions. No transfer was made.

Image: `agilityhub-core-api:review-20261023`, exact ID `sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e`. `00-scope.log` records the unchanged prior 27 tested sources; `functional-baseline-tested-inputs.json` adds the seven assigned specs (34 files total). Each stage gets fresh seed data and its own disposable Compose project, acquires the shared heavy lock, and releases it before the next team member's stage.

Final outcome (completed 2026-10-24): **50/50 distinct additional real-Core cases passed across seven fresh-seed suites, with zero final skips**. Original E4/E7/E8 harness failures remain preserved. This lane documents P2 legacy-consent inconsistency and P3 borrowed-session language inconsistency, plus the parent-owned demo-payment configuration concern; passing suites do not erase these findings. Four test specs changed, no product source. The pinned API image and remaining 30 of 34 baseline inputs are unchanged.

## Stage status

| Stage | Outcome | Scope |
|---|---|---|
| E2 | 5 passed, exit 0 | Census/filtering, booking block, member profile, catalogs, parameters/history/export/audit, club Markdown page, dog documents |
| E3 signup | 5 passed, exit 0 | Public signup, validation, welcome/rejection, adding a dog, closed signup |
| E4 planning/activities | Final 7 passed, exit 0; original harness failure retained | Templates, week validation, cancellations, ring blocks, activities, FIFO, exports |
| E4w16 cross-feature | 5 passed, exit 0 | Member tasks, password reset, impersonation, exports, billing module boundary |
| E5 booking/training | 11 passed, exit 0 | Holds, cancellations, swap, waitlist, training windows, jobs and risk review |
| E7 notifications | Final 11 passed, exit 0; both original harness failures retained | Account language, cancellation notices, template edits, preferences, push stub, broadcast, reminders |
| E8 billing/lifecycle | Final 6 passed, exit 0; original harness failure retained | Inactivity/leave, packs, remittances/rollback, cash, exports, permissions, fake-card settlement |

## Confirmed findings

### F-WEB-01 — image consent current status and historical badge disagree

Observed in the real E2 screenshot of fictional member Laia Fictici006: D10's current consent warning says “No autoritza l'ús de la seva imatge”, while “Historial de consentiments” contains only IMAGE_USE “acceptat” dated 01/09/2026. The existing five tests passed because they do not compare these two consent surfaces.

Reproduction: run E2 on a fresh reviewed-image seed; open the D10 record reached from the `member@example.test` census result; compare “Consentiments” in the upper data panel with the lower privacy history. Evidence: `core-e2/D10-abonat-bloquejat-core-1280.png`, inspected with `view_image`.

Expected: current image-use state and the latest relevant history entry use consistent consent semantics, or a later withdrawal is shown. Actual: the screen contradicts itself. The current warning reads `member.consents?.imageRights.granted` (`apps/clubs-admin/src/census/CensusRecordPage.tsx:671`), while the history badge renders the API history's `granted` (`MemberPrivacyCard.tsx:256`). `DemoSeedService.java:100` stores a legacy `accepted` field; `ConsentLedgerConverter.read()` preserves legacy maps; `CensusConsents.history()` defaults missing `granted` to true. The owning API reviewer confirmed that `accepted` is a supported legacy form: `ConsentLedgers.entries()` already uses the `granted`/`accepted` fallback. `CensusQuery.java:66` instead selects only `granted`, and `CensusConsents.java:40` treats its absence as true. No product changes made.

Priority: **P2 — inconsistent consent presentation for supported legacy data**, also visible in current demo seeds. The exact screenshot's member number 6 is even: stored `accepted=true`, current projection omits `granted` and the UI shows false, while history is true. For odd member number 7 the source stores `accepted=false`, but the history fallback still returns true; the second branch is now confirmed by the read-only runtime probe. Root independently inspected the screenshot and both API/web reviewers traced these branches.

Follow-up recommendation: normalize legacy/seed consent semantics at one boundary and add assertions relating current detail/list values to the latest history entry for accepted true and false. Never infer authorization from a missing boolean. `capture-consent.py` is a local evidence-only read probe; it records only consent fields and HTTP statuses, never runtime passwords or bearer tokens.

Runtime confirmation on the fresh E3 seed (2026-10-24, exact same image): `02-consent-comparison.log` and `core-e3/consent-comparison.json`, probe exit **0**. `GET /members/{id}` and `GET /members/{id}/consents` both returned **200** for each member.

| Fictional member number | Stored `accepted` | Current `granted` | Current UI | History `granted` |
|---|---|---|---|---|
| 6 | true | absent | false | true |
| 7 | false | absent | false | true |

The current API result contains only `imageRights.at` in both cases. The frozen OpenAPI `components.schemas.ImageRights` requires `granted` with type `boolean`, so this is also a concrete response-contract violation. For number 6, the current display loses an accepted consent; for number 7, the history incorrectly claims acceptance of a refused consent. The probe compared only fictional seed data and stored no credentials or member IDs.

## E2 result and visual inspection

Command (exit **0**, 5 passed in 19.5 s):

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e2 e2-core.spec.ts
```

Full output: `01-core-e2.log`. Last 40 lines:

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
Done in 6.9s using pnpm v9.15.9

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


Running 5 tests using 1 worker

[1/5] e2e/core/e2-core.spec.ts:199:5 › T-03-42 real census flow, booking block and member profile
[2/5] e2e/core/e2-core.spec.ts:387:5 › T-05-22/T-05-25 real catalog create, edit and deactivate round trips
[3/5] e2e/core/e2-core.spec.ts:472:5 › T-02-13/T-14-26 real parameter history, export and audit
[4/5] e2e/core/e2-core.spec.ts:559:5 › T-05-CP-07 real club page edit renders styled Markdown on screen 30
[5/5] e2e/core/e2-core.spec.ts:612:5 › T-03-40 E3-W12 step 4 · screen 13 reads GET /me/dogs only: the seed's document types, «Nivell» per dog, no /parameters (S03 §6)
  5 passed (19.5s)
```

The five local filtered-census timings were 61.7, 61.9, 63.4, 59.3 and 61 ms (median 61.7, maximum 63.4; `core-e2/performance-members.json`). This is a small local sample, not a hosted latency estimate.

Actually inspected:

- `core-e2/D10-abonat-bloquejat-core-1280.png`: the booking-block success state and badge are visible, controls and panels fit the desktop layout; the consent inconsistency above is recorded rather than hidden by the passing result.
- `core-e2/13-document-types-core-375.png`: the document type is a readable label (“Cartilla de vacunes”), the upload dialog, form fields and action button fit 375 px without clipping. Browser-native file-picker text uses the test browser's language; app labels are Catalan.

## E3 result and visual inspection

Executed on 2026-10-24, fresh seed, unchanged review image. **5 passed in 38.9 s, exit 0**; no skips. Full output: `02-core-e3.log`.

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e3 e3-signup.spec.ts
```

Last 40 lines:

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
Done in 6.5s using pnpm v9.15.9
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


Running 5 tests using 1 worker

[1/5] e2e/core/e3-signup.spec.ts:721:5 › T-02-07 E3-W12 step 5 · the signup's public footer shows /branding's identity and registered office (S02 R-02-02)
[2/5] e2e/core/e3-signup.spec.ts:739:5 › T-04-34 public signup is validated and enters through the N-02 welcome link @critical-alta
[3/5] e2e/core/e3-signup.spec.ts:2090:5 › T-04-34 rejected signup delivers N-03 @critical-alta
[4/5] e2e/core/e3-signup.spec.ts:2097:5 › T-04-34 active member adds a dog and the club validates it @critical-alta
[5/5] e2e/core/e3-signup.spec.ts:2101:5 › T-04-34 signup.enabled=false shows only the configured closed text
  5 passed (38.9s)
```

Actually inspected with `view_image`:

- `core-e3/17-document-required-core-375.png`: the missing vaccination document is highlighted with actionable Catalan error copy, the mobile form and plan cards remain readable, and the continuation button fits the page width.
- `core-e3/D2-signup-add-dog-method-core-1280.png`: the open edit drawer shows the family payment method and requested two-dog plan; fields are readable and the background record is dimmed as intended. This is a scrolled drawer view, not a claim that all fields/actions are visible at once.

Parent additionally inspected `18-family-core-375.png`, `19-payment-core-375.png` and the closed-signup capture. The payment page exposes the approved club seed's real public manual-transfer/Bizum instructions (`seeds/club-canic.yaml:63–67` in the API repository). Root records this separately as demo-preparation F04/INC-94: use separate non-operational instructions for a public demo, while preserving the production configuration. No transfer occurred. This review does not claim every configuration field is fictional.

The separate consent probe ran once during this same healthy stack:

```sh
python3 roadmap/evidence/2026-10-23-functional-web/capture-consent.py \
  agilityhub-2026-10-23-functional-web-core-e3 \
  roadmap/evidence/2026-10-23-functional-web/core-e3/consent-comparison.json
```

Exit **0**; full output (`02-consent-comparison.log`):

```text
member 6: stored accepted=True, current granted=ABSENT, current UI=False, history granted=[True], HTTP=200/200
member 7: stored accepted=False, current granted=ABSENT, current UI=False, history granted=[True], HTTP=200/200
```

## E4 initial result and test-harness correction

`03-core-e4.log`: fresh reviewed-image seed, exit **1**, **5 passed, 1 failed, 1 not run** in 38.3 s. The Spanish member case expected region `Actividades` after normal sign-in, but its setup only set `localStorage` to `es`; the account locale takes precedence by the existing `useAccountLocale` contract. The seed account remains Catalan. The serial export-error case therefore did not run. The earlier five planning/activity cases passed. The original red evidence is retained.

This is a harness setup defect, not a product-locale regression. The Spanish texts and all booking/FIFO/API assertions remain unchanged. The correction sets the real member account locale through the current profile control, checks PATCH status/body/returned locale and `html.lang`, and restores the original locale in `finally`. The admin locale selector is now opened in the actual user menu; its real PATCH and restoration receive the same checks. E5 has the same normal-account/localStorage-only setup, so root authorized applying the established E6 pattern there before its run. E8's Spanish shell is impersonated; `useAccountLocale` ignores borrowed sessions. Its localStorage setup forces shell copy only, not the authenticated/API locale. The mixed-language result is documented as F-WEB-02 / parent F06 (INC-96); it does not prove Spanish API catalog labels.

Focused checks passed: `pnpm exec eslint e2e/core/e4-core.spec.ts e2e/core/e5-core.spec.ts --max-warnings 0` (exit 0, empty `04-locale-harness-lint.log`) and `pnpm typecheck:e2e-core` (exit 0, `04-locale-harness-typecheck.log`):

```text
> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit
```

Actually inspected from the initial run: `core-e4/D4-activitat-totes-les-pistes-core-1280.png` (weekly grid shows the all-ring activity, cancelled classes, ring-maintenance block and instructor inconsistency warning without page-width clipping) and `core-e4/10-avui-core-375.png` (member day grid fits 375 px, with occupied rings and no registration counts; navigation remains visible). These screenshots precede only the harness locale correction; they do not prove the failed Spanish branch.

The failed run mentions a Playwright trace under ephemeral `/work/test-results`; no trace ZIP was copied to this evidence directory. Retained failure material is the redacted command log and an admin accessibility dump, plus selected ordinary screenshots. Later runs explicitly disable tracing; no password/bearer trace is retained.

## E4 final retry

Fresh seed and unchanged image after the two test-only locale corrections: **7 passed in 29.2 s, exit 0**, no skips. Full log `05-core-e4-locale.log`; `core-e4-locale/e4-core-run.json` records both member/admin original and restored `ca` values with selected `es`. Root reviewed the diff without whitespace and confirmed original assertions were retained.

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e4-locale 'e4-core.spec.ts --trace=off'
```

Last 40 lines:

```text
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
Done in 6.5s using pnpm v9.15.9
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

Running 7 tests using 1 worker

[1/7] e2e/core/e4-core.spec.ts:539:5 › T-06-28 E2E (a) D3: the three seeded templates, «Setmana B» blocked by its inconsistency, «Setmana A» generates the proposed week, D3b per ring
[2/7] e2e/core/e4-core.spec.ts:674:5 › T-06-28 E2E (b) D4: «Esborrany» opens the seeded draft week, [VALIDAR LA SETMANA], the D4c modal with the 4 registrants (200), «Anul·lades», ring blocks (409 then 201)
[3/7] e2e/core/e4-core.spec.ts:858:5 › T-06-28 E2E (c) screens 10 and 23: the member never sees the cancelled class nor counts, the validated week is visible; the instructor sees the block, the dimmed class and n/n
[4/7] e2e/core/e4-core.spec.ts:913:5 › T-07-32 E2E (d) D7: the four seeded activities, the Torneig blocks every ring on D4, a new seminar published over a class with the conflict dialog; D7 exports against the core
[5/7] e2e/core/e4-core.spec.ts:1158:5 › T-07-32 E2E (e) ca: 04 → detail → register → 03 → cancel in time; the waitlist of the full «Seminari de handling» and the FIFO promotion when the admin adds a place
[6/7] e2e/core/e4-core.spec.ts:1330:5 › T-07-32 E2E (e) es: the same member flow with the es literals, a second FIFO promotion, then the admin cancels the seminar (200) and the registrant reads «cancel·lada pel club»
[7/7] e2e/core/e4-core.spec.ts:1520:5 › E4-W05 step 7 · the «Excel · PDF» menus of D5 and D7 with EXPORT_TOO_LARGE and while an export is pending
  7 passed (29.2s)
```

## E4w16 result and visual inspection

Fresh seed, unchanged image: **5 passed in 13.4 s, exit 0**, no skips. Full output: `06-core-e4w16.log`.

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e4w16 'e4w16-core.spec.ts --trace=off'
```

Last 40 lines:

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
Done in 5.9s using pnpm v9.15.9
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


Running 5 tests using 1 worker

[1/5] e2e/core/e4w16-core.spec.ts:231:5 › T-03-40 E4-W16 step 11 · screen 13 lists the task rows, the done ones struck through
[2/5] e2e/core/e4w16-core.spec.ts:352:5 › T-01-19 E4-W16 step 10 · a RESET link sets the new password once without `current`
[3/5] e2e/core/e4w16-core.spec.ts:434:5 › T-01-11 E4-W16 step 1 · «Entra com l'abonat» opens the club app through the one-time code, once; E5-W05 step 24 · its banner names the member record, not the account
[4/5] e2e/core/e4w16-core.spec.ts:639:5 › T-14-26 E4-W16 step 5 · a READY export downloads from the drawer through GET /exports/{id} and the bearer
[5/5] e2e/core/e4w16-core.spec.ts:694:5 › T-03-34 (front) E4-W16 step 7 · D10 keeps the block, «Inactivitat», «Baixa» and the audit whatever BILLING says
  5 passed (13.4s)
```

Actually inspected: `core-e4w16/02-recuperacio-core-375.png` shows the intended reused-link rejection with masked password fields and a readable recovery instruction, within mobile width. `core-e4w16/exports-drawer-core-1280.png` shows the prepared 184-row export, filename and download control inside the desktop drawer. Neither screenshot exposes the runtime credential.

Final E4 visual follow-up: this agent inspected `core-e4-locale/activitat-llista-espera-core-es-375.png`; Spanish waiting-list confirmation and rank fit the mobile screen. Parent independently inspected that image plus `D7-inscrits-llista-espera-core-es-1280.png`, confirming Spanish status labels and FIFO ranks 1–3; the free-text seminar title correctly stays in its authored language.

## E5 result and visual inspection

Fresh seed, unchanged review image, established locale setup correction: **11 passed in 44.3 s, exit 0**, no skips. Full output: `07-core-e5.log`. The suite exercises real seat holds, both cancellation timings, atomic swap, notified waitlist claims, weekly/day-based training limits, ring conflicts, risk simulation/execution, opening-time boundaries, and server-side search/filter labels. Jobs and clock are restored by its failure-safe cleanup.

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e5 'e5-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 6.8s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:291) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:389) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 11 tests using 1 worker

[1/11] e2e/core/e5-core.spec.ts:932:5 › E5-W04 step 2 · the automatic processes off, POST /test/clock to demoNow, and the parameters the flows read @critical-reserva
[2/11] e2e/core/e5-core.spec.ts:1005:7 › week 0 at demoNow › T-08-40 (a)(b) · 03 and 04 from the seed, a booking inside the 30 s hold, an in-time and a late cancellation @critical-reserva
[3/11] e2e/core/e5-core.spec.ts:1117:7 › week 0 at demoNow › T-08-40 (c) · 06 swaps the week's booking in one step; without a swappable one, 29
[4/11] e2e/core/e5-core.spec.ts:1238:7 › week 0 at demoNow › T-08-40 (d) · ALL_AT_ONCE: join a full class, a seat released more than 30 min ahead, NOTIFIED, claim @critical-reserva
[5/11] e2e/core/e5-core.spec.ts:1368:7 › week 0 at demoNow › T-08-40 (g) · the same flows in es: (a) a booking inside the hold, on 03; (d) a waiting entry, gone from 04 and on 03, claimed
[6/11] e2e/core/e5-core.spec.ts:1472:7 › week 0 at demoNow › T-09-40 (e) · 08 counts 3/week in the day+3 window with «Qualsevol»; 24 blocks a ring, never over bookings
[7/11] e2e/core/e5-core.spec.ts:1764:7 › week 0 at demoNow › E5-W04 step 5 · the core's statuses for JOB_UNKNOWN, SLOT_NOT_ON_GRID, DOG_ALREADY_BOOKED and OVERRIDE_NOT_ALLOWED
[8/11] e2e/core/e5-core.spec.ts:1838:7 › week 0 at demoNow › T-15-32/T-15-33 (f) · D11 simulates (nothing changes) and runs the risk review; D1 reports it; P9 by its run
[9/11] e2e/core/e5-core.spec.ts:1969:5 › R-09-05 · 08 counts by session date: on Sunday the day+3 window reaches the next week, and a Monday booking moves only Monday's counter
[10/11] e2e/core/e5-core.spec.ts:2044:5 › R-15-11 (f) · P1 with the clock advanced: NOT_YET_OPEN before Sunday 20:00, BOOKABLE by the clock at 20:01, and [Executa ara] opens the week
[11/11] e2e/core/e5-core.spec.ts:2151:5 › E5-W05 round 2 · E75 · GET /training-bookings?q= and GET /ring-blocks?q= answer the matching rows on the core and narrow both tabs of «Entrenaments»; GET /bookings/filter-values labels every value
  11 passed (44.3s)
```

Actually inspected: `core-e5/06-confirmar-canvi-core-375.png` (375 × 844: hold timer, original/new booking choice, unavailable past class and complete swap action fit); `03-inici-core-es-375.png` (375 × 844: Spanish greeting/navigation/reservation status with all three confirmed bookings); `entrenaments-cerca-core-1280.png` (1280 × 1315: search narrows to one matching dog/member/ring row and the date filter remains visible). No new visual issue recorded.

Additional parent inspection: `core-e4w16/13-impersonat-core-375.png` shows the named impersonation banner, exit control and task states. Its measured PNG is **1280 × 1377**, despite its historical `375` suffix: it is a desktop popup capture with a centered app, not 375 px evidence. No rerun or renamed evidence was needed.

## E7 initial result and route-cleanup correction

`08-core-e7.log`: fresh seed, exit **1**, **7 passed, 1 failed, 3 not run** in 30.2 s. The failure is Playwright's `route.fetch: Request context disposed` in the injected branding/public-push-key callback after the prior test closed the push browser context during logout; Playwright attributed it to the next error-contract case. The log retains the actual stack at `e7-core.spec.ts:1981`. This is an asynchronous harness cleanup failure, not a Core notification refusal.

Core's test clock was available. Conditional cases (c) template editing and (d) email preference both ran and passed; conditional reminder case (h) did not run because of the serial predecessor failure, not because clock detection skipped it. The console line `real SMS skipped` reports the absent live Twilio provider, not a skipped Playwright test.

The test-only correction awaits `context.unrouteAll({ behavior: "wait" })` before closing both the normal logout push context and sessions during failure-safe cleanup. It drains callbacks; it neither ignores callback errors nor catches them silently. Parent reviewed the minimal diff and confirmed every assertion is unchanged. Focused ESLint passed with empty `10-e7-route-lint.log`; full core harness typecheck passed (`10-e7-route-typecheck.log`, exit 0):

```text
> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit
```

Exact checks: `pnpm exec eslint e2e/core/e7-core.spec.ts --max-warnings 0` and `pnpm typecheck:e2e-core`, both exit 0. The original failure is retained; a fresh complete retry follows E8. E7 is the third changed harness spec; every product source remains frozen.

## F-WEB-02 — borrowed-session language differs between shell and API labels (parent F06 / INC-96)

**P3, presentation consistency.** Actual E8 `core-e8/15-baixa-core-375.png` (375 × 844), inspected by this agent and root, has Spanish shell labels but Catalan reason `Ja he après tot el que volia`. `core-e8/e8-gate-record.json` records `leave.reasonLabelForEs` with that Catalan value. The parameter catalog already contains the Spanish translation (`parameters/catalog.yaml:773`), so this is not missing catalog content.

Owning behavior: web `packages/auth/src/account-locale.ts` excludes borrowed sessions from account-locale application; the impersonation UI retains the device language. API `ImpersonationService` issues the target account's locale and `RequestLocaleResolver` applies JWT locale before `Accept-Language`, as explicitly documented by `CONVENCIONS_I18N` §2 and S01 §10. `LifecycleViews.label()` uses the resulting locale. The API is following the written precedence; do not classify this as an API translation defect or change global precedence.

The read-only probe used a **normal fictional member**, not an impersonation. With explicit `Accept-Language: ca`, `es`, and `en`, all three real GET `/me/leave-requests` responses returned 200 and the same Catalan labels (`core-e8/leave-locale-probe.json`, `12-leave-locale-r2.log`, exit 0). The successful probe did not retain token claims or Content-Language, so no runtime claim about those fields is made. Its result is consistent with JWT/account precedence; source review establishes the borrowed-session mechanism.

Probe attempt provenance: `12-leave-locale.log` is an initial probe-only 401 caused by an incorrect client identifier; it was corrected to the actual `clubs-app` configuration. `12-leave-locale-r3.log` is a later attempt to add locale/header metadata, which stopped before authentication because the owned E8 stack had already been removed. Neither is a product failure, and no extra stack was started for the probe. Credentials/JWTs were never written to evidence.

Recommendation: align the borrowed UI's temporary language with its authenticated session without changing the target account or persisting a new actor preference; alternatively define a specific shared UI/API operator-language policy. Add an end-to-end assertion comparing static UI language with catalog labels during impersonation. No product edit made.

## E7 second attempt

`11-core-e7-cleanup.log`, exit **1**: **8 passed, 1 failed, 2 not run** in 47.5 s. Draining route callbacks fixed the previous disposal race. The subsequent FAQ/Spanish-UI case (i) used `clubsSession(MEMBER_CA, "es")`, which again only initialized device language while the normal account stayed Catalan. This is the same established harness setup mismatch as E4/E5, not another product regression. The final test-only correction uses the already-proven E6 real profile/PATCH helper with restoration in `finally`; Spanish shell assertions and comparisons against previously frozen Catalan notification titles remain intact. Both earlier red runs are preserved.

## E8 initial result and receipt-summary correction

`09-core-e8.log`, exit **1**: **5 passed, 1 failed** in 2.2 minutes, no skipped cases. Inactivity/leave, pack accounting, permissions and asynchronous fake-card settlement passed. The billing case's API check already found the generated invoice's inactivity line (`Quota inactivitat — Desembre 2026`, EUR 20), but its UI assertion expected that line in the list summary. The list showed a EUR 80 invoice with first line `Quota Abonat — Novembre 2026` instead.

S12 §2 defines a list summary and a separate detail containing lines; R-12-02 allows catch-up for unbilled months and R-12-09 sums them. `InvoicesPage.tsx` renders only `lines[0]` in `ReceiptRow`, while detail renders every line. Parent and release reviewer independently confirmed the contract. The initial evidence alone did not establish the complete line order, so it was not reported as incorrect billing.

The approved harness correction captures sanitized ordered lines, totals and same-invoice booleans before assertions; binds the UI row to the exact generated invoice; verifies the first-line summary and total; opens that row and verifies the same invoice's identifier/number/period, every rendered line/amount, inactivity fee, currency consistency and sum of lines. It also removes the unsupported `filter=period:eq` query from `/me/invoices` and checks the exact invoice's period. The original red run remains. This is a stronger detail check, not a relaxed fee assertion. No product changes.

Initial focused lint found two redundant null fallbacks (`13-e8-receipt-lint.log`); those were removed. Final ESLint and core harness typecheck passed (`13-e8-sum-checks.log`, exit 0), after adding line-total/currency assertions. E7 locale-focused lint and typecheck results are in `15-e7-locale-checks.log`.

Actually inspected initial E8 captures: `15-baixa-core-375.png` shows the borrowed-session language issue above, with a readable mobile form; the browser-native date field uses the test browser's numeric format. `D6-retroces-core-1280.png` (1280 × 900) shows the 116-receipt rollback confirmation and simulation totals. These captures do not independently prove the failed receipt detail.

## E8 final retry and exact receipt diagnosis

Fresh seed, unchanged review image, **6 passed in 1.9 minutes, exit 0**, no skips. Full output: `14-core-e8-detail.log`.

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e8-detail 'e8-core.spec.ts --trace=off'
```

Last 40 lines:

```text
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
Done in 6.6s using pnpm v9.15.9
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


Running 6 tests using 1 worker

[1/6] e2e/core/e8-core.spec.ts:831:5 › E8-W04 T-13-32 (e·1): screen 14 request → her class inside the period booked → «Inactivitats» → D10 approval cancels it → 04 shows it NOT_BOOKABLE{INACTIVITY}; D5/D10 «inactiva fins» @critical-remesa
[2/6] e2e/core/e8-core.spec.ts:1056:5 › E8-W04 T-13-32 (e·2) in es: her inactivity fee simulated (R-13-08) → 15 → «Baixes» → D10 approval → D5 «baixa dd/mm» and «Baixes previstes»; the ungenerated month after the leave no longer bills her, the leave's month still does (R-13-11) @critical-remesa
[3/6] e2e/core/e8-core.spec.ts:1174:5 › E8-W04 (d) R-12-23/24 pack: a 04 booking consumes one session, an in-time 07 cancellation returns it, 13 shows both; the expired pack stays unusable
[4/6] e2e/core/e8-core.spec.ts:1297:5 › E8-W04 T-12-27 (a)(b) + step 3 + step 5: simulate → generate → XML → returned → rollback → same numbers; cash paid; accounting export; GET /invoices timings @critical-remesa
[5/6] e2e/core/e8-core.spec.ts:1741:5 › E8-W04 (f) T-13-24 / T-12-21: instructor gates, another member's /me/…/{id} (also a family member's) is not found, nothing secret rendered
[6/6] e2e/core/e8-core.spec.ts:1833:5 › E8-W04 (c) card leg on the fictional Stripe club: [COBRA LES TARGETES] → 202 → CHARGING settles on its own (6b(a)) → «cobrat»; invalid-card fallback → [Actualitza la targeta] → checkout
E8 fake card: payment_intent.succeeded delivered (provider reference redacted)
  6 passed (1.9m)
```

`core-e8-detail/receipt-presentation.json` proves that generated, owned-list, UI-list, row URL and detail all reference the same invoice (recorded as match booleans without storing the identifiers). Receipt `2026-0115`, period `2026-12`, has ordered lines `MONTHLY_FEE` / `Quota Abonat — Novembre 2026` / 6000 minor EUR and `INACTIVITY_FEE` / `Quota inactivitat — Desembre 2026` / 2000 minor EUR, total 8000 minor EUR. The test verifies both line currencies, their exact sum, all detail rows and the exact list summary. This confirms a test expectation mismatch, not an incorrect charge or stale account data. The original failed run remains available.

This agent and root independently inspected `core-e8-detail/rebut-detall-core-375.png` (375 × 844): both concepts and the EUR 80 total are visible. Optional UX improvements are to signal multiple concepts in the compact list and keep the currency symbol on the amount's line at 375 px; neither is recorded as a new product incident or billing defect. No product changes were made.

## E7 final retry and visual inspection

Fresh seed, unchanged review image, **11 passed in 39.1 s, exit 0**, no Playwright skips. Full output: `16-core-e7-locale.log`. Conditional cases (c) template editing, (d) email preference and (h) reminder all executed with the available Core test clock. The final cleanup case passed, restoring reminder, account language, templates and preference matrix, cancelling the created booking and deleting the push subscription. The `real SMS skipped` console message only denotes the deliberately absent Twilio provider.

```sh
CORE_IMAGE=agilityhub-core-api:review-20261023 HEAVY_WAIT_MIN=120 \
  bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh \
  pnpm e2e:core 2026-10-23-functional-web/core-e7-locale 'e7-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 6.6s using pnpm v9.15.9
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


Running 11 tests using 1 worker

[1/11] e2e/core/e7-core.spec.ts:1340:5 › E7-W03 steps 1–2 · preflight (the S11 answers, the VAPID key, the jobs, the core's build), the processes off, POST /test/clock to demoNow (Monday 07:00) or, without it, the reason (c), (d) and (h) skip; the parameters and the scene read from the core
[2/11] e2e/core/e7-core.spec.ts:1428:5 › T-11-35 (b) R-11-15 · screen 12: the second registrant picks «Castellano» (PATCH /me {locale: es} → 200) before the cancellation — the seed has no es account
[3/11] e2e/core/e7-core.spec.ts:1456:5 › T-11-39 (a)(b)(g) R-11-01 R-11-02 R-11-10 R-11-11 · D4c cancels the seeded class → N-08a on 11 first with the x icon, ERROR tone, its border and « · i per SMS», the bell quiet after read-all, [CANVIA DE CLASSE] → 04 with her dog; the mailbox message per registrant; the es registrant in Spanish; the SMS delivery
e2e/core/e7-core.spec.ts:1456:5 › T-11-39 (a)(b)(g) R-11-01 R-11-02 R-11-10 R-11-11 · D4c cancels the seeded class → N-08a on 11 first with the x icon, ERROR tone, its border and « · i per SMS», the bell quiet after read-all, [CANVIA DE CLASSE] → 04 with her dog; the mailbox message per registrant; the es registrant in Spanish; the SMS delivery
real SMS skipped: no Twilio credentials on the local stack, fictional numbers

[4/11] e2e/core/e7-core.spec.ts:1658:5 › T-11-37 (c) R-11-12 · D9 edits N-08a's ca and es bodies with the run's marker, [DESA] → 200; the next cancellation carries it in each registrant's language while the cards of (a)/(b) stay as they were; «Restaura el text per defecte» → not customized
[5/11] e2e/core/e7-core.spec.ts:1817:5 › T-11-35 T-11-38 (d) R-11-03 R-11-04 · screen 12 turns «Canvis en reserves…» off under «Correu»: the next N-08a reaches the feed with « · i per SMS» and no e-mail, the log shows EMAIL «omès per preferència» and APP «lliurat»; D10 turns it back on and 12 shows it
[6/11] e2e/core/e7-core.spec.ts:1968:5 › T-11-35 (f) R-11-07 · web push in context: no permission prompt at boot nor on 12; turning the push switch on asks once and POST /push-subscriptions → 201 with the stubbed PushManager.subscribe
[7/11] e2e/core/e7-core.spec.ts:2097:5 › T-11-38 T-11-18 (e) R-11-13 · D5 selects the ten fictional members, «Enviar comunicat» with the seeded CUSTOM template, «S'enviarà a 10 abonats», [ENVIA] → 202; the log lists ten rows of one batch and no other recipient; one of them sees it in her feed, admin@ (not selected) does not; the filter shape counts what D5 lists; the push subscription is deleted at logout
[8/11] e2e/core/e7-core.spec.ts:2393:5 › T-11-12 T-11-16 T-11-18 T-11-20 T-11-21 E7-W03 step 5 · the core's codes and statuses for STALE_VERSION, TEMPLATE_MANDATORY, CHANNEL_NOT_ALLOWED, TEMPLATE_NOT_CATALOG, TEMPLATE_NOT_SENDABLE, NO_RECIPIENTS, INVALID_REMINDER_OPTION and PUSH_SUBSCRIPTION_INVALID
[9/11] e2e/core/e7-core.spec.ts:2520:5 › T-11-36 T-11-34 T-11-35 (i) R-11-14 · screen 30: the FAQ groups in R-05-22's order, the exclusive accordion and «Normes»; the es pass of 11 and 12: « · y por SMS», [CAMBIAR DE CLASE] and the preference rows in Spanish
[10/11] e2e/core/e7-core.spec.ts:2590:5 › T-11-35 (h) R-11-16 R-15-14 · «Recordatori de classe: 2 h abans» on 12, the clock two hours before her class, D11's [Simula] lists her booking and changes nothing, [Executa ara] gives one N-13 with the clock icon and no e-mail, a second run gives none
[11/11] e2e/core/e7-core.spec.ts:2705:5 › (j) cleanup for idempotence · the reminder back to «Mai», the run's booking cancelled, the es member back to Catalan; the template is the seed's, the matrix restored and the push subscription deleted
  11 passed (39.1s)
e7 notifications: /Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-23-functional-web/core-e7-locale/e7-notifications.json
```

Final harness checks: `pnpm exec eslint e2e/core/e7-core.spec.ts --max-warnings 0` and `pnpm typecheck:e2e-core`, both exit 0 (`15-e7-locale-checks.log`). The equivalent E8 checks, after the exact sum/currency assertions, also exited 0 (`13-e8-sum-checks.log`). ESLint output is empty; each typecheck's complete output is:

```text
> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit
```

Actually inspected with `view_image`, with dimensions read from the PNG headers:

- `core-e7-locale/11-notificacions-es-core-375.png` (375 × 1517): Spanish shell, timestamps/SMS indicator and action labels fit the mobile width. Earlier notification titles/bodies remain frozen in their original language as required by the test; this intentional content preservation is distinct from the borrowed-session catalog mismatch above. Cancellation tone/border and action buttons are visible without horizontal clipping.
- `core-e7-locale/D9-enviar-comunicat-core-1280.png` (1280 × 900): the modal displays exactly ten selected recipients, template selector, explicit confirmation and send/cancel controls; surrounding selection and modal are legible without clipping. The screenshot precedes confirmation; the subsequent successful API/batch assertions are evidenced by the test, not inferred from pixels.

## Final coverage inventory

All seven assigned suites completed on fresh seeds: **50 distinct Playwright cases passed, zero final failures, zero final skips**. Counts are test cases, not independent journeys; failed attempts are retained but not added to unique coverage.

| Stage | Cases | Real Core paths | Doubles and dependencies |
|---|---:|---|---|
| E2 | 5 | Census, member details/block, catalog CRUD, parameter history/audit/export, club page, dog documents | Serial; later cases share the first admin session and fixture state. |
| E3 | 5 | Public signup, validation, local welcome/rejection messages, attachments, extra dog, closed signup | Serial. One long case performs welcome/rejection/extra-dog/closure setup; two later cases inspect its recorded results. Intercepted signup requests are forwarded to Core, not answered with fabricated success. Local mailbox only; no live email or card provider. |
| E4 | 7 | Template/week validation, cancellation, rings, activities, registration/FIFO, successful PDF/Excel exports | Serial, shared admin/scenario. Last case deliberately injects `EXPORT_TOO_LARGE` and a held export response to test error/pending UI. |
| E4w16 | 5 | Member tasks, one-time password reset, impersonation grant, export download, billing module boundary | Serial. Public handoff URL mapped to local app; one injected `/me` 503 proves retry before real Core resumes. |
| E5 | 11 | Holds, cancellation/swap/waitlist, training windows, risk jobs, booking/search/status contracts | Serial shared sessions and Core clock. Jobs disabled before clock changes and restored afterwards; browser time stays real. Requires local `/test/clock`. |
| E7 | 11 | Account locale, cancellation feed/delivery records, template/preferences, broadcast, reminder jobs, subscription persistence | Serial. Local mailbox/fake SMS. Browser PushManager/notification/service-worker doubles exercise real subscription API, not external push delivery. Three cases conditionally skip if `/test/clock` is unavailable; all three executed and passed in the final local run. Cleanup restores locale/preferences/templates/jobs/clock. |
| E8 | 6 | Inactivity/leave, packs, remittance generation/XML/returns/rollback, cash/accounting, permissions, asynchronous fake card settlement | Default test mode with one worker; lifecycle leave case requires earlier inactivity state. FakePaymentProvider watcher settles card charges. Invalid-card `/me` flag and external checkout document are stubbed; card-setup endpoint stays real. No bank submission or genuine card failure is proved. |

All stages use fresh seeded fictional people/transactions, existing club configuration, and local Vite apps with the pinned API image. Business-date tests may move Core's local test clock; they never fake the browser clock. A serial predecessor failure can prevent later cases from running and must be reported as such, not as independent product failures. The release lane separately owns compiled production-build HTTPS coverage. Source anchors: `e3-signup.spec.ts:718`, `e4-core.spec.ts:469,1449`, `e4w16-core.spec.ts:163,434`, `e5-core.spec.ts:859`, `e7-core.spec.ts:1340,1658,1817,1968,2590`, `e8-core.spec.ts:715,831,1056,1741,1833`.

## Limits

These are local scenarios with fictional people and simulated transactions; club configuration is not entirely fictional. No mail/SMS/push delivery by a live provider, bank submission, card charge, production DNS or hosted demo has been verified. Learn remains outside the explicit isolated-Clubs-demo scope. The final results cover the exact local reviewed image and current four corrected test harnesses. The prior complete product unit/mock gates remain applicable because product sources were unchanged; no new hosted/provider or Learn verification is implied.

## Final source integrity and cleanup

`functional-final-tested-inputs.json` records the final SHA-256 values for the same 34 paths as `functional-baseline-tested-inputs.json`. Exactly four differ: `e2e/core/e4-core.spec.ts`, `e5-core.spec.ts`, `e7-core.spec.ts` and `e8-core.spec.ts`, all justified harness corrections described above. All other 30 inputs remain unchanged, including every product input in this manifest. Root separately verified the larger product inventory; this report does not present the 34-file manifest as exhaustive repository coverage.

Final verification, exit **0**:

```sh
python3 roadmap/evidence/2026-10-23-functional-web/verify-final-inputs.py \
  > roadmap/evidence/2026-10-23-functional-web/17-final-integrity.log 2>&1
```

Complete output (under 40 lines):

```text
34 final inputs match saved manifest; exactly 4 harness deltas:
e2e/core/e4-core.spec.ts
e2e/core/e5-core.spec.ts
e2e/core/e7-core.spec.ts
e2e/core/e8-core.spec.ts
Other 30 baseline inputs unchanged, including every tracked product input.
Pinned review image unchanged.
Owned containers remaining: 0
Owned networks remaining: 0
Owned volumes remaining: 0
Heavy lock absent.
Retained trace/HAR/video archives: 0
git diff --check: exit 0
```

All seven disposable groups and their retries are cleaned up, including their owned containers, networks and volumes. The shared heavy lock is absent. No trace ZIP, HAR or video remains in this review's evidence. Original failed logs and selected screenshots remain; no silent error suppression or weakened product assertion was used. No deployment, external-provider action, production write, Git commit/push or Learn change occurred.

Root's final evidence scan flagged two UUID `fileKey` attachment identifiers in `core-e3/d2-readmission-add-file-core.json` as generic API keys. They are fictional local attachment handles, not API credentials. Root replaced only those two values with distinct placeholders, preserving names, document type, HTTP statuses and timings; no scanner allowlist or test/product source changed. The first scan result is retained, and `functional-root/07-evidence-redactions.json` records this postprocessing before the final rescan.
