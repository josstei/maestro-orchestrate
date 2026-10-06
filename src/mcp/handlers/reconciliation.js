'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError, NotFoundError, StateError } = require('../../lib/errors');
const { readActiveSession, withSessionState } = require('./session-state-core');
const { isExtensionCachePath } = require('../contracts/cache-path-rejector');
const { isValidPhaseId } = require('../contracts/plan-schema');
const {
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
} = require('../contracts/downstream-context');

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.worktrees',
  '.claude',
]);
const DOCS_MAESTRO = path.join('docs', 'maestro');

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function parseIgnoreEnv(env = process.env) {
  const raw = env.MAESTRO_SCAN_IGNORE;
  if (!raw) return [];
  return raw
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * @param {string} relPath - Workspace-relative path, used for workspace-anchored rules.
 * @param {string} name
 * @param {string} absPath - Absolute path. The cache check must not use relPath:
 *   isExtensionCachePath resolves relative paths against process.cwd(), which for
 *   Claude and Gemini is the plugin/extension install dir, itself a cache path.
 * @param {string|null} stateDir - Workspace-relative path of the resolved Maestro state dir.
 * @returns {boolean}
 */
function shouldSkipDir(relPath, name, absPath, stateDir) {
  if (DEFAULT_IGNORE_DIRS.has(name)) return true;
  if (relPath === DOCS_MAESTRO || relPath === stateDir) return true;
  if (isExtensionCachePath(absPath)) return true;
  return false;
}

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
 * @param {string} workspace
 * @param {string} startedAt
 * @param {number} maxFiles
 * @param {string[]} extraIgnore
 * @param {string|null} stateDir - Workspace-relative path of the resolved Maestro state dir.
 * @returns {{ created: string[], modified: string[], ignored: Array<{path: string, reason: string}>, truncated: boolean }}
 */
function scanWorkspace(workspace, startedAt, maxFiles, extraIgnore, stateDir) {
  const startedMs = Date.parse(startedAt);
  const ignored = [];
  const created = [];
  const modified = [];
  let truncated = false;
  let seen = 0;

  function walk(dir, relDir) {
    if (seen >= maxFiles) {
      truncated = true;
      return;
    }
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
        if (shouldSkipDir(relPath, entry.name, absPath, stateDir) || extraIgnore.some((i) => relPath.startsWith(i))) {
          ignored.push({ path: relPath, reason: 'ignored directory' });
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
  return { created, modified, ignored, truncated };
}

/**
 * @param {{ session_id: string, phase_id: number }} params
 * @param {string} projectRoot
 */
function handleScanPhaseChanges(params, projectRoot) {
  assertSessionId(params.session_id);
  if (!isValidPhaseId(params.phase_id)) {
    throw new ValidationError(
      'phase_id must be a positive integer or a non-empty string'
    );
  }
  const { state, basePath } = readActiveSession(projectRoot);

  if (state.session_id !== params.session_id) {
    throw new StateError(
      `Session mismatch: active session is '${state.session_id}', got '${params.session_id}'`
    );
  }

  const phase = (state.phases || []).find((p) => p.id === params.phase_id);
  if (!phase) {
    throw new NotFoundError(`Phase ${params.phase_id} not found in session state`);
  }
  if (!phase.started) {
    throw new StateError(
      `Phase ${params.phase_id} has not started; nothing to scan`
    );
  }
  const maxFiles = Number(process.env.MAESTRO_SCAN_MAX_FILES || 5000);
  const extraIgnore = parseIgnoreEnv();
  const result = scanWorkspace(
    projectRoot,
    phase.started,
    maxFiles,
    extraIgnore,
    workspaceRelativeStateDir(projectRoot, basePath)
  );

  return {
    phase_id: phase.id,
    started_at: phase.started,
    scanned_at: new Date().toISOString(),
    candidates: { created: result.created.sort(), modified: result.modified.sort() },
    ignored_count: result.ignored.length,
    truncated: result.truncated,
    max_files: maxFiles,
  };
}

/**
 * @param {{ session_id: string, phase_id: number, files_created?: string[], files_modified?: string[], files_deleted?: string[], downstream_context?: object, reason?: string }} params
 * @param {string} projectRoot
 */
function handleReconcilePhase(params, projectRoot) {
  assertSessionId(params.session_id);
  if (!isValidPhaseId(params.phase_id)) {
    throw new ValidationError(
      'phase_id must be a positive integer or a non-empty string'
    );
  }

  const filesCreated = Array.isArray(params.files_created) ? params.files_created : [];
  const filesModified = Array.isArray(params.files_modified) ? params.files_modified : [];
  const filesDeleted = Array.isArray(params.files_deleted) ? params.files_deleted : [];
  const hasFilesPayload =
    filesCreated.length + filesModified.length + filesDeleted.length > 0;
  const normalizedContext = normalizeDownstreamContext(params.downstream_context);
  const hasContextPayload = isDownstreamContextPopulated(normalizedContext);

  if (!hasFilesPayload && !hasContextPayload) {
    throw new ValidationError(
      'reconcile_phase requires at least one of files_created, files_modified, files_deleted, or a populated downstream_context. An empty payload cannot clear requires_reconciliation.',
      { code: 'RECONCILIATION_EMPTY_PAYLOAD' }
    );
  }

  return withSessionState(projectRoot, ({ state }) => {
    if (state.session_id !== params.session_id) {
      throw new StateError(
        `Session mismatch: active session is '${state.session_id}', got '${params.session_id}'`
      );
    }

    const phase = (state.phases || []).find((p) => p.id === params.phase_id);
    if (!phase) {
      throw new NotFoundError(`Phase ${params.phase_id} not found`);
    }
    if (params.files_created !== undefined) {
      phase.files_created = filesCreated;
    }
    if (params.files_modified !== undefined) {
      phase.files_modified = filesModified;
    }
    if (params.files_deleted !== undefined) {
      phase.files_deleted = filesDeleted;
    }
    if (hasContextPayload) {
      phase.downstream_context = normalizedContext;
    }
    phase.requires_reconciliation = false;
    if (params.reason) {
      phase.reconciliation_reason = params.reason;
    }
    state.updated = new Date().toISOString();
    return {
      response: {
        success: true,
        phase_id: phase.id,
        files_created: phase.files_created,
        files_modified: phase.files_modified,
      },
      writeBack: true,
    };
  });
}

module.exports = { handleScanPhaseChanges, handleReconcilePhase };
