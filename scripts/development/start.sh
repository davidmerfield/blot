#!/usr/bin/env bash
set -euo pipefail

# Resolve repo paths
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../../ && pwd)"

# Create the env file if none exists
touch $DIR/.env

BLOT_HOST=${BLOT_HOST:-local.blot}

SETUP="$DIR/config/openresty/setup.sh"
COMPOSE_FILE="$DIR/scripts/development/docker-compose.yml"
FOLDER_SERVER="$DIR/scripts/development/open-folder-server.js"

# Ensure env for Docker build, but do not overwrite if already set
export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-bake}"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

# 1) Host-side dev certs
echo "[start] Running setup: $SETUP"
bash "$SETUP" "$BLOT_HOST"

# 2) Start auxiliary server
echo "[start] Launching open-folder-server: $FOLDER_SERVER"
node "$FOLDER_SERVER" &
FOLDER_PID=$!
echo "[start] open-folder-server pid=$FOLDER_PID"

# Signal handling
SHUTTING_DOWN=0
cleanup() {
  if [[ "$SHUTTING_DOWN" -eq 1 ]]; then return; fi
  SHUTTING_DOWN=1
  echo "[start] Caught signal, shutting down…"

  # Stop docker-compose first (so network goes down cleanly)
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" down --remove-orphans || true
  else
    docker compose -f "$COMPOSE_FILE" down --remove-orphans || true
  fi

  # Kill folder server if still running
  if kill -0 "$FOLDER_PID" >/dev/null 2>&1; then
    kill "$FOLDER_PID" 2>/dev/null || true
    wait "$FOLDER_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM

# 3) Bring up compose (foreground)
echo "[start] docker compose up --build"
if command -v docker-compose >/dev/null 2>&1; then
  BLOT_HOST="$BLOT_HOST" docker-compose -f "$COMPOSE_FILE" up --build
  COMPOSE_STATUS=$?
else
  BLOT_HOST="$BLOT_HOST" docker compose -f "$COMPOSE_FILE" up --build
  COMPOSE_STATUS=$?
fi

# On exit, run cleanup and return compose status
cleanup
exit "$COMPOSE_STATUS"
