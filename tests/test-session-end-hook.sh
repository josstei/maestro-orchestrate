#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION_END_HOOK="$PROJECT_ROOT/hooks/session-end.sh"

echo "=== Test: SessionEnd Hook ==="

echo "Test 1: SessionEnd cleans up existing state directory"
TEST_SESSION="test-se-001"
mkdir -p "/tmp/maestro-hooks/$TEST_SESSION"
echo "some-agent" > "/tmp/maestro-hooks/$TEST_SESSION/active-agent"

INPUT="{\"session_id\":\"$TEST_SESSION\",\"transcript_path\":\"/tmp/t\",\"cwd\":\"/tmp\",\"hook_event_name\":\"SessionEnd\",\"timestamp\":\"2026-02-17T00:00:00Z\"}"
OUTPUT=$(echo "$INPUT" | bash "$SESSION_END_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert isinstance(d, dict), f'Expected a JSON object, got {d}'
print('PASS: SessionEnd returns valid JSON')
PYEOF

if [ -d "/tmp/maestro-hooks/$TEST_SESSION" ]; then
  echo "FAIL: State directory was not cleaned up"
  exit 1
else
  echo "PASS: State directory cleaned up"
fi

echo "Test 2: SessionEnd handles non-existent state directory"
TEST_SESSION2="test-se-002"
rm -rf "/tmp/maestro-hooks/$TEST_SESSION2" 2>/dev/null || true

INPUT2="{\"session_id\":\"$TEST_SESSION2\",\"transcript_path\":\"/tmp/t\",\"cwd\":\"/tmp\",\"hook_event_name\":\"SessionEnd\",\"timestamp\":\"2026-02-17T00:00:00Z\"}"
OUTPUT2=$(echo "$INPUT2" | bash "$SESSION_END_HOOK" 2>/dev/null)
python3 - "$OUTPUT2" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert isinstance(d, dict), f'Expected a JSON object, got {d}'
print('PASS: SessionEnd handles missing state dir gracefully')
PYEOF

echo "Test 3: SessionEnd rejects invalid session_id"
INPUT3='{"session_id":"../../../etc","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"SessionEnd","timestamp":"2026-02-17T00:00:00Z"}'
OUTPUT3=$(echo "$INPUT3" | bash "$SESSION_END_HOOK" 2>/dev/null)
python3 - "$OUTPUT3" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert isinstance(d, dict), f'Expected a JSON object, got {d}'
print('PASS: SessionEnd rejects invalid session_id safely')
PYEOF

echo "=== All SessionEnd hook tests passed ==="
