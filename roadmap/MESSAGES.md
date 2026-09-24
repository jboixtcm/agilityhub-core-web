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
