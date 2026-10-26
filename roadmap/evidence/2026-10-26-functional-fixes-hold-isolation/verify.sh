#!/usr/bin/env bash
set -euo pipefail
corepack pnpm exec eslint apps/clubs/src/booking/test-utils.tsx apps/clubs/src/booking/test-utils.test.tsx --max-warnings 0 --config eslint.config.mjs
corepack pnpm --filter clubs exec tsc --noEmit
corepack pnpm exec prettier --check apps/clubs/src/booking/test-utils.tsx apps/clubs/src/booking/test-utils.test.tsx
git diff --check -- apps/clubs/src/booking/test-utils.tsx apps/clubs/src/booking/test-utils.test.tsx
