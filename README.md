# AgilityHub web

Frontend monorepo for the AgilityHub club applications and shared packages.

## Requirements

- Node.js 22 LTS (`nvm use`)
- pnpm 9 (`corepack enable`)

## Install

```sh
pnpm install --frozen-lockfile
```

## Run an application

```sh
pnpm --filter clubs dev
pnpm --filter clubs-admin dev
pnpm --filter id dev
```

## Quality checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm size-limit
```

Run every continuous-integration check with:

```sh
pnpm turbo run lint typecheck test build
```

The Clubs entry chunk has a 300 kB gzip budget enforced by `pnpm size-limit` after a build.

## Playwright in Docker

Browsers cannot launch in the executor sandbox. Run both the Clubs and Clubs Admin Playwright
suites, with their MSW-backed development servers, in the Playwright image that matches the
installed `@playwright/test` version:

```sh
pnpm e2e:docker
```

The runner copies the workspace without `node_modules` into the container, installs from the
frozen lockfile, runs `pnpm e2e`, and copies `roadmap/evidence/**` back to the host.

## Continuous integration and branch protection

`.github/workflows/ci.yml` runs the complete frontend gate on pushes and pull requests to `main`:
lint, typecheck, unit tests, build, translations, generated API types, Chromium Playwright suites,
and the Clubs bundle-size budget. Playwright screenshots are retained as a workflow artifact for
14 days.

Jordi must enable a `main` branch protection ruleset in GitHub that requires the `Frontend checks`
status check, requires pull requests and resolved review conversations, and prevents bypassing the
required check before merging.

Commits use the Conventional Commits format. Husky runs lint-staged before a commit and commitlint for commit messages.
