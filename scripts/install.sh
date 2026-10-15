#!/usr/bin/env bash
# ServIQ local installer — env setup + staged stack bring-up.
#
# Flow:
#   1. Confirm install
#   2. Copy .env.example/.env.dist -> .env per service (never overwrites)
#   3. Choose: fresh start (empty databases) or keep existing data
#   4. Repair minio-data volume ownership (bitnamilegacy/minio runs as UID 1001)
#   5. Build + start in order: infra -> domain services -> AI -> frontends
#   6. Seed demo accounts/data (loud, ordered) — entrypoints also seed at
#      boot but silently; this pass guarantees a usable stack post-install
#
# Usage: ./scripts/install.sh

clear
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
created=0; skipped=0; ai_env_new=0
for template in services/*/.env.example services/*/.env.dist; do
  [ -f "$template" ] || continue
  target="${template%.*}"  # strips .example / .dist -> .env
  if [ -f "$target" ]; then
    skipped=$((skipped + 1))
  else
    cp "$template" "$target"
    echo "created $target"
    [ "$target" = "services/serviq-ai-agent/.env" ] && ai_env_new=1
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

# ── 5. Host-side dependencies ────────────────────────────────────────────────
# Service dirs are bind-mounted into containers; the mount shadows any
# image-baked vendor/, so install it onto the host first via the composer:2
# image (already pulled as a Dockerfile build stage — runtime images ship no
# composer binary). Node services self-install node_modules on boot.
echo
echo "==> [deps] Installing host-side composer deps (vendor/ is bind-mounted)"
docker pull composer:2 -q >/dev/null 2>&1 || true
# Named volume caches package downloads across all 12 installs — the
# installed vendor/ trees still stay per-service (no shared-deps coupling).
docker volume create serviq-composer-cache >/dev/null
for d in services/serviq-*-backend; do
  [ -d "$d/vendor" ] && continue
  echo "  composer install -> $d"
  docker run --rm -v "$PWD/$d:/app" -w /app \
    -v serviq-composer-cache:/composer -e COMPOSER_HOME=/composer \
    composer:2 \
    install --no-dev --prefer-dist --no-interaction --no-scripts \
    --ignore-platform-req=ext-sockets >/dev/null
done

# ── 6. Staged bring-up: essential first, UI last ─────────────────────────────
echo
echo "==> [1/6] Infrastructure (postgres, mongo, redis, rabbitmq, minio, fluent-bit)"
$COMPOSE --profile infra up -d --wait --build

echo "==> [2/6] Domain services (Laravel backends + BFFs)"
$COMPOSE --profile domain up -d --wait --build

# ── Seed demo accounts + demo data ───────────────────────────────────────
# Ordered for the async bit: IAM first (platform admin, synchronous), then
# platform-management (emits Platform.TenantCreated), then WAIT for IAM's
# consumer to provision the acme.* accounts before the rest — Demo*Seeders
# (workforce's agent, customer-request's customer) look up IAM user ids.
echo
echo "==> [3/6] Seeding demo accounts + demo data"
seed_fail=0
seed() { # $1 = backend container name
  if out=$(docker exec "$1" php artisan db:seed --force 2>&1); then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s\n' "$1"
    echo "$out" | tail -5 | sed 's/^/       /'
    seed_fail=$((seed_fail + 1))
  fi
}
seed serviq-identity-access-backend
seed serviq-platform-management-backend

echo "  waiting for demo tenant accounts (event pipeline)..."
provisioned=0
for _ in $(seq 1 60); do
  provisioned=$(docker exec infra-postgres psql -U serviq -d serviq_identity -tAc \
    "select count(*) from users where scope <> 'platform'" 2>/dev/null || echo 0)
  [ "${provisioned:-0}" -ge 3 ] && break
  sleep 2
done
if [ "${provisioned:-0}" -ge 3 ]; then
  echo "  ok   demo tenant accounts provisioned"
else
  echo "  WARN tenant accounts not provisioned within 2min — check: docker logs serviq-identity-access-consumer"
fi

for c in $($COMPOSE ps --format '{{.Name}}' | grep -- '-backend$'); do
  case "$c" in
    serviq-identity-access-backend|serviq-platform-management-backend) continue ;;
  esac
  # Non-Laravel backends (customer-support is Express) have no artisan.
  docker exec "$c" sh -c 'test -f artisan' 2>/dev/null || continue
  seed "$c"
done

echo "==> [4/6] AI (ollama + ai-agent)"
$COMPOSE --profile ai up -d --wait --build

# Provider choice is asked only for a freshly created env — an existing
# .env with a deliberate provider selection is respected on re-runs.
# Without one, ai-agent runs in stub mode (heuristic parses, keyword
# intents) at zero RAM cost. Ollama weights land in the ollama-models
# volume, kept across "fresh" installs deliberately.
AI_ENV=services/serviq-ai-agent/.env
set_env() { # $1=key $2=value — whole-line replace in $AI_ENV
  local val=$2
  val=${val//\\/\\\\}  # \ first — it's the escape char for the rest
  val=${val//&/\\&}
  val=${val//|/\\|}
  sed -i.bak "s|^$1=.*|$1=$val|" "$AI_ENV" && rm -f "$AI_ENV.bak"
}

if [ "$ai_env_new" -eq 1 ]; then
  echo
  echo "  AI provider (env-driven; editable later in $AI_ENV):"
  echo "    1) stub    — heuristics only, zero RAM/setup (default)"
  echo "    2) ollama  — local models (moondream + qwen2.5:3b, ~3.7GB pull; needs ~5GiB Docker VM)"
  echo "    3) gemini  — cloud, free-tier key works (AI Studio)"
  echo "    4) other   — a registered provider name (openai-compatible endpoints, anthropic, ...)"
  read -rp "  choose [1-4, default 1]: " choice
  case "$choice" in
    2)
      docker exec infra-ollama ollama pull moondream
      docker exec infra-ollama ollama pull qwen2.5:3b
      set_env AI_VISION_PROVIDER ollama
      set_env AI_TEXT_PROVIDER ollama
      $COMPOSE up -d ai-agent ai-agent-consumer
      ;;
    3|4)
      provider=gemini; key=""
      [ "$choice" = "4" ] && read -rp "  provider name: " provider
      read -rsp "  AI_API_KEY for '$provider' (empty = stay on stub): " key && echo
      if [ -n "$key" ]; then
        set_env AI_VISION_PROVIDER "$provider"
        set_env AI_TEXT_PROVIDER "$provider"
        set_env AI_API_KEY "$key"
        $COMPOSE up -d ai-agent ai-agent-consumer
      else
        echo "  no key — ai-agent stays in stub mode."
      fi
      ;;
    *)
      echo "  stub — deterministic heuristics (no RAM, no key)."
      ;;
  esac
else
  echo "  $AI_ENV already present — provider choice respected:"
  grep -E '^AI_(VISION|TEXT)_PROVIDER=' "$AI_ENV" | sed 's/^/    /' || true
fi

echo "==> [5/6] Frontends (vite dev servers with hot reload, 3000-3003)"
$COMPOSE --profile dev up -d --wait

# Dev containers report "running" while first-boot `npm install` is still in
# flight — wait for vite to actually listen before smoke-checking.
echo "  waiting for vite dev servers to accept connections..."
for port in 3000 3001 3002 3003; do
  for _ in $(seq 1 60); do
    curl -s -o /dev/null --max-time 2 "http://localhost:$port/" && break
    sleep 2
  done
done

# ── 6. Smoke checks ──────────────────────────────────────────────────────────
echo
echo "==> [6/6] Smoke checks"
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
  "3000 customer-portal-dev" "3001 service-agent-dev" \
  "3002 tenant-console-dev"  "3003 platform-admin-dev"; do
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
check "http://localhost:8000/api/health" "customer-portal-bff"
check "http://localhost:8001/api/health" "service-agent-bff"
check "http://localhost:8100/docs" "ai-agent"

bad=$($COMPOSE ps --format '{{.Name}} {{.Status}}' | grep -ciE 'restarting|exited|unhealthy' || true)
if [ "$bad" -gt 0 ]; then
  echo "  FAIL $bad container(s) restarting/exited/unhealthy:"
  $COMPOSE ps --format '{{.Name}} {{.Status}}' | grep -iE 'restarting|exited|unhealthy' | sed 's/^/       /'
  fail=$((fail + bad))
fi

echo
total=$((fail + seed_fail))
if [ "$total" -gt 0 ]; then
  echo "Done with $total failure(s): $seed_fail seed, $fail smoke. Inspect: $COMPOSE logs <service>"
  exit 1
fi

echo "All smoke checks passed. Status:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo
echo "Demo accounts for every role were seeded during install —"
echo "see README.MD#local-seed-accounts"
