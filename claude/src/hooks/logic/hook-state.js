'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../../core/logger');
const { isValidSessionId } = require('../../lib/validation');
const { atomicWriteSync, readFileSafe } = require('../../lib/io');

const HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000;

const uid = process.getuid ? process.getuid() : 'default';
const DEFAULT_BASE_DIR = process.env.MAESTRO_HOOKS_DIR
  || path.join(os.tmpdir(), `maestro-hooks-${uid}`);

function ensureBaseDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(dir);
  if (stats.isSymbolicLink()) {
    throw new Error('Hook state directory must not be a symlink');
  }
}

function createHookState(baseDir = DEFAULT_BASE_DIR) {
  const activeAgentFile = (sessionId) => path.join(baseDir, sessionId, 'active-agent');

  function pruneStale() {
    ensureBaseDir(baseDir);

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
    if (!isValidSessionId(sessionId)) {
      log('ERROR', 'Invalid session_id: contains unsafe characters');
      return false;
    }
    atomicWriteSync(activeAgentFile(sessionId), agentName);
    return true;
  }

  function getActiveAgent(sessionId) {
    if (!isValidSessionId(sessionId)) return '';
    return readFileSafe(activeAgentFile(sessionId), '').trim();
  }

  function clearActiveAgent(sessionId) {
    if (!isValidSessionId(sessionId)) return;
    try {
      fs.unlinkSync(activeAgentFile(sessionId));
    } catch {}
  }

  function ensureSessionDir(sessionId) {
    if (!isValidSessionId(sessionId)) return false;
    ensureBaseDir(baseDir);
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true, mode: 0o700 });
    return true;
  }

  function removeSessionDir(sessionId) {
    if (!isValidSessionId(sessionId)) return false;
    try {
      fs.rmSync(path.join(baseDir, sessionId), { recursive: true, force: true });
    } catch {}
    return true;
  }

  return {
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
