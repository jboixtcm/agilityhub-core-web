#!/bin/sh
set -eu
tar --exclude=.git --exclude='.roadmap-*' --exclude=.pnpm-store --exclude=.turbo --exclude=dist --exclude=node_modules --exclude=playwright-report --exclude=test-results -cf - -C /src . | tar -xf - -C /work
corepack enable
pnpm install --frozen-lockfile
pnpm turbo run build --concurrency=2
result=0
pnpm --filter clubs e2e e2e/word-feedback.spec.ts --grep 'text size is remembered' --repeat-each=10 --workers=2 || result=$?
if [ "$result" -ne 0 ] && [ -d /work/test-results ]; then cp -R /work/test-results /evidence/; fi
exit "$result"
