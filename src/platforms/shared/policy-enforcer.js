'use strict';

const path = require('node:path');
const { checkCommand } = require('../../core/policy-rules');
const { collectStdin } = require('../../core/stdin-reader');

/**
 * Run a host's PreToolUse shell-policy hook: read the hook payload from stdin,
 * check the shell command it carries against the canonical policy rules
 * (src/core/policy-rules.js), and write the host's decision to stdout as
 * `{ decision, reason }`, leaving out `reason` when the result has none.
 *
 * A payload over the shared 1 MiB stdin cap (src/core/stdin-reader.js),
 * unparseable JSON, or an unterminated command substitution yields the host's
 * `deny` decision (fail closed).
 *
 * @param {object} host
 * @param {(input: object) => string} host.readCommand - shell command in the payload
 * @param {{ deny: string, ask: string, allow: string }} host.decisions - the host's
 *   decision name for each policy action; `deny` is also answered when the check cannot run
 * @returns {Promise<void>}
 */
function runPolicyEnforcer({ readCommand, decisions }) {
  const emit = (action, reason) => {
    const decision = reason ? { decision: decisions[action], reason } : { decision: decisions[action] };
    process.stdout.write(JSON.stringify(decision) + '\n');
  };

  return collectStdin({
    onOverflow: () => {
      process.stderr.write('Policy enforcer: stdin payload too large\n');
      emit('deny', 'Payload too large');
      process.exit(1);
    },
  }).then((raw) => {
    try {
      const { action, reason } = checkCommand(readCommand(JSON.parse(raw)) || '');
      emit(action, reason);
    } catch (err) {
      process.stderr.write('Policy enforcer error: ' + err.message + '\n');
      emit('deny', 'Policy enforcer internal error');
    }
  });
}

/**
 * Run the shell-policy hook for the runtime whose generated policy-enforcer
 * launcher calls this. The runtime's hook adapter exports the host facts as
 * `shellPolicy: { tool, readCommand, decisions }`, where `tool` is the shell
 * tool the hook is registered on (src/platforms/metadata.js).
 *
 * @param {string} runtime - runtime name, e.g. 'claude'
 * @returns {Promise<void>}
 */
function main(runtime) {
  // maestro-dependencies: hook-adapters
  const { shellPolicy } = require(path.join(__dirname, '..', runtime, 'hook-adapter.js'));
  return runPolicyEnforcer({ readCommand: shellPolicy.readCommand, decisions: shellPolicy.decisions });
}

module.exports = { main };
