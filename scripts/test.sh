#!/usr/bin/env bash
# ServIQ test runner — zero host-runtime dependencies. Everything runs in
# Docker, with the container runtime derived from each service's declared
# platform requirement:
#
#   PHP     composer.json require.php ("^8.3" → php:8.3-cli)
#   Node    service's own image (deps baked); contract-check runs in a
#           node container whose version comes from package.json engines
#           → @types/node → default 22
#   Python  service's own image (FastAPI services pin pip deps there)
#
# PHP flow per service: composer:2 (its own PHP runtime — satisfies any
# ^8.x) installs dev deps into the bind-mounted vendor/; the derived
# php:X.Y-cli image then runs phpunit with pdo_sqlite built on the fly.
# Dev deps landing in host vendor/ are harmless — gitignored.
#
# Usage:
#   ./scripts/test.sh                      # every service + contract check
#   ./scripts/test.sh services/serviq-billing-backend

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSER_RUN="docker run --rm -v __DIR__:/app -w /app -v serviq-composer-cache:/composer -e COMPOSER_HOME=/composer composer:2"

# Derive php:X.Y-cli from composer.json require.php — first version
# number found in the constraint (^8.3 → 8.3, >=8.4.1 → 8.4).
php_image() {
  local ver
  ver=$(grep -o '"php":[^,}]*' "$1/composer.json" | grep -o '[0-9]*\.[0-9]*' | head -1)
  echo "php:${ver:-8.3}-cli"
}

# Node version for repo-level scripts: package.json engines.node →
# devDeps @types/node major → 22.
node_image() {
  local ver
  ver=$(grep -o '"node":[[:space:]]*"[^"]*"' "$1/package.json" 2>/dev/null | grep -o '[0-9]*' | head -1)
  [ -z "$ver" ] && ver=$(grep -o '"@types/node":[[:space:]]*"[^^0-9]*[0-9]*' "$1/package.json" 2>/dev/null | grep -o '[0-9]*' | head -1)
  echo "node:${ver:-22}-alpine"
}

if [ $# -gt 0 ]; then
  services=("$@")
else
  services=(services/*)
fi

fail=0
for d in "${services[@]}"; do
  # Browser E2E (Playwright): dirs declaring a playwright dep run in the
  # official image. Requires the running stack — opt-in, never in the
  # default services/* glob. Invoke: ./scripts/test.sh tests/e2e
  if [ -f "$d/package.json" ] && grep -q '"playwright"' "$d/package.json"; then
    echo "==> $d (playwright)"
    PW_IMG=mcr.microsoft.com/playwright:v1.55.0-noble
    docker run --rm -v "$PWD/$d:/app" -w /app --entrypoint bash \
      "$PW_IMG" -lc "npm i --no-audit --no-fund -q" || { echo "  FAIL $d (deps)"; fail=$((fail + 1)); continue; }
    if docker run --rm --add-host host.docker.internal:host-gateway \
      -v "$PWD/$d:/tests" -w /tests --entrypoint bash \
      "$PW_IMG" -lc "for t in *.mjs; do node \"\$t\" || exit 1; done"; then
      echo "  PASS $d"
    else
      echo "  FAIL $d"; fail=$((fail + 1))
    fi
    continue
  fi

  # Broker integration (amqplib): envelopes published onto the live
  # RabbitMQ, handled by the real consumer containers, asserted on the
  # owning services' databases. Requires the running stack — opt-in.
  # Invoke: ./scripts/test.sh tests/integration
  if [ -f "$d/package.json" ] && grep -q '"amqplib"' "$d/package.json"; then
    echo "==> $d (broker integration)"
    IT_IMG=$(node_image "$d")
    docker run --rm -v "$PWD/$d:/app" -w /app "$IT_IMG" npm i --no-audit --no-fund -q \
      || { echo "  FAIL $d (deps)"; fail=$((fail + 1)); continue; }
    if docker run --rm --network serviq_serviq -v "$PWD/$d:/app" -w /app "$IT_IMG" \
      sh -c 'for t in *.mjs; do node "$t" || exit 1; done'; then
      echo "  PASS $d"
    else
      echo "  FAIL $d"; fail=$((fail + 1))
    fi
    continue
  fi

  # Python (FastAPI): tests/test_*.py via stdlib unittest in the service's
  # own image — it ships exactly the runtime requirements.txt pinned.
  if [ -d "$d/tests" ] && ls "$d/tests"/test_*.py >/dev/null 2>&1; then
    name=$(basename "$d")
    echo "==> $d (unittest, $(basename "$name").latest)"
    if docker run --rm -v "$PWD/$d:/app" -w /app --entrypoint python \
      "$name:latest" -m unittest discover -s tests -v; then
      echo "  PASS $d"
    else
      echo "  FAIL $d"; fail=$((fail + 1))
    fi
    continue
  fi

  # Node (Express/TS): tests/*.test.mjs in the service's own image on the
  # compose network — the image carries the pinned runtime + deps.
  if [ -d "$d/tests" ] && ls "$d/tests"/*.test.mjs >/dev/null 2>&1; then
    name=$(basename "$d")
    echo "==> $d (node:test, $name:latest)"
    TEST_DB="${TEST_DB:-serviq_support_test}"
    docker exec infra-postgres psql -U serviq -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$TEST_DB'" | grep -q 1 \
      || docker exec infra-postgres psql -U serviq -d postgres -qc "CREATE DATABASE $TEST_DB" >/dev/null
    if docker run --rm --network serviq_serviq --entrypoint node \
      -v "$PWD/$d/tests:/app/tests" -w /app \
      -e JWT_SECRET=test-secret-test-secret-test-secret-32 \
      -e DB_HOST=postgres -e DB_DATABASE="${TEST_DB}" \
      -e MONGODB_URI="mongodb://mongo:27017/${TEST_DB}" \
      "$name:latest" --test tests/*.test.mjs; then
      echo "  PASS $d"
    else
      echo "  FAIL $d"; fail=$((fail + 1))
    fi
    continue
  fi

  # PHP (Laravel): phpunit inside php:X.Y-cli derived from require.php.
  [ -f "$d/composer.json" ] || continue
  [ -f "$d/phpunit.xml" ] || continue
  IMG=$(php_image "$d")
  echo "==> $d (phpunit, $IMG)"
  # --ignore-platform-req=ext-sockets: composer:2 lacks the ext; the
  # derived php image carries it (same flag install.sh uses).
  if ! ${COMPOSER_RUN/__DIR__/$PWD\/$d} install --prefer-dist --no-interaction \
      --no-scripts --ignore-platform-req=ext-sockets -q; then
    # Stale lock (composer.json changed without `composer update`).
    # Regenerate — writes composer.lock; review before committing.
    echo "  stale lock — running composer update (writes composer.lock)"
    ${COMPOSER_RUN/__DIR__/$PWD\/$d} update --prefer-dist --no-interaction \
      --no-scripts --ignore-platform-req=ext-sockets -q
  fi

  if docker run --rm --entrypoint bash -v "$PWD/$d:/app" -w /app "$IMG" -lc '
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y -qq libsqlite3-dev >/dev/null 2>&1
    docker-php-ext-install pdo_sqlite >/dev/null 2>&1
    vendor/bin/phpunit'; then
    echo "  PASS $d"
  else
    echo "  FAIL $d"; fail=$((fail + 1))
  fi
done

# Contract check — frontend api.js paths vs backend route tables. Runs in
# a node container (engines → @types/node → 22), not host node.
NODE_IMG=$(node_image services/serviq-customer-support-backend)
echo "==> contract-check ($NODE_IMG)"
docker run --rm -v "$PWD:/work" -w /work --entrypoint node \
  "$NODE_IMG" scripts/contract-check.mjs || fail=$((fail + 1))

exit $fail
