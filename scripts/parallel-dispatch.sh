#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_DIR="${1:-.maestro-parallel}"
PROMPT_DIR="${DISPATCH_DIR}/prompts"
RESULT_DIR="${DISPATCH_DIR}/results"

usage() {
  cat <<EOF
Usage: parallel-dispatch.sh <dispatch-dir>

Dispatches Gemini CLI agents in parallel from prompt files.

Setup:
  1. Create dispatch directory with prompt files:
     <dispatch-dir>/prompts/agent-a.txt
     <dispatch-dir>/prompts/agent-b.txt
     ...

  2. Each prompt file contains the full agent delegation prompt.

  3. Run: ./parallel-dispatch.sh <dispatch-dir>

Results:
  <dispatch-dir>/results/agent-a.json    (structured output)
  <dispatch-dir>/results/agent-a.exit    (exit code)
  <dispatch-dir>/results/agent-a.log     (stderr/debug)
  <dispatch-dir>/results/summary.json    (batch summary)

Environment:
  MAESTRO_DEFAULT_MODEL      Override model for all agents
  MAESTRO_AGENT_TIMEOUT      Timeout in minutes (default: 10)
  MAESTRO_CLEANUP_DISPATCH   Remove prompt files after dispatch (default: false)
  MAESTRO_MAX_CONCURRENT      Max agents running simultaneously (default: 5)
  MAESTRO_STAGGER_DELAY       Seconds between agent launches (default: 15)
EOF
  exit 1
}

if [[ ! -d "$PROMPT_DIR" ]]; then
  echo "ERROR: No prompts directory found at $PROMPT_DIR"
  usage
fi

PROMPT_FILES=("$PROMPT_DIR"/*)
if [[ ${#PROMPT_FILES[@]} -eq 0 ]]; then
  echo "ERROR: No prompt files found in $PROMPT_DIR"
  exit 1
fi

mkdir -p "$RESULT_DIR"

MODEL_FLAGS=()
if [[ -n "${MAESTRO_DEFAULT_MODEL:-}" ]]; then
  MODEL_FLAGS=("-m" "$MAESTRO_DEFAULT_MODEL")
fi

TIMEOUT_MINS="${MAESTRO_AGENT_TIMEOUT:-10}"
TIMEOUT_MINS="${TIMEOUT_MINS#"${TIMEOUT_MINS%%[!0]*}"}"
[[ -z "$TIMEOUT_MINS" ]] && TIMEOUT_MINS=0
if ! [[ "$TIMEOUT_MINS" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_MINS" -eq 0 ]]; then
  echo "ERROR: MAESTRO_AGENT_TIMEOUT must be a positive integer (got: $TIMEOUT_MINS)" >&2
  exit 1
fi
if [[ "$TIMEOUT_MINS" -gt 60 ]]; then
  echo "WARNING: Agent timeout set to ${TIMEOUT_MINS} minutes (over 1 hour)" >&2
fi
TIMEOUT_SECS=$((TIMEOUT_MINS * 60))

MAX_CONCURRENT="${MAESTRO_MAX_CONCURRENT:-5}"
MAX_CONCURRENT="${MAX_CONCURRENT#"${MAX_CONCURRENT%%[!0]*}"}"
[[ -z "$MAX_CONCURRENT" ]] && MAX_CONCURRENT=0
if ! [[ "$MAX_CONCURRENT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAESTRO_MAX_CONCURRENT must be a non-negative integer (got: ${MAESTRO_MAX_CONCURRENT:-})" >&2
  exit 1
fi

STAGGER_DELAY="${MAESTRO_STAGGER_DELAY:-15}"
STAGGER_DELAY="${STAGGER_DELAY#"${STAGGER_DELAY%%[!0]*}"}"
[[ -z "$STAGGER_DELAY" ]] && STAGGER_DELAY=0
if ! [[ "$STAGGER_DELAY" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAESTRO_STAGGER_DELAY must be a non-negative integer (got: ${MAESTRO_STAGGER_DELAY:-})" >&2
  exit 1
fi

SUPPORTS_WAIT_N=false
if [[ "${BASH_VERSINFO[0]:-0}" -ge 5 ]] || \
   { [[ "${BASH_VERSINFO[0]:-0}" -eq 4 ]] && [[ "${BASH_VERSINFO[1]:-0}" -ge 3 ]]; }; then
  SUPPORTS_WAIT_N=true
fi

EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$EXTENSION_DIR/agents"
PROJECT_ROOT="$(pwd)"

PIDS=()
AGENT_NAMES=()
START_TIME=$(date +%s)

[[ "$MAX_CONCURRENT" -eq 0 ]] && CONCURRENT_DISPLAY="unlimited" || CONCURRENT_DISPLAY="$MAX_CONCURRENT"

echo "MAESTRO PARALLEL DISPATCH"
echo "========================="
echo "Agents: ${#PROMPT_FILES[@]}"
echo "Timeout: ${TIMEOUT_MINS} minutes"
echo "Model: ${MAESTRO_DEFAULT_MODEL:-default}"
echo "Max Concurrent: $CONCURRENT_DISPLAY"
echo "Stagger Delay: ${STAGGER_DELAY}s"
echo "Project Root: $PROJECT_ROOT"
echo ""

LAUNCHED=0

for PROMPT_FILE in "${PROMPT_FILES[@]}"; do
  AGENT_NAME=$(basename "$PROMPT_FILE" .txt | tr -cd 'a-zA-Z0-9_-')
  if [[ -z "$AGENT_NAME" ]]; then
    echo "ERROR: Prompt file $(basename "$PROMPT_FILE" | tr -cd 'a-zA-Z0-9_.-') produces empty agent name after sanitization" >&2
    exit 1
  fi
  AGENT_NAMES+=("$AGENT_NAME")

  NORMALIZED_NAME=$(echo "$AGENT_NAME" | tr '_' '-')
  if [[ -d "$AGENTS_DIR" ]] && [[ ! -f "$AGENTS_DIR/${NORMALIZED_NAME}.md" ]]; then
    echo "ERROR: Agent '${AGENT_NAME}' not found in ${AGENTS_DIR}/" >&2
    AVAILABLE=$(ls "$AGENTS_DIR"/*.md 2>/dev/null | xargs -I{} basename {} .md | tr '\n' ', ' | sed 's/,$//')
    [[ -n "$AVAILABLE" ]] && echo "  Available agents: ${AVAILABLE}" >&2
    exit 1
  fi

  RESULT_JSON="$RESULT_DIR/${AGENT_NAME}.json"
  RESULT_EXIT="$RESULT_DIR/${AGENT_NAME}.exit"
  RESULT_LOG="$RESULT_DIR/${AGENT_NAME}.log"

  PROMPT_SIZE=$(wc -c < "$PROMPT_FILE")
  if [[ "$PROMPT_SIZE" -gt 1000000 ]]; then
    echo "ERROR: Prompt file $AGENT_NAME exceeds 1MB size limit (${PROMPT_SIZE} bytes)" >&2
    exit 1
  fi

  PROMPT_CONTENT=$(cat "$PROMPT_FILE")

  if [[ -z "${PROMPT_CONTENT// /}" ]]; then
    echo "ERROR: Prompt file $AGENT_NAME is empty or whitespace-only" >&2
    exit 1
  fi

  PROMPT_CONTENT="PROJECT ROOT: ${PROJECT_ROOT}
All file paths in this task are relative to this directory. When using write_file, replace, or read_file, construct absolute paths by prepending this root. When using run_shell_command, execute from this directory.

${PROMPT_CONTENT}"

  if [[ "$MAX_CONCURRENT" -gt 0 ]] && [[ "$LAUNCHED" -ge "$MAX_CONCURRENT" ]]; then
    if [[ "$SUPPORTS_WAIT_N" == true ]]; then
      wait -n 2>/dev/null || true
    else
      wait "${PIDS[$(( LAUNCHED - MAX_CONCURRENT ))]}" 2>/dev/null || true
    fi
  fi

  echo "Dispatching: $AGENT_NAME"

  (
    if command -v timeout >/dev/null 2>&1; then
      timeout "$TIMEOUT_SECS" gemini \
        -p "$PROMPT_CONTENT" \
        --yolo \
        --output-format json \
        ${MODEL_FLAGS[@]+"${MODEL_FLAGS[@]}"} \
        > "$RESULT_JSON" \
        2> "$RESULT_LOG"
    else
      gemini \
        -p "$PROMPT_CONTENT" \
        --yolo \
        --output-format json \
        ${MODEL_FLAGS[@]+"${MODEL_FLAGS[@]}"} \
        > "$RESULT_JSON" \
        2> "$RESULT_LOG"
    fi
    echo $? > "$RESULT_EXIT"
  ) &

  PIDS+=($!)
  LAUNCHED=$((LAUNCHED + 1))

  if [[ "$STAGGER_DELAY" -gt 0 ]] && [[ "$PROMPT_FILE" != "${PROMPT_FILES[-1]}" ]]; then
    sleep "$STAGGER_DELAY"
  fi
done

echo ""
echo "All agents dispatched. Waiting for completion..."
echo ""

FAILURES=0
for i in "${!PIDS[@]}"; do
  PID=${PIDS[$i]}
  AGENT_NAME=${AGENT_NAMES[$i]}

  wait "$PID" 2>/dev/null || true

  RESULT_EXIT="$RESULT_DIR/${AGENT_NAME}.exit"
  if [[ -f "$RESULT_EXIT" ]]; then
    EXIT_CODE=$(cat "$RESULT_EXIT")
  else
    EXIT_CODE=255
    echo "$EXIT_CODE" > "$RESULT_EXIT"
  fi

  if [[ "$EXIT_CODE" -eq 0 ]]; then
    echo "  $AGENT_NAME: SUCCESS (exit 0)"
  elif [[ "$EXIT_CODE" -eq 124 ]]; then
    echo "  $AGENT_NAME: TIMEOUT (exceeded ${TIMEOUT_MINS}m)"
    FAILURES=$((FAILURES + 1))
  else
    echo "  $AGENT_NAME: FAILED (exit $EXIT_CODE)"
    FAILURES=$((FAILURES + 1))
  fi
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "BATCH COMPLETE"
echo "  Total agents: ${#AGENT_NAMES[@]}"
echo "  Succeeded: $(( ${#AGENT_NAMES[@]} - FAILURES ))"
echo "  Failed: $FAILURES"
echo "  Wall time: ${ELAPSED}s"

BATCH_STATUS="success"
[[ "$FAILURES" -ne 0 ]] && BATCH_STATUS="partial_failure"
SUCCEEDED=$(( ${#AGENT_NAMES[@]} - FAILURES ))

AGENTS_JSON="["
for i in "${!AGENT_NAMES[@]}"; do
  NAME=${AGENT_NAMES[$i]}
  EXIT=$(cat "$RESULT_DIR/${NAME}.exit" 2>/dev/null | tr -cd '0-9')
  [[ -z "$EXIT" ]] && EXIT=255
  STATUS="success"
  [[ "$EXIT" -eq 124 ]] && STATUS="timeout"
  [[ "$EXIT" -ne 0 && "$EXIT" -ne 124 ]] && STATUS="failed"
  [[ $i -gt 0 ]] && AGENTS_JSON+=","
  AGENTS_JSON+="{\"name\":\"$NAME\",\"exit_code\":$EXIT,\"status\":\"$STATUS\"}"
done
AGENTS_JSON+="]"

printf '{"batch_status":"%s","total_agents":%d,"succeeded":%d,"failed":%d,"wall_time_seconds":%d,"agents":%s}\n' \
  "$BATCH_STATUS" "${#AGENT_NAMES[@]}" "$SUCCEEDED" "$FAILURES" "$ELAPSED" "$AGENTS_JSON" \
  > "$RESULT_DIR/summary.json"

echo ""
echo "Results: $RESULT_DIR/summary.json"

if [[ "${MAESTRO_CLEANUP_DISPATCH:-false}" == "true" ]]; then
  if [[ "$PROMPT_DIR" == *"/prompts" ]] && [[ -d "$PROMPT_DIR" ]]; then
    rm -rf "$PROMPT_DIR"
    echo "Prompt files cleaned up (MAESTRO_CLEANUP_DISPATCH=true)"
  else
    echo "WARNING: Skipped cleanup — PROMPT_DIR does not match expected pattern: $PROMPT_DIR" >&2
  fi
fi

exit $FAILURES
