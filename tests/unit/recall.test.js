'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveStateDirPath } = require('../../src/state/session-state');
const { handleRecallSimilarSessions } = require('../../src/mcp/handlers/recall');

function writeArchive(projectRoot, sessionId, data) {
  const dir = path.join(resolveStateDirPath(projectRoot), 'state', 'archive');
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\n${JSON.stringify(data, null, 2)}\n---\n`;
  fs.writeFileSync(path.join(dir, `${sessionId}.md`), content);
}

function phase(overrides) {
  return Object.assign(
    {
      id: 1,
      name: 'P',
      status: 'completed',
      agents: [],
      files_created: [],
      files_modified: [],
      files_deleted: [],
      downstream_context: {
        key_interfaces_introduced: [],
        patterns_established: [],
        integration_points: [],
        assumptions: [],
        warnings: [],
      },
    },
    overrides
  );
}

function seedCorpus(root) {
  writeArchive(root, 'sess-auth', {
    session_id: 'sess-auth',
    task: 'Implement OAuth login and token refresh',
    created: '2026-07-01T00:00:00.000Z',
    phases: [
      phase({
        agents: ['security-auditor', 'coder'],
        files_created: ['src/auth/oauth.js'],
        files_modified: ['src/auth/token.js'],
        downstream_context: {
          key_interfaces_introduced: [],
          patterns_established: [],
          integration_points: [],
          assumptions: [],
          warnings: ['token rotation not covered by tests'],
        },
      }),
    ],
  });
  writeArchive(root, 'sess-db', {
    session_id: 'sess-db',
    task: 'Migrate database schema for billing',
    created: '2026-07-02T00:00:00.000Z',
    phases: [phase({ agents: ['coder'], files_created: ['src/db/schema.sql'] })],
  });
  writeArchive(root, 'sess-ui', {
    session_id: 'sess-ui',
    task: 'Redesign dashboard layout',
    created: '2026-07-03T00:00:00.000Z',
    phases: [phase({ agents: ['frontend'], files_created: ['src/ui/dashboard.js'] })],
  });
}

test('handleRecallSimilarSessions ranks the relevant precedent first with rationale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recall-'));
  seedCorpus(root);

  const result = handleRecallSimilarSessions({ query: 'oauth token login' }, root);

  assert.equal(result.query, 'oauth token login');
  assert.equal(result.count, 1);
  const top = result.results[0];
  assert.equal(top.session_id, 'sess-auth');
  assert.ok(top.score > 0);
  assert.deepEqual(top.agents, ['coder', 'security-auditor']);
  assert.deepEqual(top.files, ['src/auth/oauth.js', 'src/auth/token.js']);
  assert.deepEqual(top.warnings, ['token rotation not covered by tests']);
  assert.equal(top.archive_path, path.join('state', 'archive', 'sess-auth.md'));
  assert.ok(top.rationale.includes('security-auditor'));
  assert.ok(top.rationale.includes('token rotation not covered by tests'));
});

test('handleRecallSimilarSessions honors limit and descending order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recall-limit-'));
  seedCorpus(root);

  const result = handleRecallSimilarSessions({ query: 'src', limit: 2 }, root);

  assert.equal(result.count, 2);
  assert.equal(result.results.length, 2);
  assert.ok(result.results[0].score >= result.results[1].score);
});

test('handleRecallSimilarSessions returns an empty ranking on an empty archive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recall-empty-'));

  const result = handleRecallSimilarSessions({ query: 'anything' }, root);

  assert.equal(result.count, 0);
  assert.deepEqual(result.results, []);
});
