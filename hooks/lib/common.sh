#!/usr/bin/env bash
set -euo pipefail

MAESTRO_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAESTRO_ROOT="$(cd "$MAESTRO_HOOKS_DIR/.." && pwd)"

read_stdin() {
  if [ -t 0 ]; then
    echo "{}"
    return
  fi
  cat
}

json_get() {
  local json="$1"
  local key="$2"
  python3 - "$json" "$key" <<'PYEOF' 2>/dev/null || echo ""
import sys, json
d = json.loads(sys.argv[1])
print(d.get(sys.argv[2], ''))
PYEOF
}

json_get_nested() {
  local json="$1"
  shift
  python3 - "$json" "$@" <<'PYEOF' 2>/dev/null || echo ""
import sys, json
d = json.loads(sys.argv[1])
for k in sys.argv[2:]:
    if isinstance(d, dict):
        d = d.get(k, '')
    else:
        d = ''
        break
print(d if isinstance(d, str) else json.dumps(d))
PYEOF
}

respond_allow() {
  local msg="${1:-}"
  if [ -n "$msg" ]; then
    python3 - "$msg" <<'PYEOF'
import sys, json
print(json.dumps({"decision": "allow", "systemMessage": sys.argv[1]}))
PYEOF
  else
    echo '{"decision":"allow"}'
  fi
}

respond_block() {
  local reason="$1"
  python3 - "$reason" <<'PYEOF'
import sys, json
print(json.dumps({"decision": "block", "reason": sys.argv[1]}))
PYEOF
}

respond_with_context() {
  local event="$1"
  local context="$2"
  python3 - "$event" "$context" <<'PYEOF'
import sys, json
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": sys.argv[1],
        "additionalContext": sys.argv[2]
    }
}))
PYEOF
}

log_hook() {
  local level="$1"
  local msg="$2"
  echo "[$level] maestro: $msg" >&2
}

validate_session_id() {
  local session_id="$1"
  if [[ ! "$session_id" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_hook "ERROR" "Invalid session_id: contains unsafe characters"
    return 1
  fi
  return 0
}

get_active_agent() {
  local session_id="$1"
  if ! validate_session_id "$session_id"; then
    echo ""
    return
  fi
  local state_dir="/tmp/maestro-hooks"
  local agent_file="$state_dir/$session_id/active-agent"
  if [ -f "$agent_file" ]; then
    cat "$agent_file"
  else
    echo ""
  fi
}

set_active_agent() {
  local session_id="$1"
  local agent_name="$2"
  if ! validate_session_id "$session_id"; then
    return 1
  fi
  local state_dir="/tmp/maestro-hooks"
  mkdir -p "$state_dir/$session_id"
  local tmp_file="$state_dir/$session_id/active-agent.tmp.$$"
  echo "$agent_name" > "$tmp_file"
  mv "$tmp_file" "$state_dir/$session_id/active-agent"
}

clear_active_agent() {
  local session_id="$1"
  if ! validate_session_id "$session_id"; then
    return 0
  fi
  local state_dir="/tmp/maestro-hooks"
  rm -f "$state_dir/$session_id/active-agent"
}

load_permissions() {
  local perms_file="$MAESTRO_HOOKS_DIR/permissions.json"
  if [ -f "$perms_file" ]; then
    cat "$perms_file"
  else
    echo "{}"
  fi
}

get_agent_tools() {
  local permissions="$1"
  local agent_name="$2"
  python3 - "$permissions" "$agent_name" <<'PYEOF' 2>/dev/null || echo ""
import sys, json
perms = json.loads(sys.argv[1])
tools = perms.get(sys.argv[2], [])
print(' '.join(tools))
PYEOF
}

is_tool_allowed() {
  local permissions="$1"
  local agent_name="$2"
  local tool_name="$3"
  python3 - "$permissions" "$agent_name" "$tool_name" <<'PYEOF' 2>/dev/null || echo "blocked"
import sys, json
perms = json.loads(sys.argv[1])
agent_name = sys.argv[2]
tool_name = sys.argv[3]
agent_tools = perms.get(agent_name, None)
if agent_tools is None:
    print('unknown_agent')
elif tool_name in agent_tools:
    print('allowed')
elif tool_name.startswith('maestro__'):
    mcp_base = tool_name[len('maestro__'):]
    if mcp_base in agent_tools or tool_name in agent_tools:
        print('allowed')
    else:
        print('blocked')
else:
    print('blocked')
PYEOF
}
