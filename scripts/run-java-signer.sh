#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <input.pdf> <output.pdf> [pdfbox-version]" >&2
  exit 1
fi

INPUT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUTPUT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
VERSION="${3:-3.0.1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_JAR="${REPO_ROOT}/vendor/pdfbox-app-${VERSION}.jar"
EXAMPLES_JAR="${REPO_ROOT}/vendor/pdfbox-examples-${VERSION}.jar"
PATCHED_CLASS="${REPO_ROOT}/scripts/java/PatchedSignature.class"
SANITIZER_CLASS="${REPO_ROOT}/scripts/java/PdfSanitizer.class"
JFR_ENABLED="${PDFBOX_TS_JFR:-0}"
JFR_FILE="${PDFBOX_TS_JFR_FILE:-calltrace.jfr}"

if [ ! -f "${APP_JAR}" ]; then
  "${SCRIPT_DIR}/download-pdfbox.sh" "${VERSION}"
fi

if [ ! -f "${EXAMPLES_JAR}" ]; then
  curl -L -o "${EXAMPLES_JAR}" "https://repo1.maven.org/maven2/org/apache/pdfbox/pdfbox-examples/${VERSION}/pdfbox-examples-${VERSION}.jar"
fi

JAVA=${JAVA:-java}
JAVA_OPTS=()
if [ "${JFR_ENABLED}" != "0" ]; then
  JAVA_OPTS+=("-XX:StartFlightRecording=settings=profile,filename=${JFR_FILE},dumponexit=true")
fi
KEYSTORE="${REPO_ROOT}/fixtures/keys/pdfbox-ts-keystore.p12"
STORE_PASS="${PDFBOX_STORE_PASS:-password}"

SIGN_INPUT="${INPUT}"

CLASS_PATH="${APP_JAR}:${EXAMPLES_JAR}"
MAIN_CLASS="org.apache.pdfbox.examples.signature.CreateSignature"

if [ -f "${PATCHED_CLASS}" ]; then
  CLASS_PATH="${CLASS_PATH}:${REPO_ROOT}/scripts/java"
  MAIN_CLASS="PatchedSignature"
elif [ -f "${SANITIZER_CLASS}" ]; then
  CLASS_PATH="${CLASS_PATH}:${REPO_ROOT}/scripts/java"
  SANITIZED="${INPUT%.pdf}_sanitized.pdf"
  if [ "${SANITIZED}" = "${INPUT}" ]; then
    SANITIZED="${INPUT}_sanitized.pdf"
  fi
  JAVA_SANITIZE_CMD=("${JAVA}")
  if [ "${#JAVA_OPTS[@]}" -gt 0 ]; then
    JAVA_SANITIZE_CMD+=("${JAVA_OPTS[@]}")
  fi
  JAVA_SANITIZE_CMD+=(-cp "${CLASS_PATH}" PdfSanitizer "${INPUT}" "${SANITIZED}")
  "${JAVA_SANITIZE_CMD[@]}"
  SIGN_INPUT="${SANITIZED}"
fi

JAVA_CMD=("${JAVA}")
if [ "${#JAVA_OPTS[@]}" -gt 0 ]; then
  JAVA_CMD+=("${JAVA_OPTS[@]}")
fi
JAVA_CMD+=(-cp "${CLASS_PATH}" "${MAIN_CLASS}" "${KEYSTORE}" "${STORE_PASS}" "${SIGN_INPUT}")
"${JAVA_CMD[@]}"

DEFAULT_OUTPUT="${SIGN_INPUT%.pdf}_signed.pdf"
if [ ! -f "${DEFAULT_OUTPUT}" ]; then
  DEFAULT_OUTPUT="${SIGN_INPUT}_patched_signed.pdf"
fi

if [ ! -f "${DEFAULT_OUTPUT}" ]; then
  echo "Expected signed output ${DEFAULT_OUTPUT} not found." >&2
  exit 1
fi

mv -f "${DEFAULT_OUTPUT}" "${OUTPUT}"
