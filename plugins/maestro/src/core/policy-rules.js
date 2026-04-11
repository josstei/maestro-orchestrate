'use strict';

/**
 * Canonical policy rules for Maestro command safety enforcement.
 * Used by:
 *   - claude/scripts/policy-enforcer.js (Claude Code PreToolUse hook)
 *   - policies/maestro.toml (Gemini CLI policy pack — generated separately)
 *
 * Rule shapes:
 *   { matchType: 'prefix' | 'regex' | 'word', pattern: string, reason: string }
 */

const DENY_RULES = Object.freeze([
  { matchType: 'prefix', pattern: 'rm -rf', reason: 'Recursive force delete' },
  { matchType: 'prefix', pattern: 'rm -fr', reason: 'Recursive force delete (flag reorder)' },
  { matchType: 'prefix', pattern: 'sudo rm -rf', reason: 'Privileged recursive force delete' },
  { matchType: 'prefix', pattern: 'sudo rm -fr', reason: 'Privileged recursive force delete (flag reorder)' },
  { matchType: 'prefix', pattern: 'git reset --hard', reason: 'Discards uncommitted changes' },
  { matchType: 'prefix', pattern: 'git checkout --', reason: 'Discards uncommitted file changes' },
  { matchType: 'prefix', pattern: 'git clean -fd', reason: 'Removes untracked files permanently' },
  { matchType: 'prefix', pattern: 'git clean -df', reason: 'Removes untracked files permanently (flag reorder)' },
  { matchType: 'prefix', pattern: 'git clean -xfd', reason: 'Removes untracked and ignored files permanently' },
  { matchType: 'prefix', pattern: 'git clean -xdf', reason: 'Removes untracked and ignored files permanently (flag reorder)' },
  { matchType: 'regex', pattern: '<<', reason: 'Heredoc corrupts structured content (YAML, Markdown, JSON) — use write_file instead' },
]);

const ASK_RULES = Object.freeze([
  { matchType: 'word', pattern: 'tee', reason: 'Writes to file and stdout' },
  { matchType: 'regex', pattern: '\\s>>?\\s|\\s>>?$|^>>?\\s|\\d>>?\\s', reason: 'Shell output redirection' },
]);

module.exports = { DENY_RULES, ASK_RULES };
