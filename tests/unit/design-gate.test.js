'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { readGate } = require('../../src/state/design-gate');
const { withStateRead } = require('../../src/state/coordinator');
const { makeTempDir, writeFile } = require('../support/fs');
const { readSessionState } = require('../support/session-file');
const { withEnv } = require('../support/env');
const { resolveStateDirPath } = require('../../src/state/paths');
const {
  approveDesignGate,
  createInitializedSessionServer,
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
  it('validates approval document inputs before resolving an invalid state directory', async () => {
    const { workspace, server } = await initializedServer();
    await withEnv({ MAESTRO_STATE_DIR: '../invalid' }, async () => {
      for (const [document, message] of [
        [{}, /requires either design_document_path/],
        [{ design_document_path: 'design.md', design_document_content: '# Design' }, /mutually exclusive/],
        [{ design_document_content: '# Design' }, /design_document_filename is required/],
        [{ design_document_content: '# Design', design_document_filename: '../design.md' }, /pure basename/],
      ]) {
        const outcome = await server.callTool('record_design_approval', { session_id: 'alpha', ...document }, workspace);
        assert.equal(outcome.ok, false);
        assert.equal(outcome.code, 'VALIDATION_ERROR');
        assert.match(outcome.error, message);
      }
    });
  });

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

  it('create_session reports only approved orphan IDs in directory order before validating phases', async () => {
    const { workspace, server } = await initializedServer();
    await server.callTool('enter_design_gate', { session_id: 'entered-only' }, workspace);
    await approveDesignGate(server, workspace, 'approved-one', {
      design_document_content: '# A\n', design_document_filename: 'a.md',
    });
    await approveDesignGate(server, workspace, 'approved-two', {
      design_document_content: '# B\n', design_document_filename: 'b.md',
    });
    const stateDir = path.join(resolveStateDirPath(workspace), 'state');
    for (const [name, content] of [
      ['corrupt.design-gate.json', '{'],
      ['empty.design-gate.json', '{"approved_at":""}'],
      ['numeric.design-gate.json', '{"approved_at":1}'],
      ['.design-gate.json', '{"approved_at":"approved"}'],
      ['unrelated.json', '{"approved_at":"approved"}'],
    ]) writeFile(path.join(stateDir, name), content);
    const readdir = fs.readdirSync;
    fs.readdirSync = function (directory, ...args) {
      const entries = readdir.call(this, directory, ...args);
      return directory === stateDir ? entries.sort().reverse() : entries;
    };
    let outcome;
    try {
      outcome = await server.callTool('create_session', {
        session_id: 'absent-session', task: 'orphan order', phases: [],
      }, workspace);
    } finally { fs.readdirSync = readdir; }
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, 'DESIGN_GATE_SESSION_MISMATCH');
    assert.deepEqual(outcome.details, {
      current_session_id: 'absent-session',
      orphaned_session_ids: ['approved-two', 'approved-one'],
    });
    assert.equal(outcome.error,
      "Approved design gate exists for session 'approved-two', 'approved-one' but create_session was called with 'absent-session'. Session IDs must match across enter_design_gate, record_design_approval, and create_session. Either call create_session with the matching session_id, or delete the stale gate file(s) at <state_dir>/state/approved-two.design-gate.json, <state_dir>/state/approved-one.design-gate.json and re-enter the gate with 'absent-session'.");
  });

  it('create_session proceeds when the workspace state directory is absent', async () => {
    const { workspace, server } = await initializedServer();
    fs.rmSync(path.join(resolveStateDirPath(workspace), 'state'), { recursive: true });
    const outcome = await server.callTool('create_session', {
      session_id: 'absent-session', task: 'missing state directory', phases: singlePhase([]),
    }, workspace);
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
  });

  it('create_session uses its own approved gate when unrelated gates exist', async () => {
    const { workspace, server } = await initializedServer();
    const approval = await approveDesignGate(server, workspace, 'current', {
      design_document_content: '# C\n', design_document_filename: 'c.md',
    });
    await server.callTool('enter_design_gate', { session_id: 'orphan-entered-only' }, workspace);
    await approveDesignGate(server, workspace, 'orphan-approved', {
      design_document_content: '# O\n', design_document_filename: 'o.md',
    });
    const outcome = await server.callTool('create_session', {
      session_id: 'current', task: 'use current approval', phases: singlePhase([]),
    }, workspace);
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.equal(readSessionState(workspace).design_document, approval.result.design_document_path);
  });

  it('readGate reflects whether an entered-or-approved gate artifact exists for a session', async () => {
    const { workspace, server } = await initializedServer();
    const readWorkspaceGate = (sessionId) =>
      withStateRead(resolveStateDirPath(workspace), (view) => readGate(view, sessionId));

    assert.equal(await readWorkspaceGate('never-entered'), null);

    await server.callTool('enter_design_gate', { session_id: 'just-entered' }, workspace);
    assert.notEqual(await readWorkspaceGate('just-entered'), null);

    await server.callTool(
      'record_design_approval',
      {
        session_id: 'just-entered',
        design_document_content: '# D\n',
        design_document_filename: 'd.md',
      },
      workspace
    );
    assert.notEqual(await readWorkspaceGate('just-entered'), null);
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
