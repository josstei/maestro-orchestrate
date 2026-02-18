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

echo "Test 2: Permissions manifest generated"
if [ -f "$PROJECT_ROOT/hooks/permissions.json" ]; then
  AGENT_COUNT=$(python3 -c "import json; print(len(json.load(open('$PROJECT_ROOT/hooks/permissions.json'))))")
  if [ "$AGENT_COUNT" -gt 0 ]; then
    echo "PASS: Permissions manifest exists with $AGENT_COUNT agents"
  else
    echo "FAIL: Permissions manifest is empty"
    exit 1
  fi
else
  echo "FAIL: Permissions manifest not found"
  exit 1
fi

echo "Test 3: Session state directory created"
if [ -d "$STATE_DIR/test-start-001" ]; then
  echo "PASS: Session state directory created"
else
  echo "FAIL: Session state directory not created at $STATE_DIR/test-start-001"
  exit 1
fi

rm -rf "$STATE_DIR/test-start-001"
echo "=== All SessionStart hook tests passed ==="
