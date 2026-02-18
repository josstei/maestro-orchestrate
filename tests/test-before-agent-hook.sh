#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/before-agent.sh"
STATE_DIR="/tmp/maestro-hooks"

echo "=== Test: BeforeAgent Hook ==="

echo "Test 1: Returns valid JSON with no session state"
INPUT='{"session_id":"test-789","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Implement the feature"}'
OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON")
PYEOF

echo "Test 2: Detects agent name from agent_name field and sets active-agent"
rm -rf "$STATE_DIR/test-ba-001" 2>/dev/null || true
INPUT_AGENT='{"session_id":"test-ba-001","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","agent_name":"coder","prompt":"Implement the TODO API endpoint."}'
OUTPUT=$(echo "$INPUT_AGENT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for agent detection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON for agent detection")
PYEOF

TRACKED=$(cat "$STATE_DIR/test-ba-001/active-agent" 2>/dev/null || echo "")
if [ "$TRACKED" = "coder" ]; then
  echo "PASS: Active agent set to 'coder' from agent_name field"
else
  echo "FAIL: Expected 'coder' in active-agent, got '$TRACKED'"
  exit 1
fi

echo "Test 3: Falls back to prompt-based word-boundary detection when agent_name absent"
rm -rf "$STATE_DIR/test-ba-004" 2>/dev/null || true
INPUT_FALLBACK='{"session_id":"test-ba-004","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"You are the tester agent. Run the test suite."}'
OUTPUT=$(echo "$INPUT_FALLBACK" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for fallback detection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON for fallback detection")
PYEOF

TRACKED_FALLBACK=$(cat "$STATE_DIR/test-ba-004/active-agent" 2>/dev/null || echo "")
if [ "$TRACKED_FALLBACK" = "tester" ]; then
  echo "PASS: Active agent set to 'tester' via prompt-based fallback"
else
  echo "FAIL: Expected 'tester' in active-agent via fallback, got '$TRACKED_FALLBACK'"
  exit 1
fi

echo "Test 4: Injects additionalContext when session state exists"
TEMP_CWD=$(mktemp -d)
mkdir -p "$TEMP_CWD/.gemini/state"
cat > "$TEMP_CWD/.gemini/state/active-session.md" <<'STATE'
---
session_id: test-session
current_phase: phase-2-implementation
status: in_progress
---
Phase 2 is active.
STATE

INPUT_CTX="{\"session_id\":\"test-ba-002\",\"transcript_path\":\"/tmp/t\",\"cwd\":\"$TEMP_CWD\",\"hook_event_name\":\"BeforeAgent\",\"timestamp\":\"2026-02-17T00:00:00Z\",\"prompt\":\"Continue working\"}"
OUTPUT=$(echo "$INPUT_CTX" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for context injection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
hso = data.get('hookSpecificOutput', {})
assert hso.get('hookEventName') == 'BeforeAgent', f'Expected hookEventName BeforeAgent, got {hso.get("hookEventName")}'
ctx = hso.get('additionalContext', '')
assert 'current_phase=phase-2-implementation' in ctx, f'Expected phase info in context, got: {ctx}'
assert 'status=in_progress' in ctx, f'Expected status in context, got: {ctx}'
print(f'PASS: additionalContext injected: {ctx}')
PYEOF

rm -rf "$TEMP_CWD"

echo "Test 5: Returns allow with no context when session state missing"
INPUT_NO_STATE='{"session_id":"test-ba-003","transcript_path":"/tmp/t","cwd":"/tmp/nonexistent","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Test prompt"}'
OUTPUT=$(echo "$INPUT_NO_STATE" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for no-state case"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
decision = data.get('decision', '')
assert decision == 'allow', f'Expected allow decision, got {data}'
print("PASS: Returns allow when no session state")
PYEOF

rm -rf "$STATE_DIR/test-789" "$STATE_DIR/test-ba-001" "$STATE_DIR/test-ba-002" "$STATE_DIR/test-ba-003" "$STATE_DIR/test-ba-004" 2>/dev/null || true
echo "=== All BeforeAgent hook tests passed ==="
