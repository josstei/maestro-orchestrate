'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../core/logger');
const { validateSessionId } = require('../state/session-id-validator');
const { atomicWriteSync } = require('../core/atomic-write');

const HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000;

const uid = process.getuid ? process.getuid() : 'default';
const DEFAULT_BASE_DIR = process.env.MAESTRO_HOOKS_DIR
  || path.join(os.tmpdir(), `maestro-hooks-${uid}`);

function ensureBaseDir(dir) {
  try {
    const stats = fs.lstatSync(dir);
    if (stats.isSymbolicLink()) {
      throw new Error('Hook state directory must not be a symlink');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } else if (err.message.includes('symlink')) {
      throw err;
    }
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
    ensureBaseDir(baseDir);
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true, mode: 0o700 });
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
