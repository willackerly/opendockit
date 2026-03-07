#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# pdfbox-ts Agent Harness
# -----------------------------------------------------------------------------
# Usage:
#   ./run-agent.sh [repo_root]
# Defaults to the directory containing this script.
#
# What this does:
#   1. Ensures we are inside the repo.
#   2. Displays AGENTS.md as the primer.
#   3. Launches Codex with danger-full-access sandbox and on-request approvals,
#      with network enabled by default.
#   4. Falls back to an interactive shell if Codex is missing.
# -----------------------------------------------------------------------------

HARNESS_ROOT="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$HARNESS_ROOT}"

if [[ ! -d "$REPO_ROOT" ]]; then
  echo "Repository path not found: $REPO_ROOT" >&2
  exit 1
fi

cd "$REPO_ROOT"

clear
echo "=============================================================================="
echo "pdfbox-ts Agent Harness @ $REPO_ROOT"
echo "=============================================================================="

PRIMER_FILE="$REPO_ROOT/AGENTS.md"
if [[ -f "$PRIMER_FILE" ]]; then
  cat "$PRIMER_FILE"
else
  echo "AGENTS.md not found! Please add the agent guide before continuing."
fi

echo "=============================================================================="
echo "Launching Codex (danger-full-access, approval policy on-request, network ON)."
echo "Override by exporting CODEX_* env vars or editing this script."
echo "=============================================================================="

export CODEX_SANDBOX_MODE="${CODEX_SANDBOX_MODE:-danger-full-access}"
export CODEX_APPROVAL_POLICY="${CODEX_APPROVAL_POLICY:-on-request}"
export CODEX_SHELL="${CODEX_SHELL:-zsh}"
export CODEX_SANDBOX_NETWORK_DISABLED="${CODEX_SANDBOX_NETWORK_DISABLED:-0}"
export CODEX_BIN="${CODEX_BIN:-codex}"

if command -v "${CODEX_BIN}" >/dev/null 2>&1; then
  echo "[agent] Starting Codex with primer: ${PRIMER_FILE}"
  set +e
  if [[ -f "$PRIMER_FILE" ]]; then
    PRIMER_CONTENT="$(cat "$PRIMER_FILE")"
    "${CODEX_BIN}" -C "$REPO_ROOT" --sandbox "${CODEX_SANDBOX_MODE}" --ask-for-approval "${CODEX_APPROVAL_POLICY}" "${PRIMER_CONTENT}"
  else
    "${CODEX_BIN}" -C "$REPO_ROOT" --sandbox "${CODEX_SANDBOX_MODE}" --ask-for-approval "${CODEX_APPROVAL_POLICY}"
  fi
  status=$?
  set -e
  if [[ $status -eq 0 ]]; then
    exit 0
  fi
  echo "[agent] Codex exited with status ${status}; falling back to shell."
fi

SHELL_CMD="${CODEX_SHELL}"
if ! command -v "${SHELL_CMD}" >/dev/null 2>&1; then
  echo "[agent] Requested shell '${SHELL_CMD}' not found; falling back to /bin/zsh"
  SHELL_CMD="/bin/zsh"
fi

exec "${SHELL_CMD}" -i
