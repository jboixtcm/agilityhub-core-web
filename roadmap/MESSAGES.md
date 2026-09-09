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
