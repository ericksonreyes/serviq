#!/usr/bin/env bash
# Docs-screenshot capture runner — generates the PNGs referenced by
# docs/guides/<channel>.MD (ADR-0018: visuals are artifacts, not captures).
#
#   ./scripts/screenshots.sh                  all channels
#   ./scripts/screenshots.sh --only agent     one channel/spec dir
#
# Same environment as the e2e suite: Playwright image, host-gateway
# localhost remap, running stack (e2e overlay recommended for stub AI).
set -uo pipefail
cd "$(dirname "$0")/.."

PW_IMG=mcr.microsoft.com/playwright:v1.55.0-noble
SPEC_DIR=scripts/screenshots
ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# Health gate — frontends must serve; specs drive real pages.
for u in 3000/ 3001/ 3002/ 3003/ 8010/api/health; do
  curl -sf -o /dev/null --max-time 4 "http://localhost:$u" || {
    echo "stack not answering at localhost:$u — bring it up first" >&2; exit 1; }
done

echo "==> playwright deps"
docker run --rm -v "$PWD/$SPEC_DIR:/app" -w /app --entrypoint bash \
  "$PW_IMG" -lc "npm i --no-audit --no-fund -q" || { echo "deps failed" >&2; exit 1; }

# Specs run in the same persona order as the e2e stage map — platform
# onboards tenant, tenant configures, customer books, agent works.
ORDERED_CHANNELS="platform console customer agent"
specs=$(
  for ch in $ORDERED_CHANNELS; do
    find "$SPEC_DIR/$ch" -name "*.mjs" 2>/dev/null
  done | grep -v "/lib/"
)
[ -n "$ONLY" ] && specs=$(printf '%s\n' $specs | grep "/$ONLY/" || true)
[ -z "$specs" ] && { echo "no specs matched" >&2; exit 1; }

failed=0
for spec in $specs; do
  rel=${spec#"$SPEC_DIR"/}
  echo "── $rel"
  # Mount the whole repo: specs write docs/screenshots/ and import the e2e harness.
  docker run --rm --add-host host.docker.internal:host-gateway \
    -v "$PWD:/repo" -w /repo --entrypoint node \
    "$PW_IMG" "$spec" || failed=$((failed + 1))
done

[ "$failed" -eq 0 ] && echo "all channels captured" || echo "$failed spec(s) failed"
exit "$failed"
