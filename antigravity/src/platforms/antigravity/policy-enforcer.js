'use strict';

/**
 * Maestro policy enforcer for Antigravity.
 * Reads stdin (Antigravity PreToolUse hook input for run_command), checks
 * toolCall.args.CommandLine against deny and ask patterns, and outputs a
 * decision JSON to stdout.
 *
 * Antigravity denies the tool call when a PreToolUse hook fails or prints
 * anything but a known decision, and has no "no opinion" decision, so:
 *   - a deny rule match is `deny` (blocks in every permission mode)
 *   - an ask rule match is `force_ask` (prompts even when the user's
 *     permissions.allow covers the command)
 *   - any other command is `ask`, which leaves the user's permission settings
 *     and "Always Allow" choices in charge, exactly as without this hook
 *
 * Run through antigravity/hooks/policy-enforcer.js, which calls main() from
 * the repo src/ or, for installed copies, from the bundled antigravity/src/.
 */

const { runPolicyEnforcer } = require('../shared/policy-enforcer');

const ANTIGRAVITY_DECISIONS = { deny: 'deny', ask: 'force_ask', allow: 'ask' };

function main() {
  runPolicyEnforcer({
    readCommand: (input) => input.toolCall && input.toolCall.args && input.toolCall.args.CommandLine,
    formatDecision: ({ action, reason }) =>
      reason
        ? { decision: ANTIGRAVITY_DECISIONS[action], reason }
        : { decision: ANTIGRAVITY_DECISIONS[action] },
    failure: (reason) => ({ decision: 'deny', reason }),
  });
}

module.exports = { main };
