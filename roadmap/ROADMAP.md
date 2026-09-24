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

Added 24-09: **E3-W04** follow-ups after the gate (D2 polish from the E3-W03 review, one masked-IBAN format R-03-27, null-tolerant D2, INC-07 evidence in the real-core e2e).

### Gate E3 (front — checked by the organizer)
- [x] `pnpm e2e:core` green with the E3 scenarios (public signup → D1 → D2 → welcome mail → screen 03; rejection; add-dog → N-37; closed form). — organizer 24-09: E3-W03 round 2, `12-e2e-core.log` (10/10 + 4/4).
- [x] Screenshots of 16–19, enviada, D1, D2 against the mockups; `signup`, `admin-dashboard`, `admin-census` keys complete in ca/es/en; vocabulary lint green. — organizer 24-09: D2 re-shot in round 2; the two cosmetic leftovers (success toast tone, «fa 0 dies») go to E3-W04.
- [x] No S04/S14 operation left in `pending.json`; CI green. — organizer 24-09: `pending.json` has no S04/S14 path; CI green at `68e6fb8`.

## E4 · Planning and activities (thread B) — installed 2026-09-16 as `not_open`; E4-W01/W03/W04 open when api E4-T01 (contracts S06 + S07) is verified and its snapshot is staged
Decisions in force: A21, A22 (instructor reads D3/D4; single automatic description form «B+C» / «D i sup.»; the student never sees counts on 10), B20. Planned tasks: E4-W01 D3 + D3b (templates, class form, coverage) · E4-W02 D4/D4b/D4c (calendar, validation, class edition, D4c cancellation modal, ring blocks) · E4-W03 screens 10 + 23 (`DayGrid` in `packages/ui`) · E4-W04 D7 + activities in the app (04 block, detail, rows of 03/25) · E4-W05 integration against the published core with the E4 seed (T-06-28, T-07-32) — gate E4 (front).

### Gate E4 (front — checked by the organizer)
- [ ] `e2e:core` E4 scenario green: generate from «Setmana A» + «Dissabtes» → validate → cancel the Wednesday 18:50 class with 4 registrants from D4c → the student sees it on 10/25; publish an activity → block on D4 → block on 04 → register → FIFO promotion.
- [ ] Screenshots of D3/D3b/D4/D4b/D4c/D7 at 1280 and 10/23/04/detail/03/25 at 375 compared with the mockups (A22 d/e deviations only).
- [ ] Complete `pnpm e2e` green; CI green.

## E5 · E6 · E7 · E8 — INSTALLED 2026-09-19 (organizer-less mode: all tasks `ready`, chained by `depends_on`)
E5 W01 screens 03/04/06/29/07 (bookings + waitlist), W02 screen 08 + 24 + D12 card (free training, `SlotGrid`), W03 back-office (D4/23 registrants panel, `/entrenaments` register, D10 bookings card, D11 «Processos automàtics» + D1 risk card), W04 integration · E6 W01 20/21/22, W02 25/26/D13, W03 D12 agenda + PDF and D14, W04 integration · E7 W01 D9 templates + announcements + log + D10 block, W02 screens 11/12/30 + push, W03 integration · E8 W01 D6 + remittances + accounting export, W02 12/rebuts + 13 pack + 14/15, W03 D10 drawers + «Inactivitats i baixes», W04 integration. The session wrapper stages the api snapshot automatically (`openapi.next.json`); each screen task's step 0 adopts it or goes mocks-first.

## E9 → E12 (summary)
E5 03/04/06/07/29 bookings + 08/24 training + D12 card · E6 20/21/22/25/26 + D12/D13/D14 · E7 D9, 11, 12, 30, push · E8 D6, 12/receipts, 14/15, D10 drawers, «Inactivitats i baixes», remittances · E9 course-ui, D18, D16 geometry, mobile viewer/registration/build session · E10 D19 console · E11 hardening, Lighthouse, e2e, QA with Josep · E12 go-live support.
