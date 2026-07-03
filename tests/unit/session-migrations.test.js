'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  migrateSessionState,
} = require('../../src/mcp/handlers/session-migrations');

function legacyDocument() {
  return {
    session_id: 'legacy-1',
    task: 'legacy task',
    status: 'completed',
    phases: [
      { id: 1, name: 'P1', status: 'completed', agents: ['coder'] },
      { id: 2, name: 'P2', status: 'completed', agents: ['tester'] },
    ],
  };
}

describe('migrateSessionState', () => {
  it('exposes the current schema version', () => {
    assert.equal(SCHEMA_VERSION, 2);
  });

  it('stamps the schema version and backfills per-phase counters on legacy docs', () => {
    const migrated = migrateSessionState(legacyDocument());
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.parent_session_id, null);
    assert.equal(migrated.branch, null);
    for (const phase of migrated.phases) {
      assert.equal(phase.blocker_count, 0);
      assert.equal(phase.review_finding_count, 0);
    }
  });

  it('migrates v1 documents to v2 with lineage fields', () => {
    const migrated = migrateSessionState({
      schema_version: 1,
      phases: [{ id: 1, name: 'P1', status: 'completed' }],
    });
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.parent_session_id, null);
    assert.equal(migrated.branch, null);
  });

  it('is idempotent — a second application is a genuine no-op', () => {
    const data = migrateSessionState(legacyDocument());
    const afterFirst = JSON.stringify(data);
    migrateSessionState(data);
    assert.equal(JSON.stringify(data), afterFirst);
  });

  it('preserves populated counters instead of resetting them to zero', () => {
    const data = {
      schema_version: 1,
      phases: [{ id: 1, name: 'P1', blocker_count: 3, review_finding_count: 2 }],
    };
    const migrated = migrateSessionState(data);
    assert.equal(migrated.phases[0].blocker_count, 3);
    assert.equal(migrated.phases[0].review_finding_count, 2);
  });

  it('returns non-object input unchanged', () => {
    assert.equal(migrateSessionState(null), null);
    assert.equal(migrateSessionState(undefined), undefined);
  });

  it('tolerates a missing phases array', () => {
    const migrated = migrateSessionState({ session_id: 'no-phases' });
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.parent_session_id, null);
    assert.equal(migrated.branch, null);
  });
});
