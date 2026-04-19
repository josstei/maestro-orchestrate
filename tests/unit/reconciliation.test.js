'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');

function setupSession(workspace) {
  return createServer({
    runtimeConfig: { name: 'codex' },
    services: {},
    toolPacks: [createWorkspacePack, createSessionPack],
  });
}

async function bootstrap(server, workspace) {
  await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
  await server.callTool(
    'create_session',
    {
      session_id: 'recon-test',
      task: 'reconciliation',
      task_complexity: 'simple',
      phases: [
        {
          id: 1,
          name: 'Phase 1',
          agent: 'coder',
          parallel: false,
          blocked_by: [],
          files: ['src/foo.js'],
        },
      ],
    },
    workspace
  );
}

describe('scan_phase_changes', () => {
  it('returns files created after the phase started', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recon-'));
    const server = setupSession(workspace);
    await bootstrap(server, workspace);

    await new Promise((r) => setTimeout(r, 50));
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'src', 'foo.js'), '// hi\n');
    fs.writeFileSync(path.join(workspace, 'src', 'bar.js'), '// hi\n');

    const outcome = await server.callTool(
      'scan_phase_changes',
      { session_id: 'recon-test', phase_id: 1 },
      workspace
    );
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.ok(created.includes('src/foo.js'));
    assert.ok(created.includes('src/bar.js'));
  });

  it('excludes docs/maestro and .git paths', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recon-exc-'));
    const server = setupSession(workspace);
    await bootstrap(server, workspace);

    await new Promise((r) => setTimeout(r, 50));
    fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.git', 'HEAD'), '...');
    fs.writeFileSync(path.join(workspace, 'docs', 'maestro', 'notes.md'), '...');

    const outcome = await server.callTool(
      'scan_phase_changes',
      { session_id: 'recon-test', phase_id: 1 },
      workspace
    );
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.equal(created.includes('.git/HEAD'), false);
    assert.equal(created.includes('docs/maestro/notes.md'), false);
  });
});

describe('reconcile_phase — empty payload', () => {
  it('rejects a call with no files and no downstream_context', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recon-empty-'));
    const server = setupSession(workspace);
    await bootstrap(server, workspace);

    await server.callTool(
      'transition_phase',
      {
        session_id: 'recon-test',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      workspace
    );

    const outcome = await server.callTool(
      'reconcile_phase',
      { session_id: 'recon-test', phase_id: 1 },
      workspace
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /reconcile_phase requires at least one/i);
  });

  it('rejects a call with empty arrays and an unpopulated downstream_context', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recon-empty2-'));
    const server = setupSession(workspace);
    await bootstrap(server, workspace);

    await server.callTool(
      'transition_phase',
      {
        session_id: 'recon-test',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      workspace
    );

    const outcome = await server.callTool(
      'reconcile_phase',
      {
        session_id: 'recon-test',
        phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      workspace
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /reconcile_phase requires at least one/i);
  });
});

describe('reconcile_phase', () => {
  it('clears requires_reconciliation and writes file manifests', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-recon-e2e-'));
    const server = setupSession(workspace);
    await bootstrap(server, workspace);

    await server.callTool(
      'transition_phase',
      {
        session_id: 'recon-test',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      workspace
    );

    const outcome = await server.callTool(
      'reconcile_phase',
      {
        session_id: 'recon-test',
        phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: {
          key_interfaces_introduced: [],
          patterns_established: [],
          integration_points: ['src/foo.js'],
          assumptions: [],
          warnings: [],
        },
      },
      workspace
    );
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result.files_created, ['src/foo.js']);

    const archive = await server.callTool(
      'archive_session',
      { session_id: 'recon-test' },
      workspace
    );
    assert.equal(archive.ok, true);
  });
});
