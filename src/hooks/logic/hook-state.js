'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { isValidSessionId } = require('../../lib/session-id');
const { atomicWriteSync, ensurePrivateDir, readFileSafe } = require('../../lib/io');

const HOOK_STATE_TTL_MS = 2 * 60 * 60 * 1000;

const uid = process.getuid ? process.getuid() : 'default';
const BASE_DIR = process.env.MAESTRO_HOOKS_DIR
  || path.join(os.tmpdir(), `maestro-hooks-${uid}`);

const activeAgentFile = (sessionId) => path.join(BASE_DIR, sessionId, 'active-agent');

function pruneStale() {
  ensurePrivateDir(BASE_DIR, 'Hook state directory must not be a symlink');

  const now = Date.now();
  let entries;
  try {
    entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(BASE_DIR, entry.name);
    try {
      const stat = fs.lstatSync(dirPath);
      if (now - stat.mtimeMs > HOOK_STATE_TTL_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {}
  }
}

// Nothing else creates `<BASE_DIR>/<sessionId>/`: atomicWriteSync makes the
// session directory (mode 0o700) before the first write.
function setActiveAgent(sessionId, agentName) {
  if (!isValidSessionId(sessionId)) return false;
  atomicWriteSync(activeAgentFile(sessionId), agentName);
  return true;
}

function getActiveAgent(sessionId) {
  if (!isValidSessionId(sessionId)) return '';
  return readFileSafe(activeAgentFile(sessionId)).trim();
}

function clearActiveAgent(sessionId) {
  if (!isValidSessionId(sessionId)) return;
  try {
    fs.unlinkSync(activeAgentFile(sessionId));
  } catch {}
}

function removeSessionDir(sessionId) {
  if (!isValidSessionId(sessionId)) return;
  try {
    fs.rmSync(path.join(BASE_DIR, sessionId), { recursive: true, force: true });
  } catch {}
}

module.exports = {
  pruneStale,
  setActiveAgent,
  getActiveAgent,
  clearActiveAgent,
  removeSessionDir,
};
