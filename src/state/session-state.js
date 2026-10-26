'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { StateError, NotFoundError } = require('../lib/errors');
const markdownState = require('../core/markdown-state');
const { withStateMutation } = require('./coordinator');
const {
  WORKSPACE_SUBDIRS, resolveStateDirUnder, resolveStateDirPath, activeSessionFile,
} = require('./paths');

/** Parse ctx.basePath's active session; ctx is a withStateMutation tx or a withStateRead view. */
function readActiveSession(ctx) {
  const { data, body } = markdownState.parse(ctx.readFile(activeSessionFile(ctx.basePath), 'utf8'));
  return { state: data, body };
}

function readActiveSessionOrNull(ctx) {
  return ctx.exists(activeSessionFile(ctx.basePath)) ? readActiveSession(ctx) : null;
}

function writeActiveSession(tx, state, body) {
  const sessionPath = activeSessionFile(tx.basePath);
  tx.writeFile(sessionPath, markdownState.serialize(state, body));
  return sessionPath;
}

/**
 * Read the active session, fail with StateError when it is not `sessionId`
 * (a falsy `sessionId` skips the check), run `mutator(session, now)` against
 * it (mutating `session.state` in place), stamp `state.updated = now`, persist
 * the state with the original body, and return whatever the mutator returned.
 * `now` is one ISO timestamp per call, so a mutator can reuse it for other
 * fields. A mismatch or a throwing mutator leaves the session file untouched.
 */
function withSessionState(cwd, operation, sessionId, mutator) {
  return withStateMutation(resolveStateDirPath(cwd), { operation, sessionId }, (tx) => {
    const session = readActiveSession(tx);
    assertSessionMatch(session.state, sessionId);
    const now = new Date().toISOString();
    const result = mutator(session, now);
    session.state.updated = now;
    writeActiveSession(tx, session.state, session.body);
    return result;
  });
}

/**
 * Move the active session file to `state/archive/<sessionId>.md`.
 * @param {object} tx - State transaction
 * @param {string} sessionId - Already validated by assertSessionId
 * @returns {string} the archive path
 */
function archiveActiveSession(tx, sessionId) {
  const archivePath = path.join(tx.basePath, 'state', 'archive', `${sessionId}.md`);
  tx.mkdir(path.dirname(archivePath), { recursive: true, mode: 0o700 });
  tx.rename(activeSessionFile(tx.basePath), archivePath);
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

// Create the state and plans trees under `stateDir` (resolved against basePath);
// resolves { alreadyExisted } for `<state_dir>/state`.
async function ensureWorkspace(stateDir, basePath) {
  const fullBase = resolveStateDirUnder(basePath, stateDir);
  // lstat, unlike existsSync, also sees a dangling symlink. Other lstat
  // failures are left for the state lock to report.
  let stat = null;
  try { stat = fs.lstatSync(fullBase); } catch {}
  if (stat?.isSymbolicLink()) {
    throw new Error('STATE_DIR must not be a symlink');
  }
  // Checked before the state lock, which creates `state/.maestro`.
  const alreadyExisted = fs.existsSync(path.join(fullBase, 'state'));
  await withStateMutation(fullBase, { operation: 'initialize_workspace' }, (tx) => {
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
  return { alreadyExisted };
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
