#!/usr/bin/env bash
set -euo pipefail

# Translate an existing website's design into a Blot template.
#
# Usage: npm run translate <url>
#
# This script does not acquire content. Provision a site, scaffold a template,
# then wait for the operator to move content into the folder. See RESEARCH.md.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../../" && pwd)"
CONTAINER="${BLOT_CONTAINER:-blot-node-app-1}"

usage() {
  cat <<EOF
Usage: npm run translate <url>

Builds a Blot template reproducing the design of <url>.

Requires the development server to already be running:

  npm start

Content is not fetched by this script. After the site is scaffolded you will be
asked to move content into its folder — see scripts/development/dynamic-importer
or Blot's dashboard importers.
EOF
}

die() {
  echo "" >&2
  echo "[translate] $1" >&2
  if [ $# -gt 1 ]; then
    echo "" >&2
    echo "$2" >&2
  fi
  echo "" >&2
  exit 1
}

# ---------------------------------------------------------------- arguments

if [ $# -eq 0 ]; then
  usage
  exit 1
fi

URL="$1"

case "$URL" in
  -h|--help|help)
    usage
    exit 0
    ;;
  http://*|https://*)
    ;;
  *)
    die "Not a URL: '$URL'" "Pass a full URL, e.g. npm run translate https://example.com"
    ;;
esac

# ---------------------------------------------------------------- preflight

# The development stack is long-lived and interactive (it tails logs and traps
# signals to tear down compose), so we never start it here — we require it.
NOT_RUNNING="Start it in another window, then run this again:

  npm start"

echo "[translate] Checking the development server"

if ! command -v docker >/dev/null 2>&1; then
  die "docker is not installed or not on PATH."
fi

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  die "The development server is not running (no '$CONTAINER' container)." "$NOT_RUNNING"
fi

# Read the effective host from inside the container rather than guessing. The
# defaults disagree: start.sh sets BLOT_HOST=local.blot, while config/index.js
# falls back to "localhost" when the variable is absent.
if ! BLOT_HOST="$(docker exec "$CONTAINER" node -e 'process.stdout.write(require("config").host)' 2>/dev/null)"; then
  die "Could not read the server's configuration." "$NOT_RUNNING"
fi

if [ -z "$BLOT_HOST" ]; then
  die "The server reported an empty host." "$NOT_RUNNING"
fi

# --insecure on purpose: the mkcert certificate is only trusted on machines where
# `mkcert -install` has run. An untrusted certificate is not the same failure as
# a server being down, and shouldn't produce a misleading error.
HEALTH_URL="https://$BLOT_HOST/health"
HEALTHY=false

for attempt in 1 2 3; do
  if curl -sk --max-time 5 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null | grep -q '^200$'; then
    HEALTHY=true
    break
  fi
  # The container can be up while the app is still booting or mid nodemon restart.
  [ "$attempt" -lt 3 ] && sleep 2
done

if [ "$HEALTHY" != true ]; then
  die "The server is not responding at $HEALTH_URL" "The '$CONTAINER' container is running but not serving yet.
If it has only just started, wait a moment and try again. Otherwise:

  npm start"
fi

echo "[translate] Server is up at https://$BLOT_HOST"

# ---------------------------------------------------------------- provision

HANDLE="$(node "$DIR/handle.js" "$URL")"

echo "[translate] Handle: $HANDLE"

docker exec "$CONTAINER" node scripts/development/translate "$URL" "$HANDLE"
