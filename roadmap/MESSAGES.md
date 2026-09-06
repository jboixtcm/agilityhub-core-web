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
