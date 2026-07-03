'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeTempWorkspace } = require('../support/mcp');
const {
  parseSessionState,
} = require('../../src/mcp/handlers/session-state-core');
const {
  parseArchivedSessionState,
  readArchivedSessionSummaries,
} = require('../../src/mcp/handlers/archive-index');

function legacyDocument(sessionId) {
  const data = {
    session_id: sessionId,
    task: 'legacy task',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    status: 'completed',
    phases: [{ id: 1, name: 'P1', status: 'completed', agents: ['coder'] }],
  };
  return `---\n${JSON.stringify(data, null, 2)}\n---\n# legacy log\n`;
}

describe('session-state migration on both read paths', () => {
  it('parseSessionState backfills schema_version and phase counters', () => {
    const migrated = parseSessionState(legacyDocument('legacy-active'));
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.parent_session_id, null);
    assert.equal(migrated.branch, null);
    assert.equal(migrated.phases[0].blocker_count, 0);
    assert.equal(migrated.phases[0].review_finding_count, 0);
  });

  it('parseArchivedSessionState backfills schema_version and phase counters', () => {
    const migrated = parseArchivedSessionState(legacyDocument('legacy-arch'));
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.parent_session_id, null);
    assert.equal(migrated.branch, null);
    assert.equal(migrated.phases[0].blocker_count, 0);
    assert.equal(migrated.phases[0].review_finding_count, 0);
  });

  it('the archive reader summarizes old-shape archived documents without regression', () => {
    const workspace = makeTempWorkspace('maestro-archive-migrate-');
    const archiveDir = path.join(
      workspace,
      'docs',
      'maestro',
      'state',
      'archive'
    );
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, 'legacy-1.md'),
      legacyDocument('legacy-1')
    );

    const summaries = readArchivedSessionSummaries(workspace);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].session_id, 'legacy-1');
    assert.equal(summaries[0].total_phases, 1);
  });
});
