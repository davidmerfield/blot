#!/usr/bin/env bash
# Adds latency+jitter toxic to the redis proxy.
set -euo pipefail

LATENCY_MS="${BLOT_TOXIPROXY_LATENCY_MS:-6}"
JITTER_MS="${BLOT_TOXIPROXY_JITTER_MS:-10}"
API="http://127.0.0.1:8474"

curl -sf -X POST "${API}/proxies/redis/toxics" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"redis-latency\",\"type\":\"latency\",\"attributes\":{\"latency\":${LATENCY_MS},\"jitter\":${JITTER_MS}}}" \
  >/dev/null

echo "[toxiproxy] Latency now active: ${LATENCY_MS}ms + jitter ${JITTER_MS}ms (enabled after server readiness)"
