#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/session-start.sh"
STATE_DIR="/tmp/maestro-hooks"

echo "=== Test: SessionStart Hook ==="

echo "Test 1: Returns valid JSON"
INPUT='{"session_id":"test-start-001","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"startup"}'

OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: SessionStart hook output invalid"; exit 1; }
import json, sys
output = json.loads(sys.argv[1])
assert isinstance(output, dict), "Output must be a JSON object"
print("PASS: SessionStart hook returns valid JSON")
PYEOF

echo "Test 2: Session state directory created"
if [ -d "$STATE_DIR/test-start-001" ]; then
  echo "PASS: Session state directory created"
else
  echo "FAIL: Session state directory not created at $STATE_DIR/test-start-001"
  exit 1
fi

rm -rf "$STATE_DIR/test-start-001"

echo "Test 3: Fires with source=resume and returns valid JSON"
INPUT_RESUME='{"session_id":"test-start-resume","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"resume"}'

OUTPUT_RESUME=$(echo "$INPUT_RESUME" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT_RESUME" <<'PYEOF' || { echo "FAIL: SessionStart resume output invalid"; exit 1; }
import json, sys
output = json.loads(sys.argv[1])
assert isinstance(output, dict), "Output must be a JSON object"
print("PASS: SessionStart hook fires on source=resume with valid JSON")
PYEOF

echo "Test 4: Session state directory created for resume source"
if [ -d "$STATE_DIR/test-start-resume" ]; then
  echo "PASS: Session state directory created for resume source"
else
  echo "FAIL: Session state directory not created at $STATE_DIR/test-start-resume"
  exit 1
fi

rm -rf "$STATE_DIR/test-start-resume"

echo "Test 5: Fires with source=clear and returns valid JSON"
INPUT_CLEAR='{"session_id":"test-start-clear","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"clear"}'

OUTPUT_CLEAR=$(echo "$INPUT_CLEAR" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT_CLEAR" <<'PYEOF' || { echo "FAIL: SessionStart clear output invalid"; exit 1; }
import json, sys
output = json.loads(sys.argv[1])
assert isinstance(output, dict), "Output must be a JSON object"
print("PASS: SessionStart hook fires on source=clear with valid JSON")
PYEOF

echo "Test 6: Session state directory created for clear source"
if [ -d "$STATE_DIR/test-start-clear" ]; then
  echo "PASS: Session state directory created for clear source"
else
  echo "FAIL: Session state directory not created at $STATE_DIR/test-start-clear"
  exit 1
fi

rm -rf "$STATE_DIR/test-start-clear"

echo "Test 7: All three sources produce consistent JSON output"
OUTPUT_STARTUP=$(echo '{"session_id":"test-start-cmp-startup","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"startup"}' | bash "$HOOK" 2>/dev/null)
OUTPUT_RESUME2=$(echo '{"session_id":"test-start-cmp-resume","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"resume"}' | bash "$HOOK" 2>/dev/null)
OUTPUT_CLEAR2=$(echo '{"session_id":"test-start-cmp-clear","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"clear"}' | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT_STARTUP" "$OUTPUT_RESUME2" "$OUTPUT_CLEAR2" <<'PYEOF' || { echo "FAIL: Source outputs are not consistent"; exit 1; }
import json, sys
startup = json.loads(sys.argv[1])
resume  = json.loads(sys.argv[2])
clear   = json.loads(sys.argv[3])
for label, output in [("startup", startup), ("resume", resume), ("clear", clear)]:
    assert isinstance(output, dict), f"Output must be a JSON object for {label}"
assert startup == resume == clear, f"Outputs differ: startup={startup} resume={resume} clear={clear}"
print("PASS: All three sources (startup, resume, clear) produce identical empty JSON output")
PYEOF

rm -rf "$STATE_DIR/test-start-cmp-startup" "$STATE_DIR/test-start-cmp-resume" "$STATE_DIR/test-start-cmp-clear"
echo "=== All SessionStart hook tests passed ==="
