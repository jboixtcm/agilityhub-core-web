# E3-W05 · Spec-test traceability (T-04-*, T-14-*)

- **Commit:** `17864bb` + the E3-W05 working tree (no product change).
- **Core image:** revision `29603299a614ae63988fad3c50661ac10edebbf3`.
- **How the tests were found:** `grep -rnE "T-(04|14)-[0-9]+" apps packages e2e --include=*.ts --include=*.tsx` (excluding `node_modules` and `dist`). This gives every Vitest `describe` and every Playwright test/`describe` whose name contains `T-04-` or `T-14-`. The Playwright names were confirmed with `pnpm exec playwright test --list` in `apps/clubs` (25 tests) and `apps/clubs-admin` (29 tests).
- **Runs referenced:**
  - **V:** `pnpm turbo run lint typecheck test build` → `03-turbo.log`, exit 0. `clubs:test` and `clubs-admin:test` were cache misses, so they really ran.
  - **P:** `pnpm e2e:docker` (three projects in `mcr.microsoft.com/playwright:v1.63.0-noble`) → `02-playwright-all.log`, exit 0: clubs 25/25, id 1/1, clubs-admin 29/29. The line reporter prints only the totals, so a Playwright test in a green project counts as passed.
  - **C:** `pnpm e2e:core E3-W05`:
    - final run → `01-e2e-core.log`, exit 1;
    - last green run of all three stages → `01d-e2e-core-diagnostic.log`, exit 0;
    - first run (before the extra captures) → `01a-e2e-core-before-extra-captures.log`, exit 0.
  - **I:** `pnpm i18n:check` → `04-i18n.log`, exit 0.

## 1. Every test whose name contains `T-04-` or `T-14-`

| # | Test (name as written) | File | Kind | Result |
|---|---|---|---|---|
| 1 | `T-04-29 signup person and draft` › persists a current draft, expires it after 24 hours and maps identity states | `apps/clubs/src/SignupPage.test.tsx:124` | Vitest | ✅ V (file 10/10) |
| 2 | `T-04-29 …` › keeps the draft and refetches localized configuration after a language change | `apps/clubs/src/SignupPage.test.tsx:157` | Vitest | ✅ V |
| 3 | `T-04-29 …` › masks and validates the browser-independent birth date control | `apps/clubs/src/SignupPage.test.tsx:169` | Vitest | ✅ V |
| 4 | `T-04-30 signup dog, uploads, plans and module gates` › uploads sequentially named vaccination pages and renders API plans | `apps/clubs/src/SignupPage.test.tsx:183` | Vitest | ✅ V |
| 5 | `T-04-30 …` › removes amounts without BILLING and the family offer and step without FAMILY_GROUP | `apps/clubs/src/SignupPage.test.tsx:228` | Vitest | ✅ V |
| 6 | `T-04-31 signup family lookup` › continues empty, resolves the fixture family and supports a pending lookup | `apps/clubs/src/SignupPage.test.tsx:244` | Vitest | ✅ V |
| 7 | `T-04-31 …` › keeps the dog draft when returning from the family step | `apps/clubs/src/SignupPage.test.tsx:284` | Vitest | ✅ V |
| 8 | `T-04-32 signup payment, checkout and add-dog mode` › renders API totals and payment conditions and submits only after privacy consent | `apps/clubs/src/SignupPage.test.tsx:298` | Vitest | ✅ V |
| 9 | `T-04-32 …` › redirects through checkout when Stripe is enabled | `apps/clubs/src/SignupPage.test.tsx:387` | Vitest | ✅ V |
| 10 | `T-04-32 …` › uses the member plan and payment method and posts the add-dog flow | `apps/clubs/src/SignupPage.test.tsx:399` | Vitest | ✅ V |
| 11 | `T-04-29–32 public signup` › completes screens 16–19 and the sent state against MSW | `apps/clubs/e2e/signup.spec.ts:73` | Playwright (MSW) | ✅ P (clubs 25/25) |
| 12 | `T-04-32 add-dog signup` › starts from screen 13 and reaches the member payment variant | `apps/clubs/e2e/signup.spec.ts:126` | Playwright (MSW) | ✅ P |
| 13 | `T-04-33 D2 signup validation` (12 cases: masked data/documents/consent warning/level/invoice/Stripe; next-invoice from the proposed MONTHLY plan; INC-08 nulls ×2; header badges; edit + reject + validate; 422 field mapping; zero upfront confirmation; rejection reason; ICU plural for 0/1/5 days) | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:75` | Vitest | ✅ V (file 12/12) |
| 14 | `T-14-25 D1 dashboard` › renders the server aggregate, all risk rows, pending signups, and accessible chart | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:29` | Vitest | ✅ V (file 3/3) |
| 15 | `T-14-25 …` › hides nullable module blocks and refetches when the window regains focus | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:59` | Vitest | ✅ V |
| 16 | `T-14-25 …` › uses the same ICU day plural as D2 in the pending signups card | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:74` | Vitest | ✅ V |
| 17 | `T-14-25 / T-04-33 validates a D1 pending signup in D2 and refreshes the counters` | `apps/clubs-admin/e2e/dashboard-signup.spec.ts:32` | Playwright (MSW) | ✅ P (clubs-admin 29/29) |
| 18 | `T-14-26 member audit and exports` (6 cases) | `apps/clubs-admin/src/audit/AuditPage.test.tsx:75` | Vitest | ✅ V (file 6/6) |
| 19 | `T-14-26 shows member/global audit, masked diffs, LastChange and queued exports` | `apps/clubs-admin/e2e/audit.spec.ts:37` | Playwright (MSW) | ✅ P |
| 20 | `T-14-27 renders the audit and PDF export state in ca/es/en without missing keys` | `apps/clubs-admin/e2e/audit.spec.ts:103` | Playwright (MSW) | ✅ P |
| 21 | `T-02-13/T-14-26 real parameter history, export and audit` | `e2e/core/e2-core.spec.ts:422` | Playwright (real core) | ✅ C final (E1/E2 stage 10/10) |
| 22 | `T-04-34 public signup is validated and enters through the N-02 welcome link` | `e2e/core/e3-signup.spec.ts:324` | Playwright (real core) | ✅ C final · ✅ 01d · ❌ 01b (first step, «Pas 1 de 4» not visible in 15 s) |
| 23 | `T-04-34 rejected signup delivers N-03` | `e2e/core/e3-signup.spec.ts:576` | Playwright (real core) | ✅ C final · ✅ 01d |
| 24 | `T-04-34 active member adds a dog and the club validates it` | `e2e/core/e3-signup.spec.ts:583` | Playwright (real core) | ✅ C final · ✅ 01d |
| 25 | `T-04-34 signup.enabled=false shows only the configured closed text` | `e2e/core/e3-signup.spec.ts:587` | Playwright (real core) | ❌ **C final** · ✅ 01a, 01d, 01g · ❌ 01c, 01e, 01f, 01h (see §3) |

Rows 18–21 are outside the task's list of ids, but their names contain `T-14-`, so they are listed.

## 2. Spec ids in scope → tests

| Spec id | What the spec asks (short) | Tests found | Gaps seen in this audit |
|---|---|---|---|
| **T-04-29** (S04 §11) | Stepper draft (reload, 24 h), 4 or 3 steps with `FAMILY_GROUP`, `fieldErrors` on the field, «Revisa el correu» + `maskedEmail`, a language change refetches and keeps the draft | #1–3, #11 (the 3-step case is in #5) | none found |
| **T-04-30** | Step 17: signed-URL upload `cartilla_Kiwi_1.jpg` + «＋ Afegir un altre full»; no amounts without `BILLING`; no family offer without `FAMILY_GROUP` | #4, #5, #11 | The real core shows the repeated plan texts and «Entrada 0,00 €» on packs (screens.md 17 a/b), which is not what the tests see on MSW. |
| **T-04-31** | Step 18: «Grup trobat: Marta R. …», inline error with «Deixa-ho pendent i continua ›» only if allowed, empty → continue, «‹» keeps the dog | #6, #7, #11 | The real core shows the raw `{twoDogsMonthlyFee}` (screens.md 18 a). The MSW fixture text has no placeholder. |
| **T-04-32** | Step 19: methods segment; mandate + day-25 text only under «Domiciliació»; `cashConditions` only under «Efectiu»; two first-month options + **«Total a pagar al club»**; privacy gate; links; Checkout redirect | #8, #9, #10, #11, #12 | **The «Total a pagar al club» line is neither implemented nor asserted** (no key in `signup`). The real core shows the raw `{deadlineDay}` and the `MANUAL` cash instructions under «Domiciliació» (screens.md 19 a–c). |
| **T-04-33** | D2: yellow warning with gender + «Compte no informat»; document links; plan change → `dryRun`; 422 on the field; rejection modal with a required reason; [EDITA LES DADES] saves with `version` | #13, #17 | none found |
| **T-04-34** | Real E2E: fictional signup → D1 card → D2 → [VALIDA L'ALTA] → N-02 mail → link → 03; «＋ AFEGEIX UN GOS» → N-37; forbidden-vocabulary lint on `signup`/`admin-census` in ca/es | #22–#25 (real core). N-37: the `mongosh` check of `scripts/e2e-core.sh` → `n37-notification.json` = `{"action":"OPEN_DOG","channel":"APP","code":"N-37","dogName":"Neret E3","status":"SENT"}` (run 01d; the final run stops before it because #25 fails). Vocabulary: `pnpm i18n:check` (I) passed. | #25 is **flaky/red** against this core image (§3). |
| **T-14-25** (S14 §11) | D1 with the §6 JSON: 4 KPIs, «1 de fa més de 2 dies», risk card «4 avisos» + 4 states, «Compte no informat» only on Núria, [VALIDA] → D2, one column per **progression** level (E35) and «242 actius», `dogsByLevel=null` → no card, `trainingBookings=null` → 3 KPIs, refetch on focus | #14, #15, #16, #17 | The real core shows TER and PENDENT columns (E35 code pending in api E3-T08 / web E3-W07; screens.md D1 f). |

**Missing:** none. Every id T-04-29 … T-04-34 and T-14-25 has at least one named test. The gaps above are partial coverage, not missing tests.

## 3. The red T-04-34 case (closed form)

- **Symptom:** after `PUT /parameters/signup.enabled` returns `200` with `"value":false`, a fresh anonymous context opens `/apuntat-hi` about 0.5 s later. It still shows the open form («Pas 1 de 4 · Tu», [CONTINUA]) instead of `signup.text.closed`. See `01e-diag-closed-form-page.txt` and `01e-diag-closed-form-page-375.png`, and the same in 01f.
- **What was captured** (temporary failure-only diagnostic, removed before the final run):
  - failing run 01f (`01f-diag-put-signup-enabled.txt`, `01f-diag-get-signup.txt`):
    - PUT request `{"scopeRef":null,"value":false,"version":0}` → response `value:false, version:1` at 14:42:57.016Z;
    - two `GET /api/v1/signup` at 14:42:57.537Z and .543Z → `200`, `cache-control: no-cache, no-store…`, **`enabled: true`**.
  - passing run 01g (`01g-diag-*-pass.txt`):
    - the same PUT body and response;
    - `GET /signup` 0.6 s later → `enabled: false`.
- **Reading:**
  - The browser sent `false`, and the core stored it and echoed it back.
  - The public `GET /signup` then served the old value, with no-store headers, so the stale value is the core's.
  - S04 §8 (l.230) says `ParameterChanged` must invalidate the `GET /signup` cache (TTL 60 s). The observation is consistent with that invalidation missing or racing.
  - Not confirmed from the api code: reading outside this repository was denied in this session.
- **Tally for this test:** it failed in 5 of the 8 runs in which it ran (01c, 01e, 01f, 01h, final). It passed in 01a, 01d and 01g; in 01b it did not run. The other E3 failure, in 01b and in E3-W04's attempt 1 («Pas 1 de 4» not visible on the first page of the stage), was not caught by the diagnostic. Its cause is unknown.
