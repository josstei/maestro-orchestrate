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

  it('record_design_approval accepts an existing path via the path variant', async () => {
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

  it('record_design_approval accepts paths to files that have not yet materialized (defers existence to create_session)', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const outcome = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_path: path.join(workspace, 'not-yet-written.md'),
      },
      workspace
    );
    assert.equal(
      outcome.ok,
      true,
      'approval must not race Plan Mode writes; file existence is enforced at create_session'
    );
    assert.equal(
      outcome.result.design_document_path,
      path.join(workspace, 'not-yet-written.md')
    );
  });

  it('record_design_approval rejects when neither path nor content+filename is provided', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const missing = await server.callTool(
      'record_design_approval',
      { session_id: 'alpha' },
      workspace
    );
    assert.equal(missing.ok, false);
    assert.match(
      missing.error || '',
      /either design_document_path or both design_document_content and design_document_filename/i
    );

    const empty = await server.callTool(
      'record_design_approval',
      { session_id: 'alpha', design_document_path: '' },
      workspace
    );
    assert.equal(empty.ok, false);
    assert.match(
      empty.error || '',
      /either design_document_path or both design_document_content and design_document_filename/i
    );
  });

  it('record_design_approval rejects when both path and content variants are supplied', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const both = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_path: path.join(workspace, 'design.md'),
        design_document_content: '# Design\n',
        design_document_filename: 'design.md',
      },
      workspace
    );
    assert.equal(both.ok, false);
    assert.match(both.error || '', /mutually exclusive/i);
  });

  it('record_design_approval rejects the content variant when filename or content is missing', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const noFilename = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_content: '# Design\n',
      },
      workspace
    );
    assert.equal(noFilename.ok, false);
    assert.match(noFilename.error || '', /design_document_filename is required/i);

    const noContent = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_filename: 'design.md',
      },
      workspace
    );
    assert.equal(noContent.ok, false);
    assert.match(noContent.error || '', /design_document_content is required/i);
  });

  it('record_design_approval rejects filenames that contain path separators or traversal', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const traversal = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_content: '# Design\n',
        design_document_filename: '../escape.md',
      },
      workspace
    );
    assert.equal(traversal.ok, false);
    assert.match(traversal.error || '', /basename/i);

    const nested = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_content: '# Design\n',
        design_document_filename: 'sub/nested.md',
      },
      workspace
    );
    assert.equal(nested.ok, false);
    assert.match(nested.error || '', /basename/i);
  });

  it('record_design_approval content variant materializes the file atomically under plans/', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const body = '# Design\n\nApproved inline.\n';
    const outcome = await server.callTool(
      'record_design_approval',
      {
        session_id: 'alpha',
        design_document_content: body,
        design_document_filename: 'inline-design.md',
      },
      workspace
    );
    assert.equal(outcome.ok, true);
    const canonical = path.join(workspace, 'docs', 'maestro', 'plans', 'inline-design.md');
    assert.equal(outcome.result.design_document_path, canonical);
    assert.equal(fs.readFileSync(canonical, 'utf8'), body);
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
