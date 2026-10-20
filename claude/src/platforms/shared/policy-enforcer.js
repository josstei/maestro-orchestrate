'use strict';

const { checkCommand } = require('./policy-rules');
const { readStdin } = require('../../lib/io');

/**
 * Run a host's PreToolUse shell-policy hook: read the hook payload from stdin,
 * check the shell command it carries against the canonical policy rules
 * (src/platforms/shared/policy-rules.js), and write the host's decision to stdout as
 * `{ decision, reason }`, leaving out `reason` when the result has none.
 *
 * Fails closed with the host's `deny` decision when the payload exceeds the
 * 1 MiB stdin cap (readStdin in src/lib/io.js; this also exits with code 1),
 * is not JSON, or carries an unterminated command substitution.
 *
 * @param {object} host
 * @param {(input: object) => string} host.readCommand - shell command in the payload
 * @param {{ deny: string, ask: string, allow: string }} host.decisions - the host's
 *   decision name for each policy action; `deny` is also answered when the check cannot run
 */
function runPolicyEnforcer({ readCommand, decisions }) {
  const emit = (action, reason) => {
    process.stdout.write(JSON.stringify({ decision: decisions[action], reason }) + '\n');
  };

  readStdin().then((raw) => {
    try {
      const { action, reason } = checkCommand(readCommand(JSON.parse(raw)) || '');
      emit(action, reason);
    } catch (err) {
      process.stderr.write('Policy enforcer error: ' + err.message + '\n');
      emit('deny', 'Policy enforcer internal error');
    }
  }, () => {
    process.stderr.write('Policy enforcer: stdin payload too large\n');
    emit('deny', 'Payload too large');
    process.exitCode = 1;
  });
}

module.exports = { runPolicyEnforcer };
