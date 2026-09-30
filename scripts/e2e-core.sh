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

core_image="ghcr.io/jboixtcm/agilityhub-core-api:main"
if ! docker image inspect "$core_image" >/dev/null 2>&1; then
  echo "The published core image is not available locally: $core_image" >&2
  exit 1
fi
# E5-W04 review #5: the run's log names the core image it ran on (its revision label and creation
# date) and the seed files it carries, so the evidence of each run proves both.
echo "core image: $core_image $(docker image inspect "$core_image" \
  --format '{{.Architecture}} revision={{index .Config.Labels "org.opencontainers.image.revision"}} created={{.Created}}')"
echo "core image seeds (/app/seeds): $(docker run --rm --entrypoint /bin/ls "$core_image" /app/seeds | tr '\n' ' ')"

# E4-W05: the demo seed anchors its planning on the club-local Monday of the current week
# (`seed:demo --week-start`, api E4-T05); the E4 spec reads the same date. The Cànic's zone.
club_today="$(TZ=Europe/Madrid date +%F)"
days_since_monday="$(( $(TZ=Europe/Madrid date +%u) - 1 ))"
if ! club_monday="$(date -j -v-"${days_since_monday}"d -f %F "$club_today" +%F 2>/dev/null)"; then
  club_monday="$(date -d "$club_today - $days_since_monday days" +%F)"
fi
export E4_WEEK_START="${E4_WEEK_START:-$club_monday}"
echo "E4_WEEK_START=$E4_WEEK_START (club-local Monday, Europe/Madrid)"
# E5-W04: the E5 scenario of the demo seed (api E5-T06, `scenario:` of `demo-canic.yaml`) lives on
# week 0 and needs every day of it ahead: `seed:demo` applies it only when `--week-start` is the
# run's club-local Monday or later. So the E5 stage seeds from the next Monday (a week ahead on a
# Monday): its spec sets the core's test clock to the scenario's `demoNow` (Monday 07:00 of that
# week), always ahead of the browsers' own clock, which the run never fakes.
days_to_monday="$(( 8 - $(TZ=Europe/Madrid date +%u) ))"
if ! next_monday="$(date -j -v+"${days_to_monday}"d -f %F "$club_today" +%F 2>/dev/null)"; then
  next_monday="$(date -d "$club_today + $days_to_monday days" +%F)"
fi
export E5_WEEK_START="${E5_WEEK_START:-$next_monday}"
echo "E5_WEEK_START=$E5_WEEK_START (the club-local Monday after today, Europe/Madrid)"
# The seed's `--week-start` of a stage (`docker-compose.yml`): E4's Monday unless a stage says so.
export SEED_WEEK_START="$E4_WEEK_START"

mkdir -p "$evidence_directory"
export E1_CORE_PASSWORD="${E1_CORE_PASSWORD:-$(openssl rand -hex 24)}"
export CORE_EVIDENCE_SUBDIRECTORY="$evidence_subdirectory"
export COMPOSE_PROJECT_NAME="$core_project_name"

cleanup() {
  docker compose -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# E4-W14: the tail of the seed container's log goes to the evidence folder (`seed-<stage>.log`), so a
# run proves what the seed did with its options (`seed:demo --week-start`); the run's generated
# password never reaches the file.
save_seed_log() {
  docker compose -f "$compose_file" logs --no-color --no-log-prefix --tail=200 seed 2>&1 \
    | sed "s/${E1_CORE_PASSWORD}/[redacted]/g" >"$evidence_directory/seed-$1.log" || true
  echo "seed log: $evidence_directory/seed-$1.log ($(wc -l <"$evidence_directory/seed-$1.log" | tr -d ' ') lines)"
}

run_core_suite() {
  # `run_core_suite <stage> || status=$?` turns `set -e` off in here: a core that does not start
  # stops the stage (its seed log is kept all the same).
  local up_status=0
  docker compose -f "$compose_file" up -d --wait mongo seed core || up_status=$?
  save_seed_log "$1"
  if [[ "$up_status" -ne 0 ]]; then
    return "$up_status"
  fi
  # E4-W16 round 2: `--no-deps`, because the stack is already up and seeded. Without it `run` walks
  # `depends_on` (core → activate-demo-club → seed) and starts the exited seed again next to the
  # running core, and that second `seed:demo` fails now and then (runs 91 and 94 of E4-W16).
  docker compose -f "$compose_file" --profile e2e run --rm --no-deps playwright
}

check_n37_notification() {
  docker compose -f "$compose_file" exec -T mongo mongosh --quiet \
    mongodb://localhost:27017/agilityhub_e1_web --eval '
      // E4-W16 round 2 (organizer 28-09): since api E7-T02 an engine notification has the S11
      // shape: recipient.accountId, deliveries[{channel, status}] (APP is born DELIVERED) and
      // action{type, params}; the dog name is one of its variables.
      const account = db.accounts.findOne({email: "nora.e3@example.test"});
      const dogName = "Neret E3";
      const appDelivered = (item) =>
        (item.deliveries ?? []).some((delivery) => delivery.channel === "APP" && delivery.status === "DELIVERED");
      const notification = account === null ? null : db.notifications
        .find({
          "recipient.accountId": account._id,
          code: "N-37",
          "action.type": "OPEN_DOG",
          deliveries: {$elemMatch: {channel: "APP", status: "DELIVERED"}}
        })
        .toArray()
        .find((item) => EJSON.stringify(item.variables ?? {}).includes(dogName)) ?? null;
      if (notification === null) {
        // Say what the core stored for the account in S11 terms (codes, deliveries, action types
        // and the variable names only), and the flat SYSTEM rows too.
        const stored = account === null ? [] : db.notifications
          .find({$or: [{"recipient.accountId": account._id}, {accountId: account._id}]})
          .toArray()
          .map((item) => ({
            action: item.action?.type ?? null,
            appDelivered: appDelivered(item),
            code: item.code ?? null,
            deliveries: (item.deliveries ?? []).map((delivery) => ({channel: delivery.channel ?? null, status: delivery.status ?? null})),
            flat: item.recipient === undefined ? {channel: item.channel ?? null, status: item.status ?? null} : null,
            recipient: Object.keys(item.recipient ?? {}).sort(),
            variables: Object.keys(item.variables ?? {}).sort()
          }));
        print(EJSON.stringify({account: account !== null, missing: "N-37 recipient.accountId, APP DELIVERED, OPEN_DOG, Neret E3", stored}));
        quit(1);
      }
      print(EJSON.stringify({
        action: notification.action.type,
        code: notification.code,
        deliveries: notification.deliveries.map((delivery) => ({channel: delivery.channel, status: delivery.status})),
        dogName,
        recipient: Object.keys(notification.recipient).sort(),
        variables: Object.keys(notification.variables ?? {}).sort()
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
  run_core_suite e1-e2 || status=$?
  cleanup
  # E4-W16: the audit corrections (impersonation handoff, export drawer, D10, 13, recovery) on a
  # fresh core and seed: after E1/E2 the api's authentication quota per IP is spent (429).
  export CORE_TEST_FILES="e4w16-core.spec.ts"
  run_core_suite e4w16 || status=$?
  cleanup
  export CORE_TEST_FILES="e3-signup.spec.ts"
  run_core_suite e3 || status=$?
  check_n37_notification || status=1
  cleanup
  export CORE_TEST_FILES="e4-core.spec.ts"
  run_core_suite e4 || status=$?
  cleanup
  # E5-W04: bookings, waitlist, training and processes on their own fresh seed (they change it).
  export CORE_TEST_FILES="e5-core.spec.ts"
  export SEED_WEEK_START="$E5_WEEK_START"
  run_core_suite e5 || status=$?
else
  export CORE_TEST_FILES="$2"
  if [[ "$2" == *e5-core* ]]; then
    export SEED_WEEK_START="$E5_WEEK_START"
  fi
  run_core_suite files || status=$?
fi

exit "$status"
