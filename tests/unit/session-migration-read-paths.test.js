import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempWorkspace } from '../support/mcp.js';
import { parseSessionState } from '../../dist/src/mcp/handlers/session-state-core.js';
import { parseArchivedSessionState, readArchivedSessionSummaries } from '../../dist/src/mcp/handlers/archive-index.js';

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
  it('preserves exact Markdown and JSON parse failures before migration/validation', () => {
    assert.throws(
      () => parseSessionState('# no frontmatter\n'),
      { message: 'No YAML frontmatter found in session state' }
    );
    assert.throws(
      () => parseSessionState('---\n{not json}\n---\n'),
      SyntaxError
    );
  });

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

  it('the archive reader summarizes old-shape archived documents without regression', (t) => {
    const workspace = makeTempWorkspace('maestro-archive-migrate-', t);
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

  it('returns an empty archive and skips corrupt, unreadable-shape, and id-less documents', (t) => {
    const workspace = makeTempWorkspace('maestro-archive-corrupt-', t);
    assert.deepEqual(readArchivedSessionSummaries(workspace), []);

    const archiveDir = path.join(
      workspace,
      'docs',
      'maestro',
      'state',
      'archive'
    );
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'valid.md'), legacyDocument('valid'));
    fs.writeFileSync(path.join(archiveDir, 'invalid-json.md'), '---\n{bad}\n---\n');
    fs.writeFileSync(
      path.join(archiveDir, 'invalid-shape.md'),
      '---\n{"session_id":"invalid-shape","phases":[]}\n---\n'
    );
    fs.writeFileSync(
      path.join(archiveDir, 'missing-id.md'),
      '---\n{"status":"completed","phases":[]}\n---\n'
    );

    assert.deepEqual(
      readArchivedSessionSummaries(workspace).map((summary) => summary.session_id),
      ['valid']
    );
  });
});
