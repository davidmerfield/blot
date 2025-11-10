#!/usr/bin/env bash
set -euo pipefail

BLOT_HOST=${1:-local.blot}

# project root = two levels up from this script
PROJ_ROOT="$(cd "$(dirname "$0")/../.."; pwd)"
CERT_DIR="$PROJ_ROOT/data/ssl"
CRT="$CERT_DIR/certs/wildcard.crt"
KEY="$CERT_DIR/private/wildcard.key"

mkdir -p "$CERT_DIR/certs"
mkdir -p "$CERT_DIR/private"

# skip if both files exist and are non-empty
if [[ -s "$CRT" && -s "$KEY" ]]; then
  echo "✓ Existing dev certificates found at:"
  echo "  $CRT"
  echo "  $KEY"
  exit 0
fi

# otherwise, create them
if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert not installed. Install with: brew install mkcert nss"
  exit 1
fi

echo "Generating new development TLS certificates with mkcert..."
mkcert -install

mkcert -key-file "$KEY" -cert-file "$CRT" \
  "$BLOT_HOST" "*.$BLOT_HOST"

chmod 0644 "$CRT" || true
chmod 0600 "$KEY" || true

echo "✓ Certificates generated:"
echo "  $CRT"
echo "  $KEY"
