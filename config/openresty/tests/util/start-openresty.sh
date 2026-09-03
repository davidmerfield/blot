#!/bin/sh

CONFIG=$1

if [ -z "$CONFIG" ]; then
  echo "No config file specified"
  exit 1
fi

# macOS Homebrew puts openresty on PATH. Official Linux packages use
# /usr/local/openresty/bin/openresty. Alpine community packages install
# /usr/lib/nginx/bin/openresty (symlink to /usr/sbin/nginx).
if command -v openresty >/dev/null 2>&1; then
  OPENRESTY="$(command -v openresty)"
elif [ -x /usr/local/openresty/bin/openresty ]; then
  OPENRESTY="/usr/local/openresty/bin/openresty"
elif [ -x /usr/lib/nginx/bin/openresty ]; then
  OPENRESTY="/usr/lib/nginx/bin/openresty"
else
  echo "openresty executable not found"
  exit 1
fi

echo "Starting openresty with $OPENRESTY -c $CONFIG"

if [ "$(id -u)" -eq 0 ]; then
  "$OPENRESTY" -c "$CONFIG"
elif command -v sudo >/dev/null 2>&1; then
  sudo "$OPENRESTY" -c "$CONFIG"
else
  "$OPENRESTY" -c "$CONFIG"
fi
