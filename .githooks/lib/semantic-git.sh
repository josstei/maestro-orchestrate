#!/usr/bin/env bash
#
# Shared semantic git convention checks for repo-local hooks.

SEMANTIC_COMMIT_PATTERN='^(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert|release)(\([a-z0-9_./-]+\))?!?: .+'
SEMANTIC_BRANCH_PATTERN='^([a-z0-9][a-z0-9._-]*/)?(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)/[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$'
SEMANTIC_RELEASE_BRANCH_PATTERN='^release/v[0-9]+\.[0-9]+\.[0-9]+$'
SEMANTIC_ZERO_SHA_PATTERN='^0{40}$'

semantic_commit_subject_is_valid() {
  local subject="$1"

  case "$subject" in
    Merge\ *|Revert\ *|fixup!*|squash!*|amend!*) return 0 ;;
  esac

  [[ "$subject" =~ $SEMANTIC_COMMIT_PATTERN ]]
}

semantic_branch_name_is_valid() {
  local branch="$1"

  case "$branch" in
    ""|HEAD|main|master|develop|dev|trunk) return 0 ;;
    dependabot/*|renovate/*|github-actions/*) return 0 ;;
  esac

  [[ "$branch" =~ $SEMANTIC_BRANCH_PATTERN || "$branch" =~ $SEMANTIC_RELEASE_BRANCH_PATTERN ]]
}

semantic_is_zero_sha() {
  local sha="${1:-}"
  [[ "$sha" =~ $SEMANTIC_ZERO_SHA_PATTERN ]]
}

semantic_print_branch_name_error() {
  local hook_name="$1"
  local branch="$2"

  {
    echo ""
    echo "$hook_name: branch name does not match the semantic branch convention"
    echo ""
    echo "Your branch:"
    echo "    $branch"
    echo ""
    echo "Required branch format:"
    echo "    <type>/<slug>"
    echo "    <namespace>/<type>/<slug>"
    echo "    release/vX.Y.Z"
    echo ""
    echo "Allowed types:"
    echo "    feat, fix, chore, docs, test, refactor, perf, style, build, ci, revert"
    echo ""
    echo "Slug rules:"
    echo "    lowercase letters, numbers, dots, underscores, and hyphens only"
    echo ""
    echo "Examples that pass:"
    echo "    feat/semantic-git-hooks"
    echo "    fix/pre-push-range"
    echo "    codex/chore/enforce-git-conventions"
    echo "    release/v1.7.0"
    echo ""
    echo "Rename the current branch with:"
    echo "    git branch -m feat/<short-description>"
    echo ""
  } >&2
}

semantic_print_pushed_commit_error() {
  local hook_name="$1"
  local sha="$2"
  local subject="$3"

  {
    echo ""
    echo "$hook_name: commit ${sha:0:8} subject does not match Conventional Commits"
    echo "    $subject"
  } >&2
}

semantic_print_push_summary() {
  local hook_name="$1"

  {
    echo ""
    echo "$hook_name: BLOCKED - semantic git convention checks failed."
    echo ""
    echo "Commit subject format:"
    echo "    <type>(<optional-scope>)<!>: <description>"
    echo ""
    echo "Branch name format:"
    echo "    <type>/<slug>"
    echo "    <namespace>/<type>/<slug>"
    echo "    release/vX.Y.Z"
    echo ""
  } >&2
}

semantic_push_commit_range() {
  local remote_name="$1"
  local local_sha="$2"
  local remote_sha="$3"
  local base

  if ! semantic_is_zero_sha "$remote_sha" && git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
    printf '%s\n' "$remote_sha..$local_sha"
    return 0
  fi

  if base="$(git merge-base "$local_sha" "$remote_name/main" 2>/dev/null)"; then
    printf '%s\n' "$base..$local_sha"
    return 0
  fi

  if base="$(git merge-base "$local_sha" main 2>/dev/null)"; then
    printf '%s\n' "$base..$local_sha"
    return 0
  fi

  printf '%s\n' "$local_sha"
}

semantic_validate_pushed_refs() {
  local remote_name="${1:-origin}"
  local hook_name="${2:-pre-push}"
  local fail=0
  local local_ref local_sha remote_ref remote_sha
  local branch range line sha subject

  while read -r local_ref local_sha remote_ref remote_sha; do
    [ -n "${local_ref:-}" ] || continue
    semantic_is_zero_sha "${local_sha:-}" && continue

    [[ "${remote_ref:-}" == refs/heads/* ]] || continue
    branch="${remote_ref#refs/heads/}"

    if ! semantic_branch_name_is_valid "$branch"; then
      semantic_print_branch_name_error "$hook_name" "$branch"
      fail=1
    fi

    range="$(semantic_push_commit_range "$remote_name" "$local_sha" "${remote_sha:-}")"
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      sha="${line%% *}"
      subject="${line#* }"

      if ! semantic_commit_subject_is_valid "$subject"; then
        semantic_print_pushed_commit_error "$hook_name" "$sha" "$subject"
        fail=1
      fi
    done < <(git log --format='%H %s' "$range")
  done

  if [ "$fail" -ne 0 ]; then
    semantic_print_push_summary "$hook_name"
  fi

  return "$fail"
}
