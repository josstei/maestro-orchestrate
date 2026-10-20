'use strict';

/**
 * Maestro policy enforcer for Claude Code.
 * Reads stdin (Claude Code PreToolUse hook input for Bash),
 * checks tool_input.command against deny and ask patterns,
 * and outputs a decision JSON to stdout.
 *
 * Runs when required by claude/scripts/policy-enforcer.js, which loads it from
 * the repo src/ or, for detached installs, from the bundled claude/src/ copy.
 */

const { runPolicyEnforcer } = require('../shared/policy-enforcer');

runPolicyEnforcer({
  readCommand: (input) => input.tool_input?.command,
  decisions: { deny: 'block', ask: 'ask', allow: 'approve' },
});
