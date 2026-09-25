#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repository_root/scripts/core-stack/docker-compose.yml"
# Optional first argument: evidence subdirectory (`pnpm e2e:core E3-W03`), same as CORE_EVIDENCE_SUBDIRECTORY.
evidence_subdirectory="${1:-${CORE_EVIDENCE_SUBDIRECTORY:-E1-W04}}"
evidence_directory="${CORE_EVIDENCE_DIRECTORY:-$repository_root/roadmap/evidence/$evidence_subdirectory}"
# One compose project per task id (`agilityhub-e4-w05`); `agilityhub-e1-w04` without an id, as before.
default_project_name="agilityhub-$(printf '%s' "$evidence_subdirectory" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
core_project_name="${CORE_PROJECT_NAME:-${E1_CORE_PROJECT_NAME:-$default_project_name}}"

# Core URL visible from the Playwright container; defaults to the local stack.
export CORE_URL="${CORE_URL:-http://core:8080}"

if ! docker image inspect ghcr.io/jboixtcm/agilityhub-core-api:main >/dev/null 2>&1; then
  echo "The published core image is not available locally: ghcr.io/jboixtcm/agilityhub-core-api:main" >&2
  exit 1
fi

# E4-W05: the demo seed anchors its planning on the club-local Monday of the current week
# (`seed:demo --week-start`, api E4-T05); the E4 spec reads the same date. The Cànic's zone.
club_today="$(TZ=Europe/Madrid date +%F)"
days_since_monday="$(( $(TZ=Europe/Madrid date +%u) - 1 ))"
if ! club_monday="$(date -j -v-"${days_since_monday}"d -f %F "$club_today" +%F 2>/dev/null)"; then
  club_monday="$(date -d "$club_today - $days_since_monday days" +%F)"
fi
export E4_WEEK_START="${E4_WEEK_START:-$club_monday}"
echo "E4_WEEK_START=$E4_WEEK_START (club-local Monday, Europe/Madrid)"

mkdir -p "$evidence_directory"
export E1_CORE_PASSWORD="${E1_CORE_PASSWORD:-$(openssl rand -hex 24)}"
export CORE_EVIDENCE_SUBDIRECTORY="$evidence_subdirectory"
export COMPOSE_PROJECT_NAME="$core_project_name"

cleanup() {
  docker compose -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

run_core_suite() {
  # `run_core_suite || status=$?` turns `set -e` off in here: a core that does not start stops the stage.
  docker compose -f "$compose_file" up -d --wait mongo seed core || return $?
  docker compose -f "$compose_file" --profile e2e run --rm playwright
}

check_n37_notification() {
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
}

# E1/E2 stage, then the E3 signup stage and the E4 planning/activities stage, each on a fresh seed,
# whatever the task id (E3-W11 step 0, E4-W05 steps 1 and 7): run after another stage on the same
# seed, the E3 stage fails its refresh (E4-W07 report), and E2 blocks the bookings of the member
# account and edits parameters that E4 reads.
# Optional second argument: run only these spec files in one seeded stage (`pnpm e2e:core E3-W03 e3-signup.spec.ts`).
staged=true
if [[ -n "${2:-}" ]]; then
  staged=false
fi

# INC-07: every run starts a fresh oauth-token-calls.log; each stage appends its framed calls.
: > "$evidence_directory/oauth-token-calls.log"

cleanup
# A failing stage does not hide the next one: all run, and the script exits with the failure.
status=0
if [[ "$staged" == true ]]; then
  export CORE_TEST_FILES="e1-core.spec.ts e2-core.spec.ts"
  run_core_suite || status=$?
  cleanup
  export CORE_TEST_FILES="e3-signup.spec.ts"
  run_core_suite || status=$?
  check_n37_notification || status=1
  cleanup
  export CORE_TEST_FILES="e4-core.spec.ts"
  run_core_suite || status=$?
else
  export CORE_TEST_FILES="$2"
  run_core_suite || status=$?
fi

exit "$status"
