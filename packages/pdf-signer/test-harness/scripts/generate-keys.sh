#!/usr/bin/env bash
# Generate two self-signed RSA keypairs for the test harness.
# User 1 = initiator, User 2 = counter-signer.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/../keys"

mkdir -p "$KEYS_DIR"

# Skip if keys already exist
if [[ -f "$KEYS_DIR/user1.key.pem" && -f "$KEYS_DIR/user2.key.pem" ]]; then
  echo "Keys already exist in $KEYS_DIR — skipping generation."
  exit 0
fi

echo "Generating User 1 keypair..."
openssl req -x509 -newkey rsa:2048 \
  -keyout "$KEYS_DIR/user1.key.pem" \
  -out "$KEYS_DIR/user1.cert.pem" \
  -days 3650 -nodes \
  -subj "/CN=Test User 1/O=pdfbox-ts Test Harness" \
  2>/dev/null

# Also produce DER cert for the signer interface
openssl x509 -in "$KEYS_DIR/user1.cert.pem" -outform DER -out "$KEYS_DIR/user1.cert.der"

echo "Generating User 2 keypair..."
openssl req -x509 -newkey rsa:2048 \
  -keyout "$KEYS_DIR/user2.key.pem" \
  -out "$KEYS_DIR/user2.cert.pem" \
  -days 3650 -nodes \
  -subj "/CN=Test User 2/O=pdfbox-ts Test Harness" \
  2>/dev/null

openssl x509 -in "$KEYS_DIR/user2.cert.pem" -outform DER -out "$KEYS_DIR/user2.cert.der"

# Copy DER certs to public/keys/ so Vite serves them
PUBLIC_KEYS="$SCRIPT_DIR/../public/keys"
mkdir -p "$PUBLIC_KEYS"
cp "$KEYS_DIR/user1.cert.der" "$PUBLIC_KEYS/"
cp "$KEYS_DIR/user2.cert.der" "$PUBLIC_KEYS/"

echo "Done. Keys in $KEYS_DIR:"
ls -la "$KEYS_DIR"
echo "DER certs copied to $PUBLIC_KEYS/"
