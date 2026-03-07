#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-3.0.1}"
ARCHIVE_URL="https://archive.apache.org/dist/pdfbox/${VERSION}/pdfbox-app-${VERSION}.jar"
TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/vendor"
TARGET_FILE="${TARGET_DIR}/pdfbox-app-${VERSION}.jar"

mkdir -p "${TARGET_DIR}"

if [ -f "${TARGET_FILE}" ]; then
  echo "PDFBox ${VERSION} already downloaded at ${TARGET_FILE}"
  exit 0
fi

echo "Downloading PDFBox ${VERSION}..."
curl -L "${ARCHIVE_URL}" -o "${TARGET_FILE}"
echo "Saved to ${TARGET_FILE}"
