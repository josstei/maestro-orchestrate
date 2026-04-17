'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError, NotFoundError, StateError } = require('../../lib/errors');
const { readActiveSession, withSessionState } = require('./session-state-core');
const { isExtensionCachePath } = require('../contracts/cache-path-rejector');

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
 * @param {string} relPath
 * @param {string} name
 * @returns {boolean}
 */
function shouldSkipDir(relPath, name) {
  if (DEFAULT_IGNORE_DIRS.has(name)) return true;
  if (relPath === DOCS_MAESTRO) return true;
  if (isExtensionCachePath(relPath)) return true;
  return false;
}

/**
 * @param {string} workspace
 * @param {string} startedAt
 * @param {number} maxFiles
 * @param {string[]} extraIgnore
 * @returns {{ created: string[], modified: string[], ignored: Array<{path: string, reason: string}>, truncated: boolean }}
 */
function scanWorkspace(workspace, startedAt, maxFiles, extraIgnore) {
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
        if (shouldSkipDir(relPath, entry.name) || extraIgnore.some((i) => relPath.startsWith(i))) {
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
  if (!Number.isInteger(params.phase_id) || params.phase_id < 1) {
    throw new ValidationError('phase_id must be a positive integer');
  }
  const { state } = readActiveSession(projectRoot);

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
  const result = scanWorkspace(projectRoot, phase.started, maxFiles, extraIgnore);

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
  if (!Number.isInteger(params.phase_id) || params.phase_id < 1) {
    throw new ValidationError('phase_id must be a positive integer');
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
    phase.files_created = params.files_created || phase.files_created || [];
    phase.files_modified = params.files_modified || phase.files_modified || [];
    phase.files_deleted = params.files_deleted || phase.files_deleted || [];
    if (params.downstream_context) {
      phase.downstream_context = params.downstream_context;
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
