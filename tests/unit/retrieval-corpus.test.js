import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStateDirPath } from '../../src/state/session-state.js';
import { buildRetrievalCorpus } from '../../src/mcp/retrieval/corpus.js';

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

test('buildRetrievalCorpus returns [] when no archive directory exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-corpus-empty-'));
  assert.deepEqual(buildRetrievalCorpus(root), []);
});

test('buildRetrievalCorpus projects task, agents, touched files, and warnings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-corpus-'));

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

  const records = buildRetrievalCorpus(root);
  assert.equal(records.length, 2);

  const auth = records.find((record) => record.session_id === 'sess-auth');
  assert.ok(auth, 'sess-auth record present');
  assert.deepEqual(auth.summary.agents, ['coder', 'security-auditor']);
  assert.deepEqual(auth.summary.files, ['src/auth/oauth.js', 'src/auth/token.js']);
  assert.deepEqual(auth.summary.warnings, ['token rotation not covered by tests']);
  assert.equal(auth.summary.created, '2026-07-01T00:00:00.000Z');
  assert.equal(auth.summary.archive_path, path.join('state', 'archive', 'sess-auth.md'));

  assert.ok(auth.text.includes('oauth'));
  assert.ok(auth.text.includes('src/auth/token.js'));
  assert.ok(auth.text.includes('token rotation not covered by tests'));
});

test('buildRetrievalCorpus skips documents without a session_id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-corpus-skip-'));
  writeArchive(root, 'no-id', { task: 'orphan', phases: [] });
  writeArchive(root, 'sess-ok', {
    session_id: 'sess-ok',
    task: 'kept',
    created: '2026-07-03T00:00:00.000Z',
    phases: [phase({ agents: ['coder'] })],
  });

  const records = buildRetrievalCorpus(root);
  assert.deepEqual(
    records.map((record) => record.session_id),
    ['sess-ok']
  );
});
