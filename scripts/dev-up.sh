#!/usr/bin/env bash
# Levanta web + worker + renderer en local (requiere docker-compose.dev.yml arriba). Logs en $LOGDIR (por defecto /tmp/lamina-dev).
set -euo pipefail
cd "$(dirname "$0")/.."
LOGDIR="${LOGDIR:-/tmp/lamina-dev}"; mkdir -p "$LOGDIR"
set -a; . apps/web/.env.local; set +a
export SANDBOX_URL=http://localhost:8600 SANDBOX_TOKEN=local-sandbox-token-0123456789abcdef LAMINA_AI_PROVIDER="${LAMINA_AI_PROVIDER:-fake}" SEARXNG_URL="${SEARXNG_URL:-http://127.0.0.1:58080}" WEB_INTERNAL_URL=http://localhost:3100
for s in web worker renderer sandbox-runner; do [ -f "$LOGDIR/$s.pid" ] && kill -- -"$(cat "$LOGDIR/$s.pid")" 2>/dev/null || true; done
sleep 1
start() { local n=$1 dir=$2; shift 2; (cd "$dir" && setsid "$@" > "$LOGDIR/$n.log" 2>&1 & echo $! > "$LOGDIR/$n.pid"); }
SANDBOX_TOKEN=local-sandbox-token-0123456789abcdef PORT=8600 start sandbox-runner apps/sandbox-runner node_modules/.bin/tsx src/main.ts
start web apps/web pnpm dev
start worker apps/worker pnpm start
start renderer apps/renderer pnpm start
echo "logs en $LOGDIR"
