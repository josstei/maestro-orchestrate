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
const {
  listApprovedGates,
  findOrphanedApprovedGates,
  hasDesignGate,
} = require('../../src/mcp/handlers/design-gate');

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

  it('create_session rejects when an approved gate exists for a different session_id and the current session has no gate', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'placeholder-id' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'placeholder-id',
        design_document_content: '# Design\n',
        design_document_filename: 'drift-design.md',
      },
      workspace
    );

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'real-session-id',
        task: 'drifted session id',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['x'] },
        ],
      },
      workspace
    );

    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, 'DESIGN_GATE_SESSION_MISMATCH');
    assert.match(outcome.error || '', /placeholder-id/);
    assert.match(outcome.error || '', /real-session-id/);
    assert.match(outcome.error || '', /Session IDs must match/i);
  });

  it('create_session succeeds when an orphan approved gate exists but the current session also has its own gate', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    await server.callTool('enter_design_gate', { session_id: 'prior-abandoned' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'prior-abandoned',
        design_document_content: '# Old\n',
        design_document_filename: 'old-design.md',
      },
      workspace
    );

    await server.callTool('enter_design_gate', { session_id: 'fresh-session' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'fresh-session',
        design_document_content: '# New\n',
        design_document_filename: 'new-design.md',
      },
      workspace
    );

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'fresh-session',
        task: 'fresh session with abandoned orphan gate in workspace',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['y'] },
        ],
      },
      workspace
    );
    assert.equal(
      outcome.ok,
      true,
      'orphan detection must not false-positive when current session has its own gate'
    );
  });

  it('create_session with no gates in the workspace proceeds normally (simple/express tasks skip the design gate)', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'express-session',
        task: 'simple task without gate',
        task_complexity: 'simple',
        workflow_mode: 'express',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['z'] },
        ],
      },
      workspace
    );
    assert.equal(outcome.ok, true);
  });

  it('listApprovedGates enumerates only gates with a non-empty approved_at', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    await server.callTool('enter_design_gate', { session_id: 'entered-only' }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'approved-one' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'approved-one',
        design_document_content: '# A\n',
        design_document_filename: 'a.md',
      },
      workspace
    );
    await server.callTool('enter_design_gate', { session_id: 'approved-two' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'approved-two',
        design_document_content: '# B\n',
        design_document_filename: 'b.md',
      },
      workspace
    );

    const approved = listApprovedGates(workspace);
    const ids = approved.map((g) => g.session_id).sort();
    assert.deepEqual(ids, ['approved-one', 'approved-two']);
    for (const gate of approved) {
      assert.match(gate.approved_at, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(typeof gate.design_document_path, 'string');
    }
  });

  it('listApprovedGates returns an empty list when the state directory is absent', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-no-state-'));
    assert.deepEqual(listApprovedGates(workspace), []);
  });

  it('findOrphanedApprovedGates excludes the current session and skips unapproved gates', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    await server.callTool('enter_design_gate', { session_id: 'current' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'current',
        design_document_content: '# C\n',
        design_document_filename: 'c.md',
      },
      workspace
    );
    await server.callTool('enter_design_gate', { session_id: 'orphan-entered-only' }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'orphan-approved' }, workspace);
    await server.callTool(
      'record_design_approval',
      {
        session_id: 'orphan-approved',
        design_document_content: '# O\n',
        design_document_filename: 'o.md',
      },
      workspace
    );

    const orphans = findOrphanedApprovedGates(workspace, 'current');
    assert.deepEqual(
      orphans.map((g) => g.session_id),
      ['orphan-approved']
    );
  });

  it('hasDesignGate reflects whether an entered-or-approved gate artifact exists for a session', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    assert.equal(hasDesignGate(workspace, 'never-entered'), false);

    await server.callTool('enter_design_gate', { session_id: 'just-entered' }, workspace);
    assert.equal(hasDesignGate(workspace, 'just-entered'), true);

    await server.callTool(
      'record_design_approval',
      {
        session_id: 'just-entered',
        design_document_content: '# D\n',
        design_document_filename: 'd.md',
      },
      workspace
    );
    assert.equal(hasDesignGate(workspace, 'just-entered'), true);
  });

  it('create_session with mismatched session_id and an unapproved (entered-only) orphan gate does not fire the mismatch check', async () => {
    const workspace = makeWorkspace();
    const server = buildServer();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    await server.callTool('enter_design_gate', { session_id: 'pending-approval' }, workspace);

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'different-simple',
        task: 'simple task alongside pending gate for unrelated session',
        task_complexity: 'simple',
        workflow_mode: 'express',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['w'] },
        ],
      },
      workspace
    );
    assert.equal(
      outcome.ok,
      true,
      'unapproved orphan gates should not trigger DESIGN_GATE_SESSION_MISMATCH — only approved ones indicate drift'
    );
  });
});
