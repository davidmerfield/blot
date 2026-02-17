#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-compose.yml"

LATENCY_MS="${BLOT_TOXIPROXY_LATENCY_MS:-50}"
JITTER_MS="${BLOT_TOXIPROXY_JITTER_MS:-20}"
LOSS_PERCENT="${BLOT_TOXIPROXY_PACKET_LOSS_PERCENT:-2}"
REORDER_PERCENT="${BLOT_TOXIPROXY_REORDER_PERCENT:-10}"

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

if [ "${BLOT_USE_TOXIPROXY:-true}" != "true" ]; then
  echo "[toxiproxy] BLOT_USE_TOXIPROXY is not true, skipping setup"
  exit 0
fi

echo "[toxiproxy] Waiting for toxiproxy API"
for _ in $(seq 1 25); do
  if compose exec -T toxiproxy wget -qO- http://127.0.0.1:8474/version >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! compose exec -T toxiproxy wget -qO- http://127.0.0.1:8474/version >/dev/null 2>&1; then
  echo "[toxiproxy] API not reachable"
  exit 1
fi

echo "[toxiproxy] Configuring redis proxy"
compose exec -T toxiproxy sh -lc "
  set -e
  toxiproxy-cli delete redis >/dev/null 2>&1 || true
  toxiproxy-cli create redis -l 0.0.0.0:26379 -u redis:6379
  toxiproxy-cli toxic add redis -t latency -n redis-latency -a latency=${LATENCY_MS} -a jitter=${JITTER_MS}
"

echo "[toxiproxy] Applying packet loss (${LOSS_PERCENT}%) + reordering (${REORDER_PERCENT}%) via tc netem"
compose exec -T toxiproxy sh -lc "
  tc qdisc replace dev eth0 root netem \
    loss ${LOSS_PERCENT}% 25% \
    reorder ${REORDER_PERCENT}% 50%
"

echo "[toxiproxy] Ready: node-app -> toxiproxy:26379 -> redis:6379"
