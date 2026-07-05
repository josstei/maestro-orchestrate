import fs from 'fs';
import path from 'path';
import * as markdownState from '../../core/markdown-state.js';
import { resolveStateDirPath } from '../../state/session-state.js';
import { migrateSessionState } from '../handlers/session-migrations.js';

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function archiveDir(projectRoot) {
  return path.join(resolveStateDirPath(projectRoot), 'state', 'archive');
}

/**
 * @param {Array<{ agents?: unknown }>} phases
 * @returns {string[]} sorted unique agent names
 */
function collectAgents(phases) {
  const agents = new Set();
  for (const phase of Array.isArray(phases) ? phases : []) {
    for (const agent of Array.isArray(phase.agents) ? phase.agents : []) {
      if (typeof agent === 'string' && agent.length > 0) agents.add(agent);
    }
  }
  return [...agents].sort();
}

/**
 * @param {Array<object>} phases
 * @returns {string[]} sorted unique touched file paths
 */
function collectFiles(phases) {
  const files = new Set();
  for (const phase of Array.isArray(phases) ? phases : []) {
    for (const field of ['files_created', 'files_modified', 'files_deleted']) {
      for (const file of Array.isArray(phase[field]) ? phase[field] : []) {
        if (typeof file === 'string' && file.length > 0) files.add(file);
      }
    }
  }
  return [...files].sort();
}

/**
 * @param {Array<{ downstream_context?: { warnings?: unknown } }>} phases
 * @returns {string[]} recorded warnings in phase order
 */
function collectWarnings(phases) {
  const warnings = [];
  for (const phase of Array.isArray(phases) ? phases : []) {
    const context =
      phase && typeof phase.downstream_context === 'object' && phase.downstream_context
        ? phase.downstream_context
        : {};
    for (const warning of Array.isArray(context.warnings) ? context.warnings : []) {
      if (typeof warning === 'string' && warning.length > 0) warnings.push(warning);
    }
  }
  return warnings;
}

/**
 * @param {object} state - migrated session frontmatter
 * @param {string} archivePath - repo-relative archive path
 * @returns {{ session_id: string, text: string, summary: object }}
 */
function toRecord(state, archivePath) {
  const phases = Array.isArray(state.phases) ? state.phases : [];
  const task = typeof state.task === 'string' ? state.task : '';
  const agents = collectAgents(phases);
  const files = collectFiles(phases);
  const warnings = collectWarnings(phases);
  const text = [task, agents.join(' '), files.join(' '), warnings.join(' ')]
    .filter((part) => part.length > 0)
    .join(' ');
  return {
    session_id: state.session_id,
    text,
    summary: {
      session_id: state.session_id,
      task,
      created: typeof state.created === 'string' ? state.created : null,
      agents,
      files,
      warnings,
      archive_path: archivePath,
    },
  };
}

/**
 * Dedicated retrieval-corpus projection over the FULL archived session
 * documents. Reads each `<state_dir>/state/archive/*.md`, routes it through
 * Unit 1's `migrateSessionState`, and projects `task` + agents + touched
 * files + recorded warnings into an indexable record. Does NOT widen
 * `toSummary`/`readArchivedSessionSummaries`. Unparseable or id-less files
 * are skipped rather than throwing. Returns `[]` when the archive is absent.
 *
 * @param {string} projectRoot
 * @returns {Array<{ session_id: string, text: string, summary: object }>}
 */
function buildRetrievalCorpus(projectRoot) {
  const dir = archiveDir(projectRoot);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    let state;
    try {
      const parsed = markdownState.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
      state = migrateSessionState(parsed.data);
    } catch {
      continue;
    }
    if (!state || typeof state.session_id !== 'string') continue;
    records.push(toRecord(state, path.join('state', 'archive', entry.name)));
  }
  return records;
}

export { buildRetrievalCorpus };
