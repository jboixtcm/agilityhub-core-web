#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repository_root/scripts/core-stack/docker-compose.yml"
# Optional first argument: evidence subdirectory (`pnpm e2e:core E3-W03`), same as CORE_EVIDENCE_SUBDIRECTORY.
evidence_subdirectory="${1:-${CORE_EVIDENCE_SUBDIRECTORY:-E1-W04}}"
evidence_directory="${CORE_EVIDENCE_DIRECTORY:-$repository_root/roadmap/evidence/$evidence_subdirectory}"
core_project_name="${CORE_PROJECT_NAME:-${E1_CORE_PROJECT_NAME:-agilityhub-e1-w04}}"

# Core URL visible from the Playwright container; defaults to the local stack.
export CORE_URL="${CORE_URL:-http://core:8080}"

if ! docker image inspect ghcr.io/jboixtcm/agilityhub-core-api:main >/dev/null 2>&1; then
  echo "The published core image is not available locally: ghcr.io/jboixtcm/agilityhub-core-api:main" >&2
  exit 1
fi

mkdir -p "$evidence_directory"
export E1_CORE_PASSWORD="${E1_CORE_PASSWORD:-$(openssl rand -hex 24)}"
export CORE_EVIDENCE_SUBDIRECTORY="$evidence_subdirectory"
export COMPOSE_PROJECT_NAME="$core_project_name"

cleanup() {
  docker compose -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

run_core_suite() {
  docker compose -f "$compose_file" up -d --wait mongo seed core
  docker compose -f "$compose_file" --profile e2e run --rm playwright
}

# E1/E2 stage, then the E3 signup stage on a fresh seed, whatever the task id (E3-W11 step 0,
# E4-W05 step 7): run after E1/E2 on the same seed, the E3 stage fails its refresh (E4-W07 report).
# Optional second argument: run only these spec files in one seeded stage (`pnpm e2e:core E3-W03 e3-signup.spec.ts`).
staged_e3=true
if [[ -n "${2:-}" ]]; then
  staged_e3=false
fi

# INC-07: every run starts a fresh oauth-token-calls.log; each stage appends its framed calls.
: > "$evidence_directory/oauth-token-calls.log"

cleanup
# A failing stage does not hide the next one: both run, and the script exits with the failure.
status=0
if [[ "$staged_e3" == true ]]; then
  export CORE_TEST_FILES="e1-core.spec.ts e2-core.spec.ts"
  run_core_suite || status=$?
  cleanup
  export CORE_TEST_FILES="e3-signup.spec.ts"
  run_core_suite || status=$?
else
  export CORE_TEST_FILES="$2"
  run_core_suite || status=$?
fi

if [[ "$staged_e3" == true ]]; then
  docker compose -f "$compose_file" exec -T mongo mongosh --quiet \
    mongodb://localhost:27017/agilityhub_e1_web --eval '
      const account = db.accounts.findOne({email: "nora.e3@example.test"});
      const notification = account === null ? null : db.notifications.findOne({
        accountId: account._id,
        channel: "APP",
        code: "N-37",
        status: "SENT",
        "variables.action": "OPEN_DOG",
        "variables.dog_name": "Neret E3"
      });
      if (notification === null) { quit(1); }
      print(EJSON.stringify({
        action: notification.variables.action,
        channel: notification.channel,
        code: notification.code,
        dogName: notification.variables.dog_name,
        status: notification.status
      }));
    ' | tee "$evidence_directory/n37-notification.json" || status=1
fi

exit "$status"
