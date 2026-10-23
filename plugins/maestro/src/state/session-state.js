'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { StateError, NotFoundError } = require('../lib/errors');
const markdownState = require('../core/markdown-state');
const { withStateMutation } = require('./coordinator');
const {
  WORKSPACE_SUBDIRS, resolveStateDirUnder, resolveStateDirPath, activeSessionFile,
} = require('./paths');

function readActiveSession(basePath, tx) {
  const sessionPath = activeSessionFile(basePath);
  const { data, body } = markdownState.parse(tx ? tx.readFile(sessionPath, 'utf8') : fs.readFileSync(sessionPath, 'utf8'));
  return { basePath, state: data, body };
}

function readActiveSessionOrNull(basePath, tx) {
  if (!(tx ? tx.exists(activeSessionFile(basePath)) : fs.existsSync(activeSessionFile(basePath)))) {
    return null;
  }
  return readActiveSession(basePath, tx);
}

function writeActiveSession(basePath, state, body, tx) {
  const sessionPath = activeSessionFile(basePath);
  tx.writeFile(sessionPath, markdownState.serialize(state, body));
  return sessionPath;
}

/**
 * Read the active session, run `mutator(session, now)` against it (mutating
 * `session.state` in place), stamp `state.updated = now`, persist the state
 * with the original body, and return whatever the mutator returned. `now` is
 * one ISO timestamp per call, so a mutator can reuse it for other fields. A
 * throwing mutator leaves the session file untouched.
 */
function withSessionState(cwd, operation, sessionId, mutator) {
  const basePath = resolveStateDirPath(cwd);
  return withStateMutation(basePath, { operation, sessionId }, (tx) => {
    const session = readActiveSession(basePath, tx);
    const now = new Date().toISOString();
    const result = mutator(session, now);
    session.state.updated = now;
    writeActiveSession(basePath, session.state, session.body, tx);
    return result;
  });
}

/**
 * Move the active session file to `state/archive/<sessionId>.md`.
 * @param {string} basePath - Resolved state dir
 * @param {string} sessionId - Already validated by assertSessionId
 * @returns {string} the archive path
 */
function archiveActiveSession(basePath, sessionId, tx) {
  const archivePath = path.join(basePath, 'state', 'archive', `${sessionId}.md`);
  tx.mkdir(path.dirname(archivePath), { recursive: true });
  tx.rename(activeSessionFile(basePath), archivePath);
  return archivePath;
}

function assertSessionMatch(state, sessionId, verb = 'got') {
  if (sessionId && state.session_id !== sessionId) {
    throw new StateError(
      `Session mismatch: active session is '${state.session_id}', ${verb} '${sessionId}'`
    );
  }
}

/**
 * Look up a phase by id, throwing NotFoundError with `message` when absent.
 * @param {Array<{ id: number | string }>} phases
 * @param {number | string} phaseId
 * @param {string} [message]
 * @returns {object} the matching phase
 * @throws {NotFoundError} when no phase has id `phaseId`
 */
function findPhaseOrThrow(phases, phaseId, message = `Phase ${phaseId} not found in session state`) {
  const phase = phases.find((candidate) => candidate.id === phaseId);
  if (!phase) {
    throw new NotFoundError(message);
  }
  return phase;
}

async function ensureWorkspace(stateDir, basePath) {
  const fullBase = resolveStateDirUnder(basePath, stateDir);
  if (fs.existsSync(fullBase) && fs.lstatSync(fullBase).isSymbolicLink()) {
    throw new Error('STATE_DIR must not be a symlink');
  }
  return withStateMutation(fullBase, { operation: 'initialize_workspace' }, (tx) => {
    tx.mkdir(fullBase, { recursive: true, mode: 0o700 });
    for (const dir of WORKSPACE_SUBDIRS.map((subdir) => path.join(fullBase, subdir))) {
      try {
        tx.mkdir(dir, { recursive: true, mode: 0o700 });
      } catch {
        throw new Error('Failed to create workspace directory');
      }
      if (fs.existsSync(dir)) {
        try {
          fs.accessSync(dir, fs.constants.W_OK);
        } catch {
          throw new Error('Workspace directory not writable');
        }
      }
    }
    const stateGitignore = path.join(fullBase, 'state', '.gitignore');
    try {
      const existing = tx.exists(stateGitignore) ? tx.readFile(stateGitignore, 'utf8') : null;
      if (existing === null) {
        tx.writeFile(stateGitignore, 'active-session.md\narchive/\n.maestro/\n');
      } else if (!existing.split(/\r?\n/).includes('.maestro/')) {
        tx.writeFile(stateGitignore, existing + (existing.endsWith('\n') ? '' : '\n') + '.maestro/\n');
      }
    } catch {}
  });
}

module.exports = {
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
  archiveActiveSession,
  assertSessionMatch,
  findPhaseOrThrow,
  ensureWorkspace,
};
