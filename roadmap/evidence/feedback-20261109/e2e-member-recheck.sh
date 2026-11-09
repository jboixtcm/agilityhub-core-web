#!/bin/sh
set -eu
# Reuse the exact source and dependency tree from the complete four-workspace run.
VITE_MOCK=1 pnpm --filter clubs exec vite --host 0.0.0.0 --port 4173 --strictPort >/tmp/clubs-preview.log 2>&1 &
pnpm --filter clubs-admin exec vite preview --host 0.0.0.0 --port 4174 --strictPort >/tmp/admin-preview.log 2>&1 &
node --input-type=module -e 'for(const p of [4173,4174]){let ok=false;for(let n=0;n<100;n++){try{ok=(await fetch(`http://127.0.0.1:${p}`)).ok}catch{}if(ok)break;await new Promise(r=>setTimeout(r,200));}if(!ok)process.exit(1);}'
result=0
pnpm --filter clubs e2e --workers=2 || result=1
cp /work/roadmap/evidence/feedback-20261109/*.png /evidence/
exit "$result"
