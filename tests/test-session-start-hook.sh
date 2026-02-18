#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/session-start.sh"

echo "=== Test: SessionStart Hook ==="

INPUT='{"session_id":"test-123","transcript_path":"/tmp/transcript","cwd":"/tmp/test","hook_event_name":"SessionStart","timestamp":"2026-02-17T00:00:00Z","source":"startup"}'

OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)

python3 - <<PYEOF || { echo "FAIL: SessionStart hook output invalid"; exit 1; }
import json
output = json.loads('''${OUTPUT//\'/\\\'}''')
assert isinstance(output, dict), "Output must be a JSON object"
print("PASS: SessionStart hook returns valid JSON")
PYEOF

echo "=== All SessionStart hook tests passed ==="
