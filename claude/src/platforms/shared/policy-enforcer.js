'use strict';

const { checkCommand } = require('../../core/policy-rules');

const MAX_STDIN_BYTES = 1024 * 1024;

/**
 * Run a host's PreToolUse shell-policy hook: read the hook payload from stdin,
 * check the shell command it carries against the canonical policy rules
 * (src/core/policy-rules.js), and write the host-formatted decision to stdout.
 *
 * A payload over 1 MiB, unparseable JSON, or an unterminated command
 * substitution yields the host's failure decision (fail closed).
 *
 * @param {object} host
 * @param {(input: object) => string} host.readCommand - shell command in the payload
 * @param {(result: { action: 'deny'|'ask'|'allow', reason?: string }) => object} host.formatDecision
 * @param {(reason: string) => object} host.failure - decision emitted when the check cannot run
 */
function runPolicyEnforcer(host) {
  const chunks = [];
  let totalBytes = 0;
  process.stdin.on('data', (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_STDIN_BYTES) {
      process.stderr.write('Policy enforcer: stdin payload too large\n');
      process.stdout.write(JSON.stringify(host.failure('Payload too large')) + '\n');
      process.exit(1);
    }
    chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const result = checkCommand(host.readCommand(input) || '');
      process.stdout.write(JSON.stringify(host.formatDecision(result)) + '\n');
    } catch (err) {
      process.stderr.write('Policy enforcer error: ' + err.message + '\n');
      process.stdout.write(JSON.stringify(host.failure('Policy enforcer internal error')) + '\n');
    }
  });
}

module.exports = { runPolicyEnforcer };
