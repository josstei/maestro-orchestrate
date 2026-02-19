#!/usr/bin/env bash

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

main() {
  INPUT=$(read_stdin)
  SESSION_ID=$(json_get "$INPUT" "session_id")
  STOP_HOOK_ACTIVE=$(json_get_bool "$INPUT" "stop_hook_active")

  AGENT_NAME=$(get_active_agent "$SESSION_ID")

  AGENT_NAME_LOWER=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')
  if [ -n "$AGENT_NAME" ] && [ "$AGENT_NAME_LOWER" != "techlead" ] && [ "$AGENT_NAME_LOWER" != "orchestrator" ]; then
    TMPFILE=$(mktemp)
    echo "$INPUT" > "$TMPFILE"
    VALIDATION=$(python3 - "$TMPFILE" <<'PYEOF' 2>/dev/null || echo "OK"
import sys, json

with open(sys.argv[1], 'r') as f:
    data = json.load(f)

response = data.get('prompt_response', '')

has_task_report = '## Task Report' in response or '# Task Report' in response
has_downstream = '## Downstream Context' in response or '# Downstream Context' in response

warnings = []
if not has_task_report:
    warnings.append('Missing Task Report section (expected ## Task Report heading)')
if not has_downstream:
    warnings.append('Missing Downstream Context section (expected ## Downstream Context heading)')

if warnings:
    print('WARN: ' + '; '.join(warnings))
else:
    print('OK')
PYEOF
    )
    rm -f "$TMPFILE"

    if [[ "$VALIDATION" == WARN:* ]]; then
      REASON="${VALIDATION#WARN: }"
      if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
        log_hook "WARN" "AfterAgent [$AGENT_NAME]: Retry still malformed: $REASON — allowing to prevent infinite loop"
      else
        log_hook "WARN" "AfterAgent [$AGENT_NAME]: $VALIDATION — requesting retry"
        clear_active_agent "$SESSION_ID"
        respond_block "Handoff report validation failed: $REASON. Please include both a ## Task Report section and a ## Downstream Context section in your response."
        return 0
      fi
    else
      log_hook "INFO" "AfterAgent [$AGENT_NAME]: Handoff report validated"
    fi
  fi

  clear_active_agent "$SESSION_ID"
  respond_allow
}

safe_main main
