'use strict';

/**
 * Maestro policy enforcer for Claude Code.
 * Reads stdin (Claude Code PreToolUse hook input for Bash),
 * checks tool_input.command against deny and ask patterns,
 * and outputs a decision JSON to stdout.
 *
 * Run through claude/scripts/policy-enforcer.js, which calls main() from the
 * repo src/ or, for detached installs, from the bundled claude/src/ copy.
 */

const { runPolicyEnforcer } = require('../shared/policy-enforcer');

const CLAUDE_DECISIONS = { deny: 'block', ask: 'ask', allow: 'approve' };

function main() {
  runPolicyEnforcer({
    readCommand: (input) => input.tool_input && input.tool_input.command,
    formatDecision: ({ action, reason }) =>
      reason ? { decision: CLAUDE_DECISIONS[action], reason } : { decision: CLAUDE_DECISIONS[action] },
    failure: (reason) => ({ decision: 'block', reason }),
  });
}

module.exports = { main };
