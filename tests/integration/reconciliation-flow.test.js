'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');

describe('reconciliation flow', () => {
  it('covers the hung-worker postmortem scenario end to end', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-rec-flow-'));
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createWorkspacePack, createSessionPack],
    });
    await server.callTool(
      'initialize_workspace',
      { workspace_path: workspace },
      workspace
    );

    await server.callTool(
      'create_session',
      {
        session_id: 'rf-1',
        task: 'hung-worker recovery',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Scaffold',
            agent: 'design-system-engineer',
            parallel: false,
            blocked_by: [],
            files: ['index.html', 'assets/css/styles.css'],
          },
        ],
      },
      workspace
    );

    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(path.join(workspace, 'index.html'), '<html/>');
    fs.mkdirSync(path.join(workspace, 'assets', 'css'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'assets', 'css', 'styles.css'), 'body{}');

    await server.callTool(
      'transition_phase',
      {
        session_id: 'rf-1',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      workspace
    );

    const scan = await server.callTool(
      'scan_phase_changes',
      { session_id: 'rf-1', phase_id: 1 },
      workspace
    );
    assert.equal(scan.ok, true);
    assert.ok(scan.result.candidates.created.includes('index.html'));
    assert.ok(scan.result.candidates.created.includes('assets/css/styles.css'));

    const reconciled = await server.callTool(
      'reconcile_phase',
      {
        session_id: 'rf-1',
        phase_id: 1,
        files_created: ['index.html', 'assets/css/styles.css'],
        downstream_context: {
          integration_points: ['index.html', 'assets/css/styles.css'],
        },
      },
      workspace
    );
    assert.equal(reconciled.ok, true);

    const archive = await server.callTool(
      'archive_session',
      { session_id: 'rf-1' },
      workspace
    );
    assert.equal(archive.ok, true);
  });
});
