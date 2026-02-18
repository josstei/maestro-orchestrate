#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")
TOOL_NAME=$(json_get "$INPUT" "tool_name")

AGENT_NAME=$(get_active_agent "$SESSION_ID")

if [ -z "$AGENT_NAME" ]; then
  respond_allow
  exit 0
fi

PERMISSIONS=$(load_permissions)
RESULT=$(is_tool_allowed "$PERMISSIONS" "$AGENT_NAME" "$TOOL_NAME")

case "$RESULT" in
  "allowed")
    respond_allow
    ;;
  "unknown_agent")
    log_hook "WARN" "Unknown agent '$AGENT_NAME' — allowing tool '$TOOL_NAME'"
    respond_allow
    ;;
  "blocked")
    ALLOWED_TOOLS=$(get_agent_tools "$PERMISSIONS" "$AGENT_NAME")
    log_hook "WARN" "BLOCKED: Agent '$AGENT_NAME' attempted to use '$TOOL_NAME'"
    respond_block "$AGENT_NAME is not authorized to use $TOOL_NAME. Allowed tools: $ALLOWED_TOOLS"
    ;;
  *)
    respond_allow
    ;;
esac
