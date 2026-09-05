# AGENTS.md — agilityhub-core-web

You are the **executor** agent for this repository. Your work is organised by the **organizer** agent through `roadmap/`. Read this file, then `roadmap/README.md`, then `roadmap/STATUS.md`, then `roadmap/MESSAGES.md`. Do exactly one roadmap task per session.

## What this repository is

The frontend monorepo of the AgilityHub platform (pnpm 9 + Turborepo, React 19, TypeScript strict, Vite, Tailwind 4, TanStack Query, react-i18next + ICU, Vitest + Testing Library, Playwright, MSW):

- `apps/clubs` — the students' PWA (mobile-first; screens 01–30 of the mobile mockups). Served per club host (e.g. `app.agilitycanic.cat`, `clubs.agilitydoghub.com`).
- `apps/clubs-admin` — the club backoffice (desktop; screens D1–D19) + platform console.
- `apps/id` — AgilityHub ID pages (login, magic link, account, products).
- `packages/ui` (design tokens → CSS variables per club, components, icons), `packages/i18n` (ca/es/en, ICU, formats), `packages/api-client` (types generated from the core OpenAPI, fetch client, TanStack hooks, MSW mocks), `packages/auth` (session, encrypted refresh token, guards), `packages/course-core` + `packages/course-ui` (course platform, recovered from the web-planner).

The backend is `agilityhub-core-api` (`https://core.agilitydoghub.com/api/v1`); its OpenAPI snapshot is the contract (`docs/openapi/openapi.json` in that repo; copied here by `pnpm api:generate`).

## Where the truth is (inside `docs/`, synced from the project documentation)

- `docs/pantalles/mobil/*.html|png` (32 screens) and `docs/pantalles/escriptori/*.html|png` (20 screens) — **the approved mockups**. Pixel fidelity in `ca` is the goal; the HTML contains the exact microcopy, colors and icons. Never invent copy: take it from the mockup, or from the spec's proposed literals (§2 / §13), and flag anything else.
- `docs/specs/S01…S20-*.md` — specs per vertical (Catalan): screen → route → role → API table (§2), rules `R-xx-nn`, states, tests `T-xx-nn`, work packages. `docs/specs/00-transversal/CONVENCIONS_I18N.md` (locales, ICU, formats, forbidden vocabulary), `CONVENCIONS_API.md` (error JSON, lists, filters), `MATRIU_PERMISOS.md`, `CATALEG_MODULS.md` (module → UI map), `CATALEG_ERRORS.md` (every code needs a message in 3 locales).
- `docs/PLA_FRONTEND.md` — apps/packages, design system, screen → route → spec map. `docs/MODEL_DADES_PLATAFORMA.md` §0 — glossary of code names. `docs/DECISIONS_PENDENTS.md` — open decisions and the assumption applied (do not re-decide).

## Hard rules

1. **Copy from the mockups** in Catalan; `es` and `en` in the same task; every string through i18n (`t('ns:key')`), never a literal in JSX. Forbidden words anywhere in UI text: «parella/parelles», «amigable», «(paràmetre)», requirement codes like `F8`, `RF-`, `BR-`. Attendance red state is «no presentat».
2. **No literal colors** outside `packages/ui/src/tokens.css`; everything themed through CSS variables (`--ah-*`) so each club's theme applies. Lint enforces it.
3. **Modules and roles gate the UI**: routes, tabs and menu entries come from `packages/ui/src/modules.ts` and `RequireRole`/`RequireModule`; a disabled module shows nothing (no dead links).
4. **Types from OpenAPI** (`packages/api-client/src/generated`), never hand-written API types. Errors are `ApiError {code, message, details, traceId}`; map codes to i18n messages.
5. **Tests in the same task**: Vitest for logic/components, Playwright for flows, names after the spec ids (`T-02-14`). MSW handlers for every endpoint a screen uses.
6. **Accessibility**: labels, roles, focus order, contrast AA; mobile 375 px and desktop 1280 px layouts checked with screenshots next to the mockup PNG.
7. **No secrets or personal data** in the repo. Fixtures use fictional people.
8. **Do not** modify `roadmap/ROADMAP.md`, other tasks' files, or the *Organizer verification* sections. Do not mark anything `verified`.

## Commands

| Purpose | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Everything CI runs | `pnpm turbo run lint typecheck test build` |
| i18n parity + forbidden vocabulary + unused keys | `pnpm i18n:check` |
| Regenerate API types from the core snapshot | `pnpm api:generate` (path via `API_SPEC`) |
| Dev with mocks | `VITE_MOCK=1 pnpm --filter clubs dev` (same for `clubs-admin`, `id`) |
| E2E | `pnpm --filter clubs e2e` |
| Roadmap | `python3 roadmap/tools/check.py --render` · `--set <ID> <status>` · `--next` |

Use `docs/playbooks/*.md` (written in task E0-W09) for the pattern "build a screen from its mockup".

## Session protocol (short form — full text in `roadmap/README.md`)

1. `python3 roadmap/tools/check.py --next` → take that task (or a `changes_requested` one first). Read its file completely.
2. Branch `feat/<ID>-<slug>` from `main`; `check.py --set <ID> in_progress` and `check.py --field <ID> branch <name>`; commit `chore(roadmap): start <ID>`.
3. Implement following the task's **Steps**; open only the files under **Context to load** plus the code you touch.
4. Run every **Verification** command; paste **full outputs** and attach screenshots (`roadmap/evidence/<ID>/*.png`, committed) in the task's **Executor report**.
5. Fill the report, update `CHANGELOG.md`, `check.py --set <ID> awaiting_verification`, commit `chore(roadmap): <ID> awaiting verification`. Do not push: the publish script fast-forwards `main` with your branch and pushes after the session (CI runs on `main`).
6. Blocked? `check.py --set <ID> blocked` + entry in `roadmap/MESSAGES.md` addressed to `@organizer` or `@jordi`. Stop.

## Communication style

English, concrete and short: command + output, file paths, spec ids, screenshot paths. A question is one paragraph with the assumption you took meanwhile.
