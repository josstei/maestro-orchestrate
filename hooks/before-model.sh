#!/usr/bin/env bash

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

main() {
  # BeforeModel hook — reserved for future config overrides
  #
  # IMPORTANT: The Gemini CLI BeforeModel hook system extracts only `config`
  # and `contents` from hookSpecificOutput.llm_request — the `model` field
  # is discarded by hookSystem.ts. Model overrides for sequential delegation
  # are not possible via hooks.
  #
  # For parallel dispatch, model overrides work via the --model CLI flag
  # in parallel-dispatch.sh using MAESTRO_DEFAULT_MODEL.
  echo '{}'
}

safe_main main
