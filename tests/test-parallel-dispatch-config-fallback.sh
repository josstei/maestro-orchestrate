#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DISPATCH_SCRIPT="$PROJECT_ROOT/scripts/parallel-dispatch.sh"

echo "=== Test: Parallel Dispatch Config Fallback + Bash Compatibility ==="

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

DISPATCH_DIR="$TMP_DIR/.maestro-parallel"
BIN_DIR="$TMP_DIR/bin"
CAPTURE_FILE="$TMP_DIR/gemini-argv.log"
RUN_LOG="$TMP_DIR/dispatch.log"
FAKE_HOME="$TMP_DIR/home"

mkdir -p "$DISPATCH_DIR/prompts" "$BIN_DIR" "$FAKE_HOME/.gemini/extensions/maestro"

cat > "$DISPATCH_DIR/prompts/architect.txt" <<'PROMPT'
Analyze architecture and return a concise summary.
PROMPT

cat > "$DISPATCH_DIR/prompts/coder.txt" <<'PROMPT'
Implement a focused code update and report changes.
PROMPT

cat > "$BIN_DIR/gemini" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

: "${MAESTRO_TEST_ARGV_CAPTURE:?missing MAESTRO_TEST_ARGV_CAPTURE}"

{
  echo "---"
  for arg in "$@"; do
    printf '%s\n' "$arg"
  done
} >> "$MAESTRO_TEST_ARGV_CAPTURE"

echo '{"status":"ok"}'
STUB

chmod +x "$BIN_DIR/gemini"

cat > "$FAKE_HOME/.gemini/extensions/maestro/.env" <<'ENV'
MAESTRO_DEFAULT_MODEL=gemini-ext-fallback-model
MAESTRO_AGENT_TIMEOUT=2
MAESTRO_MAX_CONCURRENT=0
MAESTRO_STAGGER_DELAY=1
ENV

PATH="$BIN_DIR:$PATH" \
HOME="$FAKE_HOME" \
MAESTRO_TEST_ARGV_CAPTURE="$CAPTURE_FILE" \
"$DISPATCH_SCRIPT" "$DISPATCH_DIR" > "$RUN_LOG" 2>&1

if ! rg -n "Model: gemini-ext-fallback-model" "$RUN_LOG" >/dev/null; then
  echo "FAIL: Dispatch log did not use fallback MAESTRO_DEFAULT_MODEL from extension .env"
  cat "$RUN_LOG"
  exit 1
fi

if ! rg -n "Stagger Delay: 1s" "$RUN_LOG" >/dev/null; then
  echo "FAIL: Dispatch log did not use fallback MAESTRO_STAGGER_DELAY from extension .env"
  cat "$RUN_LOG"
  exit 1
fi

if rg -n "bad array subscript" "$RUN_LOG" >/dev/null; then
  echo "FAIL: Bash array compatibility issue detected (bad array subscript)"
  cat "$RUN_LOG"
  exit 1
fi

python3 - "$CAPTURE_FILE" <<'PYEOF' || { echo "FAIL: Fallback settings were not forwarded to gemini invocations"; exit 1; }
import pathlib
import sys

raw = pathlib.Path(sys.argv[1]).read_text()
records = [chunk.strip().splitlines() for chunk in raw.split('---') if chunk.strip()]

if len(records) != 2:
    raise AssertionError(f"Expected 2 gemini invocations, got {len(records)} records: {records}")

for idx, args in enumerate(records, start=1):
    if "--approval-mode=yolo" not in args:
        raise AssertionError(f"Invocation #{idx} missing --approval-mode=yolo: {args}")
    if "-m" not in args:
        raise AssertionError(f"Invocation #{idx} missing -m model flag: {args}")
    model_idx = args.index("-m")
    if model_idx + 1 >= len(args) or args[model_idx + 1] != "gemini-ext-fallback-model":
        raise AssertionError(f"Invocation #{idx} model mismatch: {args}")

print("PASS: Fallback .env settings were applied to all gemini invocations")
PYEOF

echo "=== Parallel dispatch config fallback test passed ==="
