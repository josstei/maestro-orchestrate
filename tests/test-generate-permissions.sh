#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GENERATOR="$PROJECT_ROOT/hooks/generate-permissions.sh"
OUTPUT="/tmp/maestro-test-permissions-$$.json"

cleanup() { rm -f "$OUTPUT"; }
trap cleanup EXIT

echo "=== Test: Permissions Generator ==="

AGENTS_DIR="$PROJECT_ROOT/agents" MAESTRO_PERMISSIONS_OUTPUT="$OUTPUT" bash "$GENERATOR"

if [ ! -f "$OUTPUT" ]; then
  echo "FAIL: permissions.json not generated"
  exit 1
fi

python3 - "$OUTPUT" <<'PYEOF'
import json, sys

output_path = sys.argv[1]
with open(output_path) as f:
    perms = json.load(f)

tools = perms.get('code-reviewer', [])
assert 'write_file' not in tools, 'code-reviewer should not have write_file'
assert 'run_shell_command' not in tools, 'code-reviewer should not have run_shell_command'
assert 'read_file' in tools, 'code-reviewer should have read_file'
print('PASS: code-reviewer permissions correct')

tools = perms.get('coder', [])
assert 'write_file' in tools, 'coder should have write_file'
assert 'run_shell_command' in tools, 'coder should have run_shell_command'
assert 'read_file' in tools, 'coder should have read_file'
print('PASS: coder permissions correct')

expected = ['architect','api-designer','code-reviewer','coder','data-engineer',
            'debugger','devops-engineer','performance-engineer','refactor',
            'security-engineer','technical-writer','tester']
for agent in expected:
    assert agent in perms, f'Missing agent: {agent}'
print(f'PASS: All {len(expected)} agents present')

for agent, tools in perms.items():
    assert len(tools) > 0, f'Agent {agent} has empty tools array — would bypass enforcement'
print('PASS: No agents with empty tools')
PYEOF

echo "=== All permissions generator tests passed ==="
