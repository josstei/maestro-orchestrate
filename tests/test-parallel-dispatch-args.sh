#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DISPATCH_SCRIPT="$PROJECT_ROOT/scripts/parallel-dispatch.sh"

echo "=== Test: Parallel Dispatch Argument Forwarding ==="

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

DISPATCH_DIR="$TMP_DIR/.maestro-parallel"
RESULT_DIR="$DISPATCH_DIR/results"
BIN_DIR="$TMP_DIR/bin"
CAPTURE_FILE="$TMP_DIR/gemini-argv.bin"

mkdir -p "$DISPATCH_DIR/prompts" "$BIN_DIR"

cat > "$DISPATCH_DIR/prompts/architect.txt" <<'PROMPT'
Review the project architecture and produce a concise summary.
PROMPT

cat > "$BIN_DIR/gemini" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

: "${MAESTRO_TEST_ARGV_CAPTURE:?missing MAESTRO_TEST_ARGV_CAPTURE}"

printf '%s\0' "$@" > "$MAESTRO_TEST_ARGV_CAPTURE"
echo '{"status":"ok"}'
STUB

chmod +x "$BIN_DIR/gemini"

PATH="$BIN_DIR:$PATH" \
MAESTRO_TEST_ARGV_CAPTURE="$CAPTURE_FILE" \
MAESTRO_DEFAULT_MODEL="gemini-2.5-pro" \
MAESTRO_GEMINI_EXTRA_ARGS="--sandbox --policy .gemini/policies/maestro.toml" \
MAESTRO_AGENT_TIMEOUT=2 \
MAESTRO_MAX_CONCURRENT=1 \
MAESTRO_STAGGER_DELAY=0 \
"$DISPATCH_SCRIPT" "$DISPATCH_DIR"

if [[ ! -f "$CAPTURE_FILE" ]]; then
  echo "FAIL: Gemini argv capture file was not created"
  exit 1
fi

python3 - "$CAPTURE_FILE" <<'PYEOF' || { echo "FAIL: Dispatch arguments did not match expectations"; exit 1; }
import pathlib
import sys

raw = pathlib.Path(sys.argv[1]).read_bytes().split(b"\0")
args = [part.decode() for part in raw if part]

def require(condition, message):
    if not condition:
        raise AssertionError(message)

require("--approval-mode=yolo" in args, f"Missing --approval-mode=yolo in args: {args}")
require("--output-format" in args, f"Missing --output-format in args: {args}")
output_idx = args.index("--output-format")
require(output_idx + 1 < len(args) and args[output_idx + 1] == "json", f"Expected --output-format json, got args: {args}")

require("-m" in args, f"Missing -m model flag in args: {args}")
model_idx = args.index("-m")
require(model_idx + 1 < len(args) and args[model_idx + 1] == "gemini-2.5-pro", f"Expected model gemini-2.5-pro, got args: {args}")

require("--sandbox" in args, f"Missing forwarded --sandbox flag in args: {args}")
require("--policy" in args, f"Missing forwarded --policy flag in args: {args}")
tools_idx = args.index("--policy")
require(
    tools_idx + 1 < len(args) and args[tools_idx + 1] == ".gemini/policies/maestro.toml",
    f"Expected forwarded policy path value, got args: {args}",
)

require("--prompt" in args, f"Missing --prompt flag in args: {args}")
prompt_idx = args.index("--prompt")
require(prompt_idx + 1 < len(args), f"--prompt has no value: {args}")
prompt_value = args[prompt_idx + 1]
require("PROJECT ROOT:" in prompt_value, "Expected prompt payload to include PROJECT ROOT preamble")
require("Review the project architecture" in prompt_value, "Expected prompt payload to include prompt file content")

print("PASS: Dispatch forwards args and uses --prompt flag")
PYEOF

if [[ ! -f "$RESULT_DIR/architect.json" ]]; then
  echo "FAIL: Result JSON file missing at $RESULT_DIR/architect.json"
  exit 1
fi

echo "=== Parallel dispatch argument forwarding test passed ==="
