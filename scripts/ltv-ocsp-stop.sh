#!/usr/bin/env bash
# Stop the local OCSP responder and static file server.
#
# Usage: bash scripts/ltv-ocsp-stop.sh

set -euo pipefail
cd "$(dirname "$0")/.."

CA_DIR="fixtures/ltv-ca"
PID_DIR="$CA_DIR/.pids"

echo "=== Stopping LTV Servers ==="

stopped=0

for svc in static ocsp; do
  PID_FILE="$PID_DIR/$svc.pid"
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      echo "  Stopped $svc (PID $PID)"
      stopped=$((stopped + 1))
    else
      echo "  $svc already stopped (PID $PID not running)"
    fi
    rm -f "$PID_FILE"
  else
    echo "  No PID file for $svc"
  fi
done

if [ $stopped -eq 0 ]; then
  echo "  No servers were running."
fi

echo "Done."
