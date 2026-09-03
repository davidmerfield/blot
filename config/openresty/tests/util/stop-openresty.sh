#!/bin/sh

# kill all openresty processes
PIDS=$(ps -ef | grep nginx | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
  echo "No openresty processes running"
else
  for PID in $PIDS
  do
    echo "Killing nginx process $PID"
    if [ "$(id -u)" -eq 0 ]; then
      kill -9 "$PID"
    elif command -v sudo >/dev/null 2>&1; then
      sudo kill -9 "$PID"
    else
      kill -9 "$PID"
    fi
  done
fi