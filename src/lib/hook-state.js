'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./logger');
const { validateSessionId } = require('./validation');
const { HOOK_STATE_TTL_MS } = require('./constants');

const DEFAULT_BASE_DIR = process.platform === 'win32'
  ? path.join(os.tmpdir(), 'maestro-hooks')
  : '/tmp/maestro-hooks';

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
    const sessionDir = path.join(baseDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const agentFile = path.join(sessionDir, 'active-agent');
    const tmpFile = `${agentFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, agentName);
    fs.renameSync(tmpFile, agentFile);
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

  return {
    getBaseDir,
    pruneStale,
    setActiveAgent,
    getActiveAgent,
    clearActiveAgent,
  };
}

const defaultInstance = createHookState();

module.exports = {
  createHookState,
  DEFAULT_BASE_DIR,
  ...defaultInstance,
};
