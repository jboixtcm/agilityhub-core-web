#!/usr/bin/env bash
set -euo pipefail
docker run --rm --name agilityhub-webkit-popup-review-20261026 --ipc=host --env CI=1 \
  --volume "$PWD:/src:ro" \
  --volume "$PWD/roadmap/evidence:/evidence" \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  node /src/roadmap/evidence/2026-10-26-functional-fixes-webkit-popup-probe/popup-policy.cjs
