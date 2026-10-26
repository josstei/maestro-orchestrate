'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { ROOT } = require('./paths');

/**
 * Runs `node <script> ...args` to completion. `env` defaults to process.env,
 * as spawnSync's does, and `input` is written to stdin verbatim. The
 * spawnSync result is returned as is: a child that exits before reading all
 * of `input` leaves an EPIPE `error` beside its real exit status.
 */
function runNode(script, args = [], { cwd = ROOT, env, input } = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd, env, input, encoding: 'utf8' });
}

/**
 * Runs `script` as runNode does and returns its stdout, failing the test
 * (quoting the child's stderr) unless it exits 0.
 */
function runNodeOk(script, args, options) {
  const result = runNode(script, args, options);
  assert.equal(result.status, 0, `${script} exited ${result.status}: ${result.stderr}`);
  return result.stdout;
}

/**
 * Asserts the exit fields `expected` names in one comparison, so a failure
 * shows every mismatched field together.
 */
function expectExit(result, expected, message) {
  const actual = Object.fromEntries(Object.keys(expected).map((key) => [key, result[key]]));
  assert.deepEqual(actual, expected, message);
}

/**
 * SIGKILLs an already-spawned `child` as soon as its stdout contains `marker`
 * and resolves once it has exited. Rejects, quoting the child's stderr, when
 * the child exits first or prints no marker within `timeoutMs`. A child the
 * test leaves running is killed after the test.
 */
function killAtMarker(t, child, marker, { timeoutMs = 10000 } = {}) {
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stdout = '';
  let stderr = '';
  let killed = false;
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Child did not print ${JSON.stringify(marker)} within ${timeoutMs}ms: ${stderr}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!killed && stdout.includes(marker)) {
        killed = true;
        child.kill('SIGKILL');
      }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => {
      clearTimeout(timer);
      if (killed) resolve();
      else reject(new Error(`Child exited before printing ${JSON.stringify(marker)}: ${stderr}`));
    });
  });
}

module.exports = {
  expectExit,
  killAtMarker,
  runNode,
  runNodeOk,
};
