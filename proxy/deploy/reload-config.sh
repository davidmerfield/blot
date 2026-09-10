#!/usr/bin/env bash
#
# Apply a CONFIG-ONLY change to the running containerised proxy without
# replacing the container (so the listening sockets are never dropped).
#
#   proxy/deploy/reload-config.sh [container-name]
#
# NOT wired to production. See proxy/README.md "Deployment".
#
# Requires the container to run with the generated config directory
# bind-mounted, e.g.:
#
#   docker run ... \
#     -v /host/openresty/conf:/usr/local/openresty/nginx/conf:ro \
#     -v /host/openresty/cacher.lua:/etc/openresty/cacher.lua:ro \
#     ...
#
# For an IMAGE change (new base image, new Lua deps, Dockerfile edits) use
# proxy/deploy/blue-green.sh instead.
set -euo pipefail

CONTAINER="${1:-blot-proxy-blue}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "No running container named '$CONTAINER'." >&2
  exit 1
fi

echo "Regenerating config (proxy/build/build.sh)"
bash "$SCRIPT_DIR/../build/build.sh"
echo "NOTE: copy proxy/build/data/latest/ to the host path bind-mounted into $CONTAINER"
echo "      (openresty.conf -> nginx/conf/nginx.conf, cacher.lua, html/)."

echo "Validating config inside $CONTAINER"
docker exec "$CONTAINER" /usr/local/openresty/bin/openresty -t

echo "Reloading $CONTAINER"
docker exec "$CONTAINER" /usr/local/openresty/bin/openresty -s reload

echo "Reloaded $CONTAINER."
