#!/bin/sh
set -eu

CRT=/etc/ssl/certs/wildcard.crt
KEY=/etc/ssl/private/wildcard.key

if [ ! -s "$CRT" ] || [ ! -s "$KEY" ]; then
  echo "TLS files missing: $CRT or $KEY"
  echo "Generate them with: config/openresty/setup.sh on the host."
  exit 1
fi

nginx -g "daemon off;"