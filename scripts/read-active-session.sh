#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

trim_wrapping_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

read_state_dir_from_env_file() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return 1
  fi
  local value
  value="$(sed -n 's/^MAESTRO_STATE_DIR=//p' "$env_file" | tail -n1)"
  if [[ -z "$value" ]]; then
    return 1
  fi
  trim_wrapping_quotes "$value"
}

resolve_state_dir() {
  local state_dir="${MAESTRO_STATE_DIR:-}"
  local project_root="$1"
  local extension_root="${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}"

  if [[ -z "$state_dir" ]]; then
    state_dir="$(read_state_dir_from_env_file "$project_root/.env" || true)"
  fi

  if [[ -z "$state_dir" ]]; then
    state_dir="$(read_state_dir_from_env_file "$extension_root/.env" || true)"
  fi

  if [[ -z "$state_dir" ]]; then
    state_dir=".gemini"
  fi

  printf '%s' "$state_dir"
}

main() {
  local project_root
  project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  local state_dir
  state_dir="$(resolve_state_dir "$project_root")"

  if [[ "$state_dir" == /* ]]; then
    local state_file="$state_dir/state/active-session.md"
    if [[ -f "$state_file" ]]; then
      cat "$state_file"
    else
      echo "No active session"
    fi
    return 0
  fi

  cd "$project_root"
  if "$SCRIPT_DIR/read-state.sh" "$state_dir/state/active-session.md" 2>/dev/null; then
    return 0
  fi

  echo "No active session"
}

main "$@"
