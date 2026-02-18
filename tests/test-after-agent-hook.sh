#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/after-agent.sh"
STATE_DIR="/tmp/maestro-hooks"

echo "=== Test: AfterAgent Hook ==="

echo "Test 1: Validates handoff report and clears agent tracking"
mkdir -p "$STATE_DIR/test-after-001"
echo "coder" > "$STATE_DIR/test-after-001/active-agent"

export MAESTRO_CURRENT_AGENT="coder"
INPUT='{"session_id":"test-after-001","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterAgent","timestamp":"2026-02-17T00:00:00Z","prompt_response":"## Task Report\nStatus: success\n## Downstream Context\nNo downstream dependencies."}'
OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert data.get("decision") == "allow", f"Expected decision=allow, got {data.get('decision')}"
print("PASS: Returns allow decision")
PYEOF

if [ -f "$STATE_DIR/test-after-001/active-agent" ]; then
  echo "FAIL: Active agent file not cleared"
  exit 1
else
  echo "PASS: Active agent tracking cleared"
fi

echo "Test 2: Runs without env var"
unset MAESTRO_CURRENT_AGENT 2>/dev/null || true
INPUT_NO_ENV='{"session_id":"test-after-002","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterAgent","timestamp":"2026-02-17T00:00:00Z","prompt_response":"Just some text"}'
OUTPUT=$(echo "$INPUT_NO_ENV" | bash "$HOOK" 2>/dev/null)

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output without env var"; exit 1; }
import json, sys
data = json.loads(sys.argv[1])
assert isinstance(data, dict), "Output must be a JSON object"
print("PASS: Hook runs without env var")
PYEOF

rm -rf "$STATE_DIR/test-after-001" "$STATE_DIR/test-after-002"
echo "=== All AfterAgent hook tests passed ==="
