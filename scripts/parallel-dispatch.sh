#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_DIR="${1:-.maestro-parallel}"
PROMPT_DIR="${DISPATCH_DIR}/prompts"
RESULT_DIR="${DISPATCH_DIR}/results"

trim_wrapping_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

read_env_var_from_file() {
  local env_file="$1"
  local var_name="$2"
  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  local value
  value="$(sed -n "s/^${var_name}=//p" "$env_file" | tail -n1)"
  if [[ -z "$value" ]]; then
    return 1
  fi

  trim_wrapping_quotes "$value"
}

resolve_setting() {
  local var_name="$1"
  local project_root="$2"
  local extension_root="${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}"

  # Exported environment variables always take precedence.
  local direct_value="${!var_name:-}"
  if [[ -n "$direct_value" ]]; then
    printf '%s' "$direct_value"
    return 0
  fi

  local resolved
  resolved="$(read_env_var_from_file "$project_root/.env" "$var_name" || true)"
  if [[ -z "$resolved" ]]; then
    resolved="$(read_env_var_from_file "$extension_root/.env" "$var_name" || true)"
  fi

  printf '%s' "$resolved"
}

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
  MAESTRO_WRITER_MODEL       Override model for technical-writer agent only
  MAESTRO_AGENT_TIMEOUT      Timeout in minutes (default: 10)
  MAESTRO_CLEANUP_DISPATCH   Remove prompt files after dispatch (default: false)
  MAESTRO_MAX_CONCURRENT      Max agents running simultaneously (default: 0 = unlimited)
  MAESTRO_STAGGER_DELAY       Seconds between agent launches (default: 5)
  MAESTRO_GEMINI_EXTRA_ARGS   Space-separated extra Gemini CLI args for each agent (prefer Policy Engine flags, e.g. --policy)
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
PROJECT_ROOT="$(pwd)"

DEFAULT_MODEL="$(resolve_setting "MAESTRO_DEFAULT_MODEL" "$PROJECT_ROOT")"
WRITER_MODEL="$(resolve_setting "MAESTRO_WRITER_MODEL" "$PROJECT_ROOT")"
AGENT_TIMEOUT="$(resolve_setting "MAESTRO_AGENT_TIMEOUT" "$PROJECT_ROOT")"
MAX_CONCURRENT_RAW="$(resolve_setting "MAESTRO_MAX_CONCURRENT" "$PROJECT_ROOT")"
STAGGER_DELAY_RAW="$(resolve_setting "MAESTRO_STAGGER_DELAY" "$PROJECT_ROOT")"
GEMINI_EXTRA_ARGS_RAW="$(resolve_setting "MAESTRO_GEMINI_EXTRA_ARGS" "$PROJECT_ROOT")"

MODEL_FLAGS=()
if [[ -n "$DEFAULT_MODEL" ]]; then
  MODEL_FLAGS=("-m" "$DEFAULT_MODEL")
fi

TIMEOUT_MINS="${AGENT_TIMEOUT:-10}"
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

MAX_CONCURRENT="${MAX_CONCURRENT_RAW:-0}"
MAX_CONCURRENT="${MAX_CONCURRENT#"${MAX_CONCURRENT%%[!0]*}"}"
[[ -z "$MAX_CONCURRENT" ]] && MAX_CONCURRENT=0
if ! [[ "$MAX_CONCURRENT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAESTRO_MAX_CONCURRENT must be a non-negative integer (got: ${MAX_CONCURRENT_RAW:-})" >&2
  exit 1
fi

STAGGER_DELAY="${STAGGER_DELAY_RAW:-5}"
STAGGER_DELAY="${STAGGER_DELAY#"${STAGGER_DELAY%%[!0]*}"}"
[[ -z "$STAGGER_DELAY" ]] && STAGGER_DELAY=0
if ! [[ "$STAGGER_DELAY" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAESTRO_STAGGER_DELAY must be a non-negative integer (got: ${STAGGER_DELAY_RAW:-})" >&2
  exit 1
fi

EXTRA_ARGS=()
HAS_EXTRA_ARGS=false
if [[ -n "$GEMINI_EXTRA_ARGS_RAW" ]]; then
  read -r -a EXTRA_ARGS <<< "$GEMINI_EXTRA_ARGS_RAW"
  HAS_EXTRA_ARGS=true
fi

DEPRECATED_ALLOWED_TOOLS=false
if [[ "$HAS_EXTRA_ARGS" == true ]]; then
  for arg in ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}; do
    if [[ "$arg" == "--allowed-tools" ]] || [[ "$arg" == --allowed-tools=* ]]; then
      DEPRECATED_ALLOWED_TOOLS=true
      break
    fi
  done
fi
if [[ "$DEPRECATED_ALLOWED_TOOLS" == true ]]; then
  echo "WARNING: --allowed-tools is deprecated in gemini-cli; prefer --policy <path> with the Policy Engine." >&2
fi

SUPPORTS_WAIT_N=false
if [[ "${BASH_VERSINFO[0]:-0}" -ge 5 ]] || \
   { [[ "${BASH_VERSINFO[0]:-0}" -eq 4 ]] && [[ "${BASH_VERSINFO[1]:-0}" -ge 3 ]]; }; then
  SUPPORTS_WAIT_N=true
fi

EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$EXTENSION_DIR/agents"

run_with_timeout() {
  local timeout_secs="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$timeout_secs" "$@"
    return $?
  fi

  "$@" &
  local cmd_pid=$!
  local cancel_file="/tmp/maestro-watchdog-$$-$cmd_pid"
  local timeout_file="/tmp/maestro-watchdog-timeout-$$-$cmd_pid"

  (
    sleep "$timeout_secs"
    if [ ! -f "$cancel_file" ] && kill -0 "$cmd_pid" 2>/dev/null; then
      touch "$timeout_file"
      echo "WARN: Process $cmd_pid timed out after ${timeout_secs}s" >&2
      kill -TERM "$cmd_pid" 2>/dev/null
      sleep 5
      if kill -0 "$cmd_pid" 2>/dev/null; then
        kill -KILL "$cmd_pid" 2>/dev/null
      fi
    fi
  ) &
  local watchdog_pid=$!

  wait "$cmd_pid" 2>/dev/null
  local exit_code=$?

  touch "$cancel_file"
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
  rm -f "$cancel_file"

  if [ -f "$timeout_file" ]; then
    rm -f "$timeout_file"
    return 124
  fi

  return "$exit_code"
}

PIDS=()
AGENT_NAMES=()
START_TIME=$(date +%s)
TOTAL_PROMPTS=${#PROMPT_FILES[@]}

[[ "$MAX_CONCURRENT" -eq 0 ]] && CONCURRENT_DISPLAY="unlimited" || CONCURRENT_DISPLAY="$MAX_CONCURRENT"

echo "MAESTRO PARALLEL DISPATCH"
echo "========================="
echo "Agents: ${#PROMPT_FILES[@]}"
echo "Timeout: ${TIMEOUT_MINS} minutes"
echo "Model: ${DEFAULT_MODEL:-default}"
[[ -n "$WRITER_MODEL" ]] && echo "Writer Model: $WRITER_MODEL"
echo "Max Concurrent: $CONCURRENT_DISPLAY"
echo "Stagger Delay: ${STAGGER_DELAY}s"
[[ "$HAS_EXTRA_ARGS" == true ]] && echo "Extra Gemini Args: $GEMINI_EXTRA_ARGS_RAW"
echo "Project Root: $PROJECT_ROOT"
echo ""

LAUNCHED=0

for PROMPT_INDEX in "${!PROMPT_FILES[@]}"; do
  PROMPT_FILE="${PROMPT_FILES[$PROMPT_INDEX]}"
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
    export MAESTRO_CURRENT_AGENT="$AGENT_NAME"
    AGENT_MODEL_FLAGS=("${MODEL_FLAGS[@]+"${MODEL_FLAGS[@]}"}")
    if [[ "$NORMALIZED_NAME" == "technical-writer" ]] && [[ -n "$WRITER_MODEL" ]]; then
      AGENT_MODEL_FLAGS=("-m" "$WRITER_MODEL")
    fi
    set +e
    run_with_timeout "$TIMEOUT_SECS" gemini \
      --approval-mode=yolo \
      --output-format json \
      ${AGENT_MODEL_FLAGS[@]+"${AGENT_MODEL_FLAGS[@]}"} \
      ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} \
      --prompt "$PROMPT_CONTENT" \
      > "$RESULT_JSON" \
      2> "$RESULT_LOG"
    AGENT_EXIT_CODE=$?
    set -e
    echo "$AGENT_EXIT_CODE" > "$RESULT_EXIT"
    exit "$AGENT_EXIT_CODE"
  ) &

  PIDS+=($!)
  LAUNCHED=$((LAUNCHED + 1))

  if [[ "$STAGGER_DELAY" -gt 0 ]] && [[ "$PROMPT_INDEX" -lt $((TOTAL_PROMPTS - 1)) ]]; then
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
