#!/usr/bin/env bash
# Generate a local PKI hierarchy for LTV testing:
#   Root CA → Intermediate CA → Signing Cert + OCSP Responder Cert
#
# The signing cert has AIA (OCSP URL) and CDP (CRL URL) extensions
# pointing to localhost servers for fully offline LTV testing.
#
# Usage: bash scripts/ltv-ca-setup.sh
# Output: fixtures/ltv-ca/

set -euo pipefail
cd "$(dirname "$0")/.."

CA_DIR="fixtures/ltv-ca"

# Ports for local servers
STATIC_PORT=9080
OCSP_PORT=9081

echo "=== LTV CA Setup ==="
echo "Output: $CA_DIR"
echo "Static server (CRL/certs): http://localhost:$STATIC_PORT"
echo "OCSP responder:            http://localhost:$OCSP_PORT"
echo ""

# Clean previous runs
rm -rf "$CA_DIR"
mkdir -p "$CA_DIR/root" "$CA_DIR/intermediate" "$CA_DIR/signing" "$CA_DIR/ocsp"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Root CA
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Creating Root CA ---"

cat > "$CA_DIR/root/root.cnf" << 'ROOTCNF'
[ca]
default_ca = CA_default

[CA_default]
dir               = ROOTDIR
database          = $dir/index.txt
serial            = $dir/serial
crlnumber         = $dir/crlnumber
new_certs_dir     = $dir
certificate       = $dir/root.crt
private_key       = $dir/root.key
default_md        = sha256
default_days      = 3650
default_crl_days  = 365
policy            = policy_anything
unique_subject    = no
copy_extensions   = copy

[policy_anything]
countryName            = optional
stateOrProvinceName    = optional
localityName           = optional
organizationName       = optional
organizationalUnitName = optional
commonName             = supplied
emailAddress           = optional

[req]
distinguished_name = req_dn
prompt             = no
x509_extensions    = v3_root

[req_dn]
CN = pdfbox-ts LTV Root CA

[v3_root]
basicConstraints       = critical, CA:TRUE
keyUsage               = critical, keyCertSign, cRLSign
subjectKeyIdentifier   = hash

[v3_intermediate]
basicConstraints       = critical, CA:TRUE, pathlen:0
keyUsage               = critical, keyCertSign, cRLSign
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always
authorityInfoAccess    = caIssuers;URI:http://localhost:9080/root.crt
crlDistributionPoints  = URI:http://localhost:9080/root.crl
ROOTCNF

# Replace ROOTDIR with absolute path
sed -i '' "s|ROOTDIR|$(pwd)/$CA_DIR/root|g" "$CA_DIR/root/root.cnf"

# Initialize CA database
touch "$CA_DIR/root/index.txt"
echo '01' > "$CA_DIR/root/serial"
echo '01' > "$CA_DIR/root/crlnumber"

# Generate root key and self-signed cert
openssl genrsa -out "$CA_DIR/root/root.key" 2048 2>/dev/null
openssl req -new -x509 -key "$CA_DIR/root/root.key" \
  -out "$CA_DIR/root/root.crt" \
  -days 3650 \
  -config "$CA_DIR/root/root.cnf" \
  -extensions v3_root 2>/dev/null

# Generate root CRL
openssl ca -gencrl \
  -config "$CA_DIR/root/root.cnf" \
  -out "$CA_DIR/root/root.crl" 2>/dev/null

echo "  Root CA: $(openssl x509 -in "$CA_DIR/root/root.crt" -noout -subject 2>/dev/null)"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Intermediate CA
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Creating Intermediate CA ---"

cat > "$CA_DIR/intermediate/intermediate.cnf" << 'INTCNF'
[ca]
default_ca = CA_default

[CA_default]
dir               = INTDIR
database          = $dir/index.txt
serial            = $dir/serial
crlnumber         = $dir/crlnumber
new_certs_dir     = $dir
certificate       = $dir/intermediate.crt
private_key       = $dir/intermediate.key
default_md        = sha256
default_days      = 1825
default_crl_days  = 365
policy            = policy_anything
unique_subject    = no
copy_extensions   = copy

[policy_anything]
countryName            = optional
stateOrProvinceName    = optional
localityName           = optional
organizationName       = optional
organizationalUnitName = optional
commonName             = supplied
emailAddress           = optional

[req]
distinguished_name = req_dn
prompt             = no

[req_dn]
CN = pdfbox-ts LTV Intermediate CA

[v3_signing]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature, nonRepudiation
extendedKeyUsage       = emailProtection
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always
authorityInfoAccess    = OCSP;URI:http://localhost:9081,caIssuers;URI:http://localhost:9080/intermediate.crt
crlDistributionPoints  = URI:http://localhost:9080/intermediate.crl

[v3_ocsp]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature
extendedKeyUsage       = OCSPSigning
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always
# id-pkix-ocsp-nocheck: OCSP responder cert doesn't need revocation checking
1.3.6.1.5.5.7.48.1.5  = ASN1:NULL
INTCNF

sed -i '' "s|INTDIR|$(pwd)/$CA_DIR/intermediate|g" "$CA_DIR/intermediate/intermediate.cnf"

# Initialize intermediate CA database
touch "$CA_DIR/intermediate/index.txt"
echo '01' > "$CA_DIR/intermediate/serial"
echo '01' > "$CA_DIR/intermediate/crlnumber"

# Generate intermediate key and CSR
openssl genrsa -out "$CA_DIR/intermediate/intermediate.key" 2048 2>/dev/null
openssl req -new -key "$CA_DIR/intermediate/intermediate.key" \
  -out "$CA_DIR/intermediate/intermediate.csr" \
  -subj "/CN=pdfbox-ts LTV Intermediate CA" 2>/dev/null

# Sign with root CA
openssl ca -batch \
  -config "$CA_DIR/root/root.cnf" \
  -extensions v3_intermediate \
  -in "$CA_DIR/intermediate/intermediate.csr" \
  -out "$CA_DIR/intermediate/intermediate.crt" 2>/dev/null

# Generate intermediate CRL
openssl ca -gencrl \
  -config "$CA_DIR/intermediate/intermediate.cnf" \
  -out "$CA_DIR/intermediate/intermediate.crl" 2>/dev/null

echo "  Intermediate CA: $(openssl x509 -in "$CA_DIR/intermediate/intermediate.crt" -noout -subject 2>/dev/null)"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Signing Certificate
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Creating Signing Certificate ---"

openssl genrsa -out "$CA_DIR/signing/signing.key" 2048 2>/dev/null
openssl req -new -key "$CA_DIR/signing/signing.key" \
  -out "$CA_DIR/signing/signing.csr" \
  -subj "/CN=pdfbox-ts LTV Signer" 2>/dev/null

# Sign with intermediate CA
openssl ca -batch \
  -config "$CA_DIR/intermediate/intermediate.cnf" \
  -extensions v3_signing \
  -in "$CA_DIR/signing/signing.csr" \
  -out "$CA_DIR/signing/signing.crt" 2>/dev/null

# Create PKCS#12 bundle (signing key + cert + chain)
cat "$CA_DIR/intermediate/intermediate.crt" "$CA_DIR/root/root.crt" > "$CA_DIR/signing/chain.pem"
openssl pkcs12 -export \
  -out "$CA_DIR/signing/signing.p12" \
  -inkey "$CA_DIR/signing/signing.key" \
  -in "$CA_DIR/signing/signing.crt" \
  -certfile "$CA_DIR/signing/chain.pem" \
  -passout pass:changeit 2>/dev/null

echo "  Signing cert: $(openssl x509 -in "$CA_DIR/signing/signing.crt" -noout -subject 2>/dev/null)"

# ─────────────────────────────────────────────────────────────────────────────
# 4. OCSP Responder Certificate
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Creating OCSP Responder Certificate ---"

openssl genrsa -out "$CA_DIR/ocsp/ocsp.key" 2048 2>/dev/null
openssl req -new -key "$CA_DIR/ocsp/ocsp.key" \
  -out "$CA_DIR/ocsp/ocsp.csr" \
  -subj "/CN=pdfbox-ts OCSP Responder" 2>/dev/null

# Sign with intermediate CA
openssl ca -batch \
  -config "$CA_DIR/intermediate/intermediate.cnf" \
  -extensions v3_ocsp \
  -in "$CA_DIR/ocsp/ocsp.csr" \
  -out "$CA_DIR/ocsp/ocsp.crt" 2>/dev/null

echo "  OCSP cert: $(openssl x509 -in "$CA_DIR/ocsp/ocsp.crt" -noout -subject 2>/dev/null)"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Full chain file and summary
# ─────────────────────────────────────────────────────────────────────────────
cat "$CA_DIR/signing/signing.crt" \
    "$CA_DIR/intermediate/intermediate.crt" \
    "$CA_DIR/root/root.crt" > "$CA_DIR/chain.pem"

# Copy CRL and certs to a flat "serve" directory for the static server
mkdir -p "$CA_DIR/serve"
cp "$CA_DIR/root/root.crt" "$CA_DIR/serve/"
cp "$CA_DIR/root/root.crl" "$CA_DIR/serve/"
cp "$CA_DIR/intermediate/intermediate.crt" "$CA_DIR/serve/"
cp "$CA_DIR/intermediate/intermediate.crl" "$CA_DIR/serve/"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Files:"
echo "  Root CA cert:         $CA_DIR/root/root.crt"
echo "  Root CRL:             $CA_DIR/root/root.crl"
echo "  Intermediate cert:    $CA_DIR/intermediate/intermediate.crt"
echo "  Intermediate CRL:     $CA_DIR/intermediate/intermediate.crl"
echo "  Signing cert:         $CA_DIR/signing/signing.crt"
echo "  Signing key:          $CA_DIR/signing/signing.key"
echo "  Signing PKCS#12:      $CA_DIR/signing/signing.p12 (pass: changeit)"
echo "  OCSP responder cert:  $CA_DIR/ocsp/ocsp.crt"
echo "  OCSP responder key:   $CA_DIR/ocsp/ocsp.key"
echo "  Full chain:           $CA_DIR/chain.pem"
echo "  Static serve dir:     $CA_DIR/serve/"
echo ""
echo "To add Root CA to Adobe Acrobat trust store:"
echo "  1. Open any PDF signed with the LTV signing cert"
echo "  2. Signature Panel → right-click sig → Show Signature Properties"
echo "  3. Certificate tab → select 'pdfbox-ts LTV Root CA'"
echo "  4. Trust → Add to Trusted Certificates → check all boxes"
echo ""
echo "To start servers:"
echo "  bash scripts/ltv-ocsp-start.sh"
