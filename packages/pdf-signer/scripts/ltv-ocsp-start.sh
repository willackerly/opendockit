#!/usr/bin/env bash
# Start the local OCSP responder and static file server for LTV testing.
#
# This starts two background processes:
#   1. Python HTTP server on port 9080 serving CRL/cert files
#   2. OpenSSL OCSP responder on port 9081
#
# Usage: bash scripts/ltv-ocsp-start.sh
# Stop:  bash scripts/ltv-ocsp-stop.sh

set -euo pipefail
cd "$(dirname "$0")/.."

CA_DIR="fixtures/ltv-ca"
PID_DIR="$CA_DIR/.pids"
STATIC_PORT=9080
OCSP_PORT=9081

# Check CA files exist
if [ ! -f "$CA_DIR/ocsp/ocsp.key" ]; then
  echo "Error: LTV CA not set up. Run: bash scripts/ltv-ca-setup.sh"
  exit 1
fi

# Check if already running
if [ -d "$PID_DIR" ] && [ -f "$PID_DIR/static.pid" ]; then
  OLD_PID=$(cat "$PID_DIR/static.pid" 2>/dev/null || true)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Servers already running (static PID=$OLD_PID). Stop first: bash scripts/ltv-ocsp-stop.sh"
    exit 1
  fi
fi

mkdir -p "$PID_DIR"

echo "=== Starting LTV Servers ==="

# 1. Static file server (CRL + certs)
echo "Starting static file server on port $STATIC_PORT..."
python3 -m http.server "$STATIC_PORT" \
  --directory "$CA_DIR/serve" \
  --bind 127.0.0.1 \
  > "$PID_DIR/static.log" 2>&1 &
echo $! > "$PID_DIR/static.pid"
echo "  PID: $(cat "$PID_DIR/static.pid")"

# 2. OCSP responder
echo "Starting OCSP responder on port $OCSP_PORT..."
openssl ocsp \
  -port "$OCSP_PORT" \
  -index "$CA_DIR/intermediate/index.txt" \
  -CA "$CA_DIR/intermediate/intermediate.crt" \
  -rkey "$CA_DIR/ocsp/ocsp.key" \
  -rsigner "$CA_DIR/ocsp/ocsp.crt" \
  -ndays 365 \
  > "$PID_DIR/ocsp.log" 2>&1 &
echo $! > "$PID_DIR/ocsp.pid"
echo "  PID: $(cat "$PID_DIR/ocsp.pid")"

# Wait a moment for servers to start
sleep 1

# Verify static server
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$STATIC_PORT/root.crt" | grep -q "200"; then
  echo "  Static server: OK (http://localhost:$STATIC_PORT)"
else
  echo "  Static server: FAILED to start"
fi

# Verify OCSP responder by sending a test request
OCSP_CHECK=$(openssl ocsp -issuer "$CA_DIR/intermediate/intermediate.crt" \
  -cert "$CA_DIR/signing/signing.crt" \
  -url "http://localhost:$OCSP_PORT" \
  -CAfile "$CA_DIR/root/root.crt" 2>&1 || true)

if echo "$OCSP_CHECK" | grep -q "good"; then
  echo "  OCSP responder: OK (http://localhost:$OCSP_PORT) — signing cert status: good"
else
  echo "  OCSP responder: Response received (may need a moment to stabilize)"
  echo "  $OCSP_CHECK" | head -3
fi

echo ""
echo "Servers running. Stop with: bash scripts/ltv-ocsp-stop.sh"
echo "Logs: $PID_DIR/static.log, $PID_DIR/ocsp.log"
