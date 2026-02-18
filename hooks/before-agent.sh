#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")
CWD=$(json_get "$INPUT" "cwd")
PROMPT=$(json_get "$INPUT" "prompt")

DETECTED_AGENT=$(python3 - "$PROMPT" "$MAESTRO_HOOKS_DIR/permissions.json" <<'PYEOF' 2>/dev/null || echo ""
import sys, json

prompt = sys.argv[1]
perms_file = sys.argv[2]

try:
    with open(perms_file) as f:
        perms = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    print('')
    sys.exit(0)

prompt_lower = prompt.lower()
for agent_name in perms:
    if agent_name in prompt_lower:
        print(agent_name)
        sys.exit(0)

print('')
PYEOF
)

if [ -n "$DETECTED_AGENT" ] && validate_session_id "$SESSION_ID" 2>/dev/null; then
  set_active_agent "$SESSION_ID" "$DETECTED_AGENT"
  log_hook "INFO" "BeforeAgent: Detected agent '$DETECTED_AGENT' — set active agent [session=$SESSION_ID]"
fi

SESSION_STATE="$CWD/.gemini/state/active-session.md"
CONTEXT_PARTS=""

if [ -f "$SESSION_STATE" ]; then
  CONTEXT_PARTS=$(python3 - "$SESSION_STATE" <<'PYEOF' 2>/dev/null || echo ""
import re, sys
with open(sys.argv[1], 'r') as f:
    content = f.read()
parts = []
match = re.search(r'current_phase:\s*(\S+)', content)
if match:
    parts.append(f'current_phase={match.group(1)}')
match2 = re.search(r'status:\s*(\S+)', content)
if match2:
    parts.append(f'status={match2.group(1)}')
if parts:
    print('Active session: ' + ', '.join(parts))
PYEOF
  )
fi

if [ -n "$CONTEXT_PARTS" ]; then
  respond_with_context "BeforeAgent" "$CONTEXT_PARTS"
else
  respond_allow
fi
