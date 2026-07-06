import fs from 'fs';
import path from 'path';
import * as markdownState from '../../core/markdown-state.js';
import { resolveStateDirPath } from '../../state/session-state.js';
import { migrateSessionState } from './session-migrations.js';
import { attempt } from './attempt.js';

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function archiveDirectoryPath(projectRoot) {
  return path.join(resolveStateDirPath(projectRoot), 'state', 'archive');
}

/**
 * Parse an archived session document and bring it up to the current schema
 * version. Shared by every archive parse site so each is migration-routed
 * identically to the active read path in `session-state-core.js`.
 *
 * @param {string} raw - raw archived session-state file content
 * @returns {object} migrated session-state frontmatter data
 */
function parseArchivedSessionState(raw) {
  return migrateSessionState(markdownState.parse(raw).data);
}

/**
 * @param {Array<{agents?:unknown}>} phases
 * @returns {string[]} sorted unique agent names
 */
function collectAgents(phases) {
  const agents = new Set();
  for (const phase of Array.isArray(phases) ? phases : []) {
    for (const agent of Array.isArray(phase.agents) ? phase.agents : []) {
      if (typeof agent === 'string' && agent.length > 0) {
        agents.add(agent);
      }
    }
  }
  return [...agents].sort();
}

/**
 * Shared readdir -> parse -> migrate -> skip-bad loop over
 * `state/archive/*.md`. Unparseable or id-less files are skipped rather
 * than throwing. Returns `[]` when the archive directory is absent.
 *
 * @template T
 * @param {string} projectRoot
 * @param {(state:object, archivePath:string) => T} projector
 * @returns {T[]}
 */
function mapArchivedSessionStates(projectRoot, projector) {
  const dir = archiveDirectoryPath(projectRoot);
  const entries = attempt(() => fs.readdirSync(dir, { withFileTypes: true }), null);
  if (!entries) return [];
  const results = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const absPath = path.join(dir, entry.name);
    const state = attempt(() => parseArchivedSessionState(fs.readFileSync(absPath, 'utf8')), null);
    if (!state || typeof state.session_id !== 'string') continue;
    results.push(projector(state, path.join('state', 'archive', entry.name)));
  }
  return results;
}

export {
  archiveDirectoryPath,
  parseArchivedSessionState,
  collectAgents,
  mapArchivedSessionStates,
};
