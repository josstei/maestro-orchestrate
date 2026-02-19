#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DISPATCH_SCRIPT="$PROJECT_ROOT/scripts/parallel-dispatch.sh"

echo "=== Test: Parallel Dispatch Exit Code Propagation ==="

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

DISPATCH_DIR="$TMP_DIR/.maestro-parallel"
BIN_DIR="$TMP_DIR/bin"
RUN_LOG="$TMP_DIR/dispatch.log"

mkdir -p "$DISPATCH_DIR/prompts" "$BIN_DIR"

cat > "$DISPATCH_DIR/prompts/coder.txt" <<'PROMPT'
Perform a task that intentionally fails for test validation.
PROMPT

cat > "$BIN_DIR/gemini" <<'STUB'
#!/usr/bin/env bash
echo "simulated failure" >&2
exit 2
STUB

chmod +x "$BIN_DIR/gemini"

set +e
PATH="$BIN_DIR:$PATH" \
MAESTRO_AGENT_TIMEOUT=2 \
"$DISPATCH_SCRIPT" "$DISPATCH_DIR" > "$RUN_LOG" 2>&1
DISPATCH_EXIT=$?
set -e

if [[ "$DISPATCH_EXIT" -ne 1 ]]; then
  echo "FAIL: Expected dispatch exit code 1 (one failed agent), got $DISPATCH_EXIT"
  cat "$RUN_LOG"
  exit 1
fi

RESULT_EXIT_FILE="$DISPATCH_DIR/results/coder.exit"
if [[ ! -f "$RESULT_EXIT_FILE" ]]; then
  echo "FAIL: Missing per-agent exit file: $RESULT_EXIT_FILE"
  cat "$RUN_LOG"
  exit 1
fi

if [[ "$(cat "$RESULT_EXIT_FILE")" != "2" ]]; then
  echo "FAIL: Expected coder.exit to contain 2, got: $(cat "$RESULT_EXIT_FILE")"
  cat "$RUN_LOG"
  exit 1
fi

if ! rg -n '"exit_code":2' "$DISPATCH_DIR/results/summary.json" >/dev/null; then
  echo "FAIL: Summary did not preserve the real agent exit code"
  cat "$DISPATCH_DIR/results/summary.json"
  exit 1
fi

if ! rg -n 'coder: FAILED \(exit 2\)' "$RUN_LOG" >/dev/null; then
  echo "FAIL: Dispatch output did not report failure with exit 2"
  cat "$RUN_LOG"
  exit 1
fi

echo "PASS: Real non-zero agent exit codes are preserved"
echo "=== Parallel dispatch exit code propagation test passed ==="
