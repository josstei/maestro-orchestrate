#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/after-agent.sh"
STATE_DIR="/tmp/maestro-hooks"

echo "=== Test: AfterAgent Hook ==="

echo "Test 1: Validates well-formed handoff report — allows"
mkdir -p "$STATE_DIR/test-after-001"
echo "coder" > "$STATE_DIR/test-after-001/active-agent"

INPUT='{"session_id":"test-after-001","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterAgent","timestamp":"2026-02-17T00:00:00Z","prompt_response":"## Task Report\nStatus: success\n## Downstream Context\nNo downstream dependencies.","stop_hook_active":false}'
OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert data.get("decision") == "allow", f"Expected decision=allow, got {data.get('decision')}"
print("PASS: Well-formed handoff report returns allow")
PYEOF

if [ -f "$STATE_DIR/test-after-001/active-agent" ]; then
  echo "FAIL: Active agent file not cleared"
  exit 1
else
  echo "PASS: Active agent tracking cleared"
fi

echo "Test 2: Malformed handoff report — denies with retry request"
mkdir -p "$STATE_DIR/test-after-002"
echo "coder" > "$STATE_DIR/test-after-002/active-agent"

INPUT_MALFORMED='{"session_id":"test-after-002","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterAgent","timestamp":"2026-02-17T00:00:00Z","prompt_response":"I did some stuff but forgot the report format.","stop_hook_active":false}'
OUTPUT=$(echo "$INPUT_MALFORMED" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output for malformed report"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert data.get("decision") == "block", f"Expected decision=block for malformed report, got {data.get('decision')}"
assert "reason" in data, "Expected reason field in block response"
print("PASS: Malformed handoff report triggers block/retry")
PYEOF

echo "Test 3: stop_hook_active=true skips validation — allows"
mkdir -p "$STATE_DIR/test-after-003"
echo "coder" > "$STATE_DIR/test-after-003/active-agent"

INPUT_STOP='{"session_id":"test-after-003","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterAgent","timestamp":"2026-02-17T00:00:00Z","prompt_response":"No report format here either.","stop_hook_active":true}'
OUTPUT=$(echo "$INPUT_STOP" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output for stop_hook_active"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert data.get("decision") == "allow", f"Expected decision=allow when stop_hook_active=true, got {data.get('decision')}"
print("PASS: stop_hook_active=true skips validation")
PYEOF

echo "Test 4: No active agent — allows without validation"
INPUT_NO_AGENT='{"session_id":"test-after-004","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterAgent","timestamp":"2026-02-17T00:00:00Z","prompt_response":"Just some text","stop_hook_active":false}'
OUTPUT=$(echo "$INPUT_NO_AGENT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output without agent"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: No active agent allows without validation")
PYEOF

rm -rf "$STATE_DIR/test-after-001" "$STATE_DIR/test-after-002" "$STATE_DIR/test-after-003" "$STATE_DIR/test-after-004"
echo "=== All AfterAgent hook tests passed ==="
