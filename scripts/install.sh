#!/usr/bin/env bash
# ServIQ local installer — env setup + staged stack bring-up.
#
# Flow:
#   1. Confirm install
#   2. Copy .env.example/.env.dist -> .env per service (never overwrites)
#   3. Choose: fresh start (empty databases) or keep existing data
#   4. Repair minio-data volume ownership (bitnamilegacy/minio runs as UID 1001)
#   5. Build + start in order: infra -> domain services -> AI -> frontends
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

# ── 4. Repair minio-data ownership ───────────────────────────────────────────
# bitnamilegacy/minio runs as UID 1001; a volume initialized by a root-running
# MinIO image denies writes and crash-loops the container, which fails --wait.
docker volume create serviq_minio-data >/dev/null
docker run --rm -v serviq_minio-data:/data alpine chown -R 1001:1001 /data

# ── 5. Staged bring-up: essential first, UI last ─────────────────────────────
echo
echo "==> [1/5] Infrastructure (postgres, mongo, redis, rabbitmq, minio, fluent-bit)"
$COMPOSE --profile infra up -d --wait --build

echo "==> [2/5] Domain services (Laravel backends + BFFs)"
$COMPOSE --profile domain up -d --wait --build

echo "==> [3/5] AI (ollama + ai-agent)"
$COMPOSE --profile ai up -d --wait --build

echo "==> [4/5] Frontends (static builds on nginx)"
$COMPOSE --profile full up -d --wait --build

# ── 6. Smoke checks ──────────────────────────────────────────────────────────
echo
echo "==> [5/5] Smoke checks"
fail=0
check() { # $1=url  $2=label
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" || echo 000)
  if [ "$code" = "200" ]; then
    printf '  ok   %-28s %s\n' "$2" "$code"
  else
    printf '  FAIL %-28s %s\n' "$2" "$code"
    fail=$((fail + 1))
  fi
}

for entry in \
  "8080 customer-portal-frontend" "8081 service-agent-frontend" \
  "8082 tenant-console-frontend"  "8083 platform-admin-frontend"; do
  check "http://localhost:${entry%% *}/" "${entry#* }"
done
for entry in \
  "8010 identity-access"        "8011 platform-management" \
  "8012 service-management"     "8013 customer-request" \
  "8014 service-job"            "8015 workforce" \
  "8016 assignment-dispatch"    "8017 field-service" \
  "8018 customer-support"       "8019 notification" \
  "8020 billing"                "8021 payouts"; do
  check "http://localhost:${entry%% *}/api/health" "${entry#* }"
done
check "http://localhost:3000/api/health" "customer-portal-bff"
check "http://localhost:3001/api/health" "service-agent-bff"
check "http://localhost:8100/docs" "ai-agent"

bad=$($COMPOSE ps --format '{{.Name}} {{.Status}}' | grep -ciE 'restarting|exited|unhealthy' || true)
if [ "$bad" -gt 0 ]; then
  echo "  FAIL $bad container(s) restarting/exited/unhealthy:"
  $COMPOSE ps --format '{{.Name}} {{.Status}}' | grep -iE 'restarting|exited|unhealthy' | sed 's/^/       /'
  fail=$((fail + bad))
fi

echo
if [ "$fail" -gt 0 ]; then
  echo "Done with $fail smoke-check failure(s). Inspect: $COMPOSE logs <service>"
  exit 1
fi

echo "All smoke checks passed. Status:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo
echo "Demo accounts for every role were seeded during install —"
echo "see README.MD#local-seed-accounts"
