'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { readGate } = require('../../src/state/design-gate');
const { withStateRead } = require('../../src/state/coordinator');
const { writeFile } = require('../support/fs');
const { readSessionState } = require('../support/session-file');
const { withEnv } = require('../support/env');
const { resolveStateDirPath } = require('../../src/state/paths');
const { SessionWorkspace, singlePhase } = require('../support/session-server');

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

// record_design_approval's content variant for a `<name>.md` document.
function inline(name, content) {
  return { design_document_content: content, design_document_filename: `${name}.md` };
}

describe('design gate tools', () => {
  it('validates approval document inputs before resolving an invalid state directory', async () => {
    const workspace = await SessionWorkspace.create();
    const neitherVariant = /requires either design_document_path or both design_document_content and design_document_filename/;
    await withEnv({ MAESTRO_STATE_DIR: '../invalid' }, async () => {
      for (const [document, message] of [
        [{}, neitherVariant],
        [{ design_document_path: '' }, neitherVariant],
        [{ design_document_path: 'design.md', design_document_content: '# Design' }, /mutually exclusive/],
        [{ design_document_content: '# Design' }, /design_document_filename is required/],
        [{ design_document_filename: 'design.md' }, /design_document_content is required/],
        [{ design_document_content: '# Design', design_document_filename: '../design.md' }, /pure basename/],
        [{ design_document_content: '# Design', design_document_filename: 'sub/nested.md' }, /pure basename/],
      ]) {
        const outcome = await workspace.call('record_design_approval', { session_id: 'alpha', ...document });
        assert.equal(outcome.ok, false);
        assert.equal(outcome.code, 'VALIDATION_ERROR');
        assert.match(outcome.error, message);
      }
    });
  });

  it('enter_design_gate records a timestamp on the session-gate store and is idempotent', async () => {
    const workspace = await SessionWorkspace.create();

    const first = await workspace.enterGate('alpha');
    assert.equal(first.ok, true);
    assert.equal(first.result.success, true);
    assert.match(first.result.entered_at, TIMESTAMP);

    const second = await workspace.enterGate('alpha');
    assert.equal(second.ok, true);
    assert.equal(second.result.entered_at, first.result.entered_at);
  });

  it('record_design_approval accepts an existing path via the path variant', async () => {
    const workspace = await SessionWorkspace.create();

    const designPath = path.join(workspace.dir, 'docs', 'maestro', 'plans', 'design.md');
    writeFile(designPath, '# Design\n\nA real design document.\n');

    const outcome = await workspace.approve('alpha', { design_document_path: designPath });
    assert.equal(outcome.ok, true);
    assert.match(outcome.result.approved_at, TIMESTAMP);
  });

  it('record_design_approval content variant materializes the file atomically under plans/', async () => {
    const workspace = await SessionWorkspace.create();

    const body = '# Design\n\nApproved inline.\n';
    const outcome = await workspace.approve('alpha', inline('inline-design', body));
    assert.equal(outcome.ok, true);
    const canonical = path.join(workspace.dir, 'docs', 'maestro', 'plans', 'inline-design.md');
    assert.equal(outcome.result.design_document_path, canonical);
    assert.equal(fs.readFileSync(canonical, 'utf8'), body);
  });

  it('get_design_gate_status returns null when gate was never entered', async () => {
    const workspace = await SessionWorkspace.create();
    const outcome = await workspace.call('get_design_gate_status', { session_id: 'alpha' });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.entered_at, null);
  });

  it('create_session rejects when design gate is entered but unapproved', async () => {
    const workspace = await SessionWorkspace.create();
    await workspace.enterGate('alpha');

    const outcome = await workspace.createSession('alpha', { phases: singlePhase(['x'], { name: 'x' }) });
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /design gate|approval/i);
  });

  for (const [name, arrange, sessionId, overrides] of [
    ['create_session with no gates in the workspace proceeds normally (simple/express tasks skip the design gate)',
      () => {}, 'express-session', { task_complexity: 'simple', workflow_mode: 'express', phases: singlePhase(['z']) }],
    ['create_session proceeds when the workspace state directory is absent',
      (workspace) => fs.rmSync(path.join(resolveStateDirPath(workspace.dir), 'state'), { recursive: true }),
      'absent-session'],
    ['create_session with mismatched session_id and an unapproved (entered-only) orphan gate does not fire the mismatch check',
      (workspace) => workspace.enterGate('pending-approval'),
      'different-simple', { task_complexity: 'simple', workflow_mode: 'express', phases: singlePhase(['w']) }],
  ]) {
    it(name, async () => {
      const workspace = await SessionWorkspace.create();
      await arrange(workspace);
      const outcome = await workspace.createSession(sessionId, overrides);
      assert.equal(outcome.ok, true, JSON.stringify(outcome));
    });
  }

  it('create_session reports only approved orphan IDs in directory order before validating phases', async (t) => {
    const workspace = await SessionWorkspace.create();
    await workspace.enterGate('entered-only');
    await workspace.approve('approved-one', inline('a', '# A\n'));
    await workspace.approve('approved-two', inline('b', '# B\n'));
    const stateDir = path.join(resolveStateDirPath(workspace.dir), 'state');
    for (const [name, content] of [
      ['corrupt.design-gate.json', '{'],
      ['empty.design-gate.json', '{"approved_at":""}'],
      ['numeric.design-gate.json', '{"approved_at":1}'],
      ['.design-gate.json', '{"approved_at":"approved"}'],
      ['unrelated.json', '{"approved_at":"approved"}'],
    ]) writeFile(path.join(stateDir, name), content);
    const readdir = fs.readdirSync;
    t.mock.method(fs, 'readdirSync', function (directory, ...args) {
      const entries = readdir.call(this, directory, ...args);
      return directory === stateDir ? entries.sort().reverse() : entries;
    });
    // A simple task gets the same mismatch check.
    const outcome = await workspace.createSession('absent-session', {
      task: 'orphan order', task_complexity: 'simple', phases: [],
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, 'DESIGN_GATE_SESSION_MISMATCH');
    assert.deepEqual(outcome.details, {
      current_session_id: 'absent-session',
      orphaned_session_ids: ['approved-two', 'approved-one'],
    });
    assert.equal(outcome.error,
      "Approved design gate exists for session 'approved-two', 'approved-one' but create_session was called with 'absent-session'. Session IDs must match across enter_design_gate, record_design_approval, and create_session. Either call create_session with the matching session_id, or delete the stale gate file(s) at <state_dir>/state/approved-two.design-gate.json, <state_dir>/state/approved-one.design-gate.json and re-enter the gate with 'absent-session'.");
  });

  it('create_session uses its own approved gate when unrelated gates exist', async () => {
    const workspace = await SessionWorkspace.create();
    const approval = await workspace.approve('current', inline('c', '# C\n'));
    await workspace.enterGate('orphan-entered-only');
    await workspace.approve('orphan-approved', inline('o', '# O\n'));
    const outcome = await workspace.createSession('current', { task: 'use current approval' });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.equal(readSessionState(workspace.dir).design_document, approval.result.design_document_path);
  });

  it('readGate reflects whether an entered-or-approved gate artifact exists for a session', async () => {
    const workspace = await SessionWorkspace.create();
    const readWorkspaceGate = (sessionId) =>
      withStateRead(resolveStateDirPath(workspace.dir), (view) => readGate(view, sessionId));

    assert.equal(await readWorkspaceGate('never-entered'), null);

    await workspace.enterGate('just-entered');
    assert.notEqual(await readWorkspaceGate('just-entered'), null);

    await workspace.call('record_design_approval', { session_id: 'just-entered', ...inline('d', '# D\n') });
    assert.notEqual(await readWorkspaceGate('just-entered'), null);
  });
});
