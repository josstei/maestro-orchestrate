'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { ROOT } = require('./paths');

/**
 * Runs `node <script> ...args` to completion. `env` defaults to process.env,
 * as spawnSync's does, and `input` is written to stdin verbatim. The
 * spawnSync result is returned as is: a child that exits before reading all
 * of `input` leaves an EPIPE `error` beside its real exit status.
 *
 * @param {string} script - Script path, absolute or relative to `cwd`
 * @param {string[]} [args=[]] - Arguments after the script path
 * @param {Object} [options]
 * @param {string} [options.cwd=ROOT] - Working directory of the child
 * @param {NodeJS.ProcessEnv} [options.env] - Environment of the child
 * @param {string} [options.input] - Text written to the child's stdin
 * @returns {import('node:child_process').SpawnSyncReturns<string>} The spawnSync result
 */
function runNode(script, args = [], { cwd = ROOT, env, input } = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd, env, input, encoding: 'utf8' });
}

/**
 * Runs `script` as runNode does and fails the test, quoting the child's
 * stderr, unless it exits 0.
 *
 * @param {string} script - Script path, absolute or relative to `cwd`
 * @param {string[]} [args] - Arguments after the script path
 * @param {Object} [options] - runNode options
 * @returns {string} The child's stdout
 */
function runNodeOk(script, args, options) {
  const result = runNode(script, args, options);
  assert.equal(result.status, 0, `${script} exited ${result.status}: ${result.stderr}`);
  return result.stdout;
}

/**
 * Asserts the exit fields `expected` names in one comparison, so a failure
 * shows every mismatched field together.
 *
 * @param {{ status: number | null, stdout: string, stderr: string }} result - A runNode result
 * @param {{ status?: number, stdout?: string, stderr?: string }} expected - Exact values of the fields to check
 * @param {string} [message] - Assertion message
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
 *
 * @param {import('node:test').TestContext} t - Context of the running test
 * @param {import('node:child_process').ChildProcess} child - Child with piped stdout and stderr
 * @param {string} marker - Text the child prints once it has reached the point to kill it at
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=10000] - How long to wait for `marker`
 * @returns {Promise<void>} Settles once the child has exited
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
