'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runNodeOk } = require('./process');
const { acquireStateLock } = require('../../src/state/state-lock');
const { createTransaction, publishTransaction } = require('../../src/state/transaction');

/**
 * Link type for directory symlinks. Windows junctions need no symlink
 * privilege, so tests that link directories run on unprivileged hosts too.
 */
const DIR_LINK = process.platform === 'win32' ? 'junction' : 'dir';

/** Returns the private coordination directory of a state root. */
function controlDir(base) {
  return path.join(base, 'state', '.maestro');
}

/**
 * Commits a transaction's journal without applying it, leaving the state as
 * a writer killed right after its commit point would. Recovery replays it.
 * `lock` holds the state lock while committing, as a live writer does.
 */
async function leaveCommitted(base, mutate, { operation = 'interrupted_test_write', result, lock = false } = {}) {
  const control = controlDir(base);
  const release = lock ? await acquireStateLock(control) : () => {};
  try {
    const pending = createTransaction(base, control);
    mutate(pending.tx);
    publishTransaction(pending, control, { operation }, result);
    return pending;
  } finally { release(); }
}

/**
 * Creates a symlink, or skips the test when Windows denies the privilege to
 * create it. The caller must return when this returns false.
 */
function symlinkOrSkip(t, target, linkPath, type) {
  try {
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.skip('Symlinks require privileges');
    return false;
  }
}

/**
 * Runs the five state CLIs in `scriptsDir` against a workspace with no
 * active session: ensure-workspace creates `stateDir`, read-setting reads
 * MAESTRO_EXECUTION_MODE as `parallel`, and a session written with
 * write-state reads back unchanged through read-state and
 * read-active-session. The caller's env or workspace .env must set
 * MAESTRO_EXECUTION_MODE=parallel and MAESTRO_STATE_DIR=`stateDir`.
 */
function assertStateCliRoundTrip(scriptsDir, stateDir, { cwd, env }) {
  const run = (script, args = [], input = '') =>
    runNodeOk(path.join(scriptsDir, script), args, { cwd, env, input });
  run('ensure-workspace.js', [stateDir]);
  assert.ok(fs.statSync(path.join(cwd, stateDir, 'plans/archive')).isDirectory());
  assert.equal(run('read-setting.js', ['MAESTRO_EXECUTION_MODE']), 'parallel');
  assert.equal(run('read-active-session.js'), 'No active session\n');
  const session = `${stateDir}/state/active-session.md`;
  const content = '---\n{"session_id":"round-trip","status":"in_progress"}\n---\n# Session\n';
  run('write-state.js', [session], content);
  assert.equal(run('read-state.js', [session]), content);
  assert.equal(run('read-active-session.js'), content);
}

module.exports = {
  DIR_LINK,
  assertStateCliRoundTrip,
  controlDir,
  leaveCommitted,
  symlinkOrSkip,
};
