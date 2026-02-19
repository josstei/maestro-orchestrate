#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_DIR=$(mktemp -d)
DISPATCH_DIR="$TEST_DIR/.maestro-parallel"

echo "MAESTRO PARALLEL DISPATCH - PROOF OF CONCEPT"
echo "============================================="
echo ""
echo "Test directory: $TEST_DIR"
echo ""

mkdir -p "$TEST_DIR/src"
echo "placeholder" > "$TEST_DIR/src/file-a.txt"
echo "placeholder" > "$TEST_DIR/src/file-b.txt"

mkdir -p "$DISPATCH_DIR/prompts"

# Single-quoted HEREDOC delimiter prevents $(date +%s) from expanding during file creation
cat > "$DISPATCH_DIR/prompts/agent-a.txt" <<'PROMPT'
You are Agent A in a parallel execution test.

Your task: Use the write_file tool to write EXACTLY this content to the file src/file-a.txt:
"Agent A was here. Timestamp: $(date +%s)"

IMPORTANT: You MUST use the write_file tool to write the file. Do NOT use cat, echo, printf, heredocs, or any shell command to write file content.

Steps:
1. Use write_file to write the content to src/file-a.txt
2. Use read_file to read the file back and confirm

Do NOT touch any other files. Only modify src/file-a.txt.

When done, report: which file you modified and the content you wrote.
PROMPT

# Single-quoted HEREDOC delimiter prevents $(date +%s) from expanding during file creation
cat > "$DISPATCH_DIR/prompts/agent-b.txt" <<'PROMPT'
You are Agent B in a parallel execution test.

Your task: Use the write_file tool to write EXACTLY this content to the file src/file-b.txt:
"Agent B was here. Timestamp: $(date +%s)"

IMPORTANT: You MUST use the write_file tool to write the file. Do NOT use cat, echo, printf, heredocs, or any shell command to write file content.

Steps:
1. Use write_file to write the content to src/file-b.txt
2. Use read_file to read the file back and confirm

Do NOT touch any other files. Only modify src/file-b.txt.

When done, report: which file you modified and the content you wrote.
PROMPT

echo "Prompt files created:"
ls -la "$DISPATCH_DIR/prompts/"
echo ""

echo "Dispatching parallel agents..."
echo ""

cd "$TEST_DIR"

MAESTRO_AGENT_TIMEOUT=5 node "$SCRIPT_DIR/parallel-dispatch.js" "$DISPATCH_DIR"
DISPATCH_EXIT=$?

echo ""
echo "VERIFICATION"
echo "============"
echo ""

echo "File A contents:"
cat "$TEST_DIR/src/file-a.txt" 2>/dev/null || echo "(unchanged/missing)"
echo ""

echo "File B contents:"
cat "$TEST_DIR/src/file-b.txt" 2>/dev/null || echo "(unchanged/missing)"
echo ""

if [[ -f "$DISPATCH_DIR/results/summary.json" ]]; then
  echo "Batch summary:"
  cat "$DISPATCH_DIR/results/summary.json"
  echo ""
fi

echo "Agent A log:"
cat "$DISPATCH_DIR/results/agent-a.log" 2>/dev/null | tail -5 || echo "(no log)"
echo ""

echo "Agent B log:"
cat "$DISPATCH_DIR/results/agent-b.log" 2>/dev/null | tail -5 || echo "(no log)"
echo ""

if [[ $DISPATCH_EXIT -eq 0 ]]; then
  echo "RESULT: PARALLEL DISPATCH SUCCEEDED"
else
  echo "RESULT: PARALLEL DISPATCH HAD FAILURES (exit $DISPATCH_EXIT)"
fi

echo ""
echo "Full results at: $DISPATCH_DIR/results/"
echo "Clean up with: rm -rf $TEST_DIR"
