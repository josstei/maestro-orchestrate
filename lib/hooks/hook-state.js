'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../core/logger');
const { validateSessionId } = require('../state/session-id-validator');
const { atomicWriteSync } = require('../core/atomic-write');

const HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000;

const DEFAULT_BASE_DIR = process.env.MAESTRO_HOOKS_DIR
  || (process.platform === 'win32'
    ? path.join(os.tmpdir(), 'maestro-hooks')
    : '/tmp/maestro-hooks');

function createHookState(baseDir = DEFAULT_BASE_DIR) {
  function getBaseDir() {
    return baseDir;
  }

  function pruneStale() {
    if (!fs.existsSync(baseDir)) return;

    const now = Date.now();
    let entries;
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(baseDir, entry.name);
      try {
        const stat = fs.lstatSync(dirPath);
        if (now - stat.mtimeMs > HOOK_STATE_TTL_MS) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  function setActiveAgent(sessionId, agentName) {
    if (!validateSessionId(sessionId)) {
      log('ERROR', 'Invalid session_id: contains unsafe characters');
      return false;
    }
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    atomicWriteSync(agentFile, agentName);
    return true;
  }

  function getActiveAgent(sessionId) {
    if (!validateSessionId(sessionId)) return '';
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    try {
      return fs.readFileSync(agentFile, 'utf8').trim();
    } catch {
      return '';
    }
  }

  function clearActiveAgent(sessionId) {
    if (!validateSessionId(sessionId)) return;
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    try {
      fs.unlinkSync(agentFile);
    } catch {}
  }

  function ensureSessionDir(sessionId) {
    if (!validateSessionId(sessionId)) return false;
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true });
    return true;
  }

  function removeSessionDir(sessionId) {
    if (!validateSessionId(sessionId)) return false;
    try {
      fs.rmSync(path.join(baseDir, sessionId), { recursive: true, force: true });
    } catch {}
    return true;
  }

  return {
    getBaseDir,
    pruneStale,
    setActiveAgent,
    getActiveAgent,
    clearActiveAgent,
    ensureSessionDir,
    removeSessionDir,
  };
}

const defaultInstance = createHookState();

module.exports = {
  createHookState,
  DEFAULT_BASE_DIR,
  ...defaultInstance,
};
