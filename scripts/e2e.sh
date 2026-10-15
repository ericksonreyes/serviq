#!/usr/bin/env bash
# Persona-ordered browser E2E runner — the stage map lives in
# workspace/specs/testing/README.MD#browser-e2e-run-order.
#
#   ./scripts/e2e.sh                  all stages, sequential
#   ./scripts/e2e.sh --fresh          wipe postgres-e2e, rebuild stack state,
#                                     then run bootstrap.mjs first (builds the
#                                     world through real UI flows)
#   ./scripts/e2e.sh --only money-flows[,support]   selected suites
#   ./scripts/e2e.sh --fail-fast      stop at first failure
#   ./scripts/e2e.sh --skip-health    stack already verified up
#
# Deterministic AI + isolated DB: bring the stack up with the e2e overlay —
#   docker compose -f services/docker-compose.yml -f services/docker-compose.e2e.yml \
#     --profile infra --profile domain --profile ai --profile frontends up -d
# Suites are sequential and marker-idempotent: they construct their own
# prerequisites against accumulated dev data and never depend on run order.
set -uo pipefail
cd "$(dirname "$0")/.."

PW_IMG=mcr.microsoft.com/playwright:v1.55.0-noble
E2E_DIR=tests/e2e
FAIL_FAST=0 SKIP_HEALTH=0 FRESH=0 ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --fail-fast) FAIL_FAST=1; shift ;;
    --fresh) FRESH=1; shift ;;
    --skip-health) SKIP_HEALTH=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ── --fresh: wipe the disposable e2e cluster and rebuild world state ──────
# Guarded: refuses unless infra-postgres-e2e exists (the overlay is up) —
# dev infra-postgres is never touched. After the wipe, backends' entrypoints
# recreate/migrate/seed canonical-only (SEED_DEMO=false), so bootstrap.mjs
# runs first to build the tenant world through the real UI flows.
if [ "$FRESH" -eq 1 ]; then
  COMPOSE="docker compose -f services/docker-compose.yml -f services/docker-compose.e2e.yml"
  if ! docker ps -a --format '{{.Names}}' | grep -qx infra-postgres-e2e; then
    echo "--fresh needs the e2e overlay stack (postgres-e2e not found)." >&2
    echo "  docker compose -f services/docker-compose.yml -f services/docker-compose.e2e.yml \\" >&2
    echo "    --profile infra --profile domain --profile ai --profile frontends up -d" >&2
    exit 2
  fi
  echo "==> fresh: wiping postgres-e2e + volumes"
  $COMPOSE rm -sfv postgres-e2e >/dev/null
  docker volume rm -f serviq_postgres-e2e-data >/dev/null 2>&1 || true
  echo "==> fresh: restarting the stack (entrypoints re-migrate into empty DBs)"
  $COMPOSE --profile infra --profile domain --profile ai --profile frontends up -d
  # Wait for the fresh cluster's initdb + healthcheck BEFORE touching
  # anything — bouncing it mid-initdb corrupts the data dir.
  echo "==> fresh: waiting for postgres-e2e initdb"
  for _ in $(seq 1 36); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' infra-postgres-e2e 2>/dev/null)" = "healthy" ] && break
    sleep 5
  done
  # up -d leaves running containers untouched — the serviq-* services must
  # restart for their entrypoints to migrate + seed the recreated databases.
  # (compose restart would also bounce infra-* on the shared profile.)
  docker ps --format '{{.Names}}' | grep '^serviq-' | xargs -r docker restart >/dev/null
  # Entrypoints retry-migrate for ~60s; give them room before the health gate.
  echo "==> fresh: waiting for backends to finish migrations"
  sleep 45
  # Cached persona JWTs + auth pacing belong to the wiped world — drop them.
  rm -rf "$E2E_DIR/.runtime"
fi

# Stage map — persona hierarchy: platform onboards tenant, tenant onboards
# agent, customer signs up, then the journey runs on proven pieces.
# Stage 0 (World) only exists under --fresh.
STAGE_NAMES=("World" "Canary" "Platform" "Tenant setup" "Customer" "Journey" "Money" "Dispatch ops" "Support" "AI surfaces")
STAGE_SUITES=(
  "$([ "$FRESH" -eq 1 ] || [[ ",$ONLY," == *",bootstrap,"* ]] && echo bootstrap.mjs)"
  "login-negatives.mjs"
  "platform-admin.mjs platform-admin-ops.mjs"
  "tenant-admin.mjs invitations.mjs"
  "customer-self-service.mjs"
  "golden-chain.mjs customer-agent-lifecycle.mjs"
  "cash-remittance.mjs money-flows.mjs transfer-remittance.mjs"
  "dispatch-strategies.mjs dispatch-ops.mjs console-ops.mjs"
  "support.mjs"
  "chatbots.mjs"
)

# ── Health gate: the same surface install.sh smoke-checks ────────────────
health_gate() {
  local urls=(
    "3000/" "3001/" "3002/" "3003/"
    "8000/api/health" "8001/api/health" "8100/docs"
    "8010/api/health" "8011/api/health" "8012/api/health" "8013/api/health"
    "8014/api/health" "8015/api/health" "8016/api/health" "8017/api/health"
    "8018/api/health" "8019/api/health" "8020/api/health" "8021/api/health"
  )
  local dead=()
  for u in "${urls[@]}"; do
    curl -sf -o /dev/null --max-time 4 "http://localhost:$u" || dead+=("$u")
  done
  if [ ${#dead[@]} -gt 0 ]; then
    echo "HEALTH GATE FAILED — not answering:" >&2
    printf '  http://localhost:%s\n' "${dead[@]}" >&2
    echo "  bring the stack up (e2e overlay recommended — see header comment)" >&2
    exit 1
  fi
  echo "health gate: all surfaces answering"
}

[ "$SKIP_HEALTH" -eq 0 ] && health_gate

# Deps once — same image/test.sh uses.
echo "==> playwright deps"
docker run --rm -v "$PWD/$E2E_DIR:/app" -w /app --entrypoint bash \
  "$PW_IMG" -lc "npm i --no-audit --no-fund -q" || { echo "deps failed" >&2; exit 1; }

LOGDIR=$(mktemp -d)
trap 'rm -rf "$LOGDIR"' EXIT

declare -a RESULTS=()
failed=0

run_suite() {
  local file=$1 t0=$SECONDS
  # Stream progress lines as they happen — a silent multi-minute suite
  # reads as hung. Full output still lands in the log for failure tails.
  docker run --rm --add-host host.docker.internal:host-gateway \
      -v "$PWD/$E2E_DIR:/tests" -w /tests --entrypoint node \
      "$PW_IMG" "$file" 2>&1 \
      | tee "$LOGDIR/$file.log" \
      | grep --line-buffered -E '(✓|✗|throttled|waiting out|pacing|reused|FAIL|Error|never|refused)' \
      | sed 's/^/      /'
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -eq 0 ]; then
    RESULTS+=("PASS  ${file%.mjs}  ($((SECONDS - t0))s)")
    echo "  PASS ${file%.mjs} ($((SECONDS - t0))s)"
    return 0
  fi
  RESULTS+=("FAIL  ${file%.mjs}  ($((SECONDS - t0))s)")
  echo "  FAIL ${file%.mjs} — last output:"
  tail -15 "$LOGDIR/$file.log" | sed 's/^/    /'
  echo "  service tails (docker logs --tail 20):"
  for svc in serviq-billing-backend serviq-assignment-dispatch-backend \
             serviq-identity-access-backend serviq-ai-agent; do
    echo "  ── $svc"
    docker logs --tail 8 "$svc" 2>&1 | sed 's/^/    /' | tail -8
  done
  failed=$((failed + 1))
  return 1
}

only_match() {
  [ -z "$ONLY" ] && return 0
  local name="${1%.mjs}"
  [[ ",$ONLY," == *",$name,"* ]]
}

for i in "${!STAGE_NAMES[@]}"; do
  ran_any=0
  for file in ${STAGE_SUITES[$i]}; do
    only_match "$file" || continue
    [ "$ran_any" -eq 0 ] && echo "── Stage $i: ${STAGE_NAMES[$i]}"
    ran_any=1
    run_suite "$file" || { [ "$FAIL_FAST" -eq 1 ] && break 2; }
  done
done

echo
echo "══ E2E summary ══"
printf '%s\n' "${RESULTS[@]}"
[ "$failed" -eq 0 ] && echo "all green" || echo "$failed suite(s) failed — screenshots: tests/e2e/fail-*.png, logs were tailed above"
exit "$failed"
