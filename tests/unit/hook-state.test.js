'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeTempDir } = require('../support/fs');

// hook-state reads MAESTRO_HOOKS_DIR once, at load; each test uses its own session id.
// The base dir is nested in a private temp dir, so a removeSessionDir('..') that
// slipped past session-id validation could only delete that dir, not os.tmpdir().
const baseDir = path.join(makeTempDir('maestro-hook-state-test-'), 'hooks');
process.env.MAESTRO_HOOKS_DIR = baseDir;
const state = require('../../src/hooks/logic/hook-state');

describe('hook-state', () => {
  describe('setActiveAgent', () => {
    it('writes the agent name and returns true', () => {
      const result = state.setActiveAgent('sess1', 'coder');
      assert.equal(result, true);
      assert.equal(fs.readFileSync(path.join(baseDir, 'sess1', 'active-agent'), 'utf8'), 'coder');
    });

    it('creates the missing session directory as private (0o700)', {
      skip: process.platform === 'win32' && 'Windows does not report POSIX modes',
    }, () => {
      state.setActiveAgent('session-abc123', 'coder');
      const stat = fs.statSync(path.join(baseDir, 'session-abc123'));
      assert.ok(stat.isDirectory());
      assert.equal(stat.mode & 0o777, 0o700);
    });

    it('returns false for an invalid session ID', () => {
      const result = state.setActiveAgent('../hack', 'coder');
      assert.equal(result, false);
    });
  });

  describe('getActiveAgent', () => {
    it('reads back the written agent name', () => {
      state.setActiveAgent('sess2', 'tester');
      assert.equal(state.getActiveAgent('sess2'), 'tester');
    });

    it("returns '' for a non-existent session", () => {
      assert.equal(state.getActiveAgent('nonexistent'), '');
    });

    it("returns '' for an invalid session ID", () => {
      assert.equal(state.getActiveAgent('../hack'), '');
    });
  });

  describe('clearActiveAgent', () => {
    it('removes the agent file', () => {
      state.setActiveAgent('sess3', 'architect');
      state.clearActiveAgent('sess3');
      assert.equal(state.getActiveAgent('sess3'), '');
    });

    it('is safe to call when no agent is set', () => {
      assert.doesNotThrow(() => state.clearActiveAgent('sess4'));
    });
  });

  describe('removeSessionDir', () => {
    it('removes the entire session directory', () => {
      state.setActiveAgent('sess5', 'coder');
      state.removeSessionDir('sess5');
      assert.equal(fs.existsSync(path.join(baseDir, 'sess5')), false);
    });

    it('leaves the base directory alone for an invalid session ID', () => {
      state.setActiveAgent('sess6', 'coder');
      assert.doesNotThrow(() => state.removeSessionDir('..'));
      assert.doesNotThrow(() => state.removeSessionDir('../hack'));
      assert.equal(state.getActiveAgent('sess6'), 'coder');
    });

    it('is safe to call when the directory does not exist', () => {
      assert.doesNotThrow(() => state.removeSessionDir('nonexistent-session'));
    });
  });

  describe('pruneStale', () => {
    it('does not remove freshly created directories', () => {
      state.setActiveAgent('fresh-session', 'coder');
      state.pruneStale();
      assert.ok(fs.existsSync(path.join(baseDir, 'fresh-session')));
    });
  });
});
