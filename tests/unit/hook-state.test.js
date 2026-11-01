'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createHookState } = require('../../src/hooks/logic/hook-state');
const { makeTempDir } = require('../support/fs');

describe('hook-state', () => {
  let baseDir;
  let state;

  beforeEach(() => {
    baseDir = makeTempDir('maestro-hook-state-test-');
    state = createHookState(baseDir);
  });

  it('writes, reads back and clears the active agent', () => {
    assert.equal(state.setActiveAgent('sess2', 'tester'), true);
    assert.equal(state.getActiveAgent('sess2'), 'tester');
    state.clearActiveAgent('sess2');
    assert.equal(state.getActiveAgent('sess2'), '');
  });

  it('creates the missing session directory as private (0o700)', {
    skip: process.platform === 'win32' && 'Windows does not report POSIX modes',
  }, () => {
    state.setActiveAgent('session-abc123', 'coder');
    const stat = fs.statSync(path.join(baseDir, 'session-abc123'));
    assert.ok(stat.isDirectory());
    assert.equal(stat.mode & 0o777, 0o700);
  });

  it('rejects an invalid session ID everywhere', () => {
    assert.equal(state.setActiveAgent('../hack', 'coder'), false);
    assert.equal(state.getActiveAgent('../hack'), '');
    assert.equal(state.removeSessionDir('../hack'), false);
  });

  it('treats a session with no agent or directory as empty', () => {
    assert.equal(state.getActiveAgent('nonexistent'), '');
    assert.doesNotThrow(() => state.clearActiveAgent('sess4'));
    assert.equal(state.removeSessionDir('nonexistent-session'), true);
  });

  it('removes the entire session directory', () => {
    state.setActiveAgent('sess5', 'coder');
    assert.equal(state.removeSessionDir('sess5'), true);
    assert.equal(fs.existsSync(path.join(baseDir, 'sess5')), false);
  });

  describe('pruneStale', () => {
    it('does not remove freshly created directories', () => {
      state.setActiveAgent('fresh-session', 'coder');
      state.pruneStale();
      assert.ok(fs.existsSync(path.join(baseDir, 'fresh-session')));
    });

    it('creates a missing base directory and its parents', () => {
      const nested = path.join(baseDir, 'a', 'b', 'hooks');
      createHookState(nested).pruneStale();
      assert.ok(fs.statSync(nested).isDirectory());
    });

    it('refuses a symlinked base directory', () => {
      const link = path.join(baseDir, 'link');
      fs.symlinkSync(baseDir, link, 'dir');
      assert.throws(
        () => createHookState(link).pruneStale(),
        { message: 'Hook state directory must not be a symlink' }
      );
    });
  });
});
