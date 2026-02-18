#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")
CWD=$(json_get "$INPUT" "cwd")
SOURCE=$(json_get "$INPUT" "source")

log_hook "INFO" "SessionStart [session=$SESSION_ID, source=$SOURCE, cwd=$CWD]"

if [ -f "$MAESTRO_ROOT/hooks/generate-permissions.sh" ]; then
  AGENTS_DIR="$MAESTRO_ROOT/agents" bash "$MAESTRO_ROOT/hooks/generate-permissions.sh" 2>/dev/null || log_hook "WARN" "Permissions manifest generation failed"
fi

STATE_DIR="/tmp/maestro-hooks"
if [ -d "$STATE_DIR" ]; then
  find "$STATE_DIR" -maxdepth 1 -type d -mmin +120 -not -path "$STATE_DIR" -exec rm -rf {} \; 2>/dev/null || true
fi

if validate_session_id "$SESSION_ID" 2>/dev/null; then
  mkdir -p "$STATE_DIR/$SESSION_ID"
fi

respond_allow "Maestro hooks initialized"
