#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AGENTS_DIR="$PROJECT_ROOT/agents"

VALID_TOOLS=(
  "read_file"
  "list_directory"
  "glob"
  "grep_search"
  "write_file"
  "replace"
  "read_many_files"
  "run_shell_command"
  "google_web_search"
  "web_fetch"
  "ask_user"
  "save_memory"
  "write_todos"
  "activate_skill"
  "get_internal_docs"
  "enter_plan_mode"
  "exit_plan_mode"
)

READONLY_AGENTS=("architect" "api-designer" "code-reviewer")
WRITE_FORBIDDEN_TOOLS=("write_file" "replace" "run_shell_command")

ERRORS=0

for agent_file in "$AGENTS_DIR"/*.md; do
  AGENT_NAME=$(basename "$agent_file" .md)

  TOOLS=$(awk '/^tools:/{capture=1; next} /^[a-zA-Z_]/{capture=0} capture && /^  - /{sub(/^  - /,""); print}' "$agent_file")

  while IFS= read -r tool; do
    [[ -z "$tool" ]] && continue
    FOUND=0
    for valid in "${VALID_TOOLS[@]}"; do
      if [[ "$tool" == "$valid" ]]; then
        FOUND=1
        break
      fi
    done
    if [[ "$FOUND" -eq 0 ]]; then
      echo "ERROR: $AGENT_NAME has unrecognized tool: $tool"
      ERRORS=$((ERRORS + 1))
    fi
  done <<< "$TOOLS"

  for readonly_agent in "${READONLY_AGENTS[@]}"; do
    if [[ "$AGENT_NAME" == "$readonly_agent" ]]; then
      while IFS= read -r tool; do
        [[ -z "$tool" ]] && continue
        for forbidden in "${WRITE_FORBIDDEN_TOOLS[@]}"; do
          if [[ "$tool" == "$forbidden" ]]; then
            echo "ERROR: Read-only agent $AGENT_NAME has forbidden tool: $tool"
            ERRORS=$((ERRORS + 1))
          fi
        done
      done <<< "$TOOLS"
    fi
  done
done

if [[ "$ERRORS" -eq 0 ]]; then
  echo "All agent permissions valid."
else
  echo ""
  echo "FAILED: $ERRORS permission violation(s) found."
fi

exit "$ERRORS"
