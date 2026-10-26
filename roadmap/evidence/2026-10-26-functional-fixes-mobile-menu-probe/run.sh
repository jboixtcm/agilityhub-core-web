#!/usr/bin/env bash
set -euo pipefail
repository_root="$(pwd)"
playwright_version="$(pnpm exec playwright --version)"
playwright_version="${playwright_version#Version }"
docker run --rm --ipc=host --env CI=1 \
  --volume "$repository_root:/src:ro" \
  --volume "$repository_root/roadmap/evidence:/evidence" \
  --workdir /work "mcr.microsoft.com/playwright:v${playwright_version}-noble" sh -c '
    set -eu
    tar --exclude=.git --exclude=".roadmap-*" --exclude=.pnpm-store --exclude=.turbo --exclude=dist --exclude=node_modules --exclude=playwright-report --exclude=test-results -cf - -C /src . | tar -xf - -C /work
    corepack enable
    pnpm install --frozen-lockfile
    pnpm exec playwright test --config=roadmap/evidence/2026-10-26-functional-fixes-mobile-menu-probe/playwright.config.ts
  '
