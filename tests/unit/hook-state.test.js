'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createHookState, DEFAULT_BASE_DIR } = require('../../src/hooks/logic/hook-state');

function makeTempBaseDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hook-state-test-'));
}

describe('hook-state', () => {
  describe('DEFAULT_BASE_DIR', () => {
    it('is defined and is a string', () => {
      assert.ok(DEFAULT_BASE_DIR);
      assert.equal(typeof DEFAULT_BASE_DIR, 'string');
    });
  });

  describe('getBaseDir', () => {
    it('returns the configured base directory', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      assert.equal(state.getBaseDir(), baseDir);
    });
  });

  describe('ensureSessionDir', () => {
    it('creates a directory for a valid session ID', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const result = state.ensureSessionDir('session-abc123');
      assert.equal(result, true);
      assert.ok(fs.existsSync(path.join(baseDir, 'session-abc123')));
    });

    it('returns false for an invalid session ID', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const result = state.ensureSessionDir('../hack');
      assert.equal(result, false);
    });
  });

  describe('setActiveAgent', () => {
    it('writes the agent name and returns true', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const result = state.setActiveAgent('sess1', 'coder');
      assert.equal(result, true);
    });

    it('returns false for an invalid session ID', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const result = state.setActiveAgent('../hack', 'coder');
      assert.equal(result, false);
    });
  });

  describe('getActiveAgent', () => {
    it('reads back the written agent name', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      state.setActiveAgent('sess2', 'tester');
      assert.equal(state.getActiveAgent('sess2'), 'tester');
    });

    it("returns '' for a non-existent session", () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      assert.equal(state.getActiveAgent('nonexistent'), '');
    });

    it("returns '' for an invalid session ID", () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      assert.equal(state.getActiveAgent('../hack'), '');
    });
  });

  describe('clearActiveAgent', () => {
    it('removes the agent file', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      state.setActiveAgent('sess3', 'architect');
      state.clearActiveAgent('sess3');
      assert.equal(state.getActiveAgent('sess3'), '');
    });

    it('is safe to call when no agent is set', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      assert.doesNotThrow(() => state.clearActiveAgent('sess4'));
    });
  });

  describe('removeSessionDir', () => {
    it('removes the entire session directory', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      state.ensureSessionDir('sess5');
      const result = state.removeSessionDir('sess5');
      assert.equal(result, true);
      assert.equal(fs.existsSync(path.join(baseDir, 'sess5')), false);
    });

    it('returns false for an invalid session ID', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const result = state.removeSessionDir('../hack');
      assert.equal(result, false);
    });

    it('returns true and is safe to call when the directory does not exist', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const result = state.removeSessionDir('nonexistent-session');
      assert.equal(result, true);
    });
  });

  describe('pruneStale', () => {
    it('does not remove freshly created directories', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      state.ensureSessionDir('fresh-session');
      state.pruneStale();
      assert.ok(fs.existsSync(path.join(baseDir, 'fresh-session')));
    });
  });

  describe('full lifecycle', () => {
    it('ensure → set → get → clear → get returns empty string', () => {
      const baseDir = makeTempBaseDir();
      const state = createHookState(baseDir);
      const sessionId = 'lifecycle-session';

      state.ensureSessionDir(sessionId);
      state.setActiveAgent(sessionId, 'debugger');
      assert.equal(state.getActiveAgent(sessionId), 'debugger');
      state.clearActiveAgent(sessionId);
      assert.equal(state.getActiveAgent(sessionId), '');
    });
  });
});
