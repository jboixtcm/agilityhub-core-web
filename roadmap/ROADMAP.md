# ROADMAP — agilityhub-core-web (maintained by the organizer)

Stages come from `docs/PLA_DESENVOLUPAMENT.md` (E0–E12, no dates; goal: the Cànic fully operational by end of October 2026). A stage is **closed** when all its tasks are `verified` and the gate passes with Jordi. Task files exist only for opened stages.

Live status: `STATUS.md` (generated). Questions and decisions: `MESSAGES.md`. Open product decisions and applied assumptions: `docs/DECISIONS_PENDENTS.md`. The backend contract comes from the `agilityhub-core-api` repository (`docs/openapi/openapi.json`).

## E0 · Foundations (thread B, C for W08) — OPEN

Order: W01 → W02 ∥ W03 → W04 → W05 → W06 → W07 → W09 · W08 when Jordi provides the course-builder root.

| ID | Task | Depends on |
|---|---|---|
| E0-W01 | Monorepo skeleton, tooling, color lint | repo created |
| E0-W02 | `packages/ui`: tokens, BrandingProvider, components, icons from the mockups | W01 |
| E0-W03 | `packages/i18n`: ICU, formats, parity/vocabulary checks | W01 |
| E0-W04 | `packages/api-client`: generated types, client, ApiError, MSW | W01 (+ api E0-T12 soft) |
| E0-W05 | `packages/auth`: session, encrypted refresh, guards (decision A1) | W04 |
| E0-W06 | Shells of the three apps, themed per host, gated by modules/roles (T-02-14) | W02, W03, W04, W05 |
| E0-W07 | Front CI (lint, typecheck, tests, i18n, generated diff, e2e, size) | W06 |
| E0-W08 | Recover `course-core` + `shared-types` from the web-planner | W01, Jordi |
| E0-W09 | Playbook «screen from mockup» + checklist | W06, W07 |

### Gate E0 (front part)
- [ ] The three shells render with the theme of the host's club **before first paint**, the navigation matches the mockups (6 tabs / sidebar groups) and hides disabled modules and unauthorised entries.
- [ ] CI green: lint (incl. color rule), typecheck, tests, `i18n:check`, generated types diff, e2e, size budget.
- [ ] Gallery screenshots in both themes; shell screenshots at 375 px and 1280 px committed under `roadmap/evidence/E0-W06/`.
- [ ] `course-core` + `shared-types` in the monorepo with tests green (or explicitly deferred).
- [ ] Playbook written.

## E1 · AgilityHub ID (front part) — OPENED 2026-09-06 (E1-W01 ready; W02–W04 open when the api contract E1-T01 lands)
Planned: E1-W01 screens 01 (access), 02 (first access), 03b (profile choice), rows of 12 (password, language, sessions, sign out), impersonation banner, admin login with magic link · E1-W02 onboarding «Completa el teu perfil» · E1-W03 `apps/id` (login, magic link, set password, account, products) · E1-W04 e2e + screenshots next to `docs/pantalles/mobil/01, 02, 03b, 12`. · E1-W05 footer from `branding.club.city` (removes the club literal left by E1-W01; organizer 06-09). · E1-W06 adopt the verified api OpenAPI snapshot (replace the stub, regenerate types, fixture-vs-schema contract test) before E1-W04.

Added 09-09: **E1-W07** cookie mode for `packages/auth` (A1: refresh token in an HttpOnly cookie behind the same-site proxy; WebCrypto storage removed) before E1-W04.

## E2 · Census and catalogs (front with MSW until the backend lands) — E2-W01 OPENED 2026-09-06 (build against the S03 §6 contract in the stub; regenerate when api E2-T01 lands)
Planned: E2-W01 `UniversalList` (D5/D15: search, status chips, universal column filter with active indicator, draggable columns, saved views, export) · E2-W02 D10 member record + dog record · E2-W03 mobile 13 + 28 · E2-W04 D16 rings · D17 team · D11 level/FAQ cards · D8 plans · E2-W05 D11 parameters generated from the catalog · E2-W06 audit + exports UI · E2-W07 integration e2e against staging.

Added 06-09: **E2-W08** adopt the verified api E2 snapshot (`openapi.next.json` → `openapi.json`, prune `pending.json`, align fixtures/consumers) before E2-W07.
Added 09-09: **E2-W09** D11 «Pàgines del club» editor + screen 30 «Info» tabs (`ClubPage` contract of api E2-T12; opens after E2-W05 and E2-T12).
Added 09-09: **E2-W10** CI e2e independence (each Playwright project starts the servers it needs; `pnpm e2e` deterministic on the runner) — the last step to a green `main`.

## E3 · Public signup + dashboard (thread B) — task files installed 09-09 (`not_open`; the organizer opens E3-W01 at gate E2 or as soon as api E3-T01 publishes the contract)
Planned: E3-W01 public stepper 16–19 (`/apuntat-hi/*`) + «add a dog» (`/gossos/nou*`), mocks-first on the S04 contract (T-04-29…32) · E3-W02 D2 `/preinscripcions/:id` + D1 `/tauler` (KPIs, risk card, pending card, dogs-by-level chart, menu counters; T-04-33, T-14-25) · E3-W03 integration against the real core (adopt the E3 snapshot; T-04-34 scenarios; gate E3 front).

### Gate E3 (front — checked by the organizer)
- [ ] `pnpm e2e:core` green with the E3 scenarios (public signup → D1 → D2 → welcome mail → screen 03; rejection; add-dog → N-37; closed form).
- [ ] Screenshots of 16–19, enviada, D1, D2 against the mockups; `signup`, `admin-dashboard`, `admin-census` keys complete in ca/es/en; vocabulary lint green.
- [ ] No S04/S14 operation left in `pending.json`; CI green.

## E4 → E12 (summary)
E4 D3/D3b/D4/D4b/D4c + 10/23 + D7 + activities in 04 · E5 03/04/06/07/29 bookings + 08/24 training + D12 card · E6 20/21/22/25/26 + D12/D13/D14 · E7 D9, 11, 12, 30, push · E8 D6, 12/receipts, 14/15, D10 drawers, «Inactivitats i baixes», remittances · E9 course-ui, D18, D16 geometry, mobile viewer/registration/build session · E10 D19 console · E11 hardening, Lighthouse, e2e, QA with Josep · E12 go-live support.
