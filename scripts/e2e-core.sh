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
# E7-W03 round 2 (step 2): an optional third argument `no-clock` (`pnpm e2e:core E7-W03
# e7-core.spec.ts no-clock`) makes the specs treat `POST /test/clock` as absent, as an image
# without the `test` profile would: the clock steps are skipped with their reason.
export CORE_CLOCK_DETECTION=""
if [[ "${3:-}" == "no-clock" ]]; then
  export CORE_CLOCK_DETECTION="off"
  echo "CORE_CLOCK_DETECTION=off (POST /test/clock treated as absent)"
fi

core_image="ghcr.io/jboixtcm/agilityhub-core-api:main"
if ! docker image inspect "$core_image" >/dev/null 2>&1; then
  echo "The published core image is not available locally: $core_image" >&2
  exit 1
fi
# E5-W04 review #5: the run's log names the core image it ran on (its revision label and creation
# date) and the seed files it carries, so the evidence of each run proves both.
# E7-W03 round 2 #8: the digest too, since a published image may carry no revision label.
echo "core image: $core_image $(docker image inspect "$core_image" \
  --format '{{.Architecture}} revision={{index .Config.Labels "org.opencontainers.image.revision"}} created={{.Created}} digests={{.RepoDigests}}')"
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
# E6-W04: the image's demo seed (fictional people only), kept with the run's evidence, so the core
# specs' seeded rows can be checked against the file the stages seeded from.
docker run --rm --entrypoint /bin/cat "$core_image" /app/seeds/demo-canic.yaml \
  >"$evidence_directory/demo-canic.yaml" || echo "could not read /app/seeds/demo-canic.yaml" >&2
echo "demo seed: $evidence_directory/demo-canic.yaml ($(wc -l <"$evidence_directory/demo-canic.yaml" | tr -d ' ') lines)"
export E1_CORE_PASSWORD="${E1_CORE_PASSWORD:-$(openssl rand -hex 24)}"
export CORE_EVIDENCE_SUBDIRECTORY="$evidence_subdirectory"
export COMPOSE_PROJECT_NAME="$core_project_name"

# E5-W05 step 20 (E5-W04 question R2-3): `down` names the `e2e` profile, so a Playwright one-off
# container (`run playwright`, a service of that profile) left by an interrupted stage goes with
# the stack; without the profile `down` does not see that service's containers.
cleanup() {
  docker compose -f "$compose_file" --profile e2e down --volumes --remove-orphans >/dev/null 2>&1 || true
}
# An INT or TERM cleans up and ends the script (130 / 143): the handler exits instead of returning
# to the script, which went on with the next stage after a TERM (E5-W04 run 46). Bash runs the
# handler once the foreground command (the stage's `docker compose run`) has returned.
stop_on_signal() {
  trap - EXIT INT TERM
  echo "e2e-core: $1 received, cleaning up and exiting" >&2
  cleanup
  exit "$2"
}
trap cleanup EXIT
trap 'stop_on_signal INT 130' INT
trap 'stop_on_signal TERM 143' TERM

# E4-W14: the tail of the seed container's log goes to the evidence folder (`seed-<stage>.log`), so a
# run proves what the seed did with its options (`seed:demo --week-start`); the run's generated
# password never reaches the file.
save_seed_log() {
  docker compose -f "$compose_file" logs --no-color --no-log-prefix --tail=200 seed 2>&1 \
    | sed "s/${E1_CORE_PASSWORD}/[redacted]/g" >"$evidence_directory/seed-$1.log" || true
  echo "seed log: $evidence_directory/seed-$1.log ($(wc -l <"$evidence_directory/seed-$1.log" | tr -d ' ') lines)"
}

run_core_suite() {
  # `run_stage` calls it as `run_core_suite <stage> || …`, which turns `set -e` off in here: a core
  # that does not start stops the stage (its seed log is kept all the same).
  local up_status=0
  docker compose -f "$compose_file" up -d --wait mongo seed core || up_status=$?
  save_seed_log "$1"
  if [[ "$up_status" -ne 0 ]]; then
    return "$up_status"
  fi
  # E4-W16 round 2: `--no-deps`, because the stack is already up and seeded. Without it `run` walks
  # `depends_on` (core → activate-demo-club → seed) and starts the exited seed again next to the
  # running core, and that second `seed:demo` fails now and then (runs 91 and 94 of E4-W16).
  # E5-W05 round 2 (review #8): `-T`, never a pseudo-TTY. In an interactive terminal `run` took one
  # and put the terminal in raw mode, so Ctrl-C reached the container as a keystroke and never the
  # script's INT trap. Nothing in the stage reads a terminal (tar, pnpm and Playwright's `line`
  # reporter under CI=1), and the unattended runs never had a TTY. The service runs under an init
  # (`init: true`, `docker-compose.yml`), so the signal `run` forwards reaches Playwright.
  docker compose -f "$compose_file" --profile e2e run --rm --no-deps -T playwright
}

# E5-W05 round 2 (review #8): a stage that a signal ended (130 after SIGINT, 143 after SIGTERM)
# stops the script there, cleaned up, with that code: `run_core_suite <stage> || status=$?` kept it
# as a failure and started the next stage. Any other failure is recorded and the next stage runs.
run_stage() {
  local stage_status=0
  run_core_suite "$1" || stage_status=$?
  if ((stage_status == 130 || stage_status == 143)); then
    trap - EXIT INT TERM
    echo "e2e-core: stage $1 ended with $stage_status (interrupted), cleaning up and exiting" >&2
    cleanup
    exit "$stage_status"
  fi
  if ((stage_status != 0)); then
    status="$stage_status"
  fi
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

# E6-W04: what the core stored for the E6 stage's notices (N-15 to the waiting dog when «ha avisat»
# frees the seat, N-19 from P3 the next morning). Evidence only, the spec asserts the screens: the
# codes, deliveries, action types and variables (the seed's fictional names and the class's date),
# the recipient's field names, never an address or a token. It never fails the run.
save_e6_notifications() {
  docker compose -f "$compose_file" exec -T mongo mongosh --quiet \
    mongodb://localhost:27017/agilityhub_e1_web --eval '
      const pick = (item) => ({
        action: item.action?.type ?? null,
        code: item.code ?? null,
        createdAt: item.createdAt ?? null,
        deliveries: (item.deliveries ?? []).map((delivery) => ({channel: delivery.channel ?? null, status: delivery.status ?? null})),
        recipient: Object.keys(item.recipient ?? {}).sort(),
        variables: item.variables ?? {}
      });
      const notices = db.notifications.find({code: {$in: ["N-15", "N-19"]}}).sort({createdAt: 1}).toArray().map(pick);
      const byCode = db.notifications.aggregate([{$group: {_id: "$code", count: {$sum: 1}}}, {$sort: {_id: 1}}]).toArray();
      print(EJSON.stringify({byCode, notices}, null, 2));
    ' >"$evidence_directory/e6-notifications.json" 2>&1 \
    || echo "could not read the E6 notifications" >&2
  echo "e6 notifications: $evidence_directory/e6-notifications.json"
}

# E7-W03: what the core stored for the E7 stage's notices (N-08a of the classes cancelled at D4c,
# N-13 of the reminders process, the announcements of «Enviar comunicat»), the N-08a template's
# state and the push subscriptions. Evidence only, the spec asserts the screens: codes, audiences,
# locales, delivery channels and statuses, action types, variable NAMES, the recipient's field
# names — never an address, a phone, a delivery target, a provider reference, a token, an endpoint
# or a body. It never fails the run.
save_e7_notifications() {
  docker compose -f "$compose_file" exec -T mongo mongosh --quiet \
    mongodb://localhost:27017/agilityhub_e1_web --eval '
      const pick = (item) => ({
        action: item.action?.type ?? null,
        audience: item.audience ?? null,
        category: item.category ?? null,
        code: item.code ?? null,
        createdAt: item.createdAt ?? null,
        deliveries: (item.deliveries ?? []).map((delivery) => ({
          attempts: delivery.attempts ?? null,
          channel: delivery.channel ?? null,
          providerRef: delivery.providerRef == null ? null : "present",
          status: delivery.status ?? null
        })),
        locale: item.locale ?? null,
        readAt: item.readAt == null ? null : "set",
        recipient: Object.keys(item.recipient ?? {}).sort(),
        templateVersion: item.templateVersion ?? null,
        variables: Object.keys(item.variables ?? {}).sort()
      });
      const notices = db.notifications
        .find({$or: [{code: {$in: ["N-08a", "N-13", "N-24"]}}, {code: null}]})
        .sort({createdAt: 1})
        .toArray()
        .map(pick);
      const byCode = db.notifications.aggregate([{$group: {_id: "$code", count: {$sum: 1}}}, {$sort: {_id: 1}}]).toArray();
      const statuses = db.notifications.aggregate([
        {$unwind: "$deliveries"},
        {$group: {_id: {code: "$code", channel: "$deliveries.channel", status: "$deliveries.status"}, count: {$sum: 1}}},
        {$sort: {"_id.code": 1, "_id.channel": 1, "_id.status": 1}}
      ]).toArray();
      const templates = db.message_templates
        .find({$or: [{code: "N-08a"}, {kind: "CUSTOM"}]})
        .toArray()
        .map((item) => ({
          category: item.category ?? null,
          code: item.code ?? null,
          customized: item.customized ?? null,
          kind: item.kind ?? null,
          status: item.status ?? null,
          version: item.version ?? null
        }));
      const pushSubscriptions = db.push_subscriptions.aggregate([
        {$group: {_id: "$status", count: {$sum: 1}}},
        {$sort: {_id: 1}}
      ]).toArray();
      print(EJSON.stringify({byCode, notices, pushSubscriptions, statuses, templates}, null, 2));
    ' >"$evidence_directory/e7-notifications.json" 2>&1 \
    || echo "could not read the E7 notifications" >&2
  echo "e7 notifications: $evidence_directory/e7-notifications.json"
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
# A failing stage does not hide the next one: all run, and the script exits with the failure. An
# interrupted one (130/143) ends the script at once (`run_stage`).
status=0
if [[ "$staged" == true ]]; then
  export CORE_TEST_FILES="e1-core.spec.ts e2-core.spec.ts"
  run_stage e1-e2
  cleanup
  # E4-W16: the audit corrections (impersonation handoff, export drawer, D10, 13, recovery) on a
  # fresh core and seed: after E1/E2 the api's authentication quota per IP is spent (429).
  export CORE_TEST_FILES="e4w16-core.spec.ts"
  run_stage e4w16
  cleanup
  export CORE_TEST_FILES="e3-signup.spec.ts"
  run_stage e3
  check_n37_notification || status=1
  cleanup
  export CORE_TEST_FILES="e4-core.spec.ts"
  run_stage e4
  cleanup
  # E5-W04: bookings, waitlist, training and processes on their own fresh seed (they change it).
  export CORE_TEST_FILES="e5-core.spec.ts"
  export SEED_WEEK_START="$E5_WEEK_START"
  run_stage e5
  cleanup
  # E6-W04: the attendance sheet, tasks and follow-up on their own fresh seed. The E6 scenario of
  # the demo seed (api E6-T04, `scenario.attendance`) lives on week 0 like E5's, so it seeds from
  # the same Monday; its spec moves the core's test clock through that Monday and Tuesday.
  export CORE_TEST_FILES="e6-core.spec.ts"
  export SEED_WEEK_START="$E5_WEEK_START"
  run_stage e6
  save_e6_notifications
  cleanup
  # E7-W03: the notification flows (D4c cancellations → N-08a, D9's edited template, the matrix
  # from 12 and D10, the announcement, the push subscription and P4's N-13) on their own fresh
  # seed, from the same Monday as E5/E6: the E5 scenario's week-0 bookings give two login members
  # a shared class to cancel, and its spec sets the core's test clock to `demoNow` (Monday 07:00)
  # so week 0 is open for the bookings it adds, then to two hours before the reminder's class.
  export CORE_TEST_FILES="e7-core.spec.ts"
  export SEED_WEEK_START="$E5_WEEK_START"
  run_stage e7
  save_e7_notifications
else
  export CORE_TEST_FILES="$2"
  if [[ "$2" == *e5-core* || "$2" == *e6-core* || "$2" == *e7-core* ]]; then
    export SEED_WEEK_START="$E5_WEEK_START"
  fi
  run_stage files
  if [[ "$2" == *e6-core* ]]; then
    save_e6_notifications
  fi
  if [[ "$2" == *e7-core* ]]; then
    save_e7_notifications
  fi
fi

exit "$status"
