#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")

AGENT_NAME="${MAESTRO_CURRENT_AGENT:-}"

if [ -n "$AGENT_NAME" ]; then
  set_active_agent "$SESSION_ID" "$AGENT_NAME"
  log_hook "INFO" "BeforeAgent: Tracking agent '$AGENT_NAME' [session=$SESSION_ID]"
fi

CWD=$(json_get "$INPUT" "cwd")
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
