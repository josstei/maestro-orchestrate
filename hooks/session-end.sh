#!/usr/bin/env bash

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

main() {
  INPUT=$(read_stdin)
  SESSION_ID=$(json_get "$INPUT" "session_id")

  if validate_session_id "$SESSION_ID" 2>/dev/null; then
    STATE_DIR="/tmp/maestro-hooks/$SESSION_ID"
    if [ -d "$STATE_DIR" ]; then
      rm -rf "$STATE_DIR"
      log_hook "INFO" "SessionEnd: Cleaned up state directory [session=$SESSION_ID]"
    fi
  fi

  log_hook "INFO" "SessionEnd: Session ended [session=$SESSION_ID]"
  echo '{}'
}

safe_main main
