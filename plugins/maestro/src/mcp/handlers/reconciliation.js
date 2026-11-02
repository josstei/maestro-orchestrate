'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError, StateError } = require('../../lib/errors');
const { withStateRead } = require('../../state/coordinator');
const { DEFAULT_STATE_DIR } = require('../../state/paths');
const {
  readActiveSession,
  assertSessionMatch,
  findPhaseOrThrow,
} = require('../../state/session-state');
const { isExtensionCachePath } = require('../../core/project-root-resolver');
const { isValidPhaseId } = require('../contracts/plan-schema');
const {
  HANDOFF_FILE_FIELDS,
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
} = require('../contracts/downstream-context');

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

// No access mode, so the workspace scan runs after the state read releases the lock.
async function scanPhaseChanges({ params, projectRoot, basePath }) {
  const { state } = await withStateRead(basePath, readActiveSession);
  assertSessionMatch(state, params.session_id);

  const phase = findPhaseOrThrow(state.phases || [], params.phase_id);
  if (!phase.started) {
    throw new StateError(
      `Phase ${params.phase_id} has not started; nothing to scan`
    );
  }
  const maxFiles = Number(process.env.MAESTRO_SCAN_MAX_FILES || 5000);
  const extraIgnore = (process.env.MAESTRO_SCAN_IGNORE || '').split(':').map((entry) => entry.trim()).filter(Boolean);
  const stateDir = workspaceRelativeStateDir(projectRoot, basePath);
  const startedMs = Date.parse(phase.started);
  const created = [];
  const modified = [];
  let ignoredCount = 0;
  // A non-positive budget is spent before the root is read, even an empty or unreadable root.
  let truncated = maxFiles <= 0;
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
        // The cache check takes absPath: isExtensionCachePath resolves a relative path against
        // process.cwd(), which for Claude is the plugin install dir, itself a cache path.
        if (DEFAULT_IGNORE_DIRS.has(entry.name) || relPath === DOCS_MAESTRO || relPath === stateDir
          || isExtensionCachePath(absPath) || extraIgnore.some((prefix) => relPath.startsWith(prefix))) {
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
      // A zero birthtime is unreported, so mtime decides whether the file is new.
      if ((stat.birthtimeMs || mtimeMs) >= startedMs) {
        created.push(relPath);
      } else if (mtimeMs >= startedMs) {
        modified.push(relPath);
      }
    }
  }

  walk(projectRoot, '');
  return {
    phase_id: phase.id,
    started_at: phase.started,
    scanned_at: new Date().toISOString(),
    candidates: { created: created.sort(), modified: modified.sort() },
    ignored_count: ignoredCount,
    truncated,
    max_files: maxFiles,
  };
}

/**
 * @param {{ session_id: string, phase_id: number, files_created?: string[], files_modified?: string[], files_deleted?: string[], downstream_context?: object, reason?: string }} params
 */
function prepareReconciliation(params) {
  assertPhaseRequest(params);

  const files = Object.fromEntries(
    HANDOFF_FILE_FIELDS.map((field) => [field, Array.isArray(params[field]) ? params[field] : []])
  );
  const hasFilesPayload = HANDOFF_FILE_FIELDS.some((field) => files[field].length > 0);
  const normalizedContext = normalizeDownstreamContext(params.downstream_context);
  const hasContextPayload = isDownstreamContextPopulated(normalizedContext);

  if (!hasFilesPayload && !hasContextPayload) {
    throw new ValidationError(
      'reconcile_phase requires at least one of files_created, files_modified, files_deleted, or a populated downstream_context. An empty payload cannot clear requires_reconciliation.',
      { code: 'RECONCILIATION_EMPTY_PAYLOAD' }
    );
  }
  return { files, normalizedContext, hasContextPayload };
}

function reconcilePhase({ params, input: { files, normalizedContext, hasContextPayload } }, { state }) {
  const phase = findPhaseOrThrow(
    state.phases || [],
    params.phase_id,
    `Phase ${params.phase_id} not found`
  );
  for (const field of HANDOFF_FILE_FIELDS) {
    if (params[field] !== undefined) {
      phase[field] = files[field];
    }
  }
  if (hasContextPayload) {
    phase.downstream_context = normalizedContext;
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
}

module.exports = {
  scan_phase_changes: { run: scanPhaseChanges, prepare: assertPhaseRequest },
  reconcile_phase: { access: 'session', run: reconcilePhase, prepare: prepareReconciliation },
};
