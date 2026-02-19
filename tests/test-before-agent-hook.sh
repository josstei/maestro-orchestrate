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

echo "Test 2: Detects agent name from MAESTRO_CURRENT_AGENT env var and sets active-agent"
rm -rf "$STATE_DIR/test-ba-001" 2>/dev/null || true
INPUT_AGENT='{"session_id":"test-ba-001","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Implement the TODO API endpoint."}'
OUTPUT=$(MAESTRO_CURRENT_AGENT="coder" bash "$HOOK" <<< "$INPUT_AGENT" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for agent detection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON for agent detection")
PYEOF

TRACKED=$(cat "$STATE_DIR/test-ba-001/active-agent" 2>/dev/null || echo "")
if [ "$TRACKED" = "coder" ]; then
  echo "PASS: Active agent set to 'coder' from MAESTRO_CURRENT_AGENT env var"
else
  echo "FAIL: Expected 'coder' in active-agent, got '$TRACKED'"
  exit 1
fi

echo "Test 3: Falls back to prompt-based delegation-pattern detection when agent_name absent"
rm -rf "$STATE_DIR/test-ba-004" 2>/dev/null || true
INPUT_FALLBACK='{"session_id":"test-ba-004","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"delegate to tester to run the test suite"}'
OUTPUT=$(echo "$INPUT_FALLBACK" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for fallback detection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON for fallback detection")
PYEOF

TRACKED_FALLBACK=$(cat "$STATE_DIR/test-ba-004/active-agent" 2>/dev/null || echo "")
if [ "$TRACKED_FALLBACK" = "tester" ]; then
  echo "PASS: Active agent set to 'tester' via prompt-based delegation-pattern fallback"
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
assert hso.get('hookEventName') == 'BeforeAgent', f'Expected hookEventName=BeforeAgent, got: {hso.get("hookEventName")}'
assert data.get('decision') == 'allow', f'Expected decision allow, got {data.get("decision")}'
ctx = hso.get('additionalContext', '')
assert 'current_phase=phase-2-implementation' in ctx, f'Expected phase info in context, got: {ctx}'
assert 'status=in_progress' in ctx, f'Expected status in context, got: {ctx}'
print(f'PASS: additionalContext injected: {ctx}')
PYEOF

rm -rf "$TEMP_CWD"

echo "Test 5: Honors MAESTRO_STATE_DIR for relative custom state path"
TEMP_CWD_CUSTOM=$(mktemp -d)
mkdir -p "$TEMP_CWD_CUSTOM/.maestro/state"
cat > "$TEMP_CWD_CUSTOM/.maestro/state/active-session.md" <<'STATE'
---
session_id: test-session-custom
current_phase: phase-4-validation
status: in_progress
---
Custom state directory is active.
STATE

INPUT_CTX_CUSTOM="{\"session_id\":\"test-ba-005\",\"transcript_path\":\"/tmp/t\",\"cwd\":\"$TEMP_CWD_CUSTOM\",\"hook_event_name\":\"BeforeAgent\",\"timestamp\":\"2026-02-17T00:00:00Z\",\"prompt\":\"Continue working\"}"
OUTPUT=$(MAESTRO_STATE_DIR=".maestro" bash "$HOOK" <<< "$INPUT_CTX_CUSTOM" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for custom state dir injection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
hso = data.get('hookSpecificOutput', {})
ctx = hso.get('additionalContext', '')
assert 'current_phase=phase-4-validation' in ctx, f'Expected phase info in context, got: {ctx}'
assert 'status=in_progress' in ctx, f'Expected status in context, got: {ctx}'
print(f'PASS: MAESTRO_STATE_DIR relative path honored: {ctx}')
PYEOF

rm -rf "$TEMP_CWD_CUSTOM"

echo "Test 6: Honors MAESTRO_STATE_DIR for absolute custom state path"
ABS_STATE_ROOT=$(mktemp -d)
mkdir -p "$ABS_STATE_ROOT/state"
cat > "$ABS_STATE_ROOT/state/active-session.md" <<'STATE'
---
session_id: test-session-absolute
current_phase: phase-5-docs
status: in_progress
---
Absolute state directory is active.
STATE

INPUT_CTX_ABS='{"session_id":"test-ba-006","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Continue working"}'
OUTPUT=$(MAESTRO_STATE_DIR="$ABS_STATE_ROOT" bash "$HOOK" <<< "$INPUT_CTX_ABS" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for absolute state dir injection"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
hso = data.get('hookSpecificOutput', {})
ctx = hso.get('additionalContext', '')
assert 'current_phase=phase-5-docs' in ctx, f'Expected phase info in context, got: {ctx}'
assert 'status=in_progress' in ctx, f'Expected status in context, got: {ctx}'
print(f'PASS: MAESTRO_STATE_DIR absolute path honored: {ctx}')
PYEOF

rm -rf "$ABS_STATE_ROOT"

echo "Test 7: Returns allow with no context when session state missing"
INPUT_NO_STATE='{"session_id":"test-ba-003","transcript_path":"/tmp/t","cwd":"/tmp/nonexistent","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Test prompt"}'
OUTPUT=$(echo "$INPUT_NO_STATE" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON for no-state case"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
decision = data.get('decision', '')
assert decision == 'allow', f'Expected allow decision, got {data}'
print("PASS: Returns allow when no session state")
PYEOF

echo "Test 8: Casual agent name mention does not trigger detection"
rm -rf "$STATE_DIR/test-ba-casual" 2>/dev/null || true
INPUT_CASUAL='{"session_id":"test-ba-casual","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"You are the tester agent. Run the test suite."}'
echo "$INPUT_CASUAL" | bash "$HOOK" 2>/dev/null
TRACKED_CASUAL=$(cat "$STATE_DIR/test-ba-casual/active-agent" 2>/dev/null || echo "")
if [ -z "$TRACKED_CASUAL" ]; then
  echo "PASS: Casual agent name mention did not set active-agent"
else
  echo "FAIL: Expected no active-agent for casual mention, got '$TRACKED_CASUAL'"
  exit 1
fi

rm -rf "$STATE_DIR/test-ba-001" "$STATE_DIR/test-ba-002" "$STATE_DIR/test-ba-003" "$STATE_DIR/test-ba-004" "$STATE_DIR/test-ba-casual" 2>/dev/null || true
echo "=== All BeforeAgent hook tests passed ==="
