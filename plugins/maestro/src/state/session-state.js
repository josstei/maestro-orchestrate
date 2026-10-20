'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteSync, ensurePrivateDir } = require('../lib/io');
const { StateError, NotFoundError } = require('../lib/errors');
const markdownState = require('../core/markdown-state');
const { resolveSetting } = require('../config/setting-resolver');

const DEFAULT_STATE_DIR = 'docs/maestro';
const ACTIVE_SESSION_REL = path.join('state', 'active-session.md');
const WORKSPACE_SUBDIRS = Object.freeze(['state', 'state/archive', 'plans', 'plans/archive']);

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error('Path must be relative');
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}

function validateContainment(absolutePath, rootDir) {
  let resolved = path.resolve(absolutePath);
  let resolvedRoot = path.resolve(rootDir);
  try { resolved = fs.realpathSync(resolved); } catch {}
  try { resolvedRoot = fs.realpathSync(resolvedRoot); } catch {}
  const rootPrefix = resolvedRoot + path.sep;
  if (!resolved.startsWith(rootPrefix) && resolved !== resolvedRoot) {
    throw new Error('state_dir must be within the project root');
  }
  return resolved;
}

function resolveStateDirUnder(base, stateDir) {
  if (path.isAbsolute(stateDir)) {
    return validateContainment(stateDir, base);
  }

  validateRelativePath(stateDir);
  return path.join(base, stateDir);
}

/**
 * Resolve the absolute state dir for a workspace: the override when given,
 * else MAESTRO_STATE_DIR with the same precedence initialize_workspace uses
 * (environment, then the workspace .env, then the extension .env), else
 * DEFAULT_STATE_DIR.
 * @param {string} [cwd] - Workspace root; defaults to process.cwd()
 * @param {string} [stateDirOverride]
 * @returns {string}
 */
function resolveStateDirPath(cwd, stateDirOverride) {
  const root = cwd || process.cwd();
  const stateDir = stateDirOverride || resolveSetting('MAESTRO_STATE_DIR', root) || DEFAULT_STATE_DIR;
  return resolveStateDirUnder(root, stateDir);
}

function activeSessionFile(basePath) {
  return path.join(basePath, ACTIVE_SESSION_REL);
}

function resolveActiveSessionPath(cwd, stateDirOverride) {
  return activeSessionFile(resolveStateDirPath(cwd, stateDirOverride));
}

function readState(relativePath, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function writeState(relativePath, content, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  atomicWriteSync(fullPath, content);
}

function readSessionAt(basePath) {
  const sessionPath = activeSessionFile(basePath);
  const { data, body } = markdownState.parse(fs.readFileSync(sessionPath, 'utf8'));
  return { basePath, sessionPath, state: data, body };
}

function readActiveSession(cwd) {
  return readSessionAt(resolveStateDirPath(cwd));
}

function readActiveSessionOrNull(cwd) {
  const basePath = resolveStateDirPath(cwd);
  if (!fs.existsSync(activeSessionFile(basePath))) {
    return null;
  }
  return readSessionAt(basePath);
}

function writeActiveSession(basePath, state, body) {
  const sessionPath = activeSessionFile(basePath);
  atomicWriteSync(sessionPath, markdownState.serialize(state, body));
  return sessionPath;
}

/**
 * Read the active session, run `mutator` against it (mutating `session.state`
 * in place), persist the state with the original body, and return whatever
 * the mutator returned. A throwing mutator leaves the session file untouched.
 */
function withSessionState(cwd, mutator) {
  const session = readActiveSession(cwd);
  const result = mutator(session);
  writeActiveSession(session.basePath, session.state, session.body);
  return result;
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

function ensureWorkspace(stateDir, basePath) {
  const fullBase = resolveStateDirUnder(basePath, stateDir);
  ensurePrivateDir(fullBase, 'STATE_DIR must not be a symlink');
  for (const dir of WORKSPACE_SUBDIRS.map((subdir) => path.join(fullBase, subdir))) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      throw new Error('Failed to create workspace directory');
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error('Workspace directory not writable');
    }
  }
  const stateGitignore = path.join(fullBase, 'state', '.gitignore');
  try {
    fs.writeFileSync(stateGitignore, 'active-session.md\narchive/\n', { mode: 0o600, flag: 'wx' });
  } catch {}
}

module.exports = {
  DEFAULT_STATE_DIR,
  WORKSPACE_SUBDIRS,
  resolveStateDirPath,
  resolveActiveSessionPath,
  readState,
  writeState,
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
  assertSessionMatch,
  findPhaseOrThrow,
  ensureWorkspace,
};
