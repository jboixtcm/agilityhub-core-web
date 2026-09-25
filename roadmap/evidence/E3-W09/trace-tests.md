# E3-W09 · Spec-test traceability (T-04-29 … T-04-34, T-14-25) after the gate E3 fixes

- **Commit:** `a999f150115b89b9b062ce6ab7bb46d83187fa63` + the session's working tree. That tree carries E4-W05 (awaiting verification, same session): the D7 lists' `fields`, the day-grid follow-ups and the real-core E4 stage. E3-W09 itself changes no product code, test or fixture.
- **Core image:** `ghcr.io/jboixtcm/agilityhub-core-api:main`, revision `1308743f9f9eca90bca1ed8faf4de86599d31b02` (arm64). It carries api E3-T16 round 2, as step 1 requires (organizer, MESSAGES 25-09).
- **How the tests were found:**
  - Vitest: `pnpm --filter <clubs|clubs-admin|@agilityhub/api-client> exec vitest run --reporter=json --outputFile=… --includeTaskLocation`, all green (clubs 167, clubs-admin 268, api-client 181). The raw reports are committed as `vitest-clubs.json`, `vitest-clubs-admin.json` and `vitest-api-client.json`. §1 lists every test case whose qualified name (describe › test) carries `T-04-29`…`T-04-34`, `T-04-29–32` or `T-14-25`: one row per case, parameterized cases included.
  - Playwright: the `test(`/`test.describe(` lines of the specs, found with `grep`.
- **Runs referenced:**
  - **V:** the Vitest JSON runs above. The same code passed `pnpm turbo run lint typecheck test build --force` → `03-turbo.log`, exit 0, 34/34, 0 cached.
  - **P:** `pnpm e2e:docker E3-W09` → `02-e2e-docker.log`, exit 0: clubs 29/29, id 1/1, clubs-admin 42/42. The line reporter prints only totals, so a test in a green project counts as passed.
  - **C:** `pnpm e2e:core E3-W09` → `01-e2e-core.log`, exit 0: E1/E2 12/12, E3 5/5, E4 7/7. N-37 → `n37-notification.json`.
  - **I:** `pnpm i18n:check` → `04-i18n.log`, exit 0.

## 1. Every test case whose name carries an in-scope id

| # | Test (fully qualified name) | Location | Kind | Result |
|---|---|---|---|---|
| 1 | T-04-29 signup person and draft › persists a current draft, expires it after 24 hours and maps identity states | `apps/clubs/src/SignupPage.test.tsx:284` | Vitest | ✅ V |
| 2 | T-04-29 signup person and draft › keeps the draft and refetches localized configuration after a language change | `apps/clubs/src/SignupPage.test.tsx:317` | Vitest | ✅ V |
| 3 | T-04-29 signup person and draft › masks and validates the browser-independent birth date control | `apps/clubs/src/SignupPage.test.tsx:329` | Vitest | ✅ V |
| 4 | T-04-29 signup person and draft › M2 checks the ES postal code and a past birth date from 1900 before any request | `apps/clubs/src/SignupPage.test.tsx:341` | Vitest | ✅ V |
| 5 | T-04-29 signup person and draft › focuses the first error after it renders and links each field to its message | `apps/clubs/src/SignupPage.test.tsx:358` | Vitest | ✅ V |
| 6 | T-04-29 signup person and draft › keeps fields typed while the town lookup is in flight | `apps/clubs/src/SignupPage.test.tsx:377` | Vitest | ✅ V |
| 7 | T-04-29 signup person and draft › GENERIC profile: the first document type of the profile and an editable prefix | `apps/clubs/src/SignupPage.test.tsx:407` | Vitest | ✅ V |
| 8 | T-04-30 signup dog, uploads, plans and module gates › uploads sequentially named vaccination pages and renders API plans | `apps/clubs/src/SignupPage.test.tsx:450` | Vitest | ✅ V |
| 9 | T-04-30 signup dog, uploads, plans and module gates › removes amounts without BILLING and the family offer and step without FAMILY_GROUP | `apps/clubs/src/SignupPage.test.tsx:497` | Vitest | ✅ V |
| 10 | T-04-30 signup dog, uploads, plans and module gates › gates offerLabel by FAMILY_GROUP even when the configuration sends it | `apps/clubs/src/SignupPage.test.tsx:511` | Vitest | ✅ V |
| 11 | T-04-30 signup dog, uploads, plans and module gates › validates and normalises the chip per country profile and the birth month | `apps/clubs/src/SignupPage.test.tsx:521` | Vitest | ✅ V |
| 12 | T-04-30 signup dog, uploads, plans and module gates › keeps fields typed while an upload is in flight | `apps/clubs/src/SignupPage.test.tsx:553` | Vitest | ✅ V |
| 13 | T-04-31 signup family lookup › continues empty, resolves the fixture family and supports a pending lookup | `apps/clubs/src/SignupPage.test.tsx:584` | Vitest | ✅ V |
| 14 | T-04-31 signup family lookup › keeps the dog draft when returning from the family step | `apps/clubs/src/SignupPage.test.tsx:627` | Vitest | ✅ V |
| 15 | T-04-31 signup family lookup › prefills the account holder with the group holder when the group is found (R-04-10) | `apps/clubs/src/SignupPage.test.tsx:641` | Vitest | ✅ V |
| 16 | T-04-32 signup payment, checkout and add-dog mode › renders API totals and payment conditions and submits only after privacy consent | `apps/clubs/src/SignupPage.test.tsx:658` | Vitest | ✅ V |
| 17 | T-04-32 signup payment, checkout and add-dog mode › shows each payment text only under its method (T-04-32, M7 web half) | `apps/clubs/src/SignupPage.test.tsx:716` | Vitest | ✅ V |
| 18 | T-04-32 signup payment, checkout and add-dog mode › redirects through checkout when Stripe is enabled | `apps/clubs/src/SignupPage.test.tsx:744` | Vitest | ✅ V |
| 19 | T-04-32 signup payment, checkout and add-dog mode › uses the member plan and payment method and posts the add-dog flow | `apps/clubs/src/SignupPage.test.tsx:757` | Vitest | ✅ V |
| 20 | T-04-32 signup payment, checkout and add-dog mode › the add-dog success page does not promise a welcome email | `apps/clubs/src/SignupPage.test.tsx:771` | Vitest | ✅ V |
| 21 | T-04-32 signup payment, checkout and add-dog mode › sends notesToInstructors from 17 and holderTaxId from 19 (§2, §3) | `apps/clubs/src/SignupPage.test.tsx:778` | Vitest | ✅ V |
| 22 | T-04-32 signup payment, checkout and add-dog mode › drops the IBAN from the session draft when the method changes away from SEPA | `apps/clubs/src/SignupPage.test.tsx:801` | Vitest | ✅ V |
| 23 | T-04-32 signup payment, checkout and add-dog mode › checks the IBAN mod-97 before sending | `apps/clubs/src/SignupPage.test.tsx:816` | Vitest | ✅ V |
| 24 | T-04-32 signup payment, checkout and add-dog mode › omits planId and planIdRequested when the club has no signup plans (R-04-09) | `apps/clubs/src/SignupPage.test.tsx:835` | Vitest | ✅ V |
| 25 | T-04-32 signup payment, checkout and add-dog mode › hides the honeypot from assistive technology and the tab order | `apps/clubs/src/SignupPage.test.tsx:868` | Vitest | ✅ V |
| 26 | T-04-32 signup payment, checkout and add-dog mode › reads the image-consent text from texts.imageConsent, then legal.imageConsentText | `apps/clubs/src/SignupPage.test.tsx:877` | Vitest | ✅ V |
| 27 | E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32) › 05-08-2026 (before the split day): a full month today, half a month from the 16th | `apps/clubs/src/SignupPage.test.tsx:1491` | Vitest | ✅ V |
| 28 | E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32) › 17-08-2026: half a month today, the 1st of September in full, a 130 € total; the total is never sent | `apps/clubs/src/SignupPage.test.tsx:1506` | Vitest | ✅ V |
| 29 | E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32) › 31-12-2026: the alternative starts on the 1st of January (full month) | `apps/clubs/src/SignupPage.test.tsx:1528` | Vitest | ✅ V |
| 30 | E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32) › Pack 6: the pack line and no start options; Teràpia: its 50 € entry fee only | `apps/clubs/src/SignupPage.test.tsx:1538` | Vitest | ✅ V |
| 31 | E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32) › a zero line of the quote is hidden (no «Entrada 0,00 €») | `apps/clubs/src/SignupPage.test.tsx:1556` | Vitest | ✅ V |
| 32 | E3-W08 step 1: the «Pagament inicial» card is the selected plan's quote (R-04-14/15, T-04-32) › add-dog: on day 26 only TODAY (after billing.upfrontCutoffDay); on day 17 the 1st of next month pays the entry fee only | `apps/clubs/src/SignupPage.test.tsx:1568` | Vitest | ✅ V |
| 33 | E3-W08 step 4: the signup flags (R-04-08, R-04-12) › T-04-31 allowFamilyGroupPending=false: a NOT_FOUND claim offers no «Deixa-ho pendent» | `apps/clubs/src/SignupPage.test.tsx:1726` | Vitest | ✅ V |
| 34 | E3-W08 step 4: the signup flags (R-04-08, R-04-12) › T-04-31 allowFamilyGroupPending=true: the same claim can be left pending | `apps/clubs/src/SignupPage.test.tsx:1741` | Vitest | ✅ V |
| 35 | E3-W08 step 4: the signup flags (R-04-08, R-04-12) › T-04-30 requireDogDocumentAtSignup=true: 17 requires the vaccination card with an actionable error | `apps/clubs/src/SignupPage.test.tsx:1753` | Vitest | ✅ V |
| 36 | E3-W08 step 4: the signup flags (R-04-08, R-04-12) › T-04-30 requireDogDocumentAtSignup=false: 17 continues without a file and shows the optional note | `apps/clubs/src/SignupPage.test.tsx:1782` | Vitest | ✅ V |
| 37 | T-14-25 D1 dashboard › renders the server aggregate, all risk rows, pending signups, and accessible chart | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:61` | Vitest | ✅ V |
| 38 | T-14-25 D1 dashboard › hides nullable module blocks and refetches when the window regains the focus | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:83` | Vitest | ✅ V |
| 39 | T-14-25 D1 dashboard › uses the same ICU day plural as D2 in the pending signups card | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:98` | Vitest | ✅ V |
| 40 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › gives each VALIDA its own accessible name | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:105` | Vitest | ✅ V |
| 41 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › marks an add-dog row «(nou gos)» | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:114` | Vitest | ✅ V |
| 42 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › R-14-05 paints the submission date red only when pendingDays > warnDays | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:121` | Vitest | ✅ V |
| 43 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › signs the members delta 3 as «+3 aquest mes» | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:133` | Vitest | ✅ V |
| 44 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › signs the members delta -2 as «−2 aquest mes» | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:133` | Vitest | ✅ V |
| 45 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › signs the members delta 0 as «0 aquest mes» | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:133` | Vitest | ✅ V |
| 46 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › counts 1 risk alert(s) with an ICU plural | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:142` | Vitest | ✅ V |
| 47 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › counts 4 risk alert(s) with an ICU plural | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:142` | Vitest | ✅ V |
| 48 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › writes times as «7:30» and links each risk row to D4 on its class | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:147` | Vitest | ✅ V |
| 49 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › shows at most 6 risk rows, then «+{n} més» to D4 on the first hidden one | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:158` | Vitest | ✅ V |
| 50 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › puts the warning icon on the risk card title | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:181` | Vitest | ✅ V |
| 51 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › E35 paints one column per progression level with the level name as tooltip, never `others` | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:187` | Vitest | ✅ V |
| 52 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › follows coverage.activeDogWeeks = 1 in the chart legend | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:202` | Vitest | ✅ V |
| 53 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › follows coverage.activeDogWeeks = 2 in the chart legend | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:202` | Vitest | ✅ V |
| 54 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › follows coverage.activeDogWeeks = 3 in the chart legend | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:202` | Vitest | ✅ V |
| 55 | E3-W07 step 9 · the D1 minors (S14 R-14-05…07, T-14-25) › R-04-23 keeps the refund notice after a rejection with a collected payment | `apps/clubs-admin/src/dashboard/DashboardPage.test.tsx:207` | Vitest | ✅ V |
| 56 | T-04-33 D2 signup validation › shows the mockup: DNI and phone in full, signed documents, consent warning, level, invoice and Stripe payment | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:158` | Vitest | ✅ V |
| 57 | T-04-33 D2 signup validation › shows the required next-invoice date from the proposed MONTHLY plan when the pending member has no plan yet | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:184` | Vitest | ✅ V |
| 58 | T-04-33 D2 signup validation › shows the pending badge as an ICU plural for 0 days | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:197` | Vitest | ✅ V |
| 59 | T-04-33 D2 signup validation › shows the pending badge as an ICU plural for 1 days | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:197` | Vitest | ✅ V |
| 60 | T-04-33 D2 signup validation › shows the pending badge as an ICU plural for 5 days | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:197` | Vitest | ✅ V |
| 61 | T-04-33 D2 signup validation › R-04-24 warns on the age badge only when pendingDays > warnDays, read from the signup view | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:202` | Vitest | ✅ V |
| 62 | T-04-33 D2 signup validation › step 0 renders each review warning by its code, so a new api value needs only its key | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:214` | Vitest | ✅ V |
| 63 | T-04-33 D2 signup validation › tolerates null optional fields (INC-08) and never sends null back | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:225` | Vitest | ✅ V |
| 64 | T-04-33 D2 signup validation › T-04-16 validates a FOUND claim whose holder has no group yet without familyGroupId (the api creates the group) | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:245` | Vitest | ✅ V |
| 65 | T-04-33 D2 signup validation › validates a signup with a null payment method, upfront and family claim without sending null | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:257` | Vitest | ✅ V |
| 66 | T-04-33 D2 signup validation › shows signup warnings as compact header badges | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:276` | Vitest | ✅ V |
| 67 | T-04-33 D2 signup validation › requires explicit confirmation when a manual upfront payment is zero | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:285` | Vitest | ✅ V |
| 68 | E3-W07 step 4 · M15 the plan and family decisions (R-04-13, T-04-33) › lists planOptions with their periodicity and runs dryRun on a change to Pack 6: lines, date and body updated | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:543` | Vitest | ✅ V |
| 69 | E3-W07 step 4 · M15 the plan and family decisions (R-04-13, T-04-33) › renders the dry run's warnings on the plan card (PAID_EXCEEDS_QUOTE on a cheaper plan) | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:580` | Vitest | ✅ V |
| 70 | E3-W07 step 4 · M15 the plan and family decisions (R-04-13, T-04-33) › a NOT_FOUND_PENDING claim shows what the applicant typed and is resolved by attaching the holder's group | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:589` | Vitest | ✅ V |
| 71 | E3-W07 step 4 · M15 the plan and family decisions (R-04-13, T-04-33) › a NOT_FOUND_PENDING claim is resolved with an explicit «Sense grup»: no familyGroupId | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:611` | Vitest | ✅ V |
| 72 | T-04-33 E3-W11 step 1 · a reload drops the quote at once (review #1, S04 §2 D2, R-04-15) › a delayed reload after STALE_VERSION: no upfront block and VALIDA disabled until the reload and the new quote both land | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:870` | Vitest | ✅ V |
| 73 | T-04-33 E3-W11 step 1 · a reload drops the quote at once (review #1, S04 §2 D2, R-04-15) › a failed reload shows its error with a retry, never the old quote (its «Data del proper rebut» included), and the retry brings a fresh one | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:916` | Vitest | ✅ V |
| 74 | T-04-33 E3-W11 step 1 · a reload drops the quote at once (review #1, S04 §2 D2, R-04-15) › the reload after a drawer save drops the quote too, until the fresh view lands | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:948` | Vitest | ✅ V |
| 75 | T-04-14 T-04-20 T-04-33 E3-W11 step 2 · the drawer's payment methods come from the D2 view (review #2, R-04-10, R-04-19) › a view without the card offers no «Targeta», even with Stripe listed (disabled) on /club, and keeps the applicant's method | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:981` | Vitest | ✅ V |
| 76 | T-04-14 T-04-20 T-04-33 E3-W11 step 2 · the drawer's payment methods come from the D2 view (review #2, R-04-10, R-04-19) › the applicant's card, not assignable any more, is shown preselected but cannot be chosen again | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:995` | Vitest | ✅ V |
| 77 | T-04-14 T-04-20 T-04-33 E3-W11 step 2 · the drawer's payment methods come from the D2 view (review #2, R-04-10, R-04-19) › the preselected method is the view's `current` one (a readmission's submitted method) | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:1021` | Vitest | ✅ V |
| 78 | T-04-14 T-04-20 T-04-33 E3-W11 step 2 · the drawer's payment methods come from the D2 view (review #2, R-04-10, R-04-19) › a PENDING applicant with no assignable method sees the current one read-only | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:1032` | Vitest | ✅ V |
| 79 | T-04-14 T-04-20 T-04-33 E3-W11 step 2 · the drawer's payment methods come from the D2 view (review #2, R-04-10, R-04-19) › add-dog (R-04-19, R-04-25): the member's method is shown read-only, as the view lists it | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:1043` | Vitest | ✅ V |
| 80 | T-04-14 T-04-20 T-04-33 E3-W11 step 2 · the drawer's payment methods come from the D2 view (review #2, R-04-10, R-04-19) › an empty list (an ACTIVE member without a method) shows no method row | `apps/clubs-admin/src/dashboard/SignupReviewPage.test.tsx:1054` | Vitest | ✅ V |
| 81 | T-04-29–32 public signup › completes screens 16–19 and the sent state against MSW | `apps/clubs/e2e/signup.spec.ts:75` | Playwright (MSW) | ✅ P (clubs 29/29) |
| 82 | E3-W08 T-04-32 the «Pagament inicial» card before the split day (MSW clock 05-08-2026) › a full month today, half a month from the 16th, and the total with the entry fee | `apps/clubs/e2e/signup.spec.ts:128` | Playwright (MSW) | ✅ P (clubs 29/29) |
| 83 | T-04-32 add-dog signup › starts from screen 13 and reaches the member payment variant | `apps/clubs/e2e/signup.spec.ts:189` | Playwright (MSW) | ✅ P (clubs 29/29) |
| 84 | T-14-25 / T-04-33 validates a D1 pending signup in D2 and refreshes the counters | `apps/clubs-admin/e2e/dashboard-signup.spec.ts:35` | Playwright (MSW) | ✅ P (clubs-admin 42/42) |
| 85 | T-04-34 public signup is validated and enters through the N-02 welcome link | `e2e/core/e3-signup.spec.ts:564` | Playwright (real core) | ✅ C (E3 stage 5/5) |
| 86 | T-04-34 rejected signup delivers N-03 | `e2e/core/e3-signup.spec.ts:1243` | Playwright (real core) | ✅ C |
| 87 | T-04-34 active member adds a dog and the club validates it | `e2e/core/e3-signup.spec.ts:1250` | Playwright (real core) | ✅ C |
| 88 | T-04-34 signup.enabled=false shows only the configured closed text | `e2e/core/e3-signup.spec.ts:1254` | Playwright (real core) | ✅ C |

Rows 75–80 also carry T-04-14/T-04-20 (other S04 ids); they are listed because they carry T-04-33.

## 2. Spec ids → what §11 asks → the test that asserts it

An id is **covered** when every clause of its §11 row has a test that asserts it. The clause is quoted from S04 §11 (l.322–327) or S14 §11 (l.265). # = the row in §1, or the file and line when the test does not carry the id.

| Spec id | Clause (§11) | Asserting test | Status |
|---|---|---|---|
| **T-04-29** | the draft survives a reload and is dropped after 24 h | #1 | covered |
| | `steps` = 4 or 3 with/without `FAMILY_GROUP` | #9 (`Pas 2 de 3` without `FAMILY_GROUP`); #81 walks the 4 steps | covered |
| | `fieldErrors` of the 400 land on their field | `apps/clubs/src/SignupPage.test.tsx:1092` «M2 api errors land on their field and step» › `VALIDATION_ERROR (400) → /apuntat-hi` and `→ /apuntat-hi/gos`; #5 (focus and `aria-describedby`) | covered |
| | «Revisa el correu» with `maskedEmail` | #1 (heading and `e••••••g@e••••••.test`) | covered |
| | a language change re-reads `GET /signup` and keeps the draft | #2 | covered |
| **T-04-30** | signed-URL upload named `cartilla_Kiwi_1.jpg` and «＋ Afegir un altre full» | #8 (and #35/#36 for the document flag) | covered |
| | cards without amounts with `BILLING` off | #9 | covered |
| | «Ofertes si es porta més d'un gos per família» absent without `FAMILY_GROUP` | #9, #10 | covered |
| **T-04-31** | «Grup trobat: Marta R. …» | #13 (the exact text) | covered |
| | an inline error with «Deixa-ho pendent i continua ›» only with `allowFamilyGroupPending` | #33 (false: not offered), #34 (true) | covered |
| | empty fields → continue without a claim | #13 | covered |
| | «‹» keeps the dog | #14 | covered |
| **T-04-32** | the segment with the methods received | #16, #17 | covered |
| | the mandate and the day-25 text only under «Domiciliació»; `cashConditions` only under «Efectiu» | #17 | covered |
| | two start options with the received dates and «Total a pagar al club» | #27 (day 5), #28 (day 17, 130 € total), #29 (31-12), #82 (MSW e2e); real core: #85 (`expectUpfrontCard` against `GET /signup`'s quote) | covered |
| | [ENVIA LA SOL·LICITUD] disabled until privacy is accepted | #16 | covered |
| | «Pots consultar-la aquí» opens a new tab without leaving the step | #16 (`window.open` with `_blank`) | covered |
| | «què vol dir?» unfolds the text | #16, #26 | covered |
| | `checkout.required` redirects to `checkoutUrl` | #18 | covered |
| **T-04-33** | yellow warning with the gender, and «Compte no informat» when due | #56 (`…fotos on surti ella`); `SignupReviewPage.test.tsx:1189` («Compte no informat» on the card) | covered |
| | document links | #56 (`cartilla_Kiwi_1.jpg` link with its signed URL) | covered |
| | a plan change runs `dryRun` and redraws «Pagament inicial (anticipat)» | #68 (Pack 6: lines, date and body updated) | covered |
| | 422 on the field | `SignupReviewPage.test.tsx:391` «M13 422 codes on their fields» (9 cases: LEVEL_REQUIRED, LEVEL_NOT_ACTIVE, NEXT_INVOICE_DATE_REQUIRED, VALIDATION_ERROR, UPFRONT_AMOUNT_EXCEEDS_DUE, PLAN_NOT_AVAILABLE, INVALID_STATE, MEMBERSHIP_EXISTS, MEMBER_ERASED) | covered |
| | the rejection modal with a required reason | `SignupReviewPage.test.tsx:656` (the modal's [REBUTJA] disabled until «Motiu del rebuig») | covered |
| | [EDITA LES DADES] saves with `version` | `SignupReviewPage.test.tsx:301` (member and dog each with their own `version`) | covered |
| **T-04-34** | real E2E: signup → D1 card → D2 → [VALIDA L'ALTA] → N-02 mail → link → 03 | #85 (C) | covered |
| | «＋ AFEGEIX UN GOS» → N-37 | #85 and #87 (C); `n37-notification.json` `{"action":"OPEN_DOG","channel":"APP","code":"N-37","dogName":"Neret E3","status":"SENT"}` | covered |
| | the forbidden-vocabulary lint on `signup`/`admin-census` in ca/es | I (`pnpm i18n:check` passed) | covered |
| **T-14-25** | 4 KPIs with the mockup's literals | #37 (184, 87 %, 56, «142/163 places», …) | covered |
| | «1 de fa més de 2 dies» | #37 | covered |
| | the risk card «4 avisos» and the 4 states (ICU «avisada Laura + Duna» / «avisat Pau + Blat») | #37, #47 | covered |
| | «Compte no informat» only on Núria | #37 | covered |
| | [VALIDA] navigates to `/preinscripcions/:id` | #37 (the `navigate` spy), #84 (MSW e2e) | covered |
| | one column per progression level (E35) and «242 actius» | #37, #51 | covered |
| | `dogsByLevel = null` → no card; `trainingBookings = null` → 3 KPIs | #38 | covered |
| | a refetch when the focus comes back | #38 | covered |

**Missing:** none. Every clause of T-04-29 … T-04-34 and T-14-25 has an asserting test, and every such test passed in this run.

## 3. Audit tests (`roadmap/reviews/gate-E3/consolidated.md`, «Tests that must exist after the fixes», web items)

| Audit item | Test that proves it | Location | Result |
|---|---|---|---|
| a NIE and a passport submission — Vitest | «B1 identity document at submission (R-04-01)» › submits a NIE applicant …; › submits a passport only applicant … (and the DNI case) | `apps/clubs/src/SignupPage.test.tsx:908` (parameterized) | ✅ V |
| a NIE and a passport submission — real-core e2e | #85: a NIE applicant typed lower case with a hyphen reaches «Sol·licitud enviada», and the D2 view carries `{type: NIE, value: Y7654321G}` (`e3-signup.spec.ts:762`); a passport-only applicant «Joana Passaport E3» (`:782`); D2 capture `D2-signup-family-pending-core-1280.png` shows `PA1234567` | `e2e/core/e3-signup.spec.ts:564` | ✅ C |
| a retry after a lost 201 | «M1 stable retries (CONVENCIONS_API §7, R-04-26/27)» › retries a lost 201 with the same Idempotency-Key and gets the same 201; › add-dog: a lost 201 is replayed, never DOG_CHIP_ALREADY_REGISTERED …; «E3-W08 step 7» › #2 a cancelled checkout is consumed once … retry with the same key | `apps/clubs/src/SignupPage.test.tsx:924`, `:974`, `:1976` | ✅ V (Vitest against the MSW api; no real-core case: the core cannot be made to lose a 201) |
| the total on 19, and the labels on days 5 and 17 | #27 (05-08: «a full month today, half a month from the 16th»), #28 (17-08: «half a month today, the 1st of September in full, a 130 € total»), #82 (MSW e2e, day 5); real core (day 26): #85 checks the card against `GET /signup`'s quote (`19-payment-core-375.png`: 100 + 30 = 130 €) | see §1 | ✅ V · ✅ P · ✅ C |
| a pack-plan quote | #30 (Pack 6: the pack line and no start options); real core #85 with `plan: "Pack 6"` (`e3-signup.spec.ts:772`, `19-payment-pack6-core-375.png`: 135 €); D2 #68 (the Pack 6 `dryRun`) | see §1 | ✅ V · ✅ C |
| a dog edit after an add-dog | `SignupReviewPage.test.tsx:315` «add-dog: the person is read-only and the new dog is saved with its version 0 while the member is at 7 (R-04-25)»; real core #85 (M12, `e3-signup.spec.ts:905`: the member's fields disabled, the new dog saved with its own version; `D2-signup-add-dog-core-1280.png` shows the edited breed «Gos d'atura») | as named | ✅ V · ✅ C |
| 422 codes on the D2 fields | `SignupReviewPage.test.tsx:391` «M13 422 codes on their fields» (9 cases) and `:419` «maps the mock's own answers too» | as named | ✅ V |
| D1 fresh right after a validation, with no wait in the e2e | `SignupReviewPage.test.tsx:625` «M11 … after VALIDA navigates to /tauler and refreshes the menu counters»; real core #85 (`e3-signup.spec.ts:714`: «VALIDA lands on D1, whose first read already omits the signup (no wait, no detour)») | as named | ✅ V · ✅ C |

The consolidated list's other items (the family-plan add-dog, a validation with the family fare, an S3-signed upload against MinIO, a readmission rejected with the original data intact, a percent-encoded route still rate-limited) are api items or were not in this task's list. The web part of two of them shows in this run: `D2-signup-add-dog-core-1280.png` (an add-dog on the family plan «Abonat · 2 gossos (familiar) · 90,00 €/mes») and `D10-after-rejected-readmission-core-1280.png` with `readmission-core.json`.

## 4. Notes

- No failure and no retry in any of the four runs.
- `oauth-token-calls.log` (committed, 105 calls in the three stages): every non-2xx is `REFRESH_EXPIRED`. 42 are cookie-less probes on pages that open before their login. One is sent with the cookie, in T-01-22 (the apps/id authorize flow, which passes), as in the E3-W05, E3-W12 and E4-W05 logs. There is no `REFRESH_REUSED`.
