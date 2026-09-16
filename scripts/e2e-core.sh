#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repository_root/scripts/core-stack/docker-compose.yml"
evidence_subdirectory="${CORE_EVIDENCE_SUBDIRECTORY:-E1-W04}"
evidence_directory="${CORE_EVIDENCE_DIRECTORY:-$repository_root/roadmap/evidence/$evidence_subdirectory}"
core_project_name="${CORE_PROJECT_NAME:-${E1_CORE_PROJECT_NAME:-agilityhub-e1-w04}}"

: "${CORE_URL:?Set CORE_URL to the core URL visible from the Playwright container (for the local stack: http://core:8080)}"

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

cleanup
docker compose -f "$compose_file" up -d --wait mongo seed core
docker compose -f "$compose_file" --profile e2e run --rm playwright
