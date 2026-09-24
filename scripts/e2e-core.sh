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

cleanup
# Optional second argument: run only these spec files in one seeded stage (`pnpm e2e:core E3-W03 e3-signup.spec.ts`).
if [[ -n "${2:-}" ]]; then
  export CORE_TEST_FILES="$2"
  run_core_suite
elif [[ "$evidence_subdirectory" == "E3-W03" ]]; then
  export CORE_TEST_FILES="e1-core.spec.ts e2-core.spec.ts"
  run_core_suite
  cleanup
  export CORE_TEST_FILES="e3-signup.spec.ts"
  run_core_suite
else
  run_core_suite
fi

if [[ "$evidence_subdirectory" == "E3-W03" ]]; then
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
    ' | tee "$evidence_directory/n37-notification.json"
fi
