'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../lib/io');
const { StateError } = require('../lib/errors');
const markdownState = require('../core/markdown-state');

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

function resolveStateDirPath(cwd, stateDirOverride) {
  const stateDir = stateDirOverride || process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;
  return resolveStateDirUnder(cwd || process.cwd(), stateDir);
}

function resolveActiveSessionPath(cwd) {
  return path.join(resolveStateDirPath(cwd), ACTIVE_SESSION_REL);
}

function hasActiveSession(cwd) {
  try {
    const sessionPath = resolveActiveSessionPath(cwd);
    return fs.existsSync(sessionPath);
  } catch {
    return false;
  }
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
  const { data, body } = markdownState.parse(readState(ACTIVE_SESSION_REL, basePath));
  return {
    basePath,
    sessionPath: path.join(basePath, ACTIVE_SESSION_REL),
    state: data,
    body,
  };
}

function readActiveSession(cwd) {
  return readSessionAt(resolveStateDirPath(cwd));
}

function readActiveSessionOrNull(cwd) {
  const basePath = resolveStateDirPath(cwd);
  if (!fs.existsSync(path.join(basePath, ACTIVE_SESSION_REL))) {
    return null;
  }
  return readSessionAt(basePath);
}

function writeActiveSession(basePath, state, body) {
  writeState(ACTIVE_SESSION_REL, markdownState.serialize(state, body), basePath);
  return path.join(basePath, ACTIVE_SESSION_REL);
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

function ensureWorkspace(stateDir, basePath) {
  const fullBase = resolveStateDirUnder(basePath, stateDir);
  fs.mkdirSync(fullBase, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(fullBase);
  if (stats.isSymbolicLink()) {
    throw new Error('STATE_DIR must not be a symlink');
  }
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
  validateContainment,
  resolveStateDirPath,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
  assertSessionMatch,
  ensureWorkspace,
};
