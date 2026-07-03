'use strict';

/**
 * Current session-state schema version. Bumped by whichever unit introduces a
 * new persisted field so migrations can bring older documents forward.
 * @type {number}
 */
const SCHEMA_VERSION = 1;

/**
 * Backfill the per-phase fields introduced by schema version 1
 * (`blocker_count`, `review_finding_count`). Existing numeric values are
 * preserved so a populated count is never reset to zero.
 *
 * @param {object} data - parsed session-state frontmatter
 * @returns {object} the same object, with per-phase counters ensured
 */
function migrateToV1(data) {
  const phases = Array.isArray(data.phases) ? data.phases : [];
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object') {
      continue;
    }
    if (typeof phase.blocker_count !== 'number') {
      phase.blocker_count = 0;
    }
    if (typeof phase.review_finding_count !== 'number') {
      phase.review_finding_count = 0;
    }
  }
  return data;
}

/**
 * Ordered registry of schema migrations. Each entry upgrades a document to its
 * `to` version and MUST be idempotent. Future units append a new entry with the
 * next `to` value rather than editing an existing step.
 * @type {ReadonlyArray<{ to: number, migrate: (data: object) => object }>}
 */
const MIGRATIONS = [{ to: 1, migrate: migrateToV1 }];

/**
 * Bring a parsed session-state document up to {@link SCHEMA_VERSION}.
 *
 * A missing or lower `schema_version` triggers every registered migration whose
 * target version exceeds the document's current version, applied in ascending
 * order; the result is stamped with the current version. Non-object input is
 * returned unchanged so malformed frontmatter never throws here.
 *
 * @param {object} data - parsed session-state frontmatter (mutated in place)
 * @returns {object} the migrated document
 */
function migrateSessionState(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const current =
    typeof data.schema_version === 'number' ? data.schema_version : 0;
  for (const migration of MIGRATIONS) {
    if (migration.to > current) {
      migration.migrate(data);
    }
  }
  data.schema_version = SCHEMA_VERSION;
  return data;
}

module.exports = { SCHEMA_VERSION, migrateSessionState };
