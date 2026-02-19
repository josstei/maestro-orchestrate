'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./logger');
const { validateSessionId } = require('./validation');
const { HOOK_STATE_TTL_MS } = require('./constants');

let _baseDir = path.join(os.tmpdir(), 'maestro-hooks');

function getBaseDir() {
  return _baseDir;
}

function _setBaseDirForTest(dir) {
  _baseDir = dir;
}

function pruneStale() {
  const baseDir = getBaseDir();
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
      const stat = fs.statSync(dirPath);
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
  const baseDir = getBaseDir();
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
  const agentFile = path.join(getBaseDir(), sessionId, 'active-agent');
  try {
    return fs.readFileSync(agentFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function clearActiveAgent(sessionId) {
  if (!validateSessionId(sessionId)) return;
  const agentFile = path.join(getBaseDir(), sessionId, 'active-agent');
  try {
    fs.unlinkSync(agentFile);
  } catch {}
}

module.exports = {
  getBaseDir,
  _setBaseDirForTest,
  pruneStale,
  setActiveAgent,
  getActiveAgent,
  clearActiveAgent,
};
