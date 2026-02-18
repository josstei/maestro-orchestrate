#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOL_HOOK="$PROJECT_ROOT/hooks/before-tool.sh"
SELECTION_HOOK="$PROJECT_ROOT/hooks/before-tool-selection.sh"

echo "=== Test: Tool Permission Enforcement ==="

AGENTS_DIR="$PROJECT_ROOT/agents" bash "$PROJECT_ROOT/hooks/generate-permissions.sh" 2>/dev/null

echo "Test 1: No active agent — should allow all"
rm -rf /tmp/maestro-hooks/test-456 2>/dev/null || true
INPUT='{"session_id":"test-456","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeTool","timestamp":"2026-02-17T00:00:00Z","tool_name":"write_file","tool_input":{}}'
OUTPUT=$(echo "$INPUT" | bash "$TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
decision = d.get('decision', 'allow')
assert decision == 'allow', f'Expected allow, got {decision}'
print('PASS: No agent -> allow all')
PYEOF

echo "Test 2: code-reviewer (via state file) + write_file — should block"
mkdir -p /tmp/maestro-hooks/test-456
echo "code-reviewer" > /tmp/maestro-hooks/test-456/active-agent
OUTPUT=$(echo "$INPUT" | bash "$TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
decision = d.get('decision', '')
assert decision in ('block', 'deny'), f'Expected block/deny, got {decision}'
print('PASS: code-reviewer blocked from write_file')
PYEOF

echo "Test 3: code-reviewer (via state file) + read_file — should allow"
INPUT_READ='{"session_id":"test-456","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeTool","timestamp":"2026-02-17T00:00:00Z","tool_name":"read_file","tool_input":{}}'
OUTPUT=$(echo "$INPUT_READ" | bash "$TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
decision = d.get('decision', 'allow')
assert decision == 'allow', f'Expected allow, got {decision}'
print('PASS: code-reviewer allowed read_file')
PYEOF

echo "Test 4: coder (via state file) + write_file — should allow"
echo "coder" > /tmp/maestro-hooks/test-456/active-agent
OUTPUT=$(echo "$INPUT" | bash "$TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
decision = d.get('decision', 'allow')
assert decision == 'allow', f'Expected allow, got {decision}'
print('PASS: coder allowed write_file')
PYEOF

echo "Test 5: BeforeToolSelection suggests code-reviewer tools"
echo "code-reviewer" > /tmp/maestro-hooks/test-456/active-agent
SELECTION_INPUT='{"session_id":"test-456","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeToolSelection","timestamp":"2026-02-17T00:00:00Z","llm_request":{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Test prompt"}],"config":{"temperature":0.2},"toolConfig":{"mode":"AUTO","allowedFunctionNames":[]}}}'
OUTPUT=$(echo "$SELECTION_INPUT" | bash "$SELECTION_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
hso = d.get('hookSpecificOutput', {})
assert hso.get('hookEventName') == 'BeforeToolSelection', f'Expected hookEventName BeforeToolSelection, got {hso.get("hookEventName")}'
tc = hso.get('toolConfig', {})
allowed = tc.get('allowedFunctionNames', [])
assert 'read_file' in allowed, f'read_file should be suggested: {allowed}'
print(f'PASS: BeforeToolSelection suggests {len(allowed)} tools (UX only)')
PYEOF

echo "Test 6: No active agent for BeforeToolSelection — returns empty JSON"
rm -rf /tmp/maestro-hooks/test-456
SELECTION_INPUT_NO_AGENT='{"session_id":"test-456","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeToolSelection","timestamp":"2026-02-17T00:00:00Z","llm_request":{"model":"gemini-2.5-pro","messages":[]}}'
OUTPUT=$(echo "$SELECTION_INPUT_NO_AGENT" | bash "$SELECTION_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert d == {}, f'Expected empty JSON, got {d}'
print('PASS: No agent -> empty BeforeToolSelection response')
PYEOF

rm -rf /tmp/maestro-hooks/test-456 2>/dev/null || true
echo "=== All tool enforcement tests passed ==="
