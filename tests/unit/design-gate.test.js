'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { withEnv } = require('../support/env');
const { makeTempDir, writeFile } = require('../support/fs');
const {
  approveDesignGate,
  createInitializedSessionServer,
  createSessionServer,
  singlePhase,
} = require('../support/session-server');

// A fresh initialized workspace.
async function initializedServer() {
  const workspace = makeTempDir('maestro-gate-');
  return { workspace, server: await createInitializedSessionServer(workspace) };
}

// A fresh initialized workspace whose 'alpha' session has entered the design gate.
async function gatedServer() {
  const { workspace, server } = await initializedServer();
  await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
  return { workspace, server };
}

describe('design gate tools', () => {
  it('enter_design_gate records a timestamp on the session-gate store', async () => {
    const { workspace, server } = await initializedServer();

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
    const { workspace, server } = await initializedServer();

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
    const { workspace, server } = await gatedServer();

    const designPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    writeFile(designPath, '# Design\n\nA real design document.\n');

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

  it('record_design_approval rejects when neither path nor content+filename is provided', async () => {
    const { workspace, server } = await gatedServer();

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
    const { workspace, server } = await gatedServer();

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
    const { workspace, server } = await gatedServer();

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
    const { workspace, server } = await gatedServer();

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

  it('record_design_approval reports invalid document params before an invalid state dir', async () => {
    const { workspace, server } = await gatedServer();
    const call = (params) =>
      withEnv({ MAESTRO_STATE_DIR: makeTempDir('maestro-gate-outside-') }, () =>
        server.callTool('record_design_approval', { session_id: 'alpha', ...params }, workspace)
      );

    const invalidParams = await call({ design_document_content: '# Design\n' });
    assert.equal(invalidParams.code, 'VALIDATION_ERROR');
    assert.match(invalidParams.error, /design_document_filename is required/);

    const validParams = await call({ design_document_content: '# Design\n', design_document_filename: 'd.md' });
    assert.equal(validParams.code, 'INTERNAL_TOOL_ERROR');
    assert.match(validParams.error, /state_dir must be within the project root/);
  });

  it('record_design_approval content variant materializes the file atomically under plans/', async () => {
    const { workspace, server } = await gatedServer();

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
    const { workspace, server } = await initializedServer();
    const outcome = await server.callTool(
      'get_design_gate_status',
      { session_id: 'alpha' },
      workspace
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.entered_at, null);
  });

  it('create_session rejects when design gate is entered but unapproved', async () => {
    const { workspace, server } = await gatedServer();

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'alpha',
        task: 'should fail',
        phases: singlePhase(['x'], { name: 'x' }),
      },
      workspace
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /design gate|approval/i);
  });

  it('create_session succeeds after record_design_approval', async () => {
    const { workspace, server } = await gatedServer();

    const designPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    writeFile(designPath, '# Design\n');
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
        phases: singlePhase(['x'], { name: 'x' }),
      },
      workspace
    );
    assert.equal(outcome.ok, true);
  });

  it('create_session rejects when an approved gate exists for a different session_id and the current session has no gate', async () => {
    const { workspace, server } = await initializedServer();
    await approveDesignGate(server, workspace, 'placeholder-id', {
      design_document_content: '# Design\n',
      design_document_filename: 'drift-design.md',
    });

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'real-session-id',
        task: 'drifted session id',
        task_complexity: 'simple',
        phases: singlePhase(['x']),
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
    const { workspace, server } = await initializedServer();

    await approveDesignGate(server, workspace, 'prior-abandoned', {
      design_document_content: '# Old\n',
      design_document_filename: 'old-design.md',
    });

    await approveDesignGate(server, workspace, 'fresh-session', {
      design_document_content: '# New\n',
      design_document_filename: 'new-design.md',
    });

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'fresh-session',
        task: 'fresh session with abandoned orphan gate in workspace',
        task_complexity: 'simple',
        phases: singlePhase(['y']),
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
    const { workspace, server } = await initializedServer();

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'express-session',
        task: 'simple task without gate',
        task_complexity: 'simple',
        workflow_mode: 'express',
        phases: singlePhase(['z']),
      },
      workspace
    );
    assert.equal(outcome.ok, true);
  });

  it('create_session names every approved foreign gate, and no unapproved one, when its own gate is absent', async () => {
    const { workspace, server } = await initializedServer();

    await server.callTool('enter_design_gate', { session_id: 'entered-only' }, workspace);
    await approveDesignGate(server, workspace, 'approved-one', {
      design_document_content: '# A\n',
      design_document_filename: 'a.md',
    });
    await approveDesignGate(server, workspace, 'approved-two', {
      design_document_content: '# B\n',
      design_document_filename: 'b.md',
    });

    const outcome = await server.callTool(
      'create_session',
      { session_id: 'absent-session', task: 'drifted', phases: singlePhase(['x']) },
      workspace
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, 'DESIGN_GATE_SESSION_MISMATCH');
    assert.equal(outcome.details.current_session_id, 'absent-session');
    assert.deepEqual([...outcome.details.orphaned_session_ids].sort(), ['approved-one', 'approved-two']);
    assert.match(outcome.error, /<state_dir>\/state\/approved-one\.design-gate\.json/);
    assert.doesNotMatch(outcome.error, /entered-only/);
  });

  it('create_session proceeds in a workspace whose state directory does not exist yet', async () => {
    const workspace = makeTempDir('maestro-no-state-');
    const outcome = await createSessionServer().callTool(
      'create_session',
      { session_id: 'absent-session', task: 'no state dir', phases: singlePhase(['x']) },
      workspace
    );
    assert.equal(outcome.ok, true);
  });

  it('get_design_gate_status reflects the entered and approved timestamps of a session gate', async () => {
    const { workspace, server } = await initializedServer();
    const status = async (sessionId) =>
      (await server.callTool('get_design_gate_status', { session_id: sessionId }, workspace)).result;

    assert.deepEqual(await status('never-entered'), {
      session_id: 'never-entered',
      entered_at: null,
      approved_at: null,
      design_document_path: null,
    });

    await server.callTool('enter_design_gate', { session_id: 'just-entered' }, workspace);
    const entered = await status('just-entered');
    assert.match(entered.entered_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entered.approved_at, null);

    await server.callTool(
      'record_design_approval',
      {
        session_id: 'just-entered',
        design_document_content: '# D\n',
        design_document_filename: 'd.md',
      },
      workspace
    );
    const approved = await status('just-entered');
    assert.equal(approved.entered_at, entered.entered_at);
    assert.match(approved.approved_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(approved.design_document_path, path.join(workspace, 'docs', 'maestro', 'plans', 'd.md'));
  });

  it('create_session with mismatched session_id and an unapproved (entered-only) orphan gate does not fire the mismatch check', async () => {
    const { workspace, server } = await initializedServer();

    await server.callTool('enter_design_gate', { session_id: 'pending-approval' }, workspace);

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'different-simple',
        task: 'simple task alongside pending gate for unrelated session',
        task_complexity: 'simple',
        workflow_mode: 'express',
        phases: singlePhase(['w']),
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
