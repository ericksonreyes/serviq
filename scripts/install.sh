#!/usr/bin/env bash
# ServIQ local installer — env setup + staged stack bring-up.
#
# Flow:
#   1. Confirm install
#   2. Copy .env.example/.env.dist -> .env per service (never overwrites)
#   3. Choose: fresh start (empty databases) or keep existing data
#   4. Build + start in order: infra -> domain services -> AI -> frontends
#
# Usage: ./scripts/install.sh

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f services/docker-compose.yml"
# Data volumes wiped on "fresh". ollama-models is NOT data — it holds GBs of
# model weights; wiping it would force a re-download.
DATA_VOLUMES="serviq_postgres-data serviq_mongo-data serviq_redis-data serviq_rabbitmq-data serviq_minio-data"

# ── 1. Confirm ───────────────────────────────────────────────────────────────
read -rp "Install and start ServIQ locally (builds and runs all services)? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── 2. Env templates ─────────────────────────────────────────────────────────
created=0; skipped=0
for template in services/*/.env.example services/*/.env.dist; do
  [ -f "$template" ] || continue
  target="${template%.*}"  # strips .example / .dist -> .env
  if [ -f "$target" ]; then
    skipped=$((skipped + 1))
  else
    cp "$template" "$target"
    echo "created $target"
    created=$((created + 1))
  fi
done
echo "env: $created created, $skipped already present."

# ── 3. Fresh vs keep ─────────────────────────────────────────────────────────
read -rp "Fresh start with empty databases (existing data volumes are deleted)? [y/N] " fresh
if [[ "$fresh" =~ ^[Yy]$ ]]; then
  echo "Stopping stack and clearing data volumes (model weights kept)..."
  $COMPOSE down --remove-orphans 2>/dev/null || true
  # shellcheck disable=SC2086
  docker volume rm -f $DATA_VOLUMES 2>/dev/null || true
fi

# ── 4. Staged bring-up: essential first, UI last ─────────────────────────────
echo
echo "==> [1/4] Infrastructure (postgres, mongo, redis, rabbitmq, minio, fluent-bit)"
$COMPOSE --profile infra up -d --wait --build

echo "==> [2/4] Domain services (Laravel backends + BFFs)"
$COMPOSE --profile domain up -d --wait --build

echo "==> [3/4] AI (ollama + ai-agent)"
$COMPOSE --profile ai up -d --wait --build

echo "==> [4/4] Frontends (static builds on nginx)"
$COMPOSE --profile full up -d --wait --build

echo
echo "Done. Status:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
