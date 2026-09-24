#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwright_version="$(cd "$repository_root" && pnpm exec playwright --version)"
playwright_version="${playwright_version#Version }"
playwright_image="mcr.microsoft.com/playwright:v${playwright_version}-noble"
evidence_directory="$repository_root/roadmap/evidence"

# Only the evidence of the task being worked on comes back from the container, and only the
# files this run wrote: the complete suite re-captures every task's screenshots, and copying the
# whole folder back overwrote other tasks' PNGs and the logs the executor was writing next to them.
# Override with E2E_EVIDENCE_TASK="E4-W01 E4-W02"; by default, every task whose status is in_progress.
evidence_tasks="${E2E_EVIDENCE_TASK:-}"
if [[ -z "$evidence_tasks" ]]; then
  for task_file in "$repository_root"/roadmap/tasks/*.md; do
    if grep -q '^status: in_progress$' "$task_file"; then
      evidence_tasks="${evidence_tasks:+$evidence_tasks }$(basename "$task_file" .md)"
    fi
  done
fi

mkdir -p "$evidence_directory"

echo "Running Playwright in $playwright_image"
echo "Evidence copied back for: ${evidence_tasks:-<no task>}"
docker run --rm \
  --env CI=1 \
  --env EVIDENCE_TASKS="$evidence_tasks" \
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
    touch /tmp/e2e-started
    e2e_status=0
    pnpm e2e || e2e_status=$?
    for task in $EVIDENCE_TASKS; do
      task_directory="/work/roadmap/evidence/$task"
      [ -d "$task_directory" ] || continue
      (cd "$task_directory" && find . -type f -newer /tmp/e2e-started) | while read -r file; do
        mkdir -p "/evidence/$task/$(dirname "$file")"
        cp "$task_directory/$file" "/evidence/$task/$file"
        echo "evidence: $task/${file#./}"
      done
    done
    exit "$e2e_status"
  '
