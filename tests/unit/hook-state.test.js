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

  describe('ensureSessionDir', () => {
    it('creates a directory for a valid session ID', () => {
      const result = state.ensureSessionDir('session-abc123');
      assert.equal(result, true);
      assert.ok(fs.existsSync(path.join(baseDir, 'session-abc123')));
    });

    it('returns false for an invalid session ID', () => {
      const result = state.ensureSessionDir('../hack');
      assert.equal(result, false);
    });
  });

  describe('setActiveAgent', () => {
    it('writes the agent name and returns true', () => {
      const result = state.setActiveAgent('sess1', 'coder');
      assert.equal(result, true);
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
      state.ensureSessionDir('sess5');
      const result = state.removeSessionDir('sess5');
      assert.equal(result, true);
      assert.equal(fs.existsSync(path.join(baseDir, 'sess5')), false);
    });

    it('returns false for an invalid session ID', () => {
      const result = state.removeSessionDir('../hack');
      assert.equal(result, false);
    });

    it('returns true and is safe to call when the directory does not exist', () => {
      const result = state.removeSessionDir('nonexistent-session');
      assert.equal(result, true);
    });
  });

  describe('pruneStale', () => {
    it('does not remove freshly created directories', () => {
      state.ensureSessionDir('fresh-session');
      state.pruneStale();
      assert.ok(fs.existsSync(path.join(baseDir, 'fresh-session')));
    });
  });
});
