#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")
TOOL_NAME=$(json_get "$INPUT" "tool_name")

if is_known_agent "$TOOL_NAME"; then
  clear_active_agent "$SESSION_ID"
  log_hook "INFO" "AfterTool: Subagent '$TOOL_NAME' completed — cleared active agent [session=$SESSION_ID]"
fi

echo '{}'
