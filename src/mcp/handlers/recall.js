import { Bm25Provider } from '../retrieval/bm25-provider.js';
import { buildRetrievalCorpus } from '../retrieval/corpus.js';
const DEFAULT_LIMIT = 5;

/**
 * @param {number} count
 * @param {string} noun
 * @returns {string}
 */
function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * @param {{ agents: string[], files: string[], warnings: string[] }} summary
 * @returns {string}
 */
function buildRationale(summary) {
  const parts = [];
  if (summary.agents.length > 0) {
    parts.push(`handled by ${summary.agents.join(', ')}`);
  }
  if (summary.files.length > 0) {
    parts.push(`touched ${pluralize(summary.files.length, 'file')}`);
  }
  if (summary.warnings.length > 0) {
    parts.push(`recorded ${pluralize(summary.warnings.length, 'warning')}: ${summary.warnings.join('; ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'no recorded agents, files, or warnings';
}

/**
 * Rank archived sessions by BM25 relevance to a free-text task description.
 * Builds the retrieval corpus, indexes it with the default `Bm25Provider`,
 * and returns positive-score precedents (score descending, ties by
 * `session_id` ascending) with a rationale naming the agents that handled
 * similar work, contended file areas, and recorded warnings.
 *
 * @param {{ query?: string, limit?: number }} params
 * @param {string} projectRoot
 * @returns {{ query: string, count: number, results: object[] }}
 */
function handleRecallSimilarSessions(params, projectRoot) {
  const query = typeof params.query === 'string' ? params.query : '';
  const limit =
    Number.isInteger(params.limit) && params.limit > 0 ? params.limit : DEFAULT_LIMIT;
  const records = buildRetrievalCorpus(projectRoot);
  const ranked = new Bm25Provider()
    .index(records)
    .query(query)
    .filter((entry) => entry.score > 0)
    .slice(0, limit);
  const results = ranked.map((entry) => ({
    session_id: entry.session_id,
    score: entry.score,
    task: entry.summary.task,
    created: entry.summary.created,
    agents: entry.summary.agents,
    files: entry.summary.files,
    warnings: entry.summary.warnings,
    archive_path: entry.summary.archive_path,
    rationale: buildRationale(entry.summary),
  }));
  return { query, count: results.length, results };
}

export { handleRecallSimilarSessions };
