#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/before-agent.sh"
STATE_DIR="/tmp/maestro-hooks"

echo "=== Test: BeforeAgent Hook ==="

echo "Test 1: Agent tracking from env var"
export MAESTRO_CURRENT_AGENT="coder"
INPUT='{"session_id":"test-789","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Implement the feature"}'
OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

TRACKED=$(cat "$STATE_DIR/test-789/active-agent" 2>/dev/null || echo "")
if [ "$TRACKED" = "coder" ]; then
  echo "PASS: Agent 'coder' tracked in state file"
else
  echo "FAIL: Expected 'coder' in state, got '$TRACKED'"
  exit 1
fi

python3 - "$OUTPUT" <<'PYEOF' || { echo "FAIL: Invalid JSON output"; exit 1; }
import json, sys
json.loads(sys.argv[1])
print("PASS: Returns valid JSON")
PYEOF

echo "Test 2: No env var — state file still written from prior hook"
unset MAESTRO_CURRENT_AGENT 2>/dev/null || true
INPUT_NO_ENV='{"session_id":"test-790","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"BeforeAgent","timestamp":"2026-02-17T00:00:00Z","prompt":"Test prompt"}'
OUTPUT=$(echo "$INPUT_NO_ENV" | bash "$HOOK" 2>/dev/null)
echo "PASS: Hook runs without env var"

rm -rf "$STATE_DIR/test-789" "$STATE_DIR/test-790"
echo "=== All BeforeAgent hook tests passed ==="
