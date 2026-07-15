#!/bin/bash

CONFIG=$1

if [ -z "$CONFIG" ]; then
  echo "No config file specified"
  exit 1
fi

# determine the path to the openresty executable
# on my mac it will be present in the PATH already, but on github actions 
# we need to use: /usr/local/openresty/bin/openresty
OPENRESTY=$(which openresty)

if [ -z "$OPENRESTY" ]; then
  OPENRESTY="/usr/local/openresty/bin/openresty"
fi

echo "Starting openresty as root with config $CONFIG"

sudo $OPENRESTY -c $CONFIG