'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteSync, ensurePrivateDir } = require('../lib/io');
const { StateError, NotFoundError } = require('../lib/errors');
const { resolveSetting } = require('../config/setting-resolver');

const DEFAULT_STATE_DIR = 'docs/maestro';
const ACTIVE_SESSION_REL = path.join('state', 'active-session.md');
const WORKSPACE_SUBDIRS = Object.freeze(['state', 'state/archive', 'plans', 'plans/archive']);
const SESSION_FILE_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error('Path must be relative');
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}

function joinRelative(basePath, relativePath) {
  validateRelativePath(relativePath);
  return path.join(basePath, relativePath);
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

  return joinRelative(base, stateDir);
}

/**
 * Resolve the configured state dir for a workspace, as written (relative or
 * absolute, not yet resolved against the workspace): the override when given,
 * else MAESTRO_STATE_DIR (environment, then the workspace .env, then the
 * extension .env), else DEFAULT_STATE_DIR.
 * @param {string} [cwd] - Workspace root; defaults to process.cwd()
 * @param {string} [stateDirOverride]
 * @returns {string}
 */
function resolveStateDirSetting(cwd, stateDirOverride) {
  return (
    stateDirOverride ||
    resolveSetting('MAESTRO_STATE_DIR', cwd || process.cwd()) ||
    DEFAULT_STATE_DIR
  );
}

/**
 * Resolve the absolute state dir for a workspace from the setting chosen by
 * resolveStateDirSetting.
 * @param {string} [cwd] - Workspace root; defaults to process.cwd()
 * @param {string} [stateDirOverride]
 * @returns {string}
 */
function resolveStateDirPath(cwd, stateDirOverride) {
  const root = cwd || process.cwd();
  return resolveStateDirUnder(root, resolveStateDirSetting(root, stateDirOverride));
}

function activeSessionFile(basePath) {
  return path.join(basePath, ACTIVE_SESSION_REL);
}

function resolveActiveSessionPath(cwd) {
  return activeSessionFile(resolveStateDirPath(cwd));
}

function readState(relativePath, basePath) {
  return fs.readFileSync(joinRelative(basePath, relativePath), 'utf8');
}

function writeState(relativePath, content, basePath) {
  atomicWriteSync(joinRelative(basePath, relativePath), content);
}

/**
 * Parse a session file: a JSON frontmatter block between `---` lines, followed
 * by the Markdown log.
 *
 * @param {string} content
 * @returns {{ data: object, body: string }}
 * @throws {Error} when the content has no frontmatter block
 */
function parseSessionFile(content) {
  const match = content.match(SESSION_FILE_PATTERN);
  if (!match) {
    // The frontmatter is JSON, but this text is part of the MCP error contract.
    throw new Error('No YAML frontmatter found in session state');
  }
  return { data: JSON.parse(match[1]), body: match[2] };
}

function serializeSessionFile(data, body) {
  return `---\n${JSON.stringify(data, null, 2)}\n---\n${body}`;
}

function readSessionAt(basePath) {
  const sessionPath = activeSessionFile(basePath);
  const { data, body } = parseSessionFile(fs.readFileSync(sessionPath, 'utf8'));
  return { basePath, state: data, body };
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
  atomicWriteSync(sessionPath, serializeSessionFile(state, body));
  return sessionPath;
}

/**
 * Read the active session, run `mutator(session, now)` against it (mutating
 * `session.state` in place), stamp `state.updated = now`, persist the state
 * with the original body, and return whatever the mutator returned. `now` is
 * one ISO timestamp per call, so a mutator can reuse it for other fields. A
 * throwing mutator leaves the session file untouched.
 */
function withSessionState(cwd, mutator) {
  const session = readActiveSession(cwd);
  const now = new Date().toISOString();
  const result = mutator(session, now);
  session.state.updated = now;
  writeActiveSession(session.basePath, session.state, session.body);
  return result;
}

/**
 * Move the active session file to `state/archive/<sessionId>.md`.
 * @param {string} basePath - Resolved state dir
 * @param {string} sessionId - Already validated by assertSessionId
 * @returns {string} the archive path
 */
function archiveActiveSession(basePath, sessionId) {
  const archivePath = path.join(basePath, 'state', 'archive', `${sessionId}.md`);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.renameSync(activeSessionFile(basePath), archivePath);
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
  resolveStateDirSetting,
  resolveStateDirPath,
  resolveActiveSessionPath,
  parseSessionFile,
  readState,
  writeState,
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
  archiveActiveSession,
  assertSessionMatch,
  findPhaseOrThrow,
  ensureWorkspace,
};
