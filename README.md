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
```

Run every continuous-integration check with:

```sh
pnpm turbo run lint typecheck test build
```

Commits use the Conventional Commits format. Husky runs lint-staged before a commit and commitlint for commit messages.
