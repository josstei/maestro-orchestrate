#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")

AGENT_NAME="${MAESTRO_CURRENT_AGENT:-}"

if [ -z "$AGENT_NAME" ]; then
  AGENT_NAME=$(get_active_agent "$SESSION_ID")
fi

if [ -z "$AGENT_NAME" ]; then
  echo '{}'
  exit 0
fi

PERMISSIONS=$(load_permissions)
TOOLS=$(get_agent_tools "$PERMISSIONS" "$AGENT_NAME")

if [ -z "$TOOLS" ]; then
  echo '{}'
  exit 0
fi

python3 - "$TOOLS" <<'PYEOF'
import sys, json
tools = sys.argv[1].split()
result = {
    "hookSpecificOutput": {
        "hookEventName": "BeforeToolSelection",
        "toolConfig": {
            "mode": "AUTO",
            "allowedFunctionNames": tools
        }
    }
}
print(json.dumps(result))
PYEOF
