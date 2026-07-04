'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { resolveTypedSetting } = require('../../config/setting-resolver');
const { assertContainedIn } = require('../../lib/validation');
const { readArchivedSessionSummaries } = require('./archive-index');
const { resolveBasePath } = require('./session-state-core');

/**
 * Resolve and validate the concrete archive document path for a summary.
 *
 * @param {string} basePath
 * @param {{ archive_path?: string }} summary
 * @returns {string}
 */
function resolveArchiveDocumentPath(basePath, summary) {
  const archiveDir = path.join(basePath, 'state', 'archive');
  const archivePath = path.join(basePath, summary.archive_path || '');
  assertContainedIn(archivePath, archiveDir);

  if (
    path.resolve(path.dirname(archivePath)) !== path.resolve(archiveDir) ||
    path.extname(archivePath) !== '.md'
  ) {
    throw new Error('Archive compaction may only delete state/archive/*.md files');
  }

  return archivePath;
}

/**
 * Deterministically prune oldest archived session documents beyond the
 * configured retention count. Retention 0 is a no-op.
 *
 * @param {object} _params
 * @param {string} projectRoot
 * @returns {{ pruned: string[], retained: number }}
 */
function handleCompactArchive(_params, projectRoot) {
  const retention = resolveTypedSetting('MAESTRO_ARCHIVE_RETENTION', projectRoot);
  const summaries = readArchivedSessionSummaries(projectRoot);

  if (retention === 0 || summaries.length <= retention) {
    return { pruned: [], retained: summaries.length };
  }

  const basePath = resolveBasePath(projectRoot);
  const toPrune = summaries.slice(retention).reverse();
  const pruned = [];

  for (const summary of toPrune) {
    const archivePath = resolveArchiveDocumentPath(basePath, summary);
    fs.rmSync(archivePath, { force: true });
    pruned.push(summary.session_id);
  }

  return { pruned, retained: retention };
}

module.exports = {
  handleCompactArchive,
};
