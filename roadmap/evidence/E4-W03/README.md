# E4-W03 evidence

- `01-turbo-lint-typecheck-test-build.log` — `pnpm turbo run lint typecheck test build`
- `02-i18n-check.log` — `pnpm i18n:check`
- `03-vitest-e4-w03.log` — Vitest T-06-29, T-06-30, `day-grid.test.tsx` and the Ajv fixture suite
- `04-e2e-docker.log` — run 1 of the complete `pnpm e2e` (three projects) in `mcr.microsoft.com/playwright:v1.63.0-noble` (passed; screenshots then showed the 6-tab overlap and a clipped «Ocupada»)
- `05-e2e-docker-final.log` — final complete `pnpm e2e` run after the CSS fixes (passed; the PNGs below come from it)
- Round 2:
  - `06-r2-turbo-lint-typecheck-test-build.log` — `pnpm turbo run lint typecheck test build --force`
  - `07-r2-i18n-check.log` — `pnpm i18n:check`
  - `08a…08e-r2-vitest-*.log` — targeted Vitest runs (clubs, ui, i18n, api-client, clubs-admin)
  - `09-r2-e2e-docker.log` — complete `pnpm e2e` in Docker (`pnpm e2e:docker`); it re-shot the five PNGs byte-identical
- Screenshots (375 × 812): `10-avui-375.png` (balloon open on the 20:00 class), `10-avui-buit-375.png`,
  `10-avui-impersonat-375.png`, `23-visio-global-375.png`, `23-visio-global-classe-375.png` (drawer open)
