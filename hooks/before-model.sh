#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")

ACTIVE_AGENT=$(get_active_agent "$SESSION_ID" 2>/dev/null || echo "")

if [ -z "$ACTIVE_AGENT" ]; then
  echo '{}'
  exit 0
fi

MODEL_OVERRIDE=""

if [ "$ACTIVE_AGENT" = "technical-writer" ] && [ -n "${MAESTRO_WRITER_MODEL:-}" ]; then
  MODEL_OVERRIDE="$MAESTRO_WRITER_MODEL"
elif [ -n "${MAESTRO_DEFAULT_MODEL:-}" ]; then
  MODEL_OVERRIDE="$MAESTRO_DEFAULT_MODEL"
fi

if [ -n "$MODEL_OVERRIDE" ]; then
  python3 -c "
import json, sys
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'BeforeModel',
        'llm_request': {
            'model': sys.argv[1]
        }
    }
}))
" "$MODEL_OVERRIDE"
else
  echo '{}'
fi
