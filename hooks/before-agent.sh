#!/usr/bin/env bash

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

main() {
  INPUT=$(read_stdin)
  SESSION_ID=$(json_get "$INPUT" "session_id")
  CWD=$(json_get "$INPUT" "cwd")
  PROMPT=$(json_get "$INPUT" "prompt")

  AGENT_NAME="${MAESTRO_CURRENT_AGENT:-}"
  # MAESTRO_CURRENT_AGENT is set by parallel-dispatch.sh (exported to the
  # subprocess environment). In parallel dispatch, hooks inherit it via
  # process.env. In sequential delegation (main session), this env var is
  # never set — detection falls through to the delegation-pattern regex below.

  if [ -z "$AGENT_NAME" ]; then
    AGENT_NAME=$(python3 - "$PROMPT" <<'PYEOF' 2>/dev/null || echo ""
import sys, re

KNOWN_AGENTS = [
    "architect", "api-designer", "code-reviewer", "coder",
    "data-engineer", "debugger", "devops-engineer", "performance-engineer",
    "refactor", "security-engineer", "technical-writer", "tester"
]

prompt = sys.argv[1].lower()
for agent in KNOWN_AGENTS:
    DELEGATION_PATTERNS = [
        r'(?:delegate|transfer|hand\s*off|dispatch|invoke)\s+(?:to\s+)?(?:the\s+)?' + re.escape(agent) + r'\b',
        r'@' + re.escape(agent) + r'\b',
    ]
    if any(re.search(p, prompt) for p in DELEGATION_PATTERNS):
        print(agent)
        sys.exit(0)

print('')
PYEOF
    )
  fi

  if [ -n "$AGENT_NAME" ] && validate_session_id "$SESSION_ID" 2>/dev/null; then
    set_active_agent "$SESSION_ID" "$AGENT_NAME"
    log_hook "INFO" "BeforeAgent: Detected agent '$AGENT_NAME' — set active agent [session=$SESSION_ID]"
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
    respond_with_context "$CONTEXT_PARTS"
  else
    respond_allow
  fi
}

safe_main main
