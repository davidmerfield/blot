#!/usr/bin/env bash
#
# Blue/green swap of the containerised OpenResty proxy for an IMAGE change.
#
#   proxy/deploy/blue-green.sh <new-image>
#
# NOT wired to production - this is the mechanism the containerised proxy will
# use once it replaces config/openresty, plus the reference other tooling can
# build on. See proxy/README.md "Deployment".
#
# How it works
# ------------
# The two proxy containers run with `--network host` (the generated config's
# upstreams are 127.0.0.1:8088-8091, the node app on the same host). The
# generated config sets `reuseport` on the single default server for :80 and
# :443 (and on the loopback-only :80 / :8999 helpers), so a second container
# can join the listening group while the first is still serving. We bring the
# new colour up, wait for it to pass its health check, then stop the old one
# with a drain timeout - entrypoint.sh traps SIGTERM and runs
# `openresty -s quit`, so in-flight requests finish before the old socket
# leaves the group.
#
# Config-only changes do NOT need this - use proxy/deploy/reload-config.sh.
set -euo pipefail

NEW_IMAGE="${1:?usage: blue-green.sh <new-image>}"

BLOT_HOST="${BLOT_HOST:?set BLOT_HOST to the base domain}"
CACHE_VOLUME="${PROXY_CACHE_VOLUME:-blot-proxy-cache}"
AUTOSSL_VOLUME="${PROXY_AUTOSSL_VOLUME:-blot-proxy-auto-ssl}"
DRAIN_TIMEOUT="${PROXY_DRAIN_TIMEOUT:-30}"
HEALTH_TIMEOUT="${PROXY_HEALTH_TIMEOUT:-60}"
CERT_MOUNT="${PROXY_CERT_MOUNT:-}"   # optional "-v /host/certs:/etc/ssl/private:ro"

running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

if running blot-proxy-blue; then
  OLD=blot-proxy-blue; NEW=blot-proxy-green
elif running blot-proxy-green; then
  OLD=blot-proxy-green; NEW=blot-proxy-blue
else
  OLD=""; NEW=blot-proxy-blue
  echo "No proxy container running - starting $NEW fresh (no overlap)."
fi

echo "Starting $NEW from $NEW_IMAGE"
docker rm -f "$NEW" >/dev/null 2>&1 || true
# shellcheck disable=SC2086
docker run -d --name "$NEW" \
  --network host \
  --cap-add SYS_NICE \
  --restart unless-stopped \
  -e BLOT_HOST="$BLOT_HOST" \
  -v "$CACHE_VOLUME":/var/cache/openresty \
  -v "$AUTOSSL_VOLUME":/etc/resty-auto-ssl \
  $CERT_MOUNT \
  "$NEW_IMAGE" >/dev/null

echo "Waiting up to ${HEALTH_TIMEOUT}s for $NEW to become healthy"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$NEW" 2>/dev/null || echo missing)
  [ "$status" = "healthy" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "FAIL: $NEW did not become healthy (last status: $status)" >&2
    docker logs --tail 50 "$NEW" >&2 || true
    docker rm -f "$NEW" >/dev/null 2>&1 || true
    exit 1
  fi
  sleep 2
done
echo "$NEW is healthy."

if [ -n "$OLD" ]; then
  echo "Draining and stopping $OLD (timeout ${DRAIN_TIMEOUT}s)"
  docker stop --time "$DRAIN_TIMEOUT" "$OLD"
  docker rm "$OLD" >/dev/null 2>&1 || true
  echo "Swapped $OLD -> $NEW"
else
  echo "$NEW is now serving."
fi
