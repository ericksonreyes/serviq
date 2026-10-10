#!/usr/bin/env bash
# Scaffold a Laravel backend from the proven platform-management skeleton.
# Usage: scaffold-service.sh <service-dir-name> <db-name> <events-queue> [port]
set -euo pipefail
SRC=/home/ubuntu/repos/serviq/services/serviq-platform-management-backend
DST=/home/ubuntu/repos/serviq/services/$1
DB=$2
QUEUE=$3
PORT=${4:-8012}

rsync -a --exclude vendor --exclude .env --exclude storage/logs --exclude 'storage/keys' "$SRC/" "$DST/"
cd "$DST"
# rename identifiers
find . -type f \( -name '*.php' -o -name '*.env*' -o -name '*.yml' -o -name '*.MD' -o -name '*.json' -o -name '*.sh' -o -name '*.feature' \) -print0 \
  | xargs -0 sed -i "s/platform-management-backend/$1/g; s/serviq_platform/$DB/g; s/platform-management\.events/$QUEUE/g"
# composer project name
sed -i "s#serviq/platform-management-backend#serviq/$1#" composer.json
cp .env.example .env
# tenant-scope middleware lives in service-management (added post-scaffold)
cp /home/ubuntu/repos/serviq/services/serviq-service-management-backend/app/Http/Middleware/RequireTenantScope.php app/Http/Middleware/ 2>/dev/null || true
rm -f bootstrap/cache/*.php
echo "scaffolded $1 (db=$DB queue=$QUEUE port=$PORT)"

# register tenant.scope alias if middleware file was copied
if [ -f app/Http/Middleware/RequireTenantScope.php ] && ! grep -q tenant.scope bootstrap/app.php; then
  python3 - <<'PY'
import pathlib
p=pathlib.Path('bootstrap/app.php'); s=p.read_text()
s=s.replace("use App\\Http\\Middleware\\RequireRole;","use App\\Http\\Middleware\\RequireRole;\nuse App\\Http\\Middleware\\RequireTenantScope;")
s=s.replace("'role' => RequireRole::class,","'role' => RequireRole::class,\n            'tenant.scope' => RequireTenantScope::class,")
p.write_text(s)
PY
fi
