'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { assertSessionId } = require('../../lib/session-id');
const { ValidationError, StateError } = require('../../lib/errors');
const {
  DEFAULT_STATE_DIR,
  resolveStateDirPath,
  readActiveSession,
  withSessionState,
  assertSessionMatch,
  findPhaseOrThrow,
} = require('../../state/session-state');
const { isExtensionCachePath } = require('../../core/cache-path-rejector');
const { isValidPhaseId } = require('../contracts/plan-schema');
const { readDownstreamContext } = require('../contracts/downstream-context');

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.worktrees',
  '.claude',
]);
// path.join normalizes the separator so it compares equal to walk() relPaths.
const DOCS_MAESTRO = path.join(DEFAULT_STATE_DIR);

/**
 * Workspace-relative path of the state dir, compared on realpaths so a symlinked
 * workspace or state dir still matches the walk's logical paths. Null when the
 * state dir is the workspace root itself or lies outside it.
 * @param {string} workspace
 * @param {string} stateDir
 * @returns {string|null}
 */
function workspaceRelativeStateDir(workspace, stateDir) {
  const real = (p) => {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  };
  const rel = path.relative(real(workspace), real(stateDir));
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel;
}

/**
 * Walk `workspace` for files created or modified since `startedAt`, visiting
 * at most `maxFiles` files.
 *
 * @param {string} workspace
 * @param {string} startedAt
 * @param {number} maxFiles
 * @param {(relPath: string, name: string, absPath: string) => boolean} skipDir - true for a directory the walk must not enter
 * @returns {{ created: string[], modified: string[], ignoredCount: number, truncated: boolean }}
 */
function scanWorkspace(workspace, startedAt, maxFiles, skipDir) {
  const startedMs = Date.parse(startedAt);
  let ignoredCount = 0;
  const created = [];
  const modified = [];
  let truncated = false;
  let seen = 0;

  function walk(dir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= maxFiles) {
        truncated = true;
        return;
      }
      const absPath = path.join(dir, entry.name);
      const relPath = relDir ? path.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (skipDir(relPath, entry.name, absPath)) {
          ignoredCount += 1;
          continue;
        }
        walk(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      seen += 1;
      let stat;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }
      const mtimeMs = stat.mtimeMs || 0;
      const birthtimeMs = stat.birthtimeMs || 0;
      const isNewByBirthtime = birthtimeMs > 0 && birthtimeMs >= startedMs;
      const isNewByMtime = birthtimeMs === 0 && mtimeMs >= startedMs;
      if (isNewByBirthtime || isNewByMtime) {
        created.push(relPath);
      } else if (mtimeMs >= startedMs) {
        modified.push(relPath);
      }
    }
  }

  walk(workspace, '');
  return { created, modified, ignoredCount, truncated };
}

/**
 * @param {{ session_id: string, phase_id: number | string }} params
 * @throws {ValidationError} when session_id or phase_id is malformed
 */
function assertPhaseRequest(params) {
  assertSessionId(params.session_id);
  if (!isValidPhaseId(params.phase_id)) {
    throw new ValidationError(
      'phase_id must be a positive integer or a non-empty string'
    );
  }
}

/**
 * @param {{ session_id: string, phase_id: number }} params
 * @param {string} projectRoot
 */
function handleScanPhaseChanges(params, projectRoot) {
  assertPhaseRequest(params);
  const stateDir = resolveStateDirPath(projectRoot);
  const { state } = readActiveSession(stateDir);
  assertSessionMatch(state, params.session_id);

  const phase = findPhaseOrThrow(state.phases || [], params.phase_id);
  if (!phase.started) {
    throw new StateError(
      `Phase ${params.phase_id} has not started; nothing to scan`
    );
  }
  const maxFiles = Number(process.env.MAESTRO_SCAN_MAX_FILES || 5000);
  const extraIgnore = (process.env.MAESTRO_SCAN_IGNORE || '')
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const stateDirRel = workspaceRelativeStateDir(projectRoot, stateDir);
  // relPath is workspace-relative, for the workspace-anchored rules. The cache
  // check must use absPath: isExtensionCachePath resolves relative paths
  // against process.cwd(), which for Claude is the plugin install dir, itself
  // a cache path.
  const skipDir = (relPath, name, absPath) =>
    DEFAULT_IGNORE_DIRS.has(name) ||
    relPath === DOCS_MAESTRO ||
    relPath === stateDirRel ||
    extraIgnore.some((prefix) => relPath.startsWith(prefix)) ||
    isExtensionCachePath(absPath);
  const result = scanWorkspace(projectRoot, phase.started, maxFiles, skipDir);

  return {
    phase_id: phase.id,
    started_at: phase.started,
    scanned_at: new Date().toISOString(),
    candidates: { created: result.created.sort(), modified: result.modified.sort() },
    ignored_count: result.ignoredCount,
    truncated: result.truncated,
    max_files: maxFiles,
  };
}

/**
 * @param {{ session_id: string, phase_id: number, files_created?: string[], files_modified?: string[], files_deleted?: string[], downstream_context?: object, reason?: string }} params
 * @param {string} projectRoot
 */
function handleReconcilePhase(params, projectRoot) {
  assertPhaseRequest(params);

  const filesCreated = Array.isArray(params.files_created) ? params.files_created : [];
  const filesModified = Array.isArray(params.files_modified) ? params.files_modified : [];
  const filesDeleted = Array.isArray(params.files_deleted) ? params.files_deleted : [];
  const hasFilesPayload =
    filesCreated.length + filesModified.length + filesDeleted.length > 0;
  const { context, populated } = readDownstreamContext(params.downstream_context);

  if (!hasFilesPayload && !populated) {
    throw new ValidationError(
      'reconcile_phase requires at least one of files_created, files_modified, files_deleted, or a populated downstream_context. An empty payload cannot clear requires_reconciliation.',
      { code: 'RECONCILIATION_EMPTY_PAYLOAD' }
    );
  }

  return withSessionState(resolveStateDirPath(projectRoot), (state) => {
    assertSessionMatch(state, params.session_id);

    const phase = findPhaseOrThrow(
      state.phases || [],
      params.phase_id,
      `Phase ${params.phase_id} not found`
    );
    if (params.files_created !== undefined) {
      phase.files_created = filesCreated;
    }
    if (params.files_modified !== undefined) {
      phase.files_modified = filesModified;
    }
    if (params.files_deleted !== undefined) {
      phase.files_deleted = filesDeleted;
    }
    if (populated) {
      phase.downstream_context = context;
    }
    phase.requires_reconciliation = false;
    if (params.reason) {
      phase.reconciliation_reason = params.reason;
    }
    return {
      success: true,
      phase_id: phase.id,
      files_created: phase.files_created,
      files_modified: phase.files_modified,
    };
  });
}

module.exports = { handleScanPhaseChanges, handleReconcilePhase };
