#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AFTER_TOOL_HOOK="$PROJECT_ROOT/hooks/after-tool.sh"

echo "=== Test: AfterTool Hook ==="

echo "Test 1: AfterTool returns valid empty JSON for standard tool"
INPUT='{"session_id":"test-at-001","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterTool","timestamp":"2026-02-17T00:00:00Z","tool_name":"read_file","tool_input":{"file_path":"/tmp/test.txt"},"tool_output":"file contents"}'
OUTPUT=$(echo "$INPUT" | bash "$AFTER_TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert d == {}, f'Expected empty JSON, got {d}'
print('PASS: AfterTool returns empty JSON for standard tool')
PYEOF

echo "Test 2: AfterTool returns valid JSON for write_file"
INPUT_WRITE='{"session_id":"test-at-002","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"AfterTool","timestamp":"2026-02-17T00:00:00Z","tool_name":"write_file","tool_input":{"file_path":"/tmp/out.txt","content":"hello"},"tool_output":"success"}'
OUTPUT=$(echo "$INPUT_WRITE" | bash "$AFTER_TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert isinstance(d, dict), f'Expected dict, got {type(d)}'
print('PASS: AfterTool returns valid JSON for write_file')
PYEOF

echo "Test 3: AfterTool handles empty stdin gracefully"
OUTPUT=$(echo '{}' | bash "$AFTER_TOOL_HOOK" 2>/dev/null)
python3 - "$OUTPUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
assert isinstance(d, dict), f'Expected dict, got {type(d)}'
print('PASS: AfterTool handles empty stdin')
PYEOF

echo "=== All AfterTool hook tests passed ==="
