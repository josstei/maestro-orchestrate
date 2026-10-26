'use strict';

const path = require('node:path');
const { checkCommand } = require('../../core/policy-rules');
const { collectStdin } = require('../../core/stdin-reader');

/**
 * Run `runtime`'s PreToolUse shell-policy hook: check the stdin payload's command
 * against src/core/policy-rules.js and print `{ decision, reason? }` named by the
 * adapter's shellPolicy.decisions. A payload over the 1 MiB stdin cap, unparseable
 * JSON or an unterminated command substitution gets the host's `deny` (fail closed).
 *
 * @param {string} runtime - runtime name, e.g. 'claude'
 * @returns {Promise<void>}
 */
function main(runtime) {
  // maestro-dependencies: hook-adapters
  const { readCommand, decisions } = require(path.join(__dirname, '..', runtime, 'hook-adapter.js')).shellPolicy;
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

module.exports = { main };
