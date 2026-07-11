import fs from 'fs';
import path from 'path';
import { ValidationError, NotFoundError, StateError } from '../../lib/errors/index.js';

import {
  assertValidActiveSession,
  extractFileManifest,
  sessionStore,
} from '../session/session-store.js';

import { isExtensionCachePath } from '../../core/workspace-path.js';
import { isValidPhaseId } from '../contracts/plan-schema.js';
import { normalizeDownstreamContext, isDownstreamContextPopulated } from '../contracts/downstream-context.js';
import { attempt } from './attempt.js';

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
function parseIgnoreEnv(env: any = process.env) {
  const raw = env.MAESTRO_SCAN_IGNORE;
  if (!raw) return [];
  return raw
    .split(':')
    .map((entry: any) => entry.trim())
    .filter(Boolean);
}

/**
 * @param {string} relPath
 * @param {string} name
 * @returns {boolean}
 */
function shouldSkipDir(relPath: any, name: any) {
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
function scanWorkspace(workspace: any, startedAt: any, maxFiles: any, extraIgnore: any) {
  const startedMs = Date.parse(startedAt);
  const ignored: Array<{ path: string; reason: string }> = [];
  const created: string[] = [];
  const modified: string[] = [];
  let truncated = false;
  let seen = 0;

  function walk(dir: any, relDir: any) {
    if (seen >= maxFiles) {
      truncated = true;
      return;
    }
    const entries = attempt(() => fs.readdirSync(dir, { withFileTypes: true }), null);
    if (!entries) return;
    for (const entry of entries) {
      if (seen >= maxFiles) {
        truncated = true;
        return;
      }
      const absPath = path.join(dir, entry.name);
      const relPath = relDir ? path.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (shouldSkipDir(relPath, entry.name) || extraIgnore.some((i: any) => relPath.startsWith(i))) {
          ignored.push({ path: relPath, reason: 'ignored directory' });
          continue;
        }
        walk(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      seen += 1;
      const stat = attempt(() => fs.statSync(absPath), null);
      if (!stat) continue;
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
function handleScanPhaseChanges(params: any, projectRoot: any) {
  if (!isValidPhaseId(params.phase_id)) {
    throw new ValidationError(
      'phase_id must be a positive integer or a non-empty string'
    );
  }
  const { state } = assertValidActiveSession(projectRoot, params.session_id);

  const phase = (state.phases || []).find((p: any) => p.id === params.phase_id);
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
function handleReconcilePhase(params: any, projectRoot: any) {
  if (!isValidPhaseId(params.phase_id)) {
    throw new ValidationError(
      'phase_id must be a positive integer or a non-empty string'
    );
  }

  const { filesCreated, filesModified, filesDeleted, hasFiles: hasFilesPayload } =
    extractFileManifest(params);
  const normalizedContext = normalizeDownstreamContext(params.downstream_context);
  const hasContextPayload = isDownstreamContextPopulated(normalizedContext);

  if (!hasFilesPayload && !hasContextPayload) {
    throw new ValidationError(
      'reconcile_phase requires at least one of files_created, files_modified, files_deleted, or a populated downstream_context. An empty payload cannot clear requires_reconciliation.',
      { code: 'RECONCILIATION_EMPTY_PAYLOAD' }
    );
  }

  return sessionStore.update(projectRoot, params.session_id, ({ state }: any) => {
    const phase = (state.phases || []).find((p: any) => p.id === params.phase_id);
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

export { handleScanPhaseChanges, handleReconcilePhase };
