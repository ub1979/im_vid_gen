#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PID_FILE="$DIR/.dev.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running (PID $(cat "$PID_FILE")). Stop first with ./stop.sh"
  exit 1
fi

npm install --silent 2>/dev/null

echo "Starting Image Creator on http://127.0.0.1:3000 ..."
npx next dev -p 3000 -H 127.0.0.1 > "$DIR/.dev.log" 2>&1 &
echo $! > "$PID_FILE"

sleep 3
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Running (PID $(cat "$PID_FILE")). Logs: .dev.log"
  echo "Stop with: ./stop.sh"
else
  echo "Failed to start. Check .dev.log"
  rm -f "$PID_FILE"
  exit 1
fi
