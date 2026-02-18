#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")
STOP_HOOK_ACTIVE=$(json_get "$INPUT" "stop_hook_active")

AGENT_NAME="${MAESTRO_CURRENT_AGENT:-}"
if [ -z "$AGENT_NAME" ]; then
  AGENT_NAME=$(get_active_agent "$SESSION_ID")
fi

STOP_HOOK_LOWER=$(echo "$STOP_HOOK_ACTIVE" | tr '[:upper:]' '[:lower:]')
if [ -n "$AGENT_NAME" ] && [ "$STOP_HOOK_LOWER" != "true" ]; then
  TMPFILE=$(mktemp)
  echo "$INPUT" > "$TMPFILE"
  VALIDATION=$(python3 - "$TMPFILE" <<'PYEOF' 2>/dev/null || echo "OK"
import sys, json

with open(sys.argv[1], 'r') as f:
    data = json.load(f)

response = data.get('prompt_response', '')

has_task_report = 'Task Report' in response or 'Status:' in response
has_downstream = 'Downstream Context' in response or 'downstream' in response.lower()

warnings = []
if not has_task_report:
    warnings.append('Missing Task Report section')
if not has_downstream:
    warnings.append('Missing Downstream Context section')

if warnings:
    print('WARN: ' + '; '.join(warnings))
else:
    print('OK')
PYEOF
  )
  rm -f "$TMPFILE"

  if [[ "$VALIDATION" == WARN:* ]]; then
    REASON="${VALIDATION#WARN: }"
    log_hook "WARN" "AfterAgent [$AGENT_NAME]: $VALIDATION — requesting retry"
    python3 - "$REASON" <<'PYEOF'
import sys, json
print(json.dumps({"decision": "deny", "reason": "Handoff report validation failed: " + sys.argv[1] + ". Please include both a Task Report section and a Downstream Context section in your response."}))
PYEOF
    exit 0
  else
    log_hook "INFO" "AfterAgent [$AGENT_NAME]: Handoff report validated"
  fi
fi

clear_active_agent "$SESSION_ID"
respond_allow
