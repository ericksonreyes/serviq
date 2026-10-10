#!/usr/bin/env bash
# ServIQ Laravel container entrypoint.
# 1. Materializes an RS256 keypair into storage/keys/ when JWT_PRIVATE_KEY
#    is not supplied — real asymmetric signing works out of the box locally;
#    the keys are container-local and never committed.
# 2. Generates a throwaway APP_KEY when unset (local POC only).
# 3. Migrates + seeds (idempotent) unless AUTO_SETUP=false.
set -e

cd /var/www/html

# ── APP_KEY ──────────────────────────────────────────────────────────────
if [ -z "${APP_KEY:-}" ]; then
  export APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
  echo "[entrypoint] APP_KEY generated for this container"
fi

# ── JWT signing keypair (RS256) ──────────────────────────────────────────
mkdir -p storage/keys
if [ -z "${JWT_PRIVATE_KEY:-}" ] && [ ! -f storage/keys/jwt-private.pem ]; then
  openssl genrsa -out storage/keys/jwt-private.pem 2048 2>/dev/null
  openssl rsa -in storage/keys/jwt-private.pem -pubout -out storage/keys/jwt-public.pem 2>/dev/null
  chmod 600 storage/keys/jwt-private.pem
  chown -R www-data:www-data storage/keys
  echo "[entrypoint] Generated local RS256 keypair in storage/keys (JWT_PRIVATE_KEY unset)"
fi

# ── Database setup ───────────────────────────────────────────────────────
if [ "${AUTO_SETUP:-true}" = "true" ] && [ "${SKIP_DB_SETUP:-}" != "true" ]; then
  tries=0
  until php artisan migrate --force >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      echo "[entrypoint] WARNING: database unreachable after 30 tries — starting without migrations" >&2
      break
    fi
    sleep 2
  done
  php artisan db:seed --force >/dev/null 2>&1 || true
fi

exec "$@"
