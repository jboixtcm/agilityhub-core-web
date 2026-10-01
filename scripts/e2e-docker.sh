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

# `pnpm e2e:docker <ID> [--] <Playwright arguments>` (E4-W12): the arguments after the task id go to
# every app's `playwright test` (for example `--repeat-each=20 --grep=… --pass-with-no-tests`);
# without them the complete suite runs, as before. The task id itself is informative only.
#
# `--capture-task=<ID>` (E5-W05 round 2, review #10), anywhere among those arguments, is the
# script's own and never reaches Playwright: the permanent mock specs that take screenshots
# (`booking.spec.ts`, `instructor-registrants.spec.ts`, `e5-backoffice.spec.ts`) write them into
# `roadmap/evidence/$E2E_CAPTURE_TASK`, by default the task that owns each spec (E5-W01, E5-W03),
# so a later complete run never rewrites another task's captures. The option goes into the
# container as `--env E2E_CAPTURE_TASK=<ID>`, and its task joins the evidence copied back. Without
# it a host `E2E_CAPTURE_TASK` is forwarded the same way. (`turbo.json` passes the variable to the
# `e2e` tasks: turbo's strict env mode drops any undeclared one.)
#   pnpm e2e:docker E5-W05 --capture-task=E5-W05
capture_task="${E2E_CAPTURE_TASK:-}"
playwright_args=()
if [[ $# -gt 1 ]]; then
  for argument in "${@:2}"; do
    case "$argument" in
      --) ;;
      --capture-task=*) capture_task="${argument#--capture-task=}" ;;
      *) playwright_args+=("$argument") ;;
    esac
  done
fi
capture_env=()
if [[ -n "$capture_task" ]]; then
  if [[ ! "$capture_task" =~ ^E[0-9]+-W[0-9]+$ ]]; then
    echo "--capture-task takes a task id (E5-W05), not: $capture_task" >&2
    exit 2
  fi
  capture_env=(--env "E2E_CAPTURE_TASK=$capture_task")
  case " $evidence_tasks " in
    *" $capture_task "*) ;;
    *) evidence_tasks="${evidence_tasks:+$evidence_tasks }$capture_task" ;;
  esac
fi

echo "Running Playwright in $playwright_image"
echo "Evidence copied back for: ${evidence_tasks:-<no task>}"
# (No apostrophe inside the `${…:-…}` below: bash reads it as an opening quote there.)
echo "Capture folder of the permanent mock specs: ${capture_task:-<the task of each spec>}"
if [[ ${#playwright_args[@]} -eq 0 ]]; then
  echo "Playwright arguments: <none, complete suite>"
else
  echo "Playwright arguments: ${playwright_args[*]}"
fi
docker run --rm \
  --env CI=1 \
  --env EVIDENCE_TASKS="$evidence_tasks" \
  ${capture_env[@]+"${capture_env[@]}"} \
  --volume "$repository_root:/src:ro" \
  --volume "$evidence_directory:/evidence" \
  --workdir /work \
  "$playwright_image" \
  sh -c '
    set -eu
    # Not copied: the roadmap kit files (`.roadmap-*`, the executor log reached 400 MB on 24-09)
    # and the stray `.pnpm-store` of 06-09 (390 MB) that no config uses.
    tar \
      --exclude=.git \
      --exclude=".roadmap-*" \
      --exclude=.pnpm-store \
      --exclude=.turbo \
      --exclude=dist \
      --exclude=node_modules \
      --exclude=playwright-report \
      --exclude=test-results \
      -cf - -C /src . | tar -xf - -C /work
    echo "Checkout copied into the container: $(du -sh /work | cut -f1)"
    corepack enable
    pnpm install --frozen-lockfile
    touch /tmp/e2e-started
    e2e_status=0
    if [ "$#" -gt 0 ]; then
      pnpm exec turbo run e2e --concurrency=1 -- "$@" || e2e_status=$?
    else
      pnpm e2e || e2e_status=$?
    fi
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
  ' sh ${playwright_args[@]+"${playwright_args[@]}"}
