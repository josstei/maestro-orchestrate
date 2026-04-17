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

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-gate-'));
}

function buildServer() {
  return createServer({
    runtimeConfig: { name: 'codex' },
    services: {},
    toolPacks: [createWorkspacePack, createSessionPack],
  });
}

describe('design gate tools', () => {
  it('enter_design_gate records a timestamp on the session-gate store', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    const outcome = await server.callTool(
      'enter_design_gate',
      { session_id: 'alpha' },
      workspace
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.success, true);
    assert.match(outcome.result.entered_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('enter_design_gate is idempotent', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    const first = await server.callTool(
      'enter_design_gate',
      { session_id: 'alpha' },
      workspace
    );
    const second = await server.callTool(
      'enter_design_gate',
      { session_id: 'alpha' },
      workspace
    );
    assert.equal(second.ok, true);
    assert.equal(second.result.entered_at, first.result.entered_at);
  });

  it('record_design_approval requires the design document to exist and be non-empty', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const designPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Design\n\nA real design document.\n');

    const outcome = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_path: designPath,
      },
      workspace
    );
    assert.equal(outcome.ok, true);
    assert.match(outcome.result.approved_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('record_design_approval rejects missing design documents', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const outcome = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_path: path.join(workspace, 'nope.md'),
      },
      workspace
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /not found|does not exist/i);
  });

  it('get_design_gate_status returns null when gate was never entered', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    const outcome = await server.callTool(
      'get_design_gate_status',
      { session_id: 'alpha' },
      workspace
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.entered_at, null);
  });

  it('create_session rejects when design gate is entered but unapproved', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'alpha',
        task: 'should fail',
        phases: [
          {
            id: 1,
            name: 'x',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['x'],
          },
        ],
      },
      workspace
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /design gate|approval/i);
  });

  it('create_session succeeds after record_design_approval', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const designPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Design\n');
    await server.callTool(
      'record_design_approval',
      { session_id: 'alpha', design_document_path: designPath },
      workspace
    );

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'alpha',
        task: 'should succeed',
        phases: [
          {
            id: 1,
            name: 'x',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['x'],
          },
        ],
      },
      workspace
    );
    assert.equal(outcome.ok, true);
  });
});
