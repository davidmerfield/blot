#!/bin/bash
set -euo pipefail

echo "Running benchmarks with args: $*"

BLOT_BENCH_ID="${BLOT_BENCH_ID:-blot-bench-$$-${RANDOM}}"
REDIS_CONTAINER="benchmark-redis-${BLOT_BENCH_ID}"
BENCH_CONTAINER="benchmark-runner-${BLOT_BENCH_ID}"

REDIS_IMAGE="redis:alpine"
BENCH_IMAGE="blot-bench"

SCRIPT_DIR=$(dirname "$0")
APP_DIR=$(realpath "$SCRIPT_DIR/../../app")
SCRIPTS_DIR=$(realpath "$SCRIPT_DIR/../../scripts")
CONFIG_DIR=$(realpath "$SCRIPT_DIR/../../config")
ROOT_DIR=$(realpath "$SCRIPT_DIR/../..")

cleanup() {
  docker rm -f "$BENCH_CONTAINER" >/dev/null 2>&1 || true
  docker stop "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker rm -f "$REDIS_CONTAINER" "$BENCH_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$REDIS_CONTAINER" \
  --rm \
  "$REDIS_IMAGE" \
  sh -c "rm -f /data/dump.rdb && redis-server" >/dev/null

docker build \
  --target dev \
  -t "$BENCH_IMAGE" \
  "$ROOT_DIR" >/dev/null

docker run --rm \
  --name "$BENCH_CONTAINER" \
  --link "$REDIS_CONTAINER:redis" \
  -e BLOT_REDIS_HOST="redis" \
  -e BLOT_HOST="localhost" \
  -e BLOT_PROTOCOL="https" \
  -e DEBUG="${DEBUG:-}" \
  -v "$APP_DIR:/usr/src/app/app" \
  -v "$SCRIPTS_DIR:/usr/src/app/scripts" \
  -v "$CONFIG_DIR:/usr/src/app/config" \
  "$BENCH_IMAGE" \
  sh -lc 'rm -rf /usr/src/app/data && mkdir /usr/src/app/data && node -v && npm -v && node scripts/benchmarks "$@"' sh "$@"
