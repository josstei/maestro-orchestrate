'use strict';

const { ValidationError } = require('../../lib/errors');
const { KnowledgeStore } = require('../memory/knowledge-store');

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 * @throws {ValidationError}
 */
function requireNonEmptyString(value, field) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return trimmed;
}

/**
 * @param {unknown} value
 * @returns {string}
 * @throws {ValidationError}
 */
function normalizeQuery(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new ValidationError('query must be a string when provided');
  }
  return value.trim();
}

/**
 * @param {object} entry
 * @returns {boolean}
 */
function isKnowledgeEntry(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    typeof entry.topic === 'string' &&
    typeof entry.note === 'string'
  );
}

/**
 * Record a cross-project knowledge note. Notes may be shared across projects;
 * callers should not store secrets.
 *
 * @param {{ topic?: string, note?: string }} params
 * @param {string} projectRoot
 * @returns {{ recorded: true }}
 * @throws {ValidationError}
 */
function handleRecordKnowledge(params, projectRoot) {
  const record = {
    topic: requireNonEmptyString(params && params.topic, 'topic'),
    note: requireNonEmptyString(params && params.note, 'note'),
    at: new Date().toISOString(),
  };
  new KnowledgeStore(projectRoot).append(record);
  return { recorded: true };
}

/**
 * Query cross-project knowledge notes. Omit query to return all entries.
 *
 * @param {{ query?: string }} params
 * @param {string} projectRoot
 * @returns {{ query: string, entries: Array<{ topic: string, note: string, at?: string }> }}
 * @throws {ValidationError}
 */
function handleQueryKnowledge(params, projectRoot) {
  const query = normalizeQuery(params && params.query);
  const needle = query.toLowerCase();
  const entries = new KnowledgeStore(projectRoot)
    .read()
    .filter(isKnowledgeEntry)
    .filter((entry) => {
      if (needle.length === 0) {
        return true;
      }
      return `${entry.topic}\n${entry.note}`.toLowerCase().includes(needle);
    });
  return { query, entries };
}

module.exports = {
  handleRecordKnowledge,
  handleQueryKnowledge,
};
