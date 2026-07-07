#!/usr/bin/env bash

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.dev.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Not running (no .dev.pid found)"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null
  echo "Stopped (PID $PID)"
else
  echo "Process $PID already dead"
fi

rm -f "$PID_FILE"
