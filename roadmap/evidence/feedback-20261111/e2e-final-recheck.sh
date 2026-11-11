#!/bin/sh
set -eu
tar --exclude=.git --exclude=".roadmap-*" --exclude=.pnpm-store --exclude=.turbo --exclude=dist --exclude=node_modules --exclude=playwright-report --exclude=test-results -cf - -C /src . | tar -xf - -C /work
corepack enable
pnpm install --frozen-lockfile
pnpm turbo run build --concurrency=2
VITE_MOCK=1 pnpm --filter clubs exec vite build
VITE_MOCK=1 pnpm --filter clubs-admin exec vite build
VITE_MOCK=1 pnpm --filter id exec vite build
VITE_MOCK=1 pnpm --filter clubs exec vite --host 0.0.0.0 --port 4173 --strictPort >/tmp/clubs-preview.log 2>&1 &
pnpm --filter clubs-admin exec vite preview --host 0.0.0.0 --port 4174 --strictPort >/tmp/admin-preview.log 2>&1 &
pnpm --filter id exec vite preview --host 0.0.0.0 --port 4175 --strictPort >/tmp/id-preview.log 2>&1 &
node --input-type=module -e 'const urls=[4173,4174,4175].map(p=>`http://127.0.0.1:${p}`);for(const url of urls){let ok=false;for(let n=0;n<100;n++){try{ok=(await fetch(url)).ok}catch{}if(ok)break;await new Promise(r=>setTimeout(r,200));}if(!ok)process.exit(1);}'
result=0
pnpm --filter clubs e2e e2e/member-self-service.spec.ts --workers=2 || result=1
pnpm --filter clubs-admin e2e e2e/dashboard-risk.spec.ts --workers=2 || result=1
cp /tmp/*-preview.log /evidence/
if [ -d /work/roadmap/evidence/feedback-20261111 ]; then cp /work/roadmap/evidence/feedback-20261111/*.png /evidence/; fi
if [ "$result" -ne 0 ] && [ -d /work/test-results ]; then cp -R /work/test-results /evidence/; fi
exit "$result"
