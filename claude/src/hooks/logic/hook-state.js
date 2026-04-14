'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../../core/logger');
const { assertSessionId } = require('../../lib/validation');
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
  function getBaseDir() {
    return baseDir;
  }

  function pruneStale() {
    ensureBaseDir(baseDir);
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
    try {
      assertSessionId(sessionId);
    } catch {
      log('ERROR', 'Invalid session_id: contains unsafe characters');
      return false;
    }
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    atomicWriteSync(agentFile, agentName);
    return true;
  }

  function getActiveAgent(sessionId) {
    try {
      assertSessionId(sessionId);
    } catch {
      return '';
    }
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    return readFileSafe(agentFile, '').trim();
  }

  function clearActiveAgent(sessionId) {
    try {
      assertSessionId(sessionId);
    } catch {
      return;
    }
    const agentFile = path.join(baseDir, sessionId, 'active-agent');
    try {
      fs.unlinkSync(agentFile);
    } catch {}
  }

  function ensureSessionDir(sessionId) {
    try {
      assertSessionId(sessionId);
    } catch {
      return false;
    }
    ensureBaseDir(baseDir);
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true, mode: 0o700 });
    return true;
  }

  function removeSessionDir(sessionId) {
    try {
      assertSessionId(sessionId);
    } catch {
      return false;
    }
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
