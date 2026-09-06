#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwright_version="$(cd "$repository_root" && pnpm exec playwright --version)"
playwright_version="${playwright_version#Version }"
playwright_image="mcr.microsoft.com/playwright:v${playwright_version}-noble"
evidence_directory="$repository_root/roadmap/evidence"

mkdir -p "$evidence_directory"

echo "Running Playwright in $playwright_image"
docker run --rm \
  --env CI=1 \
  --volume "$repository_root:/src:ro" \
  --volume "$evidence_directory:/evidence" \
  --workdir /work \
  "$playwright_image" \
  sh -c '
    set -eu
    tar \
      --exclude=.git \
      --exclude=.turbo \
      --exclude=dist \
      --exclude=node_modules \
      --exclude=playwright-report \
      --exclude=test-results \
      -cf - -C /src . | tar -xf - -C /work
    corepack enable
    pnpm install --frozen-lockfile
    e2e_status=0
    pnpm e2e || e2e_status=$?
    cp -R /work/roadmap/evidence/. /evidence/
    exit "$e2e_status"
  '
