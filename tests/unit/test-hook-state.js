'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const hookState = require('../../src/lib/hook-state');

describe('hook-state', () => {
  let testBaseDir;

  beforeEach(() => {
    testBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-hookstate-'));
    hookState._setBaseDirForTest(testBaseDir);
  });

  afterEach(() => {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  });

  describe('setActiveAgent() / getActiveAgent()', () => {
    it('writes and reads agent name', () => {
      hookState.setActiveAgent('session-1', 'coder');
      assert.equal(hookState.getActiveAgent('session-1'), 'coder');
    });

    it('returns empty string for unknown session', () => {
      assert.equal(hookState.getActiveAgent('nonexistent'), '');
    });

    it('refuses invalid session ID', () => {
      assert.equal(hookState.setActiveAgent('../bad', 'coder'), false);
    });
  });

  describe('clearActiveAgent()', () => {
    it('removes the active agent file', () => {
      hookState.setActiveAgent('session-2', 'tester');
      hookState.clearActiveAgent('session-2');
      assert.equal(hookState.getActiveAgent('session-2'), '');
    });

    it('handles already-cleared session gracefully', () => {
      hookState.clearActiveAgent('nonexistent');
    });
  });

  describe('pruneStale()', () => {
    it('removes directories older than TTL', () => {
      const staleDir = path.join(testBaseDir, 'stale-session');
      fs.mkdirSync(staleDir, { recursive: true });
      const pastTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
      fs.utimesSync(staleDir, pastTime, pastTime);
      hookState.pruneStale();
      assert.equal(fs.existsSync(staleDir), false);
    });

    it('preserves recent directories', () => {
      const recentDir = path.join(testBaseDir, 'recent-session');
      fs.mkdirSync(recentDir, { recursive: true });
      hookState.pruneStale();
      assert.equal(fs.existsSync(recentDir), true);
    });
  });
});
