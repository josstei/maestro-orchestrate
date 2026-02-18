#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/before-agent.sh"
STATE_DIR="/tmp/maestro-hooks"

echo "=== Test: BeforeAgent Hook ==="

echo "Test 1: Returns valid JSON with session context"
INPUT='{"session_id":"test-789","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Implement the feature"}'
OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON")
PYEOF

echo "Test 2: Returns valid JSON without session state"
INPUT_NO_STATE='{"session_id":"test-790","transcript_path":"/tmp/t","cwd":"/tmp/nonexistent","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Test prompt"}'
OUTPUT=$(echo "$INPUT_NO_STATE" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output for no-state case"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Returns valid JSON without session state")
PYEOF

rm -rf "$STATE_DIR/test-789" "$STATE_DIR/test-790"
echo "=== All BeforeAgent hook tests passed ==="
