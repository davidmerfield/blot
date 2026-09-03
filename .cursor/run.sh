#!/usr/bin/env bash
# Long-running foreground process for the "blot" terminal: bring up the Blot
# application stack and stream its logs. Redis is accessed directly (toxiproxy
# is disabled), so the stack is node-app + redis + nginx (OpenResty).
#   - Dashboard / docs:  https://local.blot
#   - A blog:            https://<handle>.local.blot
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DIR/.." && pwd)"
cd "$REPO_DIR"

COMPOSE_FILE="scripts/development/docker-compose.yml"

# Make sure the daemons are up in case this terminal starts before/without the
# environment "start" phase (idempotent).
bash "$DIR/start.sh"

export BLOT_HOST=local.blot
# Talk to Redis directly and skip toxiproxy's latency simulation.
export BLOT_REDIS_HOST=redis
export BLOT_USE_TOXIPROXY=false

touch "$REPO_DIR/.env"

echo "[run] Bringing up the Blot stack (toxiproxy disabled)"
COMPOSE_BAKE=true docker compose -f "$COMPOSE_FILE" up -d

# toxiproxy is started to satisfy the compose dependency graph but is unused;
# stop it so it is genuinely disabled.
docker compose -f "$COMPOSE_FILE" stop toxiproxy >/dev/null 2>&1 || true

echo "[run] Stack is up. Streaming logs (Ctrl-C detaches log view; containers keep running)."
exec docker compose -f "$COMPOSE_FILE" logs -f --no-log-prefix node-app nginx redis
