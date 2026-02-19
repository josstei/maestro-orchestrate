#!/usr/bin/env bash

MAESTRO_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

json_get_bool() {
  local json="$1"
  local key="$2"
  python3 - "$json" "$key" <<'PYEOF' 2>/dev/null || echo "false"
import sys, json
d = json.loads(sys.argv[1])
v = d.get(sys.argv[2], False)
print("true" if v else "false")
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
  echo '{"decision":"allow"}'
}

respond_block() {
  local reason="$1"
  python3 - "$reason" <<'PYEOF'
import sys, json
print(json.dumps({"decision": "deny", "reason": sys.argv[1]}))
PYEOF
}

respond_with_context() {
  local context="$1"
  local hook_event_name="${2:-BeforeAgent}"
  python3 - "$context" "$hook_event_name" <<'PYEOF'
import sys, json
print(json.dumps({
    "decision": "allow",
    "hookSpecificOutput": {
        "hookEventName": sys.argv[2],
        "additionalContext": sys.argv[1]
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
  if [[ ! "$session_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
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

safe_main() {
  local main_fn="$1"
  local hook_mode="${2:-blocking}"
  if ! "$main_fn"; then
    log_hook "ERROR" "Hook failed — returning safe default"
    if [ "$hook_mode" = "advisory" ]; then
      echo '{}'
    else
      echo '{"decision":"allow"}'
    fi
  fi
}
