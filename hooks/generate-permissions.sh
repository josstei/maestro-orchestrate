#!/usr/bin/env bash
set -euo pipefail

AGENTS_DIR="${AGENTS_DIR:-$(cd "$(dirname "$0")/../agents" && pwd)}"
OUTPUT="${MAESTRO_PERMISSIONS_OUTPUT:-$(cd "$(dirname "$0")" && pwd)/permissions.json}"

if [ ! -d "$AGENTS_DIR" ]; then
  echo "Error: agents directory not found at $AGENTS_DIR" >&2
  exit 1
fi

AGENTS_DIR="$AGENTS_DIR" python3 - "$OUTPUT" <<'PYEOF'
import os, re, json, sys

agents_dir = os.environ['AGENTS_DIR']
output_path = sys.argv[1]
permissions = {}

frontmatter_re = re.compile(r'^---\r?\n(.*?)\r?\n---', re.DOTALL)
name_re = re.compile(r'^name:\s*(.+)$', re.MULTILINE)
tools_re = re.compile(r'^tools:\s*\n((?:\s+-\s+.+\n?)*)', re.MULTILINE)
tool_item_re = re.compile(r'^\s+-\s+(.+)$', re.MULTILINE)

for filename in sorted(os.listdir(agents_dir)):
    if not filename.endswith('.md'):
        continue

    filepath = os.path.join(agents_dir, filename)
    with open(filepath, 'r') as f:
        content = f.read()

    fm_match = frontmatter_re.match(content)
    if not fm_match:
        print(f'Warning: No frontmatter in {filename}', file=sys.stderr)
        continue

    frontmatter = fm_match.group(1)

    name_match = name_re.search(frontmatter)
    if not name_match:
        print(f'Warning: No name in {filename}', file=sys.stderr)
        continue
    name = name_match.group(1).strip()

    tools_match = tools_re.search(frontmatter)
    if not tools_match:
        print(f'Warning: No tools specified for {name}', file=sys.stderr)
        continue

    tools_block = tools_match.group(1)
    tools = [m.group(1).strip() for m in tool_item_re.finditer(tools_block)]

    if not tools:
        print(f'Warning: Empty tools array for {name}', file=sys.stderr)
        continue

    permissions[name] = tools

os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
with open(output_path, 'w') as f:
    json.dump(permissions, f, indent=2, sort_keys=True)

print(f'Generated permissions for {len(permissions)} agents -> {output_path}', file=sys.stderr)
PYEOF
