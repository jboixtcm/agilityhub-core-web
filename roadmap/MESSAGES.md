# Messages — organizer ↔ executor (append-only, newest at the bottom)

Format: see `roadmap/README.md`. Address entries with `@executor`, `@organizer` or `@jordi`. One topic per entry.

## 2026-09-05 · organizer → executor · general
@executor **Welcome** — Start with `AGENTS.md`, then `roadmap/STATUS.md`. The first `ready` tasks of stage E0 have no open decisions; if something in a task contradicts `docs/`, the data model (`docs/MODEL_DADES_PLATAFORMA.md`) wins and you note it in the report. Ask here whenever a task is ambiguous; assumptions are fine if written down.

## 2026-09-06 · executor → jordi · E0-W02
@jordi **Blocked — gallery screenshot access** — The gallery implementation, UI tests, admin test, typecheck and build run, but all three Playwright engines abort at browser startup under the macOS sandbox (Chromium: MachPort rendezvous permission denied; WebKit/Firefox: abort), and Computer Use has no approved browser. Please enable a browser surface or run `PLAYWRIGHT_BROWSERS_PATH=<installed-path> node scripts/capture-ui-gallery.mjs` outside the sandbox. Assumption: the generated 1280 px screenshots will be accepted after visual inspection, then the remaining verification/report steps can continue.
Blocking: yes.

## 2026-09-06 · organizer → executor · E0-W02
@executor **Unblocked** — The gallery screenshots were captured by the organizer in a Linux sandbox (Chrome headless, 1280 px, both themes): `roadmap/evidence/E0-W02/gallery-agilityhub.png` and `gallery-canic.png`. E0-W02 is back to `in_progress`: finish the Executor report (evidence of `pnpm --filter @agilityhub/ui test`, the lint-color proof, `node scripts/extract-icons.mjs` output, icon names) and set `awaiting_verification`. New rule (AGENTS.md §6): browsers cannot launch inside your sandbox — never block on that; use the Docker recipe (`scripts/e2e-docker.sh` from E0-W07) or note it in the report and the organizer captures.

## 2026-09-06 · organizer → executor · E0-W04
@executor **Answer — `/branding` contract** — The backend is the source of truth and its real snapshot (api E0-T05, `docs/openapi/openapi.json` of `agilityhub-core-api`) already uses the design-system names: `theme.colors.{primary, onPrimary, background, surface, surfaceAlt, text, textMuted, border, success, warning, danger, info}`, `theme.{fontFamily, radius, ringPalette, logoUrl, logoDarkUrl, markUrl, mode}`, plus `club {slug, name}`, `countryProfile {code, idDocumentTypes, phonePrefix}`, `locales`, `defaultLocale`, `timeZone`, `currency`, `modules`, `signup.enabled`, `status`, `legal.privacyPolicyUrl`. There is no club id in the payload: use `club.slug` as the branding key. The mismatch came from the task text, not from the backend. In E0-W06 (new step) update the stub's `/branding` to that exact shape (copy it from the api snapshot) so the adapter only renames nothing; keep the stub for `/me` and `/oauth2/token` until api E0-T09/E0-T12 land, then switch the generator to the sibling snapshot.

## 2026-09-06 · organizer → executor · E1
@executor **Stage E1 (front) opened** — E0 front is fully verified (E0-W08 stays blocked on Jordi). `E1-W01` (screens 01/02/03b/12 + admin login + impersonation banner + handoff) is `ready`: build it against MSW from the S01 §6 contract (the api snapshot with these endpoints arrives with api E1-T01; regenerate then). Routes are the spec ones: `/entrar`, `/activacio`, `/perfil-acces` — and fix the `/acces` redirect in `packages/auth`. `E1-W02…W04` open as soon as the api contract lands.

## 2026-09-06 · organizer → executor · E1-W01
@executor **changes_requested (4 points in the task file)** — Screen 01 and the rows of 12 must follow the mockup/spec, not the task text (my wording was wrong; steps 1 and 4 of the task are corrected). Rule reminder: when the task text and the mockup/spec §2 row disagree, the mockup/spec wins and you flag it in the report — do not implement the task text silently. The contrast diagnostic is accepted as is.

## 2026-09-06 · organizer → executor · E1/E2
@executor **More work opened** — After the E1-W01 corrections: `E1-W03` (`apps/id` pages, mocks-first; the OIDC continuation lands with api E1-T05) and `E2-W01` (`UniversalList` + D5/D15, mocks-first from the S03 §6 list contract: add its operations to the stub with the `x-filterable`/`x-sortable`/`x-columns` extensions exactly as the spec table lists them; regenerate when api E2-T01 lands). `E1-W02`/`E1-W04` open when the api onboarding/integration pieces exist.

### 2026-09-06 12:50 · @organizer → @executor · E1-W01 verified; follow-up E1-W05
E1-W01 round 2 is **verified** (screens 01 and 12 now match the mockups; independent run 26/26). One item is carried into a small new task instead of a third round: `auth:access.locationCanic` + `branding.club.slug === "canic"` is a club literal in code (AGENTS.md §2). Contract decision: `/branding` `club` gains an optional `city` (from the club's `address.city`); the api adds it in E1-T02 and the web reads it in **E1-W05** (`ready`, order 15 — it will come out of `--next` after E1-W03). Task file: `roadmap/tasks/E1-W05.md`.

### 2026-09-06 13:30 · @organizer → @executor · E2 (web) installed; E2-W03 ready as filler
E2-W02…E2-W07 are in `roadmap/tasks/` (`not_open` except **E2-W03**, screens 13/28, mocks-first, which only needs E0-W06). Order of preference stays: `changes_requested` (E1-W05) → in-progress → E2-W01 → E2-W03. E1-W06 opens when the api contract is verified.

### 2026-09-06 13:40 · @organizer → @executor · api contract verified → E1-W06 ready
The api snapshot of S01 (api commit `a5565ec`, 24 paths) is at `packages/api-client/openapi/openapi.json` — byte for byte the api file, never edit it by hand. **E1-W06** (adopt it, delete the stub, fixture-vs-schema test) is `ready`. Queue order: E1-W05 round 2 → E2-W01 (in progress) → E1-W06 → E2-W03. When E2-T01 (census contract) is verified the organizer will refresh the same file and open the E2 equivalents.

### 2026-09-06 13:55 · @organizer → @executor · E2-W01 verified; E2-W02 and E2-W04 ready
E2-W01 is **verified** (D5/D15 faithful; 26/26 independent run). E2-W02 (D10 member record + dog record) and E2-W04 (D16/D17/D11 cards/D8) are `ready`, mocks-first like E2-W01: extend `stub.json` (or `pending.json` once E1-W06 lands) only with what S03/S05 §6 specify. Queue: E1-W05 round 2 → E1-W06 → E2-W02 → E2-W03 → E2-W04 (by order).

### 2026-09-06 14:40 · @organizer → @executor · pause (Codex weekly usage limit) — resume notes
Sessions stopped at 14:05 (usage limit until 2026-09-08 11:45). **E1-W06 is `in_progress` with partial work on `main` (`0c3be42`, typecheck red — expected)**: on resume, `--next` gives you E1-W06 again; check the working tree/diff first, finish (merge `openapi.json` + `pending.json`, drop the sibling lookup, fixture-vs-schema test), make `pnpm turbo run lint typecheck test build`, `i18n:check` and `e2e:docker` green, report. Note for the organizer to check on resume: CI run 34031551094 on `db2b9d5` (E1-W05 round 2, verified) failed although lint/typecheck/test/build, i18n, `api:generate` diff and `size-limit` are green locally and the Docker e2e passed — probably the Playwright step on the runner; look at the failed log before assuming a code problem.

### 2026-09-06 · executor → organizer · E1-W06
@organizer **Contract finding — branding required fields and city** — The verified snapshot's `BrandingResponse` and nested branding schemas have no `required` arrays, and `ClubSummary` omits the task-fixed optional `city` field. Please correct these in the api and refresh `openapi.json`; meanwhile the web runtime-refines every shell-required branding field and leaves the snapshot unchanged.
Blocking: no.

### 2026-09-06 15:05 · @organizer → @executor · E1-W06 verified; snapshot refreshed (api `723309a`)
E1-W06 is **verified** (26/26 independent; merge + Ajv contract test are exactly what was asked). Answer to your contract finding: `club.city` is now in `openapi/openapi.json` (api snapshot from E1-T02, types regenerated by the organizer, typecheck/tests green); the missing `required` arrays on the branding schemas are an api bug (only the identity DTOs were annotated) → api task **E1-T11** (springdoc customizer making non-optional properties required by default) — the next snapshot refresh will bring them; keep the runtime refinement until then. Queue: E2-W02 → E2-W03 → E2-W04; E1-W02 opens when api E1-T06 is verified.

### 2026-09-06 15:45 · @organizer → @executor · api E2 contract verified → staged snapshot + task E2-W08
The api E2 contract (E2-T01: 104 paths / 223 schemas) is verified. Its snapshot is staged at `packages/api-client/openapi/openapi.next.json` — **do not swap it in from another task**: the generator's guard would fail while `pending.json` still defines the same paths. Task **E2-W08** (not_open until E2-W02/E2-W04 land) does the swap, prunes `pending.json` and aligns fixtures/consumers. Until then keep working mocks-first, but prefer the real names when you extend `pending.json` (look them up in `openapi.next.json`) — it makes E2-W08 cheaper. New catalog code with translation already present: `MEMBER_ERASED` (409).

### 2026-09-06 16:15 · @executor → @organizer · E2-W03 contract follow-ups
@organizer **Non-blocking contract proposals** — R-03-18/T-03-40 require member-visible task items and completion state, but staged `TasksSummary` only exposes `open`/`completed`; please extend it (or publish the canonical S10 member task list/completion operations). Screen 28 also requires image-rights state, while staged `MeProfile` has no consents and R-03-09's PATCH excludes them; please confirm the control is read-only or publish a dedicated consent operation. E2-W03 keeps completion as a local S10 placeholder and renders image rights read-only meanwhile.
Blocking: no.

### 2026-09-06 17:10 · @organizer → @executor · E1-W02 ready (api E1-T06 verified); E2-W02 verified
The onboarding backend is verified: **E1-W02** («Completa el teu perfil» + policy pop-up) is `ready`; its contract is in `openapi.json` already (E1-T01 shapes) and the staged `openapi.next.json` is the latest api snapshot. Queue: E2-W04 (in progress) → E1-W02 → E2-W08 (opens when W04 lands).

### 2026-09-09 12:45 · @organizer → @executor · docs re-synced (decisions of 06-09 and 08-09) — read before continuing E2-W04
`docs/` now carries the specs updated after Jordi's and Josep's answers (`docs/DECISIONS_PENDENTS.md` v1.5 Parts A, B, E). What changes for work in flight:
- **A5 — levels are 100 % local**: no `Level.agilityhubLevel`, no «Escala AgilityHub» column/select anywhere (S05 §2 corrected). If E2-W04's D11 «Nivells» card or the level dialogs show it, remove it; the i18n `enums.agilityhubLevel.*` keys are deleted in E2-W08.
- **B10 — `Plan.billingMode` replaces `Member.billingMode`** (D10 «Mode de facturació» row becomes read-only, derived from the plan) — S03/S05/S12 updated; applies to E2-W02 follow-ups and E2-W08.
- **A1 — refresh token moves to an httpOnly cookie behind a same-site proxy** (`/api/*` and `/oauth2/*` proxied on every club host): `packages/auth` drops the WebCrypto storage in a dedicated task (E1-W07, coming); nothing to do in E2-W04.
- New catalog values (no UI impact yet): `billing.cashInvoicing = SEMESTER`, `billing.sepa.collectionDayOfMonth = 1`, `activities.cancelDeadline = EVENT_START`, `billing.upfrontCutoffDay = 25`, `billing.packToMember*`, `rgpd.retentionYearsAfterLeave = 6`, `dashboard.pendingSignupAgeWarnDays = 2`; N-54 «Classe amb pocs alumnes»; `Dog.handlerName` (new field, Playoff mapping) → adopted with the next api snapshot.

### 2026-09-09 13:05 · @organizer → @executor · A1 task E1-W07 created (not_open until api E1-T13); E2-W08 absorbs the spec changes
E1-W07 (cookie mode, remove WebCrypto storage) opens when the api delivers `tokenDelivery = COOKIE` (E1-T13). E2-W08 now lists the spec changes to absorb with the next snapshot (A5, B10, B19, `Dog.handlerName`, licence category/division). E2-W04 in progress: apply A5 now (no «Escala AgilityHub» on the Nivells card), and B10 on the D8 plan form (`billingMode` select, only for `MONTHLY` plans) if D8 is in your scope.

### 2026-09-09 14:10 · @organizer → @executor · api E1-T13 verified → E1-W07 ready
The api now delivers the refresh token as an `HttpOnly` cookie for `clubs-app`/`clubs-admin`/`id-web` (`ah_refresh`, `Path=/oauth2/token`), accepts cookie-based `grant_type=refresh_token`, and revokes with `{}` + bearer for those clients (task file updated). **E1-W07** is `ready` (order 17): it comes right after the current E2-W04 by order. `openapi.next.json` refreshed (api `2fff25b`).

### 2026-09-09 15:05 · @organizer → @executor · E2-W04 and E1-W02 verified; E2-W08 ready
Both **verified** (26/26 independent). **E2-W08** (adopt the api E2 snapshot: `openapi.next.json` = api `5be4dfb` with E2-T01 contracts + E2-T02 parameters API + E1-T13 cookie/platform roles) is `ready` — read its updated conventions (D8 fidelity items, what the snapshot does not carry yet). Queue by order: E1-W07 (17) → E2-W08 (45); E2-W05 opens after E2-W08 (api E2-T02 is verified).

### 2026-09-09 16:55 · @organizer → @executor · E2-W08 verified; E2-W05 ready (with a snapshot refresh as step 0)
E2-W08 **verified** — the two remaining `pending.json` operations and five support schemas are justified. **E2-W05** (D11 parameters from the catalog) is `ready`; its step 0 swaps in the newer staged snapshot (`openapi.next.json` = api `457073d`). E2-W06 waits for api E2-T08/T09; E1-W04 waits for the GHCR image (api E1-T14, published by CI on the next main push).

## 2026-09-09 · organizer → executor · E2-W05
@executor **E2-W05 → changes_requested (round 2)** — see the numbered items in the task's Organizer verification: (0) CI on `main` has been red since `f21b657` because `CensusListPage.test.tsx › renders applied filters and preserves selection when page size changes` times out on the GitHub runner (6.5 s > 5 000 ms) — raise the clubs-admin vitest `testTimeout`/`hookTimeout` to 15 s and make that test cheaper; a task cannot be verified while `main` is red, so fix it in this round and paste the CI URL of the publish commit; (1) the four S02 §2 D11 *derived* read rows are missing (level capacities grouped «Cadells 5 · A–D 5 · E–G 4 · Teràpia 1», «Nivells amb entrenament lliure: D · E · F · G», «Caducitat Pack 6 · Pack 10 · 3 mesos · 5 mesos», masked «Dades SEPA del creditor» from the provider booleans); (2) `ClubPage` is now specified in S05 §6 (`/club-pages`, `/public/{clubSlug}/pages/{key}`) and goes to api E2-T12 → web E2-W09; keep «Normes del club» disabled in this round — your disabled state was right.
Blocking: no.

## 2026-09-09 · executor → jordi · E1-W04
@jordi **Blocked — GHCR Docker login** — The mandatory pre-flight command `gh auth token | docker login ghcr.io -u jboixtcm --password-stdin` failed with the exact error ``error saving credentials: error storing credentials - err: exit status 1, out: `Keychain Error. (100001)` ``. The existing Docker credential could still inspect `ghcr.io/jboixtcm/agilityhub-core-api:main` and confirmed amd64 and arm64 manifests, but task step -1 requires blocking if either command fails. Please repair Docker Desktop's macOS Keychain credential storage, then rerun this task.
Blocking: yes.

## 2026-09-09 · organizer → executor · E1-W04
@executor **E1-W04 unblocked** — the pre-flight was too strict: the manifest inspection worked, only `docker login` failed because the Codex sandbox cannot write to the macOS Keychain. Step -1 is now: **do not run `docker login`**; the session wrapper pulls `ghcr.io/jboixtcm/agilityhub-core-api:main` outside the sandbox before your session, and your only check is `docker image inspect ghcr.io/jboixtcm/agilityhub-core-api:main` (or `docker manifest inspect`). Task back to `ready`.
Blocking: no.

## 2026-09-09 · organizer → executor · E2-W05
@executor **E2-W05 round 3 (CI only)** — round 2 is accepted (derived rows, screenshots, clubs-admin timing), but `main` is still red at `85b125c`: `apps/id` `pnpm run test` exited 1 on the 2-core runner (locally it passes in 0.3 s). Apply the contention fix described in the task's Organizer verification: `configure({ asyncUtilTimeout: 10_000 })` in the three apps' `src/test/setup.ts`, `testTimeout/hookTimeout 15 s` in `apps/id` and `apps/clubs` vite configs, `--concurrency=2` for the turbo command in `.github/workflows/ci.yml`; read the failing `id:test` assertion with `gh run view 34378122011 --log-failed` if your sandbox can, otherwise say so. Nothing else is pending on this task.
Blocking: no.

## 2026-09-09 · organizer → executor · E2-W05
@executor **CI detail for round 3** (from the organizer's CI log of run `9c99a77`, same failure as `85b125c`): `apps/id` → `src/App.test.tsx › T-01-22 apps/id › resumes a server-side OIDC flow after password login` fails with `TestingLibraryElementError: Unable to find role="heading" and name "Entra en AgilityHub"` after 1 545 ms — i.e. the Catalan heading is not there within Testing Library's default 1 000 ms `asyncUtilTimeout` on the loaded runner (locally it passes in 0.3 s). The round-3 fix (asyncUtilTimeout 10 s in the three `src/test/setup.ts`, vitest timeouts in id/clubs, `--concurrency=2` in CI) targets exactly this; also make sure that test initialises the Catalan locale deterministically before rendering (not through `navigator.language`).
Blocking: no.

## 2026-09-09 · organizer → executor · E2-W06
@executor **E2-W06 → changes_requested (round 2, CI)** — the audit/exports UI is accepted, but `main` is red at `a090d1c`: `census-lists.spec.ts › T-03-35` (E2-W01) still expects an «Excel» `<a href="…format=xlsx…columns=…">` and the list export now goes through the exports drawer. Keep the new flow (`200` → direct download with the same query, `202` → drawer), update T-03-35 (and the `UniversalList` Vitest if needed), and run the **complete** `pnpm e2e` in Docker twice (new rule in AGENTS.md step 5). See the task's Organizer verification.
Blocking: no.

## 2026-09-10 · organizer → executor · E3-W01
@executor **E3-W01 → changes_requested (round 2, fidelity)** — the flow is right; 16 and 17 do not match the V8 mockups: phones must be one row each (prefix · number · descripció, like screen 28), dates as masked text inputs (`dd/mm/aaaa`, `mm/aaaa`, ISO on the wire — no native pickers), the vaccination-card control must be custom (never «Choose Files / No file chosen»), plan cards with the mockup layout (name/price on one line, packs side by side, no name wrapping, Teràpia without the duplicated entry line), consents with the link on the same line; then the complete `pnpm e2e` in Docker and new screenshots. Keep `pending.json` (E3-W02 swaps the staged snapshot). Details in the task's Organizer verification.
Blocking: no.

## 2026-09-10 · organizer → executor · catalog
@executor **Error catalog 10-09 (FYI, no action)** — `CATALEG_ERRORS.md` gained `INTERNAL_ERROR` (500) and `METHOD_NOT_ALLOWED`/`NOT_ACCEPTABLE`/`UNSUPPORTED_MEDIA_TYPE` (405/406/415) for the api hardening task E3-T06. The organizer added their messages to `packages/i18n/src/locales/{ca,es,en}/errors.json` (`i18n:check` = 249 codes, 0 missing) — keep them if you touch those files. The shared `ApiError` handling of E0-W04 needs nothing new: an unexpected `500` carries `code = INTERNAL_ERROR` + `traceId`, shown through the existing generic error path.
Blocking: no.

## 2026-09-10 · organizer → executor · pause (Codex usage limit) — resume notes
@executor Sessions stopped at 07:17 («usage limit», retry from 2026-09-15 19:19 unless credits are added). **E2-W06 is `in_progress` with round-2 work already on `main` (`ce27746`: `census-lists.spec.ts` + `CensusListPage.tsx`, no report yet)** — on resume `--next` gives E3-W01 (`changes_requested`) first; finish E2-W06 round 2 when it comes up (its «Organizer verification» list: explicit Excel/PDF actions with `200` download / `202` drawer, T-03-35 green, complete `pnpm e2e` twice). CI web: unit job green again after the organizer's i18n commit (`d4aae0c`); Playwright red only for T-03-35.
Blocking: no.

## 2026-09-10 · executor → organizer · E2-W07
@organizer **Blocked — demo census is missing from the published core image** — `docker pull ghcr.io/jboixtcm/agilityhub-core-api:main` reports current digest `sha256:ce3b6eb…`, revision `476761a…`, but `/app/seeds/demo-canic.yaml` is absent (`sed: can't read /app/seeds/demo-canic.yaml: No such file or directory`). Please publish the image required by step 0 with that seed file (and the `seed:demo` command), or provide the approved seed file and mount source. Assumption on resume: use the corrected image's seed unchanged and require `184 active members / 242 dogs` before T-03-42.
Blocking: yes.

## 2026-09-10 · executor → organizer · E3-W03
@organizer **Blocked — E3 snapshot and real-core fixtures are missing** — `packages/api-client/openapi/openapi.next.json` is absent, while the adopted `openapi.json` lacks the E3-T03 `additionalDogOption`/`additionalDog*` fields required by step 0. The available core image is revision `476761a…`; `/app` has no E3 demo seed and no `bin/e3-smoke`. Please stage the verified api E3-T05 snapshot and publish/provide the E3-capable image. Assumption on resume: adopt the staged snapshot byte for byte and use its published seed/smoke unchanged.
Blocking: yes.

## 2026-09-16 · organizer → executor · E2-W07
@executor **E2-W07 unblocked — the image now ships the demo seed** — api E3-T05 (verified 16-09) added `seeds/demo-canic.yaml` to the `Dockerfile`; `ghcr.io/jboixtcm/agilityhub-core-api:main` is revision `2d0423c` (CI green, image published 10-09 12:37Z) and the session wrapper pulls it. In the image `/app/seeds/club-canic.yaml` is the **consumer** variant (`club-canic-consumer.yaml`) and `/app/seeds/demo-canic.yaml` is present; `java -jar /app/app.jar --core.command=seed:demo --club=canic --seed=42` from `/app` prints 184 ACTIVE members / 242 ACTIVE dogs (+3 PENDING dogs and 3 pending public signups since E3-T05 — D1 shows «Preinscripcions 3»). Your resume assumption holds: use the image's seed unchanged and require 184/242 before T-03-42. Task back to `ready`.
Blocking: no.

## 2026-09-16 · organizer → executor · E3-W03
@executor **E3-W03 unblocked — snapshot staged, image published** — `packages/api-client/openapi/openapi.next.json` = api `2d0423c` (E3-T03 add-dog option fields `additionalDogOption` / `upfront.additionalDogOptions[]` / `upfront.additionalDog` / `AddDogSignupResult.checkout`, E3-T04 dashboard corrections — occupancy percent nullable, pending warnings omitted with BILLING off —, E3-T05). The published image `main` = `2d0423c` carries the E3 routes and the demo seed with three pending public signups (one older than the warn days, without IBAN); `bin/e3-smoke` is a host script of the api repo (not inside the image) — you do not need it: the seed gives you the pending rows, and the mailbox volume of `scripts/core-stack` gives you N-02/N-03/N-37. Resume assumption accepted: adopt the staged snapshot byte for byte and use the seed unchanged. Task back to `ready` (E2-W07 first by order).
Blocking: no.

## 2026-09-16 · organizer → executor · E4 contract staged
@executor **api E4-T01 verified — snapshot staged** — `packages/api-client/openapi/openapi.next.json` = api `9b9216e` (+55 operations: 31 S06 planning/calendar/day-grid/ring-block routes and 24 S07 activity/registration/public routes; +95 schemas; `AuditAction` gains the four 16-09 actions; `UploadRequest.purpose` gains `ACTIVITY_IMAGE`/`ACTIVITY_DOCUMENT`; the existing `GET /activity-registrations/export` gains list metadata). Note: the api's scheduling validation response is published as `WeekValidationResult` (S04 owns `ValidationResult`). The routes answer `501 NOT_IMPLEMENTED` until E4-T02/T03/T04 land — build mocks on the schemas (MSW), never against the local core. E4-W01, E4-W03 and E4-W04 are `ready`; after E2-W07 and E3-W03 the queue continues with them in order (W01 → W03 → W04; W02 opens when W01 is verified). Whoever adopts the snapshot first prunes any S06/S07 entries of `pending.json` and regenerates; the others reuse the adopted `openapi.json`.
Blocking: no.

## 2026-09-16 · organizer → executor · pause (Codex usage limit) — resume notes
@executor Sessions stopped at 13:03 («usage limit», retry from 2026-09-23 08:54 unless credits are added). **E2-W07 is `in_progress` with partial work already on `main` (`8ee1952`, 52 files: `e2e/core/e2-core.spec.ts` + `playwright.config.ts`, `scripts/core-stack/*` with the demo seed, polish items — `AuditPage` `fmtDateTime` (f) and field labels (g), `ParameterSettings` coverage vocabulary (a) and `defaultCapacity` label (b), `limited-markdown` styles (e), `packages/ui/tokens.css` + `package.json` (Montserrat, d), `CensusListPage.test.tsx` (h) — no report yet)**. On resume: `--next` gives E2-W07 again; read your own partial code and the task's steps 0–5, finish the `e2e:core` E2 scenario (T-03-42, catalogs, D11 history, export, audit, club pages), the performance numbers, the screenshots, then the complete `pnpm e2e` in the Playwright image. Then E3-W03, E4-W01, E4-W03, E4-W04 (snapshot `9b9216e` staged).
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W01
@organizer **Catalog proposal + question** — (1) Proposed literal `enums:coverageStatus.NO_DOGS` = «sense gossos» (es «sin perros», en «no dogs»); no mockup shows it. (2) R-06-03 «{level} i sup.»: the S05 seed keeps «Teràpia» (order 80) as the last active level, so read literally {D,E,F,G} gives «D+E+F+G», never «D i sup.». Should the rule ignore levels such as Teràpia (e.g. a `Level` flag), or stay literal? Meanwhile the front preview and the MSW resolver apply the literal rule; the static D3 fixtures show «D i sup.» as the task lists. (3) `scripts/e2e-docker.sh` copies the container's `roadmap/evidence` back over the host folder, which overwrites logs written there and re-captures every task's screenshots; E4-W01 logged to `test-results/` and restored the other tasks' PNGs from `HEAD`. Details in the task report.
Blocking: no.

## 2026-09-24 · organizer → executor · E3-W03, E4-W01, E0-W08, E4-W06
@executor
- **E3-W03 → changes_requested (round 2).**
  - «Data del proper rebut» is missing on D2 against the real core.
  - The warnings render as full-width bars.
  - The e2e fills the date only `if visible`.
- **E4-W01 → changes_requested (round 2).** Evidence logs, the edit-mode PATCH race, error states, mock consistency with E29, `e2e-docker.sh`.
  - Your question (1): «sense gossos» is accepted.
  - (2) Ruling E29 in `docs/DECISIONS_PENDENTS.md`: `Level.progression`.
  - (3) Accepted; fix it in round 2.
- **E0-W08 → ready.** Jordi gave the course-builder root. Read the new «Source» section first: the root is read-only, never read `.env*` files, and the task lists what not to copy.
- **New task E4-W06:** the «Progressió» switch in D11 (E29), mocks-first until api E5-T11 publishes the field.
- **Evidence:** `.gitignore` now un-ignores `roadmap/evidence/E4-*/*.log` … `E12-*` (see AGENTS.md rule 4).
- **Next api snapshot:** `WaitlistEntry.position` becomes nullable (api E5-T08). It matters for the E5 screens.
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W02
@organizer **Awaiting verification + three notes.**
- **Snapshot:** E4-W02 adopted the staged `eb38e01` snapshot (step 0). `WaitlistEntry.position` is already nullable in `openapi.json`.
- **Shared mock world:** the next two weeks are now generated in draft (D4b, plus one inconsistent week). As a result, D3 proposes the 4th week. I updated `planning-templates.spec.ts` and restored the E4-W01 PNGs from `HEAD`. E4-W01 round 2 should keep these fixtures.
- **Question:** the shapes of `RING_BLOCK_CONFLICT.details.conflicts[]` and `RING_HAS_BOOKINGS.details.bookings[]` are not in the OpenAPI. Meanwhile I assume `{type, id, label, from, to}` for conflicts. Please ask the api to document both.

Details in the task report.
Blocking: no.

## 2026-09-24 · executor → organizer · E3-W03
@organizer **Round 2 awaiting verification + notes on core image `9e3a9c6`.**
- **D2 date field:** the real core sends a PENDING member with `plan: null`; the plan lives only in `proposals.planId`. D2 now takes the plan type from the proposed catalog plan, and the e2e asserts the field and the `nextInvoiceDate` it sends.
- **IBAN:** `maskedAccount` has no country or check digits, so «ES02 ···· 7719» cannot be built. D2 shows «···· 1332». Proposal: the api exposes `ES02 ···· 7719`.
- **Nulls:** the image serialises absent optional fields as `null` (not nullable in the OpenAPI). That hid every module-less D11 parameter; the front now tolerates it. Should the api omit them, or should the snapshot mark them nullable?
- **Other scope, not fixed here:**
  - D11 shows untranslated `training`/`messaging` block titles and `param.learn.*` labels.
  - A clubs `refresh_token` grant answered `400` in 2 of 6 real-core runs.
  - `e2-core.spec.ts` still expected the D3 «Aviat» placeholder. I switched it to the real heading.
- **`scripts/e2e-core.sh`:** `CORE_URL` now defaults to the local stack, and it accepts `[evidence-subdir] [spec files]` (env prefixes are denied in this sandbox).
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W01
@organizer **Round 2 awaiting verification + three notes.**
- **Overlay for E4-W06:** `Level.progression` lives in the new `x-schema-overlays` section of `pending.json`. The generator fails once the snapshot publishes the property, so E4-W06 (or the adoption task) must prune it.
- **{F,G} = «F i sup.»:** under E29, {F,G} resolves to «F i sup.». The D3 template fixtures follow the rule now. E4-W02's `fixtures/calendar.ts` still has static «F+G» sessions. They flip on the first PATCH, and `planning-calendar.spec.ts:157` expects «F+G». I left E4-W02's files alone. Please align them in E4-W02 or E4-W06.
- **`Accept-Language`:** clubs-admin sent `navigator.language`, so the Docker e2e showed «F and up» in the Catalan UI. It now sends the UI language. The `clubs` PWA builds its client the same way and probably needs the same fix (not changed here).
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W03
@organizer **Awaiting verification + proposals.**
- **Contract:** the S06 snapshot adopted by E4-W01/W02 already covers `/day-grid`, `/class-sessions/{id}` and `/ring-blocks/{id}(/cancellation)`. The staged `openapi.next.json` (`a202870`, S10) was left for its adoption task. It adds `DayGridCell.attendanceStatus`.
- **`ScheduleGrid`:** the E4-W01 cell is reused (new `plain` variant). `DayGrid` is its own CSS grid, because the `ScheduleGrid` table scrolls at 375 px. The D3b/D4 day views can adopt `DayGrid` later; they are not migrated.
- **Tab bar:** «Avui» → `/avui` for the member profile; «Visió global» → `/instructor/avui` for INSTRUCTOR/ADMIN. TabBar columns are now auto-sized, so six labels fit at 375 px. `shell.spec.ts` (E0-W06) is updated.
- **Proposed literals:** the day navigation, loading and error texts of `home:today.*`; the class and block drawer labels of `instructor:overview.*` (including the task's «Bloqueig de pista», «Motiu», «Nota», «Creat per», «Anul·la el bloqueig»); `enums:occupiedReason.{TRAINING,MAINTENANCE}`; `shell:nav.globalView`. Full list in the task report.
- **Questions for the api:**
  1. Does `/day-grid` send a «Sense» column (`ringId: null`), or only cells without a ring? The front handles both.
  2. Could the staff projection of `GET /class-sessions/{id}` carry `instructorNames[]` and `ring {id,name,color}`? The drawer (and E6 screen 21) needs them; today the front takes them from the grid.
Blocking: no.

## 2026-09-24 · organizer → executor · E3-W03, E3-W04 (new), E4-W01, E4-W02, E0-W08, E4-W06
@executor
- **Verified:**
  - **E3-W03 (round 2).** Gate E3 (front) is ticked in `ROADMAP.md`, and the stage closes with Jordi.
  - **E4-W01 (round 2).** Correction of its note: the `clubs` app already passes `getLocale` to both API clients, so it needs no follow-up.
- **New task E3-W04**, the follow-ups after the gate:
  - D2 success toast tone, ICU plural of «pendent des de…», null-tolerant D2, and the e2e proof of the typed date;
  - **one masked-IBAN format** `fmtMaskedIban` (S03 R-03-27) in D2, D5, D10, 19 and 28. The «ES02 ···· 7719» proposal is rejected;
  - `oauth-token-calls.log` in every real-core run, for INC-07.
- **Changes requested:**
  - **E4-W02**, ten points; the major one is the `STALE_VERSION` message lost on the card remount;
  - **E0-W08**, two points: `exactOptionalPropertyTypes`, and the comment on the approved colour exemption.
- **E4-W06 extended:**
  - step 4: D11 labels for the new parameter blocks, plus `check-parameter-keys.mjs`;
  - step 5: the D3 edit-mode leftovers of E4-W01.
- **From the api, for the next adoptions:**
  - `Level.progression` is in the published snapshot (api E5-T11), so E4-W06 step 0 prunes the overlay.
  - `GET /bookings/{id}` returns `checkoutUrl` while `PAYMENT_PENDING`: E5-W01 can resume a pending payment.
  - D1 rows carry the api's translated placeholder for a class with no ring (`scheduling.noRing`). Render it as sent.
  - The Cànic seed has **10 levels** (`PENDENT`, `progression=false`), and `GET /coverage` leaves out TER and PENDENT. A real-core e2e that counts levels or coverage rows must follow (E4-W05).
  - `POST /attachments` will accept `Idempotency-Key` (api E6-T01 round 2). Add `"/attachments"` to `DEFAULT_IDEMPOTENT_PATHS` when you adopt the E6 snapshot.
  - `RING_HAS_BOOKINGS`: render `memberName` + `dogName`, since the two shapes differ (INC-09). Conflicts follow `ActivityRingConflict`.
  - **INC-08:** until the api omits them, treat `null` as absent in every field the OpenAPI marks optional.
Blocking: no.

## 2026-09-24 · organizer → executor · E4-W03
@executor
- **E4-W03: changes requested** (Codex review), four points:
  - an invalid `?date=` crashes the page;
  - business dates must be formatted as calendar dates, with one `packages/i18n` helper for every `YYYY-MM-DD` value (clubs at UTC+12 or more see the next day);
  - render the api's «Sense» column as delivered;
  - mock fidelity for member and impersonation on the class and block routes.
- **Your Question 3 is accepted:** api E5-T15 adds `instructorNames[]` and `ring` to the staff projection of `GET /class-sessions/{id}`.
- **`.gitattributes`** (organizer): `packages/course-core/fixtures/** -text`. The Smarter fixtures keep their CRLF bytes, as in the source. The committed blobs had LF while the source and the working copies have CRLF, probably because of a `core.autocrlf` setting.
Blocking: no.

## 2026-09-24 · organizer → executor · E0-W08
@executor **E0-W08 verified** (round 2). The organizer re-ran `tsc --noEmit` with the base strictness on both packages: exit 0. The gate E0 line for `course-core` + `shared-types` is ticked. From the next publish on, the Smarter fixtures are committed with their source CRLF bytes (`.gitattributes`).
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W02
@organizer **Round 2 awaiting verification.** All ten points are fixed. Details are in the task report under «Round 2».
- **Conflict messages:** `STALE_VERSION` and `INVALID_STATE` now live in the page toast. The new Vitest makes a real concurrent PATCH first. Both conflict tests fail when the toast is disabled.
- **Mock:** a training booking («Clara Font + Trevi», Muntanya, current Wednesday 19:00–20:00) now feeds `RING_HAS_BOOKINGS` (422, S06 route shape). It covers PATCH/POST `/class-sessions` and POST/PATCH `/ring-blocks`.
- **Shared mock world:** `@agilityhub/api-client/mocks` now exports `catalogState` and `planningState` for app tests.
- **Screenshots:** the complete Docker e2e passed (25 + 1 + 29) and re-shot the six PNGs. Only D4b changed («F i sup.»).
- **Working tree:** the organizer-side edits made during the session (MESSAGES, ROADMAP, E0-W08, E4-W03, S06, CRLF fixtures) were left untouched.
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W03
@organizer **Round 2 awaiting verification.** All four points are fixed. Details are in the task report under «Round 2».
- **Dates:** `packages/i18n` adds `parsePlainDate`, `isPlainDate` and `formatPlainDate` (`ClubFormats.formatPlainDate`). They build the date with `Date.UTC` and format it in UTC. All the listed call sites use them. An invalid `?date=` falls back to the club-local today and rewrites the address. The tests cover Auckland, Kiritimati, Madrid and Bogota.
- **«Sense»:** `DayGrid` renders the api columns as delivered. The mock sends `{ringId: null, …}` last.
- **Question:** point 4 asks for 403 on `GET /ring-blocks/{id}` for MEMBER. S06 §6, the OpenAPI («Staff or redacted MEMBER projection») and `MATRIU_PERMISOS` say MEMBER gets the redacted `RingBlockMemberView`. I implemented the redacted view; impersonation gets 403 and the cancellation gets 403 for both. If you want the 403 anyway, it is a one-line change.
- **E4-W02 follow-up:** `CalendarDayPage` adds its own «Sense» column. Against the real `/day-grid`, which now sends one, it could show two.
Blocking: no.

## 2026-09-24 · executor → organizer · E3-W04
@organizer **Awaiting verification + one INC-07 observation.**
- **`fmtMaskedIban`** (`@agilityhub/i18n`) is used in D2/D5/D10/19/28. `compactMaskedAccount` is gone.
- **D2:**
  - the success toast now uses the success tone;
  - ICU plurals, also on the D1 KPI «de fa més de n dies»;
  - `null`s are treated as absent (INC-08);
  - D2 now asks for the amount collected only when an upfront block exists. Before, a D2 with no upfront could not be validated.
- **Real-core run:** `pnpm e2e:core E3-W04` passed 10/10 + 4/4, and `pnpm e2e` in Docker passed 1 + 25 + 29.
- **INC-07:** `oauth-token-calls.log` now records whether a cookie was sent (never its value).
  - Every `400` except one is the anonymous probe of a fresh context (`cookie=none`, `REFRESH_EXPIRED`).
  - The exception is in T-01-22 (`apps/id` authorize resume): `refresh_token` with the cookie → `400 {"code":"REFRESH_EXPIRED"}`, 350 ms after a successful rotation. The test does not assert it. It looks like a stale rotated cookie. For the api: should that be `REFRESH_REUSED`?
  - Details are in the E3-W04 report.
Blocking: no.

## 2026-09-24 · organizer → executor · gate E3 audit: E3-W05 (baseline), E3-W06 (new), E3-W07/W08/W09 (new, not_open)
@executor
- **Gate E3 audit: fail.** Codex and the organizer audited web `5d371d3` and api `20552c6` separately. The consolidated report is `roadmap/reviews/gate-E3/consolidated.md`, and the two source reports are next to it.
  - Blocker **B1**: a NIE or passport applicant cannot submit.
  - Majors on the public signup: retries, error mapping, the total and labels on 19, the plan-blind card, the consent version.
  - Majors on D2: the dog version, 422 codes on their fields, contacts, the plan selector and `dryRun`, the family claim.
- **E3-W05 is the pre-fix baseline.** The organizer set it to `not_open` by mistake while you were running it. It is back to `in_progress`: finish it as written.
- **E3-W06** (ready, no api change needed) comes next: B1, M1, M2, M19, the payment texts under the right method, and the signup minors. Each fix needs a test that fails before the fix.
- **E3-W07** (D2 and D1, with the snapshot adoption) and **E3-W08** (the 19 card from the per-plan quote, signed uploads, screen 13, the flags) open when api E3-T08 and E3-T09 are published. **E3-W09** re-runs the audit at the end. The organizer opens all three.
- **The gate tick of 24-09 on the screenshots line is withdrawn.** The organizer had checked D2 only; the 18/19 screenshots already showed the defects.
- **Docs updated:**
  - S04: R-04-06 and R-04-23 (E38), R-04-25 (E36), §5 (E39), the statuses per the catalog, `UNKNOWN_HOST`, and `warnDays` 2 with `>` on D1 and D2;
  - S14: R-14-02, R-14-07 (E35), and «avisat Pau + Blat»;
  - S15 §6 (E37);
  - S03 row 13 (E36);
  - `DECISIONS_PENDENTS.md` E35–E39;
  - `.gitignore` un-ignores `roadmap/evidence/E3-*/*.log`.
Blocking: no.

## 2026-09-24 · executor → organizer · E3-W05
@organizer **Awaiting verification: baseline audit run, finished as written.**
- **Final `pnpm e2e:core E3-W05`: red** (exit 1).
  - E1/E2 passed 10/10. E3 passed 3/4.
  - `T-04-34 signup.enabled=false shows only the configured closed text` fails in 5 of the 8 runs in which it ran.
  - Runs `01a` and `01d` were fully green, and `01d` wrote the N-37 row.
- **New, for the api (not in `consolidated.md`): the core serves a stale `GET /signup`.**
  - A temporary diagnostic, since removed, caught `PUT /parameters/signup.enabled {"value":false}` → `200 value:false`.
  - 0.5 s later, an anonymous `GET /signup` returned `enabled:true` with `Cache-Control: no-store`.
  - S04 §8 says `ParameterChanged` invalidates that cache (TTL 60 s). Evidence: `roadmap/evidence/E3-W05/01f-diag-*.txt` vs `01g-diag-*-pass.txt`.
- **Complete e2e:** `pnpm e2e:docker` passed (25 + 1 + 29). The workspace checks and i18n are green.
- **Screens and traceability:** `screens.md` covers 13 screens. `trace-tests.md` lists 25 tests; no spec id is missing.
- **Test infrastructure changes, no assertions changed:**
  - `scripts/e2e-core.sh` stages E3 for `E3-W05`;
  - `e3-signup.spec.ts` adds 3 captures (13 once loaded, add-dog 17, D11 viewport).
- **Denied commands** are listed in the report: `docker pull`, `gh run list`, `turbo --force`, `sips`, and reading the api repo.
Blocking: no.

## 2026-09-24 · organizer → executor · E3-W04, E3-W05, E4-W02, E4-W03 and routings
@executor
- **Verified:** **E3-W04**; **E3-W05** (the pre-fix baseline); **E4-W03** (round 2).
- **Changes requested: E4-W02, round 3.** Five points:
  - the bookings confirmation must match what is shown;
  - no edit lost during a save;
  - DST in `clubInstant` (first occurrence; a gap moves forward);
  - the opening-hours clamp after a start change;
  - the D4 day view «Sense» column.
  
  It comes before E4-W04 by protocol.
- **Routed:**
  - E3-W04 Codex #1 (a FOUND claim whose holder has no group) → **E3-W07 step 4**;
  - the new differences of `screens.md` → **E3-W07 steps 8–9** (D2, D1) and **E3-W08 step 5** (16, 17, the footer);
  - E4-W03 review #2–#6 → **E4-W05 step 6**;
  - E4-W03 review #7 → **E4-W02 round 3, point 5**.
- **Rulings:**
  - D2 shows the DNI/NIE in full, like D10;
  - `/branding` gains `legalName` and `taxId` (api E3-T10);
  - the labels above the fields are accepted (accessibility);
  - MEMBER keeps the redacted `/ring-blocks/{id}` (S06 §6; the organizer's round-1 point was wrong);
  - the primary-button contrast (3.32:1) is a brand question for Jordi (A32): keep the theme as it is meanwhile.
- **Evidence rule:** paste the literal last 40 lines and the exit code of every verification command, and keep one log per failed attempt.
Blocking: no.

## 2026-09-24 · executor → organizer · E3-W06
@organizer **Awaiting verification, with one red real-core test that belongs to the api.**
- **Done:** B1, M1, M2, M19, the payment texts and every signup minor. 46 of the 53 signup Vitest fail on the pre-fix page (`01-vitest-before-fix.log`).
- **Green:** `turbo` and `i18n:check`. `pnpm e2e` in Docker passed 1 + 25 + 29.
- **`pnpm e2e:core E3-W06`: exit 1.**
  - E1/E2 passed 10/10, E3 passed 3/4. The NIE applicant reaches «Sol·licitud enviada».
  - The red test is the E3-W05 api defect: the stale `GET /signup` after `signup.enabled=false`. It failed in all 4 runs that reached it, and the core answered `enabled: true` with `no-store` (`signup-closed-config-core.json`).
  - One run also hit M11 (D1 did not list the new add-dog row within 15 s).
- **Deviations, written up in the report's Assumptions:**
  - `PLAN_NOT_AVAILABLE` goes to 17 («Modalitat» lives on 17), not to 18 as the task table says.
  - No day text under CARD, per T-04-32. S04 §2 row 19 still lists it, so that row should be aligned.
- **Proposed literals:** 5 keys in ca/es/en (`invalidPostalCode`, `invalidChip`, `notesToInstructors`, `holderTaxId`, `addDogReviewFooter`).
- **My slip:** the log of the first `turbo` attempt (4 lint errors in the new test) was overwritten. The errors are quoted in the report.
Blocking: no.

## 2026-09-24 · organizer → executor · E3-W06 and E4-W02 (changes requested), E3-W07 opened
@executor
- **E3-W06: round 2.** B1 works on the real core, and 46 tests failed before the fix: good. The Codex review found three majors, confirmed in the code:
  - the routed error is lost in the full-page navigation;
  - after the signup exists, edits on 19 are silently ignored;
  - the fingerprint keeps the IBAN in the session draft.
  
  Four minors too: the stale holder, the club's today, a passport-only real-core flow, and the mock document rules. The overwritten turbo log is accepted this once.
- **E4-W02: round 4.** Two points:
  - a delayed conflict answer must not revive an old booking list;
  - `clubInstant` must be transition-safe (Pacific/Auckland 2026-04-05 02:30 → 13:30Z).
- **E3-W07 is open** (ready). It now depends only on api E3-T08, and the readmission view moved to **E3-W08 step 6**. It will start after E3-W06 round 2 is published. Its step 0 adopts the staged snapshot (`f4d6997`, or a later one if api E3-T08 round 2 has been published). Render the review warnings by code, so the new `PAID_EXCEEDS_QUOTE` (E39b) needs only its keys.
- **Queue order:** E4-W04 (running), then E3-W06 round 2, E4-W02 round 4, and E3-W07.
Blocking: no.

## 2026-09-24 · organizer → executor · A32 decided → E3-W08 step 5
@executor **A32 (Jordi):** the Cànic's primary buttons get dark text (`onPrimary` `#0B0B0B`, 5.9:1). The api seed changes in E3-T10. In the web, E3-W08 step 5 sets the MSW fixture and checks that every primary button reads `--color-on-primary`. Screens 16–19 and D2 will look different from the mockup's white text: that difference is **accepted** (A32).
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W04
@organizer **Awaiting verification: D7 and the app activities are done.** Every Verification command is green; the complete `pnpm e2e` in Docker passed 34 + 27 + 1. The details are in the report.
- **api proposal, `ActivityListItem`:** the D7 columns need `startTime`, `endTime`, `allRings`, `location` and `maxPlaces`, and the suffix needs `typeDisplay`.
  - Meanwhile they are an `x-schema-overlays` entry in `pending.json`. The generator will ask for a prune when the api publishes them.
- **api defect, `ActivityRegistrationListItem.cancelReason`:** it is typed nullable, but its enum has no `null`, so Ajv rejects `null`. The mock omits the field until the registration is cancelled.
- **Dates:** 2026-08-07 is a **Friday**. The UI therefore prints «dv 7» and «Divendres 7», where the mockups and S07 say «ds 7» and «Dissabte 7». Should the seed and the examples move to 08/08, or is «dv 7» accepted?
- **Fixtures:** a fifth fictional activity, «Taller de contactes» (full, 2 waitlisted), holds the `FULL_WAITLIST` row and the waitlist positions that the task requires; none of the four mockup activities can.
- **Mounting:**
  - The 04 block is on `/reservar`, the 03 rows on `/inici`, and E5 replaces both pages.
  - `/historic` is untouched, because `mine[]` has only live registrations. The 25 row is unit-tested, and its screenshot comes from a development-only preview route.
Blocking: no.

## 2026-09-24 · organizer → executor · E4-W04 (changes requested)
@executor **E4-W04: round 2.** The independent review found four majors, and the organizer confirmed them:
- the made-up end of a start-only activity against the real api;
- the dialog that stays spinning;
- `RING_BLOCK` conflicts treated as forceable;
- a silent lost update after an upload.

Also minors, test gaps and nits (details in the task). Your questions: 1, 2 and 4 → a new api task E4-T06; 3 → «dv 7» is right. The S07 statuses follow the catalog (422).
**Queue order:** E3-W06 round 2 (running), then E4-W02 round 4, E4-W04 round 2, and E3-W07.
Blocking: no.

## 2026-09-24 · executor → organizer · E3-W06
@organizer **Round 2 is awaiting verification. All four Verification commands passed on their first run.**
- **Fixed:** the 7 points, each with a test:
  - the routed error lives in the draft, and it is tested with the production navigator stubbed as a full load;
  - once the signup exists, 19 is read-only and offers «PAGA ARA»;
  - the fingerprint is a SHA-256 digest;
  - the group holder goes back to the applicant;
  - the local checks use the club's today;
  - a passport-only applicant runs on the real core;
  - the mocks follow the country profile.
- **Pre-fix proof:** 8 of the 10 new signup tests and both new mock tests fail on the pre-fix code.
- **Green:**
  - `pnpm e2e:core E3-W06` passed E1/E2 10/10 and E3 4/4, the closed-signup test included;
  - the Docker `pnpm e2e` passed 34 + 1 + 27.
- **Proposed literal:** `signup:payment.payNow` («PAGA ARA» / «PAGA AHORA» / «PAY NOW»).
- **For the api:** the first `GET /signup` after the PUT still answers `enabled: true` (see the diagnostic). The page ends closed anyway, with the core's `closedText`.
Blocking: no.

## 2026-09-24 · organizer → executor · E3-W06 verified; three cases → E3-W08 step 7
@executor **E3-W06 verified (round 2).** The Codex review of round 2 found three narrower cases: the navigation race, a reload of `?cs=cancel` after a retry, and the passport error on the DNI field. They go to **E3-W08 step 7**, not to a third round. **Queue order:** E4-W02 round 4 (running), then E4-W04 round 2, and E3-W07.
Blocking: no.

## 2026-09-24 · organizer → executor · the e2e timeouts are infrastructure; the host lock; E3-W10
@executor **The clubs-admin e2e timeouts of this evening are not your code.** In five runs out of five (E4-W02 round 4, E4-W04 round 2), the first 18 of 34 tests timed out right after the login, and the other 16 passed. The likely cause is a cold Vite dev server on a host that the api lane was loading.
- **The host lock (from your next session).** Heavy runs go through the host lock (step 4a of the task prompt). It waits for the other lane's heavy run, then runs yours. Give the call a 3600000 ms timeout.
- **Ending your turn ends the session.** Never wait in the background. The E4-W02 round-4 session ended «waiting for the timer», with `E2E_PLACEHOLDER` still in its report; the next E4-W02 session runs the complete e2e and fills it.
- **New task E3-W10** (ready, before E3-W07): the dev servers are warmed up before the tests, at most 4 workers under CI, and the container copy no longer includes the executor log or the stray `.pnpm-store`.
- **Until E3-W10 is verified**, if the complete `pnpm e2e:docker` (through the lock) fails **only** with this pattern (the first wave of clubs-admin times out right after the login, and everything else is green):
  1. commit that log;
  2. run the spec files that timed out again, in one targeted run (`pnpm --filter clubs-admin exec playwright test <files>`), and commit that log too;
  3. set awaiting_verification with both.
  
  The organizer accepts this for this pattern only. Any other failure is the task's.
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W04
@organizer **E4-W04 round 2 is awaiting verification.**
- **Review points:** the 21 points are done, each fixed point with a test.
- **Pre-fix proof:** 7 admin, 4 app and 3 handler tests fail on the round-1 code.
- **Final runs:**
  - turbo `--force`: 34/34, 0 cached;
  - `i18n:check`: green;
  - the complete Docker e2e: 34 + 27 + 1, fully green (run `20`), so the targeted-rerun exception was not needed.
- **One change outside the task:** `packages/api-client/src/mocks/fixtures/calendar.ts` caches one `Intl.DateTimeFormat` per zone.
  - E4-W02 round 4's `clubInstant` builds about 55 formatters per call, which cost about 1.35 ms per call in Node; now 0.12 ms, with the same R-06-14 results.
  - I added it while chasing the 18 admin timeouts (runs `17`–`19`). Run `20` passed with it.
  - An A/B run without it, at host load 56, failed differently (clubs 12), so I cannot say it was the cause. Your E3-W10 diagnosis stands.
  - Keep it or revert it in E3-W10/E4-W02, as you prefer. The admin copy in `calendar-shared.tsx` (E4-W02) is untouched.
- **Proposed literals:** «bloqueig de pista», the not-forceable note, «Classes i bloquejos en conflicte», the filtered-empty title, and the 04 block error + retry (report R2-1).
Blocking: no.

## 2026-09-24 · executor → organizer · E4-W02
@organizer **E4-W02 round 4 is awaiting verification.** This session only finished the evidence; the round-4 product code is the one committed in `84437c3`.
- **Final runs on the current tree:**
  - turbo `--force`: 34/34, 0 cached (`46`);
  - `i18n:check`, the Ajv suite and the calendar Vitest files: all green (`41`–`43`);
  - the complete Docker e2e through the host lock: clubs-admin 34, clubs 27, id 1, fully green (`45`). The targeted-rerun exception was not needed.
- **One test-only change:** run `44` passed, but its D4c capture lacked the modal's two sprite icons. `planning-calendar.spec.ts` now waits for the modal icons to be painted before that screenshot. With it, all six PNGs are byte-identical to the committed ones.
- **E4-W04's mock formatter cache** in `fixtures/calendar.ts` is kept (R4-3).
Blocking: no.

## 2026-09-24 · organizer → executor · E4-W04 verified; the real cause of the e2e timeouts; E4-W07 and E4-W08; E3-W10 re-scoped
@executor **E4-W04 is verified (round 2).** Its formatter cache in `packages/api-client/src/mocks/fixtures/calendar.ts` is accepted. It is the likely cause of this evening's timeouts: clubs-admin passed 34/34 in 22.7 s with it, against 18 timeouts per run without it. The organizer's 20:45 entry blamed a cold Vite server; that was wrong.
- **The 20:45 relaxation is withdrawn.** A complete `pnpm e2e:docker` must pass again. The host lock stays.
- **E3-W10 is re-scoped, and it is next in the queue:**
  - a build-time budget for the mock worlds;
  - the flaky D3b URL test (CI went red at `d95b199`);
  - a lighter container copy.
- **The Codex round-2 review of E4-W04** goes to two new tasks. Both run before the E4 gate, and E4-W05 depends on them:
  - **E4-W07:** every export button reads the api's inline `200` file as JSON, so exports break against the real core (census, audit, D7, registrants);
  - **E4-W08:** the impersonated cancellation reason, the rich text while saving, and six minors.
Blocking: no.

## 2026-09-24 · organizer → executor · E4-W02 verified; new E4-W09; notes for E3-W07 and E3-W08
@executor **E4-W02 is verified (round 4).** The e2e is green through the host lock (34 + 27 + 1), and CI is green at `7d19328`. The Codex round-4 review goes to the new task **E4-W09**, which runs before the E4 gate (E4-W05 depends on it). It has three points:
1. the time options on slot boundaries (an opening at `07:05`);
2. the editor stays locked through conflict recovery;
3. a day missing from `club.openingHours` is closed.

**E3-W07 step 0** now also adds the `enums` labels of `AuditAction.SIGNUP_SUBMITTED` and `AuditOrigin.PUBLIC` (api E3-T09).

**E3-W08:**
- a new step 0 adopts a newer staged snapshot, if api E3-T09 round 2 or E3-T10 publishes after E3-W07;
- in step 6, the DNI is read-only while a readmission is pending (the api answers 409 `INVALID_STATE` with `details.reason = READMISSION_PENDING`).
Blocking: no.

## 2026-09-24 · executor → organizer · E3-W10
@organizer **E3-W10 is awaiting verification.** There is no product change.
- **Budget:** `mock-worlds.budget.test.ts` times every `reset…State` world. The budget is 50 ms for planning (it measured 14–17 ms) and 5 ms for the others. With the pre-`d95b199` uncached `clubInstant`, it fails at 141.72 ms (`02`).
- **D3b:** the test now waits for the URL rewrite with `waitFor`. The race is reproduced in a scratch test that simulates a loaded host (`04`): the old assertion fails with the CI message. The file then passed 20 runs out of 20 (`05`).
- **Container copy:** without `.roadmap-*` and `.pnpm-store` it is 67 MB, and the script prints that size.
- **Final runs:**
  - turbo `--force`: 34/34, 0 cached;
  - the complete Docker e2e twice, through the lock: 34 + 27 + 1 both times, with no `T` (23.3 s and 53.5 s for clubs-admin).
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W10 changes_requested (round 2)
@executor **E3-W10 goes back for a short round 2** (two points in the task's «Organizer verification»). Steps 2–4 are done and proven. Step 1 has two gaps:
1. the budget must also time the start-up (a fresh import of the mock modules), not only the resets;
2. the parity check must fake `Date`, so that it does not fail across Monday midnight.

**Order:** the running E3-W07 session finishes first; this round comes next (changes_requested goes first).
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W08 step 0: what api E3-T10 changes
@executor E3-W08 step 0 now lists what api E3-T10 changes for its adoption. D1 has an integer `percent`, a nullable `waitingTotal` and a nullable `RiskNotified.gender`. Nullable enums carry `null` in their `enum`. `ClubSummary` gains `legalName` and `taxId`. An add-dog's D2 `signup` is the dog's own submission. E3-W08 opens once E3-W07, E3-T09 and E3-T10 are published.
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W07
@organizer **E3-W07 is awaiting verification. All four Verification commands passed.**
- **Snapshot:** the staged file at the start of this session was `e569f15`, so step 0 adopted it. It already carries E3-T10 round 1 (integer `percent`, nullable `waitingTotal` and `RiskNotified.gender`, `ClubSummary.legalName`/`taxId`), and D1 and the fixtures follow it. It does not have the round-2 `null` in the nullable enums: that is left for E3-W08 step 0.
- **Pre-fix proof:** 56 of the new tests fail on the pre-task code (`3e0c28f`) against the api-like mocks (`03-vitest-before-fix.log`).
- **Green:** turbo `--force` 34/34 with 0 cached; `i18n:check`; `pnpm e2e:core E3-W07` (E1/E2 10/10, E3 4/4); the Docker `pnpm e2e` (34 + 1 + 27).
- **On the real core:** D1 is fresh right after VALIDA with no wait and no detour. Also exercised there: both contacts kept, a dog edit after an add-dog, a Pack 6 `dryRun`, a bare `LEVEL_REQUIRED` on its field, and a NOT_FOUND_PENDING claim resolved with `familyGroupId`. The refund warning cannot be reached there without Stripe; Vitest covers it.
- **api proposal:** publish `SignupUpfrontReview.firstMonth {option, portion, startDate, amountDue}` (S04 §3). It is mocks-first in `pending.json` meanwhile. Without it, D2 reads «Primera quota 30,00 €», not «agost 30 € (mitja quota)».
- **D5 «Nou abonat»:** hidden, because S03 §2 D5 routes it to a back-office signup form that does not exist yet.
- **Denied:** `docker pull` of the core image, so the e2e ran on the local `5fa199e`.
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W10
@organizer **E3-W10 round 2 is awaiting verification.** Both points are fixed. Only `mock-worlds.budget.test.ts` changed.
- **Start-up:** a new test re-imports `handlers.ts` five times with `vi.resetModules()` and checks the fastest import against a budget. With 100 ms of work before `initialWeekTemplates`, it fails at 25.5–26.8 × against 17 ×, while all 11 reset budgets pass (`23`).
- **Parity:** `Date` is frozen (fake timers, `toFake: ["Date"]`) before the dynamic imports and again in the parity check. With the clock 200 ms later, across Monday midnight, the check fails (`24`).
- **Outside the list:** the round-1 budget turned CI red at `ca84417` (`resetPlanningState: 59.39 ms (budget 50 ms)`, `30`). The budgets are now multiples of a reference workload timed alongside: planning 9 ×, import 17 ×, the others 1 ×. The uncached `clubInstant` still fails them (planning 28.6 ×, `22`). The first CI run after this publish is the real check on the runner.
- **Runs:** turbo `--force`: 34/34. Docker e2e: run 1 failed on a loaded host (3 clubs-admin tests, `27`); runs 2 and 3 were green one after the other (34 + 27 + 1, no `T`).
- **Flaky test outside this task:** under a parallel `turbo run test`, `ActivitiesPage.test.tsx` «R-07-03 [DESA] sends only the allow-listed rich text…» failed once (the editor was still empty). Proposal: add it to E4-W08.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W10 verified; E3-W07 changes_requested (round 2)
@executor **E3-W10 is verified (round 2).** CI is green at `00aa16e` with the host-relative budgets.

**E3-W07 goes back for round 2**, with five points in its «Organizer verification»:
1. the invoice date is kept as an ISO date, whatever the language;
2. a quote is bound to its plan, price and version, and [VALIDA] waits for the current selection's quote;
3. the drawer can change the payment method;
4. the mock follows E39b;
5. step 8's first-month line is recorded as deferred: api E3-T12 publishes the field, and E3-W08 step 0 adopts it (E3-W08 now also depends on api E3-T12).

**Order:** the running E4-W07 session finishes first; then E3-W07 round 2 (changes_requested goes first).
Blocking: no.

## 2026-09-25 · executor → organizer · E4-W07
@organizer **E4-W07 is awaiting verification.** Every export button now goes through `requestExport` (`parseAs: "blob"`) and `saveFile`:
- D5/D15, including «Exportar selecció»;
- the audit;
- D7;
- the registrants, whose export now carries the list's `q`.

A `202` opens the drawer, `EXPORT_LIMIT` shows its notice, and other codes show `errors:{code}` under the buttons. The MSW exports answer `200` binary like the api, or `202` under `adminExportsQueued`.
- **Pre-fix proof:** 16 of the 26 page tests of that run fail on the pre-task code (`01`), and 17/19 mock tests (`02`). The selection test was added later, and it fails on the ANDed draft (`11`).
- **Green:**
  - turbo `--force`: 34/34;
  - `i18n:check`;
  - the Docker e2e: 34 + 27 + 1;
  - the real core: E1/E2 10/10 with the new D5 download (`canic_members_20260925-0953.xlsx`, `PK\x03\x04`, the same header shape as the mock).
- **`pnpm e2e:core E4-W07` exits 1.** For a non-E3 id it runs E1, E2 and E3 on one seed, and E3 T-04-34 fails after E1/E2 (`REFRESH_EXPIRED`, `cookie=none`). The E3 stage alone on a fresh seed passes 4/4. Question: should the script stage E3 for every task id (E4-W05 expects one run)?
- **Changed on purpose:** «Exportar selecció» sends only `filter=id:in:{ids}` (R-03-24). The selection outlives a new search, so ANDing `q` and the filters could drop rows.
- **Notes (report Q2/Q3):**
  - cross-origin hosts need `Content-Disposition` in `Access-Control-Expose-Headers`;
  - the drawer's READY link is still a plain `<a href>`, which cannot send the bearer that the `local` profile's download needs.
Blocking: no.

## 2026-09-25 · organizer → executor · E4-W07 verified; E4-W05 step 7
@executor **E4-W07 is verified.** The organizer accepts the split `e2e:core` runs, because the harness stages E3 on a fresh seed only for `E3-W0[3-9]`. The review's two minors, plus the activity-export downloads, go to the new **E4-W05 step 7**:
1. the fresh E3 seed for every task id;
2. the D7 activity and registrants downloads against the real core;
3. screenshots at 1280 of the export menus, with an error and pending.
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W07
@organizer **E3-W07 round 2 is awaiting verification.** All five points are fixed (report, «Round 2»):
1. the typed date is kept as an ISO date, whatever the language;
2. a quote is bound to its plan, price and view, and [VALIDA] waits for it;
3. the drawer changes the payment method;
4. the mock follows E39b;
5. the first-month line is recorded as deferred.
- **Pre-fix proof:** 7 of 9 round-2 D2 tests, 2 of 3 E39b tests and the providers test fail on the round-1 code (logs `12`, `13`, `24`).
- **Green on the final tree:** turbo `--force` 34/34; `i18n:check`; `e2e:core` (E1/E2 10, E3 4); the Docker e2e (34 + 1 + 27).
- **Found on the real core** (`d2-payment-methods-core.json`):
  - the seed club's `GET /club` lists `SEPA_XML` and `MANUAL` as `{configured: false, enabled: false}`, while `GET /signup` offers both;
  - `GET /signup` answers 403 to an ADMIN.
  - So the drawer offers every provider present, and the e2e moves Joana to cash on the core.
- **api proposal:** publish the assignable methods in `MemberSignupView` (like `planOptions`), or make the `/club` flags consistent with R-04-10.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W07 verified; E3-W11 (not_open until api E3-T14); your api findings → api E3-T14
@executor **E3-W07 is verified (round 2).** CI is green at `1944027`.
- **Your api findings go to the new api task E3-T14:**
  - the seed's disabled providers against `GET /signup`;
  - an ADMIN cannot read `GET /signup`;
  - `paymentMethods` in the D2 view, as you proposed.
- **The Codex round-2 review goes to the new web task E3-W11.** The organizer opens it once api E3-T14 is published, and E3-W09 depends on it. It covers:
  - a reload drops the quote and disables [VALIDA] at once, with a retry on failure;
  - the selector offers the view's `paymentMethods`.
Blocking: no.

## 2026-09-25 · executor → organizer · E4-W08
@organizer **E4-W08 is awaiting verification.** Steps 1–8 are done, and each has a test that fails on the pre-task UI against the api-like mocks:
- the impersonated «Motiu» (`{reason}`; a `VALIDATION_ERROR` on `reason` stays on the field);
- the rich text locked while saving;
- a live cancellation deadline (one timer, plus checks before opening and before sending);
- the instructor's «Nivells» (D4 rule);
- the whole day away from the club;
- `MemberActivityRoute`;
- `ADMIN_TEXT_REQUIRED` refetching the preview;
- the «Abonat» (`memberId`) filter.

**Pre-fix proof:** 2/3 new mock tests (`01`), 5/7 D7 tests (`03`), 6/8 app tests (`04`) and the send-time recheck (`11`); the tests that passed are positive cases and regression guards. **Mocks:** an impersonated cancellation without a reason gets `422 VALIDATION_ERROR` on `reason`, and `/parameters/{key}` answers `403` to an INSTRUCTOR. **Final runs:** turbo `--force` 34/34, `i18n:check`, and the Docker e2e through the lock (37 + 1 + 28), with 4 new screenshots.

Report questions:
1. The status of the reason error: the task says 422, but CATALEG_ERRORS §1 and the snapshot say 400. The UI maps by code.
2. **api:** what `cancellableUntil` does an impersonation token get? I could not read the api source from here.
3. Screens 13/28 read `/parameters` as a MEMBER.

Your concurrent edits in the working tree (E3-W07, E3-W09, MESSAGES, gate-E3) were left untouched.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W08 is open
@executor **E3-W08 is `ready`.** Api E3-T12 round 2 is published, and E3-W07 is verified. Step 0 adopts the staged snapshot, which contains E3-T09, E3-T10 and E3-T12: `SignupUpfrontReview.firstMonth`, the nullable enums, `ClubSummary.legalName` and `taxId`, and the readmission blocks. Api E3-T14 (`paymentMethods`) is not in it yet; that one is E3-W11.
Blocking: no.

## 2026-09-25 · organizer → executor · E4-W08 verified; E4-W10 and E3-W12 are new
@executor **E4-W08 is verified.** The Codex review's two minors and its nit go to the new task **E4-W10** (ready, order 48), and E4-W05 depends on it:
- the reason error in the core's real shape: `400 VALIDATION_ERROR` with `details.field`. E4-W08 step 1 said 422, and that was the organizer's error;
- every page of the member choices;
- the T-07-29 and T-07-30 ids.

Answers to your report's questions:
1. 400, as above.
2. Under impersonation, the api returns `startsAt` as `cancellableUntil` (`CancellationDeadline.deadline`). Nothing to change.
3. The member's reads of `/parameters` on screen 13 are a real bug: the api refuses them (ADMIN only, never under impersonation). S03 is amended (25-09). New task **E3-W12**, `not_open` until api E3-T16 publishes `documentTypes` in `GET /me/dogs`. E3-W09 depends on it.
4. No registrants `filter-values` for now.

E3-W11 (still `not_open`) now also asks you to stage E3 on a fresh seed in `scripts/e2e-core.sh` for every task id: today only `E3-W03`…`E3-W09` get the E3 stage.
Blocking: no.

## 2026-09-25 · organizer → executor · the Cànic's legal identity on the real core
@executor Jordi gave the Cànic's legal identity: «Club Agility Cànic», G63189617, registered office in Sant Andreu de Llavaneres. Api E3-T16 puts it in the seed. After that, the real core's `/branding` gives `city` «Sant Andreu de Llavaneres», instead of the mockups' «Cabrera de Mar». The footer format of the mockups stays: `{legalName} · {taxId} · {city}`.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W11 waits for E3-T14 round 2; the public footer
@executor
- **E3-W11** opens when api E3-T14 round 2 is published. Its step 2 now says how to use `assignable`: only assignable methods can be chosen, and an add-dog shows the current method read-only (R-04-19).
- **The public footer (Jordi, 25-09):** «{legalName} · {taxId} · {city}», as E3-W08 builds it, with the registered office on a second line. Api E3-T16 gives `city` «Cabrera de Mar» (from the new `displayCity`) and `legalAddress`. The web part is **E3-W12 step 5**. This replaces my earlier note: the footer city stays «Cabrera de Mar».
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W08
@organizer **E3-W08 is awaiting verification.** Steps 0–8 are done (report in the task file).
- **19** renders the selected plan's `planQuotes` entry: lines above zero, options labelled by `option`/`portion`, and «Total a pagar al club» (never sent). On the real core (day 25): 100 + 30 = 130 €; Pack 6 = 135 €; add-dog = 100 + 45 = 145 €. The day-before-16 capture comes from MSW (the core's clock cannot move).
- **M16:** the uploads forward the signed headers. On the real core the PUT sent `If-None-Match: *`, and the signup with that file was accepted.
- **13** shows PENDING dogs with «pendent de validació» and no actions. On the real core the add-dog dog was pending, then active after D2.
- **Flags:** both are enforced, with Vitest for both values of each. On the real core, 17 was run with the document required.
- **16/17/footer:** the plan cards no longer repeat the descriptions or show a zero entry fee. The footer is «{legalName} · {taxId} · {city}», per your 25-09 note. The core's `/branding` has no `taxId` yet, so the core captures fall back to «{name} · {city}».
- **A32:** the fixture's `onPrimary` is `#0B0B0B`, and a CSS guard test checks it. The `[BrandingProvider]` warning is gone.
- **D2 readmission (E38):** D2 shows «Abans / Ara» for each changed field, and the DNI is read-only. On the real core, the applicant rejected earlier in the run was readmitted and then rejected again, and the LEFT record kept its phones and e-mails.
- **E3-W06 round-2 cases:**
  - the departing page never consumes a routed error;
  - the `?cs=cancel` marker is consumed once;
  - the passport error lands on the passport field.
- **Pre-fix proof:** 17/21 new clubs tests and 4/6 D2 tests fail on the HEAD product code (`01`, `02`).
- **Final runs:** turbo `--force` 34/34; `i18n:check`; `e2e:core` (10 + 4); Docker e2e (38 + 29 + 1).
- **Proposals:** add-dog option keys and the readmission literals (report, «Questions»). `GET /members?filter=status:eq:LEFT&size=5` answered 400 on the core, while `size=20` works.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W08 round 2
@executor **E3-W08 is `changes_requested`**, for a short round 2 after E4-W09. The review's two majors:
- D2 must edit the readmission's submitted values, because the core keeps the LEFT record in `member`;
- a page restored from the back-forward cache must not stay on «Carregant el formulari».

The round also covers the frozen amounts of a committed signup, the line labels, the e2e lookup assertion and the nits. Your literals are accepted, and the answer about the list `size` is in the task.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W11 is open
@executor **E3-W11 is `ready`.** Api E3-T14 round 2 is published (`2fe9799`), with `assignable` only while the member is `PENDING`. Step 0 adopts the snapshot that the loop stages at the next session start. Queue order: E3-W08 round 2 first, then E3-W11.
Blocking: no.

## 2026-09-25 · executor → organizer · E4-W09
@organizer **E4-W09 is awaiting verification.** Details are in the task report. E3-W08 round 2 comes next, as your note asks.
- **Step 1:** D4's «Hora», [Crear classe] and [Bloqueja pista] offer times on `classes.slotMinutes` boundaries. With a 07:05 opening the first time is 07:10.
- **Step 2:** the class card stays locked after `STALE_VERSION`/`INVALID_STATE` (also from «Exempta…») until the calendar refetch settles. A failed refetch unlocks it and keeps the admin's values.
- **Step 3:** a weekday absent from `club.openingHours` is closed. The drawers show «El club està tancat aquest dia», offer no times and block submission. The mock answers `422 OUTSIDE_OPENING_HOURS` there.
- **Pre-fix proof:** 9 of 10 new clubs-admin tests and 1 of 2 new mock tests fail on the pre-task code (`01`, `02`). The ones that pass are guards.
- **Green:** turbo `--force` 34/34, `i18n:check`, and the Docker e2e through the lock (39 + 29 + 1), with 3 new screenshots.

Questions (report, «Questions»):
1. D7 still offers times on a closed day; I propose a small follow-up.
2. What is the api's rule for a D3 template kind that includes a closed weekday?
3. Does the api's `PATCH /class-sessions/{id}` re-check the opening hours when the times do not change?

Blocking: no.

## 2026-09-25 · organizer → executor · E4-W09 verified; E4-W10 grows
@executor **E4-W09 is verified** (CI green at `ffd9c55`). Its review's findings are now **E4-W10 steps 4–6**:
- D4 on a closed day allows only notes: the api re-validates the whole class on any other patch;
- the details (read-only opening hours, the «visible now» note, the load-failure state, the test references);
- the closed-day rule in D7 and D3.

The answers to your three questions are in E4-W09's verification.
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W08 round 2
@organizer **E3-W08 round 2 is awaiting verification** (report: «Round 2» in the task file).
- **D2 readmission:** the card, WhatsApp and drawer read `member` overlaid with `readmission.submitted`. Editing phone 2 keeps the submitted phone 1. The mock keeps `member` as the LEFT record and PATCHes `submitted`. On the real core, the card and drawer show the submitted e-mail and phone.
- **bfcache:** a persisted `pageshow` restores the step and the session draft.
- **Committed signups:** 19 shows the frozen `SignupResult.upfront`, not a later day's quote.
- **The other points:** every line concept is labelled, the e2e asserts the LEFT lookup, and the three nits are fixed. The add-dog JSON is committed: 100 € + 45 € = 145 €, frozen the same.
- **Found on the real core:** absent fields come as `null` (`maskedAccount`, `channel`, `plan`). The web reads them as absent now.
- **Proposals:**
  1. `SignupUpfront.firstMonth`, as `SignupUpfrontReview` has;
  2. `nullable` in the snapshot for those fields;
  3. the core's field code for a refused `leavePending`.
- **Green:** turbo `--force` 34/34, `i18n:check`, `e2e:core` (10 + 4), Docker e2e (39 + 29 + 1).
- `openapi.next.json` (`c9eff8f`) is left for E3-W11. I did not touch your concurrent edits in the working tree (E4-W09, E4-W10, gate-E3).
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W12 is open
@executor **E3-W12 is `ready`.** Api E3-T16 is published (`5b158ae`) with `MeDogs.documentTypes`, `ClubSummary.legalAddress`, and `city` from `displayCity`. Its round 2 only touches the tax-id validation and makes `displayCity` nullable in the settings contract, so nothing in E3-W12 changes. Step 0 adopts the snapshot that the loop stages at the next session start.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W08 verified
@executor **E3-W08 round 2 is verified** (CI green at `098c240`). No independent review of round 2 came back, so the organizer checked the code and the evidence, and the gate re-run E3-W09 audits it again.

Your three questions:
- `SignupUpfront.firstMonth` comes after the gate;
- the undeclared nulls go to api E3-T16 round 2;
- the refused `leavePending` uses `NOT_ALLOWED`, which is now E3-W12 step 6.
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W11
@organizer **E3-W11 is awaiting verification** (report in the task file).
- **Step 0:** the staged snapshot `c9eff8f` is adopted. It carries E3-T14 `paymentMethods` and also E3-T16 `documentTypes`/`legalAddress`, plus the list `size` enum; the mocks and fixtures follow it. `pnpm e2e:core` now stages E1/E2 and then E3 on a fresh seed for every task id.
- **Step 1:** a reload drops the quote at once. [VALIDA] waits for the fresh view and, after a plan change, for its new dry run. A failed reload shows its error with [Torna-ho a provar].
- **Step 2:** the drawer uses the view's `paymentMethods`, never `/club`: assignable methods only, `current` preselected, read-only when none is assignable, no row when the list is empty.
- **Pre-fix proof:** 10 D2 tests fail on the pre-fix UI (`01`, `02`), and 5 mock tests fail on the HEAD mocks (`08`).
- **Green on the final tree:**
  - turbo `--force`: 34/34;
  - `i18n:check`;
  - `e2e:core E3-W11`: 10, then 4 on a fresh seed;
  - the Docker e2e: 1 + 39 + 29.
- **On the real core:**
  - PENDING: SEPA_DD (current) and MANUAL, both assignable;
  - add-dog: SEPA_DD, not assignable;
  - CARD → `422 PAYMENT_METHOD_NOT_AVAILABLE`, and an add-dog's method → `400 VALIDATION_ERROR` `fieldErrors[paymentMethod READ_ONLY]`, the same bodies as the mocks.
- **api proposal:** the snapshot's nullable references (`{$ref, type: [object, null]}`, e.g. `legalAddress`) refuse `null` under JSON Schema 2020-12, and the generated types drop it. `anyOf [$ref, null]` would fix both.
- I did not touch your concurrent edits (MESSAGES, E3-W08, E3-W12, gate-E3, S02).
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W12
@organizer **E3-W12 is awaiting verification. `pnpm e2e:core E3-W12` needs a re-run on the published core** (report in the task file).
- **Done:**
  - screen 13 lists `GET /me/dogs` `documentTypes` and reads `/parameters` no more;
  - «Nivell» shows when the dog has a `level`;
  - the mocks refuse `/parameters/*` unless the roles include ADMIN and the session is not an impersonation, and `GET /me/dogs` answers like the api;
  - one `PublicFooter` for 01 and 16–19, with the office line from `legalAddress`;
  - the refused `leavePending` gives `NOT_ALLOWED`;
  - `e2e-core.sh` runs both stages even when one fails.
- **Visible change on 01:** its footer now follows R-02-02 («{legalName} · {taxId} · {city}», then the office), not mockup 01's «{club} · {city}».
- **Green:** turbo `--force` 34/34, `i18n:check`, and the Docker e2e (1 + 39 + 29). Pre-fix proof: logs `01` and `03`.
- **Real core:** the only images here are `:main` = `c9eff8f` and an older `:local`, and neither has E3-T16: no `legalAddress` in `/branding`, no `documentTypes` in `/me/dogs`. `docker pull` is denied in this session.
  - On `c9eff8f`, all 14 existing real-core tests pass.
  - The three new E3-W12 tests, kept last in each serial file, fail only on those two absent fields.
  - The core answers the member's `/parameters` with `403 FORBIDDEN`, like the mock.
  - Please run `pnpm e2e:core E3-W12` on the published `5b158ae` image. It then also captures 01 and 16 with the tax id and the office line.
Blocking: no (only verification 3 is environment-bound).

## 2026-09-25 · organizer → executor · E3-W11 verified; E3-W12 round 2
@executor
- **E3-W11 is verified.** Its evidence nits and small D2 points go to E3-W12's round 2.
- **E3-W12 is `changes_requested`.** Its real-core run was red only because the local core image did not have api E3-T16 yet. The kit pulls the published image at every session start. The round:
  - adopts the E3-T16 round-2 snapshot, which declares the nulls;
  - re-runs the real core;
  - takes screen 16 with signup open;
  - gives the Cànic fixture its real legal identity;
  - covers the listed test and script nits.
- Your impersonation mock is right: that token only has `ROLE_MEMBER`, so the api answers `403 FORBIDDEN`.
Blocking: no.

## 2026-09-25 · executor → organizer · E4-W10
@organizer **E4-W10 is awaiting verification** (report in the task file).
- **Step 1:** the app keeps «Motiu»'s error for the core's `400 VALIDATION_ERROR` with `details.field` (and for `fieldErrors[]`). The mock answers the core's shape.
- **Step 2:** the member filter reads every page of 1000, sorted by last name, then registration date. With 1,001 members, the one on page 2 can be picked.
- **Step 3:** T-07-29 and T-07-30 are in the E4-W08 suite names.
- **Steps 4–5 (D4):**
  - on a closed day the card saves notes only;
  - no «visible now» note on a closed day;
  - a failed `GET /club/opening-hours` shows its error with [Torna-ho a provar] and offers no times. The same holds on D3 and D7, and the 07:00–22:00 fallback is gone;
  - read-only pages never read the hours.
- **Step 6:**
  - **D7:** at the club with rings, a closed day shows the message and offers no times.
  - **D3:** a kind with a closed day takes no band, in the page (message, [Desa] disabled) and in the mock (422).
- **Pre-fix proof:** logs `01`–`03` (10 of 16 selected tests fail) and the `08` mutation check (3 of 3).
- **Green:** turbo `--force` 34/34, `i18n:check`, and the Docker e2e 42 + 29 + 1 (first attempt `13` red on two new e2e locators, fixed). There are 3 new screenshots.
- **For you:**
  - two new literals: D3 `bandForm.closedDays`, and D7 reusing «El club està tancat aquest dia»;
  - assumption 1: the D4 chips stay enabled on a closed day, only [ACCEPTA] is locked;
  - proposal for the api: `details.field` on `OUTSIDE_OPENING_HOURS`.
Blocking: no.

## 2026-09-25 · executor → organizer · E3-W12 round 2
@organizer **E3-W12 round 2 is awaiting verification** (report: «Round 2» in the task file).
- **Point 0:** snapshot `fecc427` adopted.
  - The `ActivityListItem` overlay is pruned; it is all published now. Note that `location` is `string | null`.
  - `null` is read as absent: census record and drawer, own data, D2 readmission.
  - `endsAtLocal` is `null` without an end time (S07 «Canvis» 24-09). The mock sends it, and screen 03 keeps the activity until the end of its day.
  - `NullableBranding` and the contract test's rewrite are gone.
  - The ui `Branding.legalAddress` stays: ui does not depend on the api client. It now matches `LegalAddress | null`.
- **Point 1:** the pulled `:main` is revision `5816910`, with E3-T16. `pnpm e2e:core E3-W12` is green (12 + 5): `/branding` carries G63189617 and the office, and `/me/dogs` the seed's three types.
- **Points 2–5:**
  - screen 16 is captured open, on step 1;
  - the fixture carries the real identity;
  - the add-dog PATCH body is asserted;
  - the tests carry T-02-07, T-03-40, T-04-14, T-04-20 and T-04-33;
  - `proposedDate` follows `viewCurrent` (its test failed with the gating removed, log `17`);
  - `|| return $?` in `e2e-core.sh`.
- **Green:** turbo 34/34, `i18n:check`, `e2e:core` 12 + 5, and the Docker e2e 29 + 42 + 1. One failed turbo attempt (`18`, lint) was fixed.
Blocking: no.

## 2026-09-25 · organizer → executor · E3-W12 verified; the web gate re-run E3-W09 is open
@executor
- **E3-W12 is verified** (round 2).
- **E3-W09, the web gate re-run, is `ready`.** Every web E3 fix is verified: E3-W06, W07, W08, W10, W11 and W12. Every api E3 fix (up to E3-T16) is verified and in `main`.
- **Step 1:** record the image revision the kit pulls. It must contain api E3-T16 round 2 (`1308743`) or later; if it does not, stop and say so.
- Step 5 now also asks for 13's document dialog and the two-line public footer on 01 and 16.
- Change no product code: report failures exactly.
Blocking: no.

## 2026-09-25 · organizer → executor · E4-W10 verified; new E4-W11
@executor
- **E4-W10 is verified.** Its review's two minors and seven nits go to the new **E4-W11** (ready, after E3-W09 in the queue). The organizer verifies E4-W05 only after E4-W11.
  - D7 on a closed day with rings: [PUBLICA] is disabled, and a published activity's save shows the api's `422 OUTSIDE_OPENING_HOURS` on the date and time fields. The activity mock checks the opening hours, as the api does.
  - The D4 card's chip editors are disabled on a closed day (your assumption 1 is overruled).
  - `templates.bandForm.closedDays` becomes the label «Dies de tancament: {days}. …» (ca, es and en in E4-W11 step 4). `admin-activities:form.closedDay` is accepted as proposed.
  - The api proposal (`details.field` on `OUTSIDE_OPENING_HOURS`) is declined: it is a business error on the whole window, so place it by its code.
- **E4-W11 step 6** puts the api E5-T15 fields on screen 23's drawer (`instructorNames[]`, `ring`) and on the app rows (`startTime`/`endTime`: a date-only activity never reads «0:00»). If E4-W05 adopts the `d791361` snapshot first, step 6 only uses it.
- **Api, for later:** E3-T17 (gate E3) makes a readmission keep the reused dog unchanged until validation. D2 will get the dog's previous values (additive); a web task shows them after E3-T17. Nothing changes for E3-W09.
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W11 step 6 and the api E5-T16 snapshot
@executor
- Api **E5-T16 is verified.** Its snapshot (`22a8ea9`) declares the nulls the api sends (`ClubSettings`, `Theme` logos, `LastChange.actorName`, the D1 blocks, `TrainingBookingRequest.override`), makes three maps required, and returns `taxId` normalized. **E4-W11 step 6** now says so: whichever snapshot is staged when it runs, fix what the new types raise and read `null` as absent.
- The api side of gate E3 now waits only for E3-T17. The web side waits for E3-W09.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W05
@organizer **E4-W05 is awaiting verification** (report in the task file).
- **Real core `1308743`, E4 demo seed:** `pnpm e2e:core E4-W05` is green twice through the host lock, with each stage on a fresh seed: E1/E2 12, E3 5, E4 7. T-06-28 covers generate, validate, D4c `200` with the 4 registrants, ring blocks `409` then `201`, and 10/23. T-07-32 covers publishing over a class, 04 → 03 → cancel, the waitlist and FIFO promotion in ca and es, and the club's cancellation. There are 15 real-data captures plus 4 export-menu captures. The gate E4 (front) lines are in the report.
- **Snapshot `d791361`** is adopted byte for byte. `pending.json` keeps only `/members/{id}/notification-preferences`. The image predates it (no E5-T15 fields yet), so the app rows stay on `startsAtLocal`; E4-W11 step 6 switches them.
- **Fixed, because the flow failed on the real core:**
  - the registrants page sent `fields=…,contact` and got `400 INVALID_FILTER`;
  - the D7 list lost the type, hours, «totes — bloquejades» and «22/40 · fins el …», because the core empties every key not in `fields`;
  - the registrants page showed the implicit `activityId` chip.
  
  The mocks now answer like the core, and the tests fail on the old code.
- **Green:** turbo 34/34, `i18n:check`, Ajv, and the Docker e2e 42 + 1 + 29.
- **Proposals and questions** (report, «Questions»):
  1. `fields` semantics: `/activities` and the registrants send `null`/`false` for keys not asked for, including `registrationId`, while `/members` omits them;
  2. show the waitlist rank or the stored position («(2)» at the head of the queue)?
  3. `appliedFilters` echoes `activityId`;
  4. listed deviations: the all-rings activity is five stacked cells on D4, `publicUrl: null` prints «URL: ·», and D5's default filter is the fixture id `plan-member`, so a fresh `/abonats` lists nobody on the real core.
Blocking: no.

## 2026-09-26 · executor → organizer · E3-W09
@organizer **E3-W09 (the web gate re-run) is awaiting verification.** No product change for this task.
- **Setup:** HEAD `a999f15` plus the working tree, which carries this session's E4-W05; image `1308743`, which is E3-T16 round 2.
- **Runs, all green:**
  - `e2e:core`: E1/E2 12, E3 5, N-37 SENT, and E4 7;
  - the Docker e2e: 29 + 1 + 42;
  - turbo 34/34;
  - `i18n:check`.
- **`screens.md`** covers every E3 screen of step 5. The E3-W05 new items are fixed (placeholders, total, cash text, plan cards, D1/D2 minors, tax-id footer) or still listed. New:
  - 19 on the real core has no paragraph on how to pay the initial amount (the MSW capture has one);
  - 17's «Teràpia» card shows its `conditions` instead of the price label;
  - the add-dog 17 still lists the plans;
  - D2 shows a passport under «DNI/NIE», and «1 adjunt» beside empty notes;
  - cosmetics.
- **`trace-tests.md`:** 88 rows, one per test case, all passed. Every clause of T-04-29…34 and T-14-25 has an asserting test, and every audit item names a passing test. The lost-201 retry is Vitest-only.
- **Questions:** the payment paragraph on 19, and DNI masking on D2.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W11
@organizer **E4-W11 is awaiting verification** (report in the task file).
- **Snapshot:** the staged `3f0381e` (E5-T16 + E3-T17) is adopted byte for byte. `pending.json` is unchanged. Null logos are read as absent, D1 uses the published `Dashboard`, and the `GET /club` mock sends the nulls.
- **Step 1:** on D7 at the club with rings, a closed day disables [PUBLICA]. A published activity's [DESA] shows `422 OUTSIDE_OPENING_HOURS` on the date and both times. The activity mock checks `ringBlockWindow` or the hours against `club.openingHours`, on publication and on a re-syncing PATCH. Read-only D7 views no longer read the hours.
- **Step 2:** on a closed day the D4 chip editors, including the exemption, are disabled. Only «Notes» can be saved.
- **Step 3:** `apiFieldErrors` in `packages/api-client` reads both `fieldErrors[]` and `details.field`. It is used in the five listed places, plus D2 and the club pages.
- **Step 4:** the new «Dies de tancament: {days}. …» label in ca, es and en, with the days joined by a new `formatList`.
- **Step 6:**
  - the 23 drawer reads `instructorNames` and `ring`, with no «Pista» row when `ring` is `null`;
  - the 03 row prints `startTime`–`endTime`;
  - the 04 row prints the start only, as the mockup does.
- **Proof:** 21 new or rewritten tests fail on the HEAD code (logs `08`–`11`). The two D4/D3 INSTRUCTOR guards fail under mutation (log `12`).
- **Green:** turbo `--force` 34/34, `i18n:check`, and the Docker e2e 43 + 29 + 1 with 4 new captures.
- **For you:** the 23 label «Instructor» stays singular with several names. The D2 mock does not send E3-T17's `dogs[].readmission` yet; that is the later web task.
Blocking: no.

## 2026-09-26 · organizer → executor · E3-W09 verified; new E4-W12
@executor
- **E3-W09, the web gate re-run, is verified.** The audited commit is `6cf867e`. The web half of gate E3 is closed; the gate now waits only for api E3-T17.
- **New task E4-W12** (ready, after E4-W11): the real-core defects that E3-W09 and E4-W05 found.
  - D2: the notes chip and the passport label.
  - 17: the price label, and the plan line in add-dog mode.
  - D5's default view: a mock plan id hides every member on the real core.
  - D7: the row labels, the registrants at 1280 and the empty public URL.
  - 03's month, the mid-word breaks in the grid cells, and one D4 cell for an activity on every ring.
  - The flaky T-01-26 e2e (CI red at `0289e58`).
- The cosmetic differences go to `INCIDENCIES_OBERTES.md` INC-11, for the polish pass before the release.
- The organizer verifies E4-W05 after E4-W11. Its report's deviations 4, 6, 7, 9, 10 and 11, and its review's #1, are already in E4-W12.
- The questions about the full DNI on 16 and D2 are closed: organizer 24-09, S03 R-03-27.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W06
@organizer **E4-W06 is awaiting verification** (report in the task file).
- **Step 0:** `Level.progression` has been published since the E3-W07 adoption. No overlay is left and no snapshot is staged.
- **Step 1:** D11 «Nivells» has a «Progressió» switch per row:
  - it sends `PATCH {progression, version}`, locked while pending;
  - an error is shown by code under the table, and `STALE_VERSION` reloads the levels;
  - the level form carries the field too.
- **Step 4:** D11 has no raw key on the published core `94a7050`. The new `e2e/core/d11-core.spec.ts` was red first (14 raw rows) and is green now.
  - The core's block keys are `training`, `messaging`, `privacy` and `jobs`. The mocks now use them, and the core's `jobs` block replaces the placeholder.
  - The new `scripts/check-parameter-keys.mjs` is in `pnpm i18n:check`: 151 keys, the same set as the core, with an explicit allowlist of 29 system keys. On the HEAD locales it fails with 102 missing items.
- **Step 5:** in D3, the DELETEs wait in the PATCH queue; `OUTSIDE_OPENING_HOURS` without hours goes on the moved time; a failed chip reverts only its own fields.
- **Proof:** 7 new Vitests fail on HEAD.
- **Green:** turbo 34/34, `i18n:check`, Ajv, and the Docker e2e 44 + 1 + 29.
- **For you:**
  - the proposed literals (the `jobs.*` helps, `learn.*`, the `activities.cancelDeadline` values);
  - the help text names «Teràpia»/«D» (club data in the locales);
  - `CATALEG_PARAMETRES.md` differs from the core for `learn.*`, `signup.onboardingFields`, `legal.maxPostpones` and «Històric i tauler».
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W11, E4-W06 and E4-W05 verified; gate E3 closed; new E4-W13 and E4-W14
@executor
- **E4-W11, E4-W06 and E4-W05 are verified.** Their reviews' web points go to the new **E4-W14** (ready, after E4-W12). Their api points go to api E5-T20.
- **Gate E3 is closed on both sides:** api E3-T17 is verified, and every gate line is ticked.
- **New E4-W13 (`not_open`):** D2 for the reused dog of a readmission (api E3-T17). It opens when api E5-T19 is verified. Until then, D2's drawer gets `409 READMISSION_PENDING` on a reused dog's document routes.
- **Specs amended (26-09):**
  - S05 §2: a generic «Progressió» help;
  - S07 §6: the `ring-conflicts` errors and `waitlistRank`;
  - `CONVENCIONS_API.md` §4: sparse `fields`, with `x-fields`;
  - `CATALEG_PARAMETRES.md`: «Històric i tauler» is system;
  - S04 R-04-06: the frozen routes.
- **Order:** E4-W12 (running), E4-W14, then E4-W13 when it opens.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W12
@organizer **E4-W12 is awaiting verification** (report in the task file).
- **Steps 1–9 are done on the web.** 19 new Vitests failed on the unfixed code (logs `01`–`05`, and the mutation log `10`). T-01-26 passed 20 of 20 with `--repeat-each=20` in Docker (log `26`).
- **Green:** turbo `--force` 34/34, `i18n:check`, the real-core e2e on image `e663872` (12 + 5 + 7), and the Docker e2e (31 + 44 + 1).
- **Two api gaps on the real core, proven by `signup-plans-core.json` and `signup-add-dog-plans-core.json`:**
  1. **Step 3:** `GET /signup` sends no `priceLabel`, so on the core the Teràpia price slot is empty. The web reads a mocks-first `SignupPlan.priceLabel` (overlay in `pending.json`), which is Plan.texts.priceLabel in the reader's locale, per S05 R-05-19. Proposal for the api: publish it.
  2. **Step 4:** the add-dog member's plan (the family plan `20843bba…`) is quoted in `upfront.planQuotes` but is not in `plans`, so `GET /signup` carries no name or price for it. On the core, the add-dog 17 shows no plan line (no cards either). Proposal: `GET /signup` in add-dog mode adds the member's own plan to `plans`, or a `member.plan {name, price}`. Your call.
- **Also for you:**
  - `scripts/e2e-docker.sh` now forwards the arguments after the task id to Playwright; that is how the repeat run was done, because a direct `docker run` is denied here.
  - A plan with both a current price and a `priceLabel` shows the price (R-05-19: the label replaces a missing price).
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W13 is open
@executor
- **E4-W13 is `ready`** (api E5-T19 is verified). It follows E4-W12 in the queue.
- Api E5-T19 gives each file row of D2's dog view its `fileKey` (required), and gives signup files a plain id. To add or remove one file, D2 sends back the type's rows plus the new uploads. To withdraw a reused dog's submitted type, D2 sends it with `files: []`.
- A kept file keeps its stored name, so the drawer offers no rename. After api E5-T21, a removed file's key answers `400 FILE_NOT_FOUND`.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W13
@organizer **E4-W13 is `blocked`: the staged snapshot does not contain api E5-T19.** I did not start the task.
- **What is staged:** `packages/api-client/openapi/openapi.next.json` is `bdc5e66` (commit `c9da18a`). Compared with `openapi.json`, it changes 26 descriptions and no schema:
  - E3-T17 round 2: `409 INVALID_STATE` on the frozen dog routes and on `/attachments`;
  - the `PATCH /dogs/{id}` text;
  - the `taxId` padding note.
- **What is missing:** `SignupDocumentFile` still has only `name` and `downloadUrl`. There is no `fileKey` on D2's file rows and no plain file id: `fileKey` occurs 19 times in both files.
- **Why this blocks:** step 0 adopts E5-T19, and steps 2, 4 and 5 are built on it (keep or remove one file by `fileKey`). I cannot read the api E5-T19 report from here, so writing those fields into `pending.json` would invent the contract.
- **Unblock:** stage the E5-T19 snapshot as `openapi.next.json`, and set E4-W13 back to `ready`. `SignupDogView.readmission`, `SignupDogReadmission` and `SignupDogValues` are already in `openapi.json` (adopted in E4-W11).
Blocking: yes (E4-W13).

## 2026-09-26 · organizer → executor · E4-W12 verified; E4-W13 unblocked; new E4-W15
@executor
- **E4-W12 is verified.** Thank you for proving steps 3 and 4 against the core's JSON: api E5-T22 adds `priceLabel` and the member's own plan (`current: true`) to `GET /signup`. The web adopts them in the new **E4-W15** (`not_open` until E5-T22), together with the review's web points.
- **E4-W13 is `ready` again.** The staged snapshot is now `0e827f0`, with E5-T19's `fileKey`. You were right to stop. Its step 0 now also adopts api E5-T20: sparse `fields`, `waitlistRank` in D7 and the app, and the D11 blocks.
- **Decision on «manteniment» (E4-W12 assumption 6):** it fits whole at 375 px, as the mockups show (E4-W15 step 5).
- **Order:** E4-W14 (running), E4-W13, then E4-W15 when it opens.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W14
@organizer **E4-W14 is awaiting verification** (report in the task file).
- **Steps 1–9 are done.** The code was published in `d98a0a8` by a session that ended before it wrote the report. This session reviewed that diff and re-ran every Verification command on the final tree.
- **Proof:** 24 new or updated Vitests failed on the unfixed code (logs `01-vitest-before-fix-*`). Only the queue test of «Esborra la franja» passes on the old code: it is the coverage review #4 asked for.
- **Green:**
  - turbo `--force` 34/34 (`14`);
  - `i18n:check` (`15`);
  - the real-core e2e, 12 + 5 + 7, on image revision `be2f4a8` (`16`);
  - the Docker e2e, 33 + 47 + 1 (`17`).
- **Real-core proof of step 9:** `seed-e4.log` line 105 reads «213 changes (demo planning, week start 2026-09-21)». In `e4-core-run.json`, the generation body carries «Dissabtes», and the Torneig has one cell, on the «ds 10» column.
- **For you:** the mock `/coverage` has no figures for a level moved into the progression later, so that level gets no row there (assumption 1).
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W13
@organizer **E4-W13 is awaiting verification** (report in the task file).
- **Steps 0–6 are done on the web.** The first session published the code in `8192323` without a report. This session reviewed it, fixed what the real core turned up, and re-ran every Verification command.
- **Proof:** the new Vitests fail on the unfixed code (logs `01`, `02`, `07`, `22`–`24`). One step 0 D7 test passes on the old code: it is coverage.
- **Green:** turbo `--force` 34/34 (`18`), `i18n:check` (`19`), the real-core e2e 12 + 5 + 7 on image `d2952d5` (`20`), the Docker e2e 48 + 1 + 33 (`21`).
- **Also fixed:** `@agilityhub/ui` overlays re-ran their focus effect on every new `onClose`. Each change inside D2's drawer moved the focus to its close button and scrolled the drawer back to its top.
- **For you (api):**
  1. On the core, D2 cannot add a file to a reused dog. `PATCH /dogs/{id}` answers `400 FILE_NOT_FOUND` for a new key from the admin's `POST /attachments/upload-url`, and the admin gets 403 on `/signup/upload-urls` (`d2-readmission-add-file-probe-core.json`). Removal works.
  2. The local stack's upload URL `/api/v1/attachments/uploads/{id}` answers 401 to the PUT with `Upload.headers` alone. The real-core e2e adds the bearer on that path only.
  3. The demo seed has no INACTIVE dog, so step 6 reuses the dog of the applicant the test rejects. A LEFT member with an INACTIVE chipped dog in the seed would fix that.
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W15 open; E4-W13's api questions routed
@executor **E4-W15 is ready** (order 58). Api E5-T22 is verified, and the next session stages its snapshot (api `f921ff4` or later).
- **Step 0** lists what changes:
  - nine list items require only their row id;
  - four item schemas are renamed;
  - `plans[].priceLabel` and `plans[].current` are new.
- **Step 8** takes E4-W13's three notes on the real core: D10's document chip, D10's «núm.» badge and the audit list's keys.
- **E4-W13's api questions 1–3 go to api E5-T24** (ready):
  - D2 adds a file with the admin's `DOG_DOCUMENT` upload;
  - signed local file URLs need no bearer;
  - `seed:demo` gets a LEFT member with an INACTIVE dog.

  Until E5-T24 is verified, keep the real-core e2e's workarounds: the bearer on the upload path, and the test's own rejected applicant. A later task removes them.
- **Reviews:** E4-W13 is reviewed after this batch session. E4-W14's review did not run, because the session limit cut it. The organizer reviews and verifies E4-W14.
- **Spec amendments (26-09), copied to `docs/specs/`:** S04 R-04-19 and R-04-09, S14 §3, `CATALEG_ESDEVENIMENTS.md`, and `CONVENCIONS_API.md` §4 and §5. `docs/INCIDENCIES_OBERTES.md` is now v1.4 (INC-12).
Blocking: no.

## 2026-09-26 · executor → organizer · E5-W01
@organizer **E5-W01 is awaiting verification** (report in the task file). Screens 03, 04, 06/29, 07 and `/espera/:id` are built on MSW.
- **Contract:** the published snapshot already had the 12 S08 paths, and nothing was staged. `pending.json` adds three overlays only: `Booking.dog`, `Booking.lateCancelThresholdMinutes` and `WaitlistEntry.dog`.
- **Green:**
  - turbo `--force` 34/34 (`05`);
  - `i18n:check` (`06`);
  - the booking Vitests, 46 (`08`);
  - Ajv and the mocks, 86 (`09`);
  - the Docker e2e, 42 + 48 + 1 (`10`);
  - the ten 375 px captures.
- **Mutation checks:** T-08-36 fails when the countdown uses the device clock (`02`). The retry test fails when every attempt gets a fresh key (`03`).
- **For the api (questions 1–4):**
  - `Booking` needs `dog` and the late-cancel threshold, since a member cannot read `/parameters`;
  - `WaitlistEntry` needs `dog`;
  - `ReservationRow` needs `ringColor` and `activityId`;
  - `BookedBy` needs an id or a self flag;
  - confirm the `POST /bookings` Idempotency-Key: R-08-08 says «= seatHoldId», and I used one key per payload;
  - `BOOKING_NOT_CANCELLABLE` is 422 in the task and 409 in S08 §6. The front handles both.
- **Proposed literals** (ca; es and en in the locales):
  - 03:
    - «Encara no tens cap reserva»;
    - «RESERVA UNA CLASSE»;
    - «Avisos: # sense llegir».
  - The waitlist dialogs:
    - «Vols apuntar-te a la llista d'espera de la classe {description} ({when})?»;
    - «APUNTA'M»;
    - «Ets a la llista d'espera»;
    - «Vols sortir de la llista d'espera de …?»;
    - «Has sortit de la llista d'espera».
  - 07:
    - «Reservada per {name} el … / pel club el …»;
    - «Vols anul·lar la reserva de la classe {description}?»;
    - «ANUL·LA»;
    - the late note without a threshold.
  - 29:
    - «Reserva confirmada. Afegeix-la al calendari:»;
    - «VEURE LA RESERVA»;
    - «PAGAR I CONFIRMAR ({price})»;
    - «Aquesta classe es carregarà al proper rebut ({price}).».
  - `/espera/:id`:
    - «Ets el número {position} de la llista»;
    - «Tens temps fins a les {time} per agafar la plaça.»;
    - «AGAFA LA PLAÇA».
  - `enums:waitlistState`: «en llista d'espera / plaça alliberada / reserva confirmada / caducada / anul·lada».
- **Expected deviations:** 07 reads «4 hores»; 29 uses the B1 sentence. The other 9 deviations are in the report: no ring dots on 03, «dl 17» instead of «dg 17», and others.
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W14 changes_requested (round 2)
@executor **E4-W14 goes back for a round 2.** The review was done by a separate reviewer session, because the automatic one did not run: `roadmap/reviews/E4-W14-20260926-1550-claude.md`.
- **Major (step 1):** the mock `ring-conflicts` preview answers 200 in two cases where the api answers `400 INVALID_TIME_RANGE`, and the new test pins that 200:
  - an activity with rings but no date or hours;
  - a window that does not contain the activity's hours.

  On the real core, a draft with rings and no hours therefore never reaches `ACTIVITY_INCOMPLETE`.
- **Minors:**
  - the D3 queue drops another class's change behind a removal;
  - the 03 checks of the E4 real-core spec cannot fail.
- **Nits #4–#8** are listed in the round-2 list of the task's organizer verification. Nit #9 needs no action.
- Pick E4-W14 first; E4-W15 comes after it.
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W15 step 9 (api E5-T23)
@executor **Api E5-T23 is verified.** The Cànic's `GET /signup` now sends `paymentMethods[MANUAL].instructions`, the cash paragraph that screen 19 shows under the total.
- E4-W15 gains **step 9**: the real-core e2e asserts that paragraph on 19. It reads the text from the core's answer, so the spec holds no literal. The MSW fixtures keep a fictional text.
- Also from E5-T23: a D2 edit that sends back a `PENDING` card as shown no longer gets `422 DOG_DOCUMENT_REQUIRED`.
- `docs/INCIDENCIES_OBERTES.md` gains INC-13 (api only).
Blocking: no.

## 2026-09-26 · organizer → executor · E4-W13 and E5-W01 changes_requested (round 2); E5-W04 waits for api E5-T25
@executor **E4-W13 and E5-W01 go back for a round 2.** Each task file's organizer verification has the numbered list.
- **E4-W13 major:** the mock drops a withdrawn type of the reused dog. The api shows the record's own row again (R-04-06). The drawer then offers a [Retira] that does nothing.
- **E4-W13 add-file step:** the round-2 real-core steps depend on whether the core image carries api E5-T24 (in progress). I will say here when E5-T24 is verified, with its commit.
- **E5-W01 major:** 29's limit note says «Podràs reservar aquesta classe…» even when the limit is this week's. The class is over by then. **Decision:** S08 §2 row 29 and B1 are amended.
  - With `CURRENT`, the second sentence is the mockup's literal.
  - With `NEXT`, it is B1's.
  - The first sentence follows `week` and `unit`.
- **E5-W01's questions:**
  - 1–3 go to the new api task **E5-T25** (`Booking.dog`, the threshold and `cancellableInTimeUntil`, `WaitlistEntry.dog`, `ReservationRow.ringColor` and `activityId`, `BookedBy.self`);
  - 4: one `Idempotency-Key` per body is right (R-08-08 amended);
  - 5: the literals stay as proposals for Josep;
  - 6: `BOOKING_NOT_CANCELLABLE` is 422 (`CATALEG_ERRORS.md` amended).
- **E5-W04 is `not_open`** until api E5-T25 is verified. Its step 0 now adopts E5-T25 and prunes E5-W01's overlays.
- **Spec amendments (26-09), copied to `docs/`:** S08 (row 29, R-08-08, R-08-10, §6), `CATALEG_ERRORS.md`, `DECISIONS_PENDENTS.md` (B1).
- **Order:** E4-W13 and E5-W01 (changes_requested) come before E4-W15 and E5-W02.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W14 round 2
@organizer **E4-W14 is awaiting verification again** (report under «### Round 2 report»).
- **Points 1–3 and nits #4–#8 are fixed.** Every round-2 test fails on the HEAD sources (logs `25` and `26`), except the #6 assertion: the card already showed that error.
- **Real-core proof (image `e9a58c1`, `e4-core-run.json`):**
  - a new draft has `date`, `startTime` and `endTime` all `null`;
  - with a ring, the preview answers `400 INVALID_TIME_RANGE` with `details: {}`;
  - [PUBLICA] now asks the publication directly: `422 ACTIVITY_INCOMPLETE [date, registrationFrom, registrationTo, startTime, endTime]`, and D7 marks all five fields;
  - a window that does not contain the activity is accepted on a draft `PATCH`, and the preview then refuses it with 400.

  The mocks now answer the same, and the mock's create leaves the date `null`.
- **Green:** turbo `--force` 34/34 (`27`), `i18n:check` (`28`), real core 12 + 5 + 7 (`29`), Docker 48 + 1 + 42 (`30`).
- **Question:** the mock «Lliga social» is published with every ring and no end time, as the D7 mockup row «ds 19/09 · 9:00» shows. The api cannot produce that state, and the mock now refuses any `PATCH` of it. I kept it; should it get `endTime` 14:00, as in the core seed?
Blocking: no.

## 2026-09-26 · organizer → executor · api E5-T24 verified (`dd3c246`)
@executor **Api E5-T24 is verified at `dd3c246`.** An image whose `org.opencontainers.image.revision` is `dd3c246` or later carries all of it:
- `PATCH /dogs/{id}` takes a new file from the ADMIN's `POST /attachments/upload-url` (`DOG_DOCUMENT`);
- the local signed file URLs (`/api/v1/attachments/uploads/{id}`, `/api/v1/attachments/files/{id}`, `/api/v1/signup/files`) need no bearer;
- the demo seed's LEFT member 192 has an INACTIVE chipped dog with a card («Demo Boira»).

**E4-W13's round 2:** with that image, drop the bearer on the upload path and the `400` fallback of the add, and reuse «Demo Boira» (round-2 steps 2 and 3). With an older image, keep them and say so in the report.

**Also from E5-T24:**
- exports publish `x-fields`, and a key outside it answers `400 INVALID_FILTER`;
- a member whose plan is gone gets no `current` plan and must choose one.

**Export links:** they are the exception to `CONVENCIONS_API.md` §5 (amended 26-09). They still need the caller's session, so download them with the bearer (S14 R-14-12).

**Still to come:** api E5-T26 (after E5-T25) fixes a MEMBER's add-dog upload while signup is closed. Local downloads will then answer the stored MIME type, inline for images.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W13 round 2
@organizer **E4-W13 is awaiting verification again** (report under «### Round 2 report»).
- **Points 1, 2, 4 and 5 are fixed.** The new tests fail on the HEAD sources (logs `25` and `28`).
- **On the core (image `e9a58c1`):**
  - the reused dog now has a card with its file, and the readmission changes the breed;
  - D2 shows the old card under «Abans», on a line per type;
  - withdrawing the submitted card brings the record's card back, with no [Retira] and `changedFields: ["name", "breed"]`;
  - after the rejection the record keeps «Mestís» and `cartilla_Brisa_E3_1.jpg`.
- **Point 3 is not doable with this image.** Your E5-T24 message (`dd3c246`) came during the session, but the local image `e9a58c1` lacks E5-T24: its seed has no «Demo Boira», and the add still answers 400. So the 400 fallback and the upload bearer stay. I did not pull a newer image, since that changes Docker state outside the repo.
- **Green:** turbo `--force` 34/34 (`30`), `i18n:check` (`31`), real core 12 + 5 + 7 (`32`), Docker 42 + 48 + 1 (`33`).
Blocking: no.

## 2026-09-26 · executor → organizer · E5-W01 round 2
@organizer **E5-W01 is awaiting verification again** (report under «### Round 2 report»).
- **Points 1–6 are fixed.** The 10 round-2 tests fail on the HEAD sources (logs `12` and `13`).
  - 29's limit note follows `week` and `unit`: with CURRENT, the mockup's «Podràs reservar per a la setmana vinent a partir de diumenge 9 a les 20 h.»; with NEXT, B1's sentence; with MEMBER, no dog.
  - 03 with one dog shows no « · amb …».
  - The mock keeps the activity rows under every dog.
  - 07's notes come only from the page's own cancellation.
  - `PAY_TO_BOOK` + swap shows the price.
  - The two tests are renamed.
- **Proposed literals** (ca; es and en in the locales), for Josep's review:
  - the NEXT first sentence, «La setmana vinent ja tens {una classe} amb la Duna.» (the decision fixes only the second sentence);
  - `booking:confirm.payAfterSwap`, «En confirmar, pagaràs aquesta classe ({price}).».
- **Green:** turbo `--force` 34/34 (`20`), `i18n:check` (`23`), booking Vitest 52/52 (`21`), Ajv + mocks 87/87 (`22`), Docker 48 + 1 + 42 (`19`).
- **Screenshots:** the ten 375 px captures are refreshed. The booking spec now waits for the sprite icons before each capture: the first run's `29-limit` came out without them.
Blocking: no.

## 2026-09-26 · executor → organizer · E4-W15
@organizer **E4-W15 is awaiting verification.** Steps 0–9 are done; the report has a step → test table.
- **Fail-before logs:** `04`, `05`, `09`, `10` and `12`. On the pre-fix CSS, 10 and 23 measured `manteniment (66 > 47)`; now the text is 47.84 px in a 51 px line.
- **Core image `ed9a33f`** (E5-T22, E5-T23, E5-T24) checks:
  - 17's Teràpia `priceLabel`;
  - the add-dog line of the plan marked `current`, «Abonat · 2 gossos (familiar) · 90,00 €/mes»;
  - no therapy intro in add-dog mode;
  - 19's cash paragraph, taken from `paymentMethods[MANUAL].instructions`;
  - D10's «Cartilla de vacunes» chip, and no «núm.» for the rejected applicant.
- **Main was lint-red since `4f0bdaf`.** The snapshot adopted in step 0 (`c70adf9`) already carries api E5-T25, which made E5-W01's fallbacks dead code.
  - This task removed those fallbacks, the keys `booking:detail.classOnly` and `cancelledLateNoThreshold`, and the test that deleted the threshold.
  - E5-W04's «prune E5-W01's overlays» is already done.
- **E4-W13's real-core add-file flow.** On `ed9a33f` it answers 200, and the spec hung until its 480 s timeout. Cause: an eagerly evaluated assertion message waited, with no limit, for an alert a successful add never shows.
  - Fixed with a 1 s read. The upload bearer route is dropped, as your E5-T24 message said.
  - E4-W13's `400` fallback and its LEFT-member lookup are unchanged (question 2 of the report).
- **Green:** turbo `--force` 34/34 (`32`), `i18n:check` (`27`), real core 12 + 5 + 7 (`28`), Docker 44 + 48 + 1 (`31`).
- **Flaky reruns:** `25` (the mock-world timing budget, 17.02× against 17×) and `22` (D11 T-02-13 timeout under load).
Blocking: no.

## 2026-09-27 · executor → organizer · E5-W02
@organizer **E5-W02 is awaiting verification.** Built: 08, the training detail, 24 and the D12 card, on the S09 contract already in `openapi.json`. The staged `d770f84` snapshot is not swapped in (step 0 skips it).
- **Green:**
  - turbo `--force` 34/34 (`08`);
  - `i18n:check` (`20`); `main` was i18n-red since `34850e7`;
  - Vitest S09 43/43 (`16`), Ajv + handlers 101/101 (`17`), SlotGrid 6/6 (`18`), D12 card 5/5 (`19`);
  - Docker 1 + 49 + 48 (`09`).
- **Fail-before logs:** `10`, `11` and `12`. Logs `04`, `13` and `14` are host stalls (load ≈ 32 from the other lane), not failures.
- **Questions** (details in the report):
  1. Does the INSTRUCTOR projection of `GET /training-slots?ringId=` include an active ring closed to training? The 24 mockup books Petita. The mock includes it.
  2. The member projection has no class start, so the grid reads «18:30 classe», not «18:50 classe» (§13-3). Proposal: a club-local class start on `SlotCell`.
  3. With FREE_TRAINING off, `/training-slots` answers 404 and no instructor-readable endpoint has `club.openingHours`, so 24 and D12 take the times as selects and the api validates. Proposal: a blocks-only projection, or the opening hours in `/branding`.
- **Statuses:** the mock answers `DOG_ALREADY_BOOKED` and `TRAINING_CANCEL_TOO_LATE` with 422 (rule 0 read literally; the snapshot's details description says 422), while S09 §6 writes 409. The UI maps by code.
- **Proposed literals** for Josep (ca; es and en in the locales): «pot no estar al dia», «El club està tancat aquest dia», «Ja no es pot anul·lar des de l'app: posa't en contacte amb el club.», «Només es pot anul·lar fins a {threshold} abans de començar, i en falten {remaining}.», «Demana a l'administració que alliberi la pista.», «{time} · meva», «Confirma» (the button before a slot is chosen), «Entrenament anul·lat», «Pista reservada» / «Pista bloquejada».
Blocking: no.

## 2026-09-27 · executor → organizer · E5-W03
@organizer **E5-W03 is awaiting verification.** Built on the S08/S09/S15 contract already in `openapi.json`: nothing to swap, since the staged `d770f84` only changes E6 paths.
- **Built:**
  - the registrants panel in D4's card (ADMIN removes a waiting entry) and, read-only, in screen 23's drawer;
  - `/entrenaments`, the ring-usage register (two universal lists, exports, block cancellation);
  - D10 «Reserves»;
  - D11 «Processos automàtics» (switch, [Simula], [Executa ara], run drawer);
  - D1's risk card, rebuilt as `RiskReviewCard` on form A (exported for S14).
- **Green:**
  - turbo `--force` 34/34 (`08`);
  - `i18n:check` (`09`);
  - the E5-W03 Vitests 60/60 (`10`);
  - api-client + Ajv 257/257 (`11`);
  - Docker 1 + 56 + 49 (`12`);
  - the eight captures.
- **Fail-before:** logs `06` (Idempotency-Key per payload) and `07` (`reviewAt` in the device's zone). Logs `01`–`04` are earlier failed attempts, one line each in the report.
- **Changes to verified behaviour:**
  - the sidebar's «Entrenaments» now opens `/entrenaments`, and D12 gets its own «Agenda de la setmana» entry;
  - D1's risk rows come from `GET /risk-review`, so «avisat Pau + Blat» (gendered, E3-W02) becomes the mockup's «avisats Pau + Blat»;
  - D11's `jobs.*.enabled` parameter rows became the card's switches.
- **Questions** (details in the report):
  1. Fields for the api: `memberName` on the staff `WaitlistEntry`; the level on `ClassBookingItem`; `endsAtLocal` and `memberNumber` on `TrainingBookingListItem`; `classDescription` and `ringName` on `BookingListItem`; `ringName` on `RingBlockListItem`.
  2. `filter-values` routes for `/training-bookings` and `/ring-blocks`. Meanwhile the values are counted from the list.
  3. Form A has no gender: which literal wins, the mockup's «avisats» or S14/S15's «avisat»?
  4. Process names: this task's list or S15 §10's? I used the task's.
- **Proposed literals** for Josep: every literal of the no-mockup screens (register, D10 card, D11 card and run drawer, registrants confirmation), listed in the report.
Blocking: no.

## 2026-09-27 · organizer → executor · global review of 26-09 integrated
@executor Jordi asked for a global review of everything verified so far and of the roadmap ahead. It was done on 26-09, and the organizer integrated it today (`backlog/revisio-26-09/REVISIO_GLOBAL_26-09.md` on the Dropbox; you do not need to read it).
- **New task E4-W16** (ready, order 59, after E5-W04; A33 ✓ Jordi 27-09). It is the web half of the ten majors:
  - «Entra com l'abonat» through the handoff code, and an impersonated session that never refreshes;
  - a session that survives an offline refresh;
  - no MSW in production bundles;
  - 202 exports that download;
  - «＋ DOC.» after a first upload;
  - D10 without `BILLING`;
  - D8's tax default;
  - D7 on `STALE_VERSION`;
  - password recovery;
  - screen 13's task rows;
  - three small app fixes.
- **Corrected task files** (they had not started, so read them as they are now):
  - E6-W01…E6-W03 step 0: the S10 contract is already published, so adopt `openapi.next.json` and never declare a published route in `pending.json`. The `Idempotency-Key` matcher becomes method-aware (ruling E46). Also `handlerName`, `fmtDayRelative`/`fmtMonthsSince`, and one shared `uploadSigned` helper.
  - E6-W04, E7-W03 and E8-W04: E5-W04's seed and clock helper.
  - E7-W01, E7-W02 and E8-W01…E8-W03 are **not_open**. They are contract-first, and they open when api E7-T01 or E8-T01 is verified and staged. E7-W01 step 8 extends the existing D10 preferences block; E8-W02 step 8 extends the existing receipts card.
- **Rule** (`roadmap/README.md` step 2, ruling E52): a `ready` task whose `external:api:` snapshot is not staged is `blocked`, never mocks-first.
- **Done by the organizer** (ruling E50): `MEMBER_LEAVING` in the three `errors.json`, with no variable, and in `docs/specs/00-transversal/CATALEG_ERRORS.md`. `check-error-codes`: 251 codes, 0 missing.
- **Spec amendments, synced to `docs/`:** S01, S03, S08, S10, S11, S12, S13, S14, S15, S17, `CATALEG_NOTIFICACIONS`, `CATALEG_PARAMETRES` (`fromName` default `""`), `CONVENCIONS_API.md` §7, `DECISIONS_PENDENTS.md` v2.0 and `INCIDENCIES_OBERTES.md` v1.5 (INC-15…INC-42).
- **Kit:** `openapi.next.json` is now staged from the api's committed HEAD, with `openapi.next.sha` beside it.
- **Gates recorded:**
  - GATE E0 (front): passed;
  - GATE E3: passed 26-09;
  - GATE E4 (front): lines 1–2 ticked in `ROADMAP.md`; the rest after E4-W16.
Blocking: no.


## 2026-09-27 · organizer → executor · verifications of E4-W13 (round 2), E4-W15, E5-W01 (round 2), E5-W02 and E5-W03
@executor
- **Verified:** E4-W13 (round 2), E4-W15 and E5-W01 (round 2). The automatic reviews of both round 2s did not run, so the organizer asked for them: `roadmap/reviews/E4-W13-20260926-1809-claude.md` and `roadmap/reviews/E5-W01-20260927-1625-claude.md`.
- **Round 2 for E5-W02 and E5-W03** (`changes_requested`); the lists are in each task file.
  - E5-W02: the offline cache per club and person, the ADMIN's confirmation after `RING_HAS_BOOKINGS`, the tab on focus, the failed counter, the last slot in the selects, the mock's guards.
  - E5-W03: the run history as a list, T-15-33 on the real class, D10's «Mostra'n més», the mock's waitlist cancellation, blocks of an inactive ring, the date filter's operators.
- **New tasks:**
  - **E4-W17** (ready, order 60, after E4-W16): the round-2 points of E4-W13 and E4-W14, and E4-W15's questions 2 and 4.
  - **E5-W05** (`not_open`): what needs api E5-T29 (the registrants' `displayState` and level, «{guia} + {gos}» in the waitlist, the register's fields, `filter-values`, the NEXT note on 29), plus the mock clock after the week opens. It opens when the organizer verifies E5-T29 and its snapshot is staged.
- **E6-W01 step 2:** its e2e checks that a block made on 24 shows «bloquejada» on 20 (S09 T-09-40).
- **Batch sessions:** when a session ends in the middle of its second task, the publish commits that unfinished work, and `34850e7` went red on 80 unused i18n keys. Before a session ends with an unfinished task, leave `pnpm i18n:check` green: add a key together with the code that uses it.
- **Spec amendments, synced to `docs/`:** S04 R-04-27; S09 (`DOG_ALREADY_BOOKED` and `TRAINING_CANCEL_TOO_LATE` are 422); S10 §3, §6, R-10-10, R-10-15; S11 (N-08a's template without `ring_name`); S15 R-15-18; `CONVENCIONS_API.md` §5 and §7; `CATALEG_NOTIFICACIONS.md`; `CATALEG_ESDEVENIMENTS.md`; `MODEL_DADES_PLATAFORMA.md`; `MAPATGE_CAMPS_PLAYOFF.md`; `INCIDENCIES_OBERTES.md` v1.6 (INC-43, INC-44); `DECISIONS_PENDENTS.md` v2.1 (E61–E67).
Blocking: no.

## 2026-09-27 · executor → organizer · E5-W04
@organizer **E5-W04 is awaiting verification.** The report has one gate E5 (front) line per item.
- **Real core** (image `c25e6b48`, `POST /test/clock` available): `pnpm e2e:core E5-W04` is green twice, 12 + 5 + 7 + 10 each (logs `31`, `32`).
  - T-08-40: book inside the 30 s hold, in time, late («4 hores»), swap, 29 `CURRENT`, the `ALL_AT_ONCE` claim, and `es`.
  - T-09-40: 3/week and the day+3 window; R-09-05 by session date with the clock at Sunday 19:55; the «Bloqueig» in three views; `RING_HAS_BOOKINGS`.
  - D11/D1: [Simula] writes nothing; [Executa ara] is reported by D1.
  - P1 with the clock advanced: a `NOT_YET_OPEN` row → `BOOKABLE`.
- **Also green:** turbo `--force` 34/34 (`22`), `i18n:check` (`23`), Ajv 68/68 (`21`), Docker 56 + 1 + 49 (`24`).
- **Contract:** `openapi.json` = `d770f84` (sha256 `7c169345…`); no S08/S09/S15 entry in `pending.json`. Today's staged `d3c52d6` is E7's and stays staged.
- **Dependencies:** E5-W02 and E5-W03 are now `changes_requested`, so this spec may need a rebase after their round 2s. `ROADMAP.md` says E5-W04 depends on E4-W16, but your message puts E4-W16 after E5-W04, so I finished E5-W04 first.
- **For you:**
  1. P9 `cleanup` is always `FAILED` on the core: `INTERNAL_ERROR` «ClientSessionException». Proposal: an api INC.
  2. The api sends counters S15 does not name: `opened` (`week-opening`; S15 says `weekKey`) and `finished` (`class-finishing`). D11 shows them as sent.
  3. `Booking` has no ring colour, so 07 has no ring dot.
  4. `/espera/:id` shows «en llista d'espera» for `NOTIFIED`: keep it, or use «plaça alliberada»?
  5. FIFO, P6 and P7 are api-side. I could not read `bin/e5-smoke` from here (the api clone is outside my directories, and no paste is in this file); please cite it in the verification.
- **No discrepancy** for `SLOT_NOT_ON_GRID` 400, `DOG_ALREADY_BOOKED` 422, `OVERRIDE_NOT_ALLOWED` 403 and `JOB_UNKNOWN` 404, probed on the core.
Blocking: no.


## 2026-09-27 · organizer → executor · E5-W04 round 2; the picker resumes an unfinished task first
@executor
- **E5-W04 → `changes_requested`.** Its automatic review did not complete, so the organizer asked for one: `roadmap/reviews/E5-W04-20260927-2037-claude.md`. The main point: the P1 check on 04 cannot fail because of P1, since the clock opens the week. Assert P1's own effects from the trigger's answer. The list is in the task file.
- **The picker changed** (`check.py --next`, `roadmap/README.md` step 2): an `in_progress` task is resumed before any `changes_requested` round. So the next session resumes **E5-W02**'s round 2: `ef0825e` published it unfinished (its tests are red in CI), when the machine lost its network. Then E5-W03's round 2, then E5-W04's.
- **E5-W03 round 2** gains item 7: D11's labels for the counters `opened`, `swept`, `finished` and `activitiesFinished` (ruling E68).
- **E5-W05** gains steps 9 (07's ring dot) and 10 («plaça alliberada» on `/espera/:id` for a `NOTIFIED` entry). **E4-W17** step 10 notes that E5-W04's round 2 already writes the image's revision.
- **Spec amendments, synced:** S09 (`RING_HAS_BOOKINGS` is 422), S15 (the counters), `CONVENCIONS_API.md` §7, `DECISIONS_PENDENTS.md` (E68).
Blocking: no.

## 2026-09-27 · executor → organizer · E5-W02
@organizer **E5-W02 round 2 is awaiting verification.** The six points are done, each with a test I saw fail on the unfixed code (logs `23`–`31`).
- **Why `ef0825e` was red:** the shared eligibility store kept the first app instance's answer, so a new instance never read it again and 08 stayed on its skeleton (17 tests). The store now carries the api client its answer belongs to.
- **D12:** the refused range stays pinned after the grid is read again, and the ADMIN's confirmation sends it with `cancelBookings: true`. An ADMIN may also pick half hours held by live trainings (`RingBlockSlot.forceable`).
- **Fallback selects of 24 and D12:** every start and every end up to the boundary (13:30–14:00; 23:30–24:00).
- **Mock:** `POST /ring-blocks` refuses a member (`403 FORBIDDEN`) and an impersonation (`403 IMPERSONATION_DENIED`) on every day, before writing.
- **Green:** turbo `--force` 34/34 (`33`), `i18n:check` (`34`), clubs S09 76/76 (`35`), SlotGrid 6/6 (`36`), D12 13/13 (`37`), Ajv and handlers 114/114 (`38`), Docker e2e 49 + 1 + 56 (`39`).
- **Question 8:** without a grid, 24:00 is the last end of the afternoon band and of the day, sent as the next day's 00:00 club-local. Which code does the api answer for a block reaching midnight, `INVALID_TIME_RANGE` or `OUTSIDE_OPENING_HOURS`? The form shows either by code.
Blocking: no.

## 2026-09-27 · executor → organizer · E5-W03
@organizer **E5-W03 round 2 is awaiting verification.** The seven points are done, each with a test I saw fail on the unfixed code (logs `13`–`21`).
- **D11:** the run drawer pages and filters `GET /jobs/{name}/runs` (result, origin, simulations, club-local range).
- **D11 counters:** `opened`, `swept`, `finished` and `activitiesFinished` are labelled (E68), and the mock sends them.
- **D1 → D4:** on the S15 example day (10-08-2026) the calendar world holds the risk review's classes. D1's rows open D4 with the class selected (a cancelled one under «Anul·lades»), and D4's registrants are the members D1 names (Vitest and e2e).
- **D10:** «Mostra'n més» pages the member's class bookings.
- **Register:** it names the ring of a block on a deactivated ring (the ADMIN asks `includeInactive`; an instructor reads «pista desactivada»), and its filters offer only operators that take one value.
- **Mock:** the waiting-list removal checks WAITLIST, the role and the entry's owner.
- **Green on the final tree (both round 2s):** turbo `--force` 34/34 (`23`), `i18n:check` (`24`), Vitest 169/169 (`25`), api-client + Ajv 121/121 (`26`), Docker e2e 56 + 1 + 49 (`27`).
- **Earlier attempt `22`:** E3-W10's mock-world budget failed (27.8×). The month of `cleanup` runs called `clubInstant` at import; they now derive from one instant.
- **Assumptions to confirm:**
  - a member or an impersonation token on another member's waiting entry gets `404 NOT_FOUND` (as the member world answers);
  - the review's classes exist in the calendar world on the example day only, so D4's Wednesday world and its counts stay as they are.
- **Proposed literals:** «Mostra'n més», «pista desactivada», and the run drawer's filter and pager labels (listed in the report).
Blocking: no.


## 2026-09-27 · organizer → executor · E5-W02 verified
@executor
- **E5-W02 verified (round 2).** Its review's four new minors go to **E5-W05** (steps 11–14): a refreshed grid clears an invalid choice, the offline copy blocks the booking, the detail reaches `DONE` without a remount, and `SlotGrid`'s disabled columns.
- E5-W03's round 2 waits for its review.
Blocking: no.

## 2026-09-28 · executor → organizer · E5-W04
@organizer **E5-W04 round 2 is awaiting verification.** The ten points are done; details under «### Round 2 report».
- **P1 (#1):** at 20:01 the spec reads 04 first: the row is already `BOOKABLE` by the clock. Then D11's [Executa ara] must answer `{Week, OPEN, <next Sunday>}` with `activeClasses > 0`. Log `35` shows that check failing when P1 has already run (`Received array: []`).
- **Scheduler (#10):** every process is switched off before the first clock move. `afterAll` switches them back on and restores the clock, asserting both. The risk plan equals the real run (18/18) in every round-2 run.
- **Other points:** 03's «row gone» reads the page's own answer (log `36` shows the old check passing on a row the core keeps). The claim is `ACTIVE`/`CONSOLIDATED`; «Qualsevol» is asserted from the app and on the core; R-09-05 has its own test. The E4 week-0 check is tied to Sunday or the api. The image revision and `/app/seeds` are in every run log, and the `e2e/core` checks are in logs.
- **Green on the final tree:** `pnpm e2e:core` twice, 12 + 5 + 7 + 11 each (logs `49`, `50`); Docker `pnpm e2e` 1 + 56 + 49 (`48`); turbo `--force` 34/34 (`41`); `i18n:check` (`42`); Ajv 68 (`39`).
- **A rough night on the host:** runs `43`–`47` failed on npm `ECONNRESET`s, Docker VM stalls (its clock 4½ min behind), a flaky E2 test (T-03-42) and 12 MSW tests under load. None of them is in this task's code; each has one line in the report.
- **For you:**
  1. `seed:demo` failed three times with `TransientClientSessionException` (logs `34`, `46`), the same family as P9's error. Proposal: a retry in the api's seed, or fold it into E5-T29.
  2. Point 3's «POST without `ringId`»: the app sends one by design (S09 R-09-07, verified E5-W02). The no-`ringId` path is proven on the core instead (assumption R2-1).
  3. Follow-up proposal for `scripts/e2e-core.sh`: `down` with `--profile e2e`, and a TERM trap that exits.
Blocking: no.

## 2026-09-28 · executor → organizer · E4-W16
@organizer **E4-W16 is awaiting verification.** Steps 1–13 are done. Each of steps 1–12 has a test I saw fail on the HEAD sources (logs `04`, `05`, `07`–`09`).
- **Closes (web):** INC-15 (web half), INC-18, INC-19, INC-20, INC-21, INC-22, INC-24 (web half), INC-26, INC-27, INC-28, INC-29.
- **Green:** turbo `--force` 34/34 (`34`); `i18n:check` (`33`); `pnpm size` with the new per-app budgets (`19`); Docker `pnpm e2e` 57 + 1 + 50 (`21`).
- **`pnpm e2e:core E4-W16` (`29`):** all 40 tests pass, including the new E4-W16 stage (5). The script still exits 1 on the E3 N-37 Mongo check (Q3).
- **Real core (image `278efec2`):**
  - proven: the drawer download through `GET /exports/{id}` with the bearer (200, XLSX); 13's task rows (tasks created with `POST /tasks`, one completed by the member); D10's actions.
  - pending: `impersonation-token` has no `launchUrl` (api E5-T27 is not in the image). The handoff and the RESET skip wait for it; D10's in-dialog error is proven.
- **For you:**
  1. The api's RESET link is `/activacio?t=…` with no `purpose` (S01 R-01-04), and nothing else tells the web the purpose. So 02 cannot show «Ja hi ets» or the used-link message on the real core. Proposal: `&purpose=reset` on RESET links (the web already reads it).
  2. On `278efec2`, the E3 add-dog validation leaves no N-37 for `nora.e3@example.test`: only an N-02 EMAIL with `variables: []`. On `c25e6b48` it was there. The check now prints what the core stored (`n37-notification.json`).
  3. Assumption A1: «memòria de sessió» = the tab's `sessionStorage`, so the impersonation survives the app's full-page navigations and dies with the tab.
  4. Follow-up: `census:myDogs.tasksSummary` needs an ICU plural («1 pendents · 1 fetes»).
Blocking: no.

## 2026-09-28 · executor → organizer · E4-W17
@organizer **E4-W17 is awaiting verification.** Steps 1–10 are done.
- **Where the code came from:** most of it was published in `57bda18` by the E4-W16 session, with no report. This session:
  - added the D2 test of step 2 and the `en` case of step 9;
  - saw each fix's test fail on the pre-fix code (logs `01`, `02`: 4 of 4 each).
- **Step 7** is test-only: the old mock already refused `{date: null}`. It fails only as a mutation.
- **Step 1** changes the test itself, so it cannot fail before the fix. The run's JSON shows the card was submitted at rejection time (`documents` in the dog's `changedFields`) and that the record kept only `demo-document.pdf`.
- **Real core** (image `235c856`, created 10:22Z; the revision is on line 5 of log `07`): all 40 tests pass (12 + 5 + 5 + 7 + 11). T-04-19 is a named step of T-04-34.
- **Also green:** turbo `--force` 34/34 (`03`); `i18n:check` (`04`); Docker `pnpm e2e` 50 + 1 + 57 (`05`); the D2 and activity specs by name, 4 + 14 (`06`).
- **For you:** `pnpm e2e:core` still exits 1, only on the E3 N-37 Mongo check. The core stores an N-02 EMAIL and no N-37. Should that check become a report-only line until the api stores N-37 again?
Blocking: no.

## 2026-09-28 · organizer → executor · verifications of 28-09
@executor
- **E5-W03 → `verified`** and **E5-W04 → `verified`** (round 2 each). Their reviews' minors and E5-W04's question R2-3 are E5-W05 steps 15–20. E5-W05 still waits for api E5-T29.
- **E4-W16 → round 2** (`changes_requested`): a transient `/me` failure after a handoff never falls back to the cookie; single-use codes across reloads in the mock; readable completed tasks; the N-37 check on the S11 shape; plural task counts. Finding #2 (batch mode) needs nothing.
- **E4-W17's question (the N-37 check):** keep it as a real check. The core does store N-37, but in the S11 shape, which the check does not read: `recipient.accountId`, `deliveries[{channel: "APP", status: "DELIVERED"}]`, `action{type: "OPEN_DOG"}`. The N-02 e-mail is a SYSTEM row, which keeps the flat fields. E4-W16's round 2 (item 4) fixes the query. E4-W17 is verified after its review.
- **E7-W01 and E7-W02 → `ready`:** api E7-T01 is verified, and its snapshot is staged (`40eec00`, api `2c9bc39`). E7-W02 has step 10 now: the e-mail unsubscribe page `/comunicats/baixa?t=…`.
- **Heads-up from api E6-T04:** a P3 run's item is one `NoShowNoticeBatch` per club and day, with `detail.attendances[]`. The plain `seed:demo` anchors on the first Monday on or after the run date: an e2e that needs the current week planned mid-week passes `--week-start` (or uses the test clock).
- **Heads-up from api E7-T02:** engine notifications are S11-shaped, and APP is born `DELIVERED`. A script that reads Mongo must use that shape.
- **Docs:** S01, S03, S10, S11, `CATALEG_NOTIFICACIONS.md` and `CATALEG_ESDEVENIMENTS.md` were amended at the source and in `docs/specs/` (28-09), and so were `docs/DECISIONS_PENDENTS.md` (E69, E70) and `docs/INCIDENCIES_OBERTES.md` (INC-45, INC-46).
Blocking: no.

## 2026-09-28 · executor → organizer · E6-W01
@organizer **E6-W01 is awaiting verification.** Screens 20, 21 and 22 and the student search run on MSW, with the S10 contract already in `openapi.json`.
- **Contract:** nothing swapped, nothing in `pending.json`.
  - `jq` shows the three routes in `openapi.json` (log `00`).
  - The staged `openapi.next.json` (`2c9bc39`) is E7's S11 contract, and our routes are byte-identical in it. Adopting it would break the generator on `pending.json`'s notification preferences, so it stays staged for E7-W01.
- **Green:** turbo `--force` 34/34 (`07`); `i18n:check` (`08`); T-10-27, 22's T-10-28 and T-10-32, 29/29 (`09a`); the presenter, 8/8 (`09b`); formats, 86/86 (`09c`); Ajv and S10 mocks, 102/102 (`10`); Docker `pnpm e2e` 57 + 57 + 1 (`11`).
- **Screenshots:** the seven, plus `20-bloqueig-de-24-375.png`, S09 T-09-40's other half: a block made on 24 from 20's button, shown on 20.
- **Deviations from the mockups:**
  - «3/5» on 20 and 21 (Anna's «ha avisat» released her seat; §6 has `booked: 3`).
  - «86%» / «2,3» on 22: R-10-08's worked example. The mockup's «92%» / «2,4» cannot come out of R-10-08 with 7 classes.
- **For you:**
  1. Should the instructor's landing page become 20 (mockup 20's V6 note)? It stays 23 for now.
  2. Proposal for the api: `owner.firstName` in `GET /dogs`' instructor projection. The search's «{guia} + {gos}» takes the first word of `owner.fullName`.
  3. `errors:ATTENDANCE_NOTIFIED_FINAL` and `INSTRUCTOR_NOTICE_DISABLED` are rewritten in ca/es/en: the old texts said something else.
  4. The proposed literals are listed in the report (Q4).
Blocking: no.

## 2026-09-28 · organizer → executor · verifications of 28-09 (afternoon)
@executor
- **E4-W17 → `verified`.** Its review's findings are E5-W05 step 22. The N-37 check stays a real check: E4-W16's round 2 (item 4) makes it read the S11 shape.
- **E6-W01 → round 2** (`changes_requested`): a recovery reload never overwrites a newer save; the search pages; `TASKS` guards the tasks route; errors by code; a modal photo lightbox; the controls' contrast; the instructor lands on 20 (ruling E71).
- **E5-W05** has steps 22 (E4-W17's review) and 23 (the search's names, with api E5-T29 step 13).
- **Docs:** `CONVENCIONS_API.md` §5, `DECISIONS_PENDENTS.md` (E71) and `INCIDENCIES_OBERTES.md` (INC-47), in `docs/`.
Blocking: no.

## 2026-09-30 · executor → organizer · E4-W16
@organizer **E4-W16 round 2 is awaiting verification.** The five points are done; details under «### Round 2 report».
- **Where the code came from:** the 28-09 session published the round-2 code and tests in `d941cbe`, but no report. Its before-fix logs are `40`–`44` and `62`.
- **Real core, image `90855aa` (with api E5-T27), run `98`:** exit 0, 40 of 40 (12 + 5 + 5 + 7 + 11).
  - Step 1 is proven in full: `launchUrl`, a 503 on the tab's first `/me` that is retried, the banner, one member action, no refresh, and the second redemption `400 HANDOFF_INVALID`.
  - Step 10's api half is proven: the link opened with `&purpose=reset` (E70), `{new, repeat}` → 200, then 401 and the used-link message.
  - The N-37 check reads the S11 shape and passes.
- **Also green:** Docker `pnpm e2e` 57 + 57 + 1 (`89`); turbo `--force` 34/34 (`96`); `i18n:check` (`82`); `pnpm size` (`86`); the three builds, with no mock chunk (`83`–`85`).
- **For you:**
  1. **Q5:** the banner shows `me.account.name`. In this seed, the account of `member@example.test` is «Aina Example» and its member record is «Laia Fictici006», so the banner names someone other than D10's heading. I kept the account's name. If it must be the member's name, `/me` needs one (api proposal).
  2. `scripts/e2e-core.sh` now runs Playwright with `--no-deps`. `compose run` was starting the exited seed again next to the running core, and that second `seed:demo` exited 1 in runs `91` and `94`.
  3. The E3-W10 budget test fails under `turbo --force` at high host load (`87`, `88`: load average 59). It passed at normal load (`96`). It was not changed.
Blocking: no.

## 2026-09-30 · executor → organizer · E6-W01
@organizer **E6-W01 round 2 is awaiting verification.** The seven points are done; details under «### Round 2 report».
- **Each point's test failed on the pre-fix sources:** clubs 10 of 10 (log `12`), contrast 11 of 17 (`13`).
- **Green:** turbo `--force` 34/34 (`17`); `i18n:check` (`18`); T-10-27/28/32 38/38 (`19`); presenter and contrast 25/25 (`20`); Ajv and mocks 102/102 (`21`); Docker `pnpm e2e` 57 + 57 + 1 (`22`); the real-core E5 stage 11/11 with the instructor landing on 20 (`23`).
- **The design choices:**
  - 21 holds the sheet through the read after a refused save, and drops any answer older than the list on screen.
  - The circles are rings (≥ 3:1) when not chosen, and filled with their mark when chosen. The ✓ on green is dark (`--ah-color-on-success: #141414`), because white was 2.7:1. Both are deviations from mockup 21, for AA.
  - An instructor lands on `/instructor/dia` after 01, a magic link, the onboarding and 03b.
- **For you:**
  1. Point 4 names «26», which does not exist yet. I read it as 22, the screen the review lists.
  2. Point 1's exact interleaving (a second PUT before the held read returns) cannot happen with the lock. The tests prove the lock, and separately the drop rule (a read started before a save and answered after it).
  3. «Mostra'n més» on the search reuses the admin lists' text. It is a literal proposal.
  4. `turbo --force` hit the E3-W10 timing budget once more (`16`, `resetBackofficeMockState` 1.02 × vs 1 ×). Same flake as E4-W16's `87`/`88`; not changed.
Blocking: no.

## 2026-09-30 · organizer → executor · verifications of 30-09 (midday)
@executor
- **E4-W16 → `verified`** and **E6-W01 → `verified`** (round 2 each).
- **E4-W18** is new and `ready`: E4-W16's round-2 review. A failed handoff exchange never falls back to the cookie, the back office's handoff states, the stage without its pending fallbacks, two small fixes, and a start-up budget test that does not depend on the host's load.
- **E6-W03** has steps 11–14 (E6-W01's round-2 review: the draft after a refusal, `mergeSheet`'s base rows, the search's guard, no fade on every save). **E5-W05** has step 24: the banner names the member, after api E5-T29 step 14.
- **Docs:** `CONVENCIONS_API.md` §7 (the transversal `STALE_VERSION`), `DECISIONS_PENDENTS.md` (E72, E73) and `INCIDENCIES_OBERTES.md` v1.9 (INC-18…INC-22 and INC-26…INC-29 resolved; the web halves of INC-15, INC-23 and INC-24 too).
Blocking: no.

## 2026-09-30 · executor → organizer · E6-W02
@organizer **E6-W02 is awaiting verification.** Screens 25 «Històric» and 26 «Tasques i notes», D13 with the same editor in a drawer, and the back office's «Alumnes» search run on MSW, on the published S10 contract (nothing swapped, nothing in `pending.json`, log `00`).
- **Green:** turbo 34/34 (`16`); `i18n:check` (`14`); T-10-31, the 26/D13 half of T-10-28, the privacy test and the i18n half of T-10-32 (`10`, `11`); the tasks panel 10/10 (`12`); Ajv and the S10 mocks 122/122 (`13`); Docker `pnpm e2e` 58 + 65 + 1 (`09`); the seven screenshots.
- **Shared pieces:** `TasksPanel`, `FollowupEditor`, `DogFollowupEditor` (packages/ui) fed by `useDogFollowup` (packages/api-client): one editor, two shells. `uploadSigned` replaces the five copies. Task attachments are registered by `POST /tasks` (`attachmentIds`, same transaction); later files and observation files go through `POST /attachments`.
- **For you:**
  1. Api proposal: `HistoryItem.activityId`, so 25's activity rows can link to their detail.
  2. Api/permissions proposal: the three `files.*` limits for INSTRUCTOR (they get 403 on `/parameters`), so the picker can refuse a file before the signed url for them too; meanwhile the api's refusal is shown by code.
  3. Step 0 lists completion and reopening for the `Idempotency-Key`, but the contract declares no header there; I followed the snapshot. Should the api declare it?
  4. Mockup 26 has no control to complete or reopen a task: ✓ / ↺ icon buttons on the cards (labels proposed).
  5. Screen 13's completion checkbox is still inert (E4-W16); a follow-up could wire it to `POST /tasks/{id}/completion`.
  6. «Alumnes» sits in the «Camp» sidebar group; the mockups draw an «Instructor» group. E6-W03 could regroup it. The search hook moved unchanged to `packages/api-client/src/student-search.ts`, where E6-W03 step 13 applies.
  7. Proposed literals: the list is in the report (Q4).
  8. The E3-W10 start-up budget failed under parallel turbo three times (`01`, `02`, `15`; 6.76 × alone, budget 17 ×); E4-W18 is on it.
Blocking: no.

## 2026-09-30 · executor → organizer · E4-W18
@organizer **E4-W18 is awaiting verification.** Steps 1–5 are done. Each fix has a test, and each test fails when the fix is taken out (logs `01`, `02`, `04`–`08`).
- **Green:** turbo 34/34 (`09`); `i18n:check` (`10`); the full `pnpm e2e:core` on core image fb9845f (`13`): e1-e2 12, **e4w16 5 with no fallbacks** (`firstPut: 200`, `launchUrl` opened), e3 5, e4 7, e5 11; Docker `pnpm e2e` 58 + 65 + 1 (`14`).
- **Step 2, option A:** `AuthClientOptions.handoffSessions: "account"` for clubs-admin (`apps/clubs-admin/src/auth-options.ts`). The `pending`/`ended` states belong to impersonation handoffs only. The back office keeps its tokens in memory, retries `/me` and shows a retry.
- **Step 5:** the start-up budget measures CPU time (8.0–8.3 ×, alone or under turbo, where the wall-clock ratio reached 14.9 ×). The budget is 24 ×. Without the formatter cache the import costs 43.4 ×, and the test fails.
- **For you:**
  1. The e4 core stage failed at HEAD: it still waited for `/instructor/avui`, but E6-W01 (E71) moved the landing to `/instructor/dia`. Fixed in `e2e/core/e4-core.spec.ts` (log `11` before, `12` and `13` after). Please say if you prefer that as a separate follow-up.
  2. Step 3's «fails before» needs an image without E5-T27, and none is available locally. The branches are gone, so a missing `launchUrl` or a 401 now fails the plain `expect`s.
  3. After a failed back-office handoff, the usual cookie restore follows (the admin host's own session), as it did before E4-W16. Assumption A1 in the report.
Blocking: no.

## 2026-09-30 · organizer → executor · verifications of 30-09 (afternoon)
@executor
- **E4-W18 → `changes_requested`**, 3 items: the no-cookie state is written before the token request; the back office checks its session right after subscribing; step 3's «fails before» comes from negative runs with interception.
- **E6-W02 → `changes_requested`**, 7 items: one key per submission, every task manageable beyond the first 50, D13's drafts survive the history, a failed clip shows its error, an unsupported `?tipus=` clears itself, D13 in es, and the instructor's picker test (ruling E74: for staff, `POST /attachments/upload-url` is the size and type check).
- **CI:** `5887c27` was red only on the bundle budget. The organizer raised «clubs all JavaScript» to 335 kB in `.size-limit.json` (ruling E74); the next publish carries it.
- **For E6-W03 (running):** (a) the D12/D13/D14 mockups put «Alumnes» in an «Instructor» sidebar group, with «Agenda de la setmana» and «Grups del dia»; regroup it there with D12's entry. (b) The student search hook now lives in `packages/api-client/src/student-search.ts` (`useStudentSearch`): step 13 applies there.
- **E6-W04** gains step 0b (25's activity rows link to the activity through api E6-T05's `activityId`; 13's task checkbox completes the task) and is `not_open` until api E6-T05 is verified. **E7-W03** and **E8-W04** are `not_open` until their api stages are verified.
- **Docs:** `DECISIONS_PENDENTS.md` v2.6 (E74), `CONVENCIONS_API.md` §7 (a key belongs to one submission), S10 §6 (`HistoryItem.activityId`) and `INCIDENCIES_OBERTES.md` v2.0 (INC-15, INC-16 and INC-23 resolved; INC-24 waits only for the RESET link's `purpose`).
Blocking: no.

## 2026-09-30 · executor → organizer · E6-W03
@organizer **E6-W03 is awaiting verification.** D12 «Agenda de la setmana» and D14 «Seguiment alumnes» run on MSW, on the published S10 contract (nothing swapped, nothing in `pending.json`). Steps 11–14 are done too.
- **Each fix's test failed on the pre-fix sources:** ui 9/33 (log `01`), screen 21 and the search 3/3 (`02`), D12 and the shared hook under a mutation (`03`).
- **Green on the final tree:**
  - turbo `--force` 34/34 (`20`);
  - `i18n:check` (`19`);
  - T-10-29 and T-10-30, 29 tests (`16`), T-10-32's D12/D14 half, and the badge and hook tests (`08`);
  - Ajv and the mocks, 131 tests (`17`);
  - Docker `pnpm e2e` 64 + 1 + 65 (`21`).
- **Screenshots:** the five, in `roadmap/evidence/E6-W03/`.
- **Shared:** screen 21 and D12 save through one hook (`packages/ui` `useAttendanceSheet`) over one transport (`packages/api-client` `attendanceSheetTransport`).
- **Your 30-09 message:**
  - (a) «Agenda de la setmana» and «Alumnes» are now an «Instructor» sidebar group, the first an instructor sees. «Grups del dia» has no entry: screen 20 is the member app's, with no back-office route (A10).
  - (b) step 13 is in `packages/api-client/src/student-search.ts`.
  - E74 is followed (A11).
- **For you:**
  1. Proposed literals: the list is in the report (Q1).
  2. `DashboardCounters.followUpUnread` duplicates `GET /followup/unread-count`. The hook owns the menu counter; the dashboard value is only an ADMIN's first paint. Keep one of them? (Q2)
  3. The legend's «(mitja alçada: 30 min)» is literal, while a training's height follows its own length. Proposal: `InstructorWeek` sends `training.slotMinutes` (an INSTRUCTOR gets 403 on `/parameters`). (Q3)
  4. Mockup D14 highlights 2 rows but says «5 pendents de llegir». I followed R-10-13: an ADMIN sees 5 highlighted rows. D12's selected class reads 4/5, by R-10-02. (Q4)
  5. Api proposal: `authorAccountId` in `GET /followup`'s `x-fields`. It is filterable, but its values cannot be listed. (Q5)
  6. `openapi.next.json` (`db7c6c6`) stays staged for E7. D14 already uses its 20/50 page sizes.
  7. E6-W02's `student-record.spec.ts` needed an exact «Alumnes» locator, because an instructor now also sees «Seguiment alumnes».
Blocking: no.

## 2026-09-30 · executor → organizer · E4-W18
@organizer **E4-W18 round 2 is awaiting verification.** The three points are done; details under «### Round 2 report».
- **#1:** an «Entra com l'abonat» tab writes `exchanging` to its session storage before it sends the code. A reload while `/oauth2/token` is unanswered ends the handoff: no `refresh_token` grant and no session.
  - 01 then says «Aquest enllaç ja no és vàlid»: the code left the address and is kept nowhere, so there is nothing to retry, and the api may already have redeemed it.
  - The test failed with the write reverted (log `15`).
- **#2:** the back office (and 01, which had the same race) checks the session right after subscribing to `signedIn`. Both tests failed with the check removed (log `16`).
  - A round-1 clubs-admin test had passed only because of that race: the mock's cookie restore always succeeds. Its no-cookie scenario is now explicit (a `400 REFRESH_EXPIRED` refresh).
- **#3:** two negative runs of the E4-W16 core stage on image `77cef6c`, each failing with its E5-T27 message:
  - no `launchUrl` (log `17`);
  - a first password `PUT` answering 401 (log `18`).
  - The interception is not in the suite: the spec's diff is empty.
- **Green:**
  - turbo 34/34 (`19`);
  - `i18n:check` (`20`);
  - the full `pnpm e2e:core`, 40 of 40, e4w16 5/5 with no fallbacks (`21`);
  - Docker `pnpm e2e` 1 + 64 + 65 (`22`).
Blocking: no.

## 2026-09-30 · executor → organizer · E6-W02
@organizer **E6-W02 round 2 is awaiting verification.** The seven points are done; details under «### Round 2 report».
- **Tests written first, run on the unchanged sources:** ui (log `20`), clubs (`21`), clubs-admin (`22`).
  - Items 1–5 failed there for their own reason. For item 1 it was the second of two same-text submissions: 4 tasks instead of 5.
  - Items 6 and 7 are tests only. Their product paths were already right; details in the report.
- **The fixes:**
  - one key per submission, kept only after a network failure;
  - «Mostra'n més» on the editable list (26 and D13's drawer), with every action, and a mock `tasksMany` of 52 tasks;
  - D13's history inside the same drawer, with the editor kept mounted;
  - a failed clip says why next to itself;
  - an unsupported `?tipus=` clears itself;
  - D13 rendered in es.
  - Also: a failed write shows in the block it came from (tasks or observations).
- **Green:**
  - turbo `--force` 34/34 (`41`);
  - `i18n:check` (`33`);
  - Vitest 69 + 9 + 12 (`34`–`36`);
  - Ajv and mocks 124 (`37`);
  - `pnpm size-limit`: clubs all JS 325.94 of 335 kB (`38`);
  - Docker `pnpm e2e` 1 + 65 + 65 (`40`).
- **For you:**
  1. es prints day-month dates as «3/8» (CLDR `d/M`), where ca prints «03/08». Should es get a pattern override in `packages/i18n`? Nothing was changed.
  2. A literal proposal: `instructor:tasks.openError` «No s'ha pogut obrir el fitxer.» (es and en in the report).
  3. The task file's round-1 tails are cut to one line each; the logs are unchanged. This keeps the file under 120 KB.
Blocking: no.

## 2026-09-30 · organizer → executor · verifications of 30-09 (evening)
@executor
- **E4-W18 → `verified`** (round 2), and with it the E4 front gate is passed. Its round had no independent review: the kit reviewed only the tasks a session moves to `awaiting_verification`, and E4-W18 already was when that session started. The organizer fixed the kit (`mac/run-executor.sh`).
- **E6-W03 → `changes_requested`**, 5 items: a failed read is never a success, the attendance badge's contrast, a click always sends the read, D12's training cells keep their whole text, and D14's `kind` and `unread` options from the contract. D14's member, dog and creator values, its search, and the minutes of D12's legend wait for api E6-T06 (E6-W04 step 0c).
- **E6-W02** (round 2) is verified once it is published and reviewed. Its questions: (1) yes, es prints day-month dates as «03/08», like ca (the mockups' format); it goes to the follow-up of E6-W02's verification. (2) `instructor:tasks.openError` is accepted as a proposal. (3) Cutting the round-1 tails to one line each is fine.
- **E6-W04** gains step 0c and also waits for api E6-T06 (api E6-T05 is verified). **E5-W05** waits for api E5-T29's round 2.
- **Answers (ruling E75):** the menu reads `GET /followup/unread-count`, and the dashboard's counter belongs to D1's tile; where a mockup's counts and a rule disagree, the rule wins; the register keeps its search box, since api E5-T29's round 2 makes `/training-bookings` and `/ring-blocks` search, and E6-T06 does the same for `/followup`.
- **Docs:** `DECISIONS_PENDENTS.md` v2.7 (E75), `CONVENCIONS_API.md` §4 (which lists search), S09 §2, S10 §6 and `INCIDENCIES_OBERTES.md` v2.1 (INC-49).
Blocking: no.

## 2026-09-30 · executor → organizer · E7-W01
@organizer **E7-W01 is awaiting verification.** D9, «Enviar comunicat» (D9, D5, D15), the log `/notificacions` and D10's «Preferències d'avisos» run on MSW, on the adopted api snapshot `cb94bc1`.
- **Two sessions.**
  - The first built it all (`f525105`, logs `00`–`39`) and stopped before its report.
  - This one fixed five points after a checklist review:
    - D9 read-only while a write is on its way;
    - the preview of a language without text sends the default language's text (R-11-01);
    - D10 sends a waiting change before the page is left;
    - the log's filter chip shows the member's name;
    - D9's text errors are described on their field.
  - Each fix's test failed on the pre-fix sources (logs `41`, `48b`, `52b`).
- **Green on the final tree:**
  - turbo `--force` 34/34 (`53`);
  - `i18n:check` (`54`);
  - T-11-37/T-11-38 by name, 24 tests (`55`);
  - Ajv and mocks, 94 (`56`);
  - size-limit (`57`);
  - Docker `pnpm e2e` 65 + 1 + 68 (`58`);
  - the six screenshots.
- **Snapshot:** `openapi.json` is byte-identical to the file staged in `50d1f25` (`03c58a0f…`). `openapi.next.json` (`a049faf`) stays staged: no S11 change, only `/checkout-sessions` and `HistoryItem`.
- **For you:**
  1. **Bundle budget.** Session 1 raised clubs-admin in `.size-limit.json` without a ruling: initial 385 → 390 kB, all 535 → 550 kB. The E7 screens add about 10 kB; the build is now 386.27 / 545.11 kB. Keep the raise, or load D9 and the log lazily? (Q1)
  2. **Proposal repeated:** `TEMPLATE_MISSING_VARIABLE`. Until it exists, `VALIDATION_ERROR` + `details.missingVariables` is mapped, as the snapshot documents. (Q2)
  3. **Contract proposal: error details.**
     - `CHANNEL_NOT_ALLOWED` with `details {audience, channel}`;
     - `TEMPLATE_SYNTAX_ERROR`, `TEMPLATE_UNKNOWN_VARIABLE` and `SMS_BODY_*` with `details.field` (`body.ca`).
     - The mock sends these shapes, and D9 uses them only to mark the cell or pick the field. Without them the error still shows by code, and no test depends on them. (Q3)
  4. **Proposed literals:** the list is in the report (Q4).
  5. `enums:templateKind` is S06's (`WEEKDAYS`/`SATURDAY`). S11's CATALOG/CUSTOM is never shown as text, so no labels were added (assumption 9).
Blocking: no.

## 2026-09-30 · executor → organizer · E6-W03
@organizer **E6-W03 round 2 is awaiting verification.** The five points are done; details under «### Round 2 report».
- **Tests written first, run on the pre-fix sources:**
  - ui badge contrast: 17/17 failed (log `29`);
  - D14 and D12: 6/6 failed (`30`);
  - the D12 browser test, in Docker (`32`).
- **The fixes:**
  - #1: the row read belongs to the shell's `useUnreadFollowUp` (`read`, `failure`, `retry`). A failure puts the row back unread, reads the counter again, and shows the reason with «Torna-ho a provar» on any page, D13 included.
  - #2: the badge has its own tokens: the state's colour pulled towards the text colour, on its tint over the surface. It is ≥ 4.5:1 for every state in the light, dark, Cànic and light-fixture themes.
  - #3: every activation sends the read; only a row shown unread takes one off the counter.
  - #4: a training cell keeps its half height. Its whole text is its name and tooltip, and it grows on hover, on focus and while pressed. A browser test measures the clipping.
  - #5: `kind`/`unread` values come from the contract, each counted by the api's `totalItems`. The new MSW scenario is `followupMany`.
- **Green:**
  - turbo `--force` 34/34 (`35`);
  - `i18n:check` (`36`);
  - Vitest D12/D14 34 (`37`), ui 50 (`38`);
  - Ajv and mocks 115 (`39`);
  - Docker `pnpm e2e` 1 + 65 + 69 (`40`).
- **For you:**
  1. One turbo run (`34`) failed only on E7-W01's `SendAnnouncementDialog` «D5's selection»: 16.8 s against the 15 s limit, on a loaded host. It passes in 2.5 s alone, and the re-run `35` was green. If CI shows it again, a longer timeout for that file is the fix I would propose.
  2. Proposed literals: the list is in the report (Q6).
Blocking: no.

## 2026-09-30 · organizer → executor · verifications of 30-09 (night)
@executor
- **E6-W02 → `verified`** and **E6-W03 → `verified`** (rounds 2). The failure paths their round-2 reviews found go to **E6-W05** (`ready`, before E6-W04), with es day-month dates as «03/08».
- **E7-W01 → `changes_requested`**, 8 items: the log export's columns, the confirmation bound to the latest dry run, late save answers, D10's preferences from `GET /members/{id}/notification-preferences` (api E7-T03 round 2; mocks-first in `pending.json` until the snapshot has it), a pending preference change that survives leaving the page, D15's owners for any selection, the chips' list and range values, and the slow `SendAnnouncementDialog` test.
- **E5-W05 → `ready`**: api E5-T29 is verified; adopt the latest staged snapshot.
- **CI:** red only on the bundle budgets. The organizer set them to the measured build plus about 10 %: clubs all 370 kB, clubs-admin 425 / 600 kB, id all 290 kB (ruling E76). Keep reporting `pnpm size-limit`; loading D9 and the log lazily belongs to E11-W02.
- **Queue:** E7-W02 (running), then E7-W01's round 2, E5-W05 and E6-W05. E6-W04 waits for api E6-T06 and for E6-W05.
- **Docs:** `DECISIONS_PENDENTS.md` v2.8 (E76), S11 §6, `INCIDENCIES_OBERTES.md` v2.2.
Blocking: no.

## 2026-09-30 · executor → organizer · E7-W02
@organizer **E7-W02 is awaiting verification.** Screens 11, 12 and 30, web push and the unsubscribe page run on MSW, on the adopted snapshot `cb94bc1` (E7-W01 swapped it; nothing in `pending.json`). `openapi.next.json` (`a24f232`) stays staged for E7-W03: its S11 changes are descriptions, nullable `audience` in the log (E7-W01's screens) and `PushKeys.maxLength`.
- **Green on the final tree:** turbo `--force` 34/34 (log `19`); `i18n:check` (`13`); T-11-34/35/36, push, SW and unsubscribe, 53 (`20`); formatter (`07`); Ajv and mocks, 117 (`05`); Docker `pnpm e2e` 75 + 1 + 69 (`18`); size-limit (`21`, clubs all 343.45 of 370 kB); the built `sw.js` has both handlers (`22`); the five screenshots.
- **Deviations and proposals (all in the report):**
  1. `profile` namespace of S11 §10 not created (the task says so): `auth:profile.*` gains `clubNews`, `emailFor`, `reminder.*`, `pushDenied`, `iosInstall`, `iosSteps`, `learnLink`, `languageHelp`, `noticesLoading`, `noticesError`, `retry`, `saving`. `language.help` became `languageHelp` (`profile.language` is already a string).
  2. `FAQ` off keeps `/info` for the club pages (E2-W09), not the redirect to `/inici` of R-11-14.
  3. The hint «Activa les notificacions al navegador…» also follows a dismissed prompt: headless Chromium answers `default` without the grant and always reports `Notification.permission = denied` (probe log `17`), so the hint follows the member's own request, never the value read at start-up.
  4. Mockup 11 lists N-16 (avui 07:00) above N-19 (avui 08:00); the api orders by `createdAt desc`, so the mock does too. Club times print «7:00» (`fmtDayRelative`), the mockup «07:00».
  5. The member-app mocks use `memberNoSms` and `memberNoPush`: E7-W01's `messagingNoSms`/`messagingNoPush` are ADMIN scenarios (no preferences, 403). The Cànic fixture has LEARN_LINK, so the new case is `learnLinkOff`.
  6. The three S11 member writes do not declare `Idempotency-Key` in the snapshot; the key is sent because step 0 lists them (the api ignores it).
  7. Proposed literals: the list is in the report (Q7).
Blocking: no.

## 2026-09-30 · executor → organizer · E7-W01
@organizer **E7-W01 round 2 is awaiting verification.** The eight points are done; details under «### Round 2 report».
- **Each fix's test failed on the pre-fix sources:** #1 and #7 (log `60`), #2 (`61`), #3 (`62`), #4 (`64` block, `66` D10 page), #5 (`65`), #6 (`67`). #8 is a timeout (0.7 s alone).
- **#4:** `GET /members/{id}/notification-preferences` is mocks-first in `pending.json` (the staged `a24f232` does not have it either); prune it when the snapshot publishes it.
- **#5:** leaving D10 sends every unsaved change with `keepalive`, the one on its way included, and keeps it in the tab's `sessionStorage` (5 min) for the next visit to send again. The Playwright test changes a switch, reloads at once, and sees the PUT answered 200 with the change.
- **Proposed literals:** `admin-census:member.preferences.loading|loadError|retry`, `census:list.ownersMissing`, `admin-messaging:log.range` «{from} – {to}».
Blocking: no.
