'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');

const { makeTempDir, writeFile, writeTree } = require('../support/fs');
const { activeSessionPath, readSessionState } = require('../support/session-file');
const { killAtMarker } = require('../support/process');
const { SessionWorkspace, packServer, sessionParams } = require('../support/session-server');
const { symlinkOrSkip } = require('../support/state');
const markdownState = require('../../src/core/markdown-state');
const { createToolPack: createSessionPack } = require('../../src/mcp/tool-packs/session');

const workerPath = path.join(__dirname, '..', 'support', 'mcp-state-worker.js');

function forkWorker(stdout) {
  const env = { ...process.env, MAESTRO_STATE_DIR: 'docs/maestro' };
  return fork(workerPath, [], { stdio: ['ignore', stdout, 'pipe', 'ipc'], env });
}

async function competingCalls(t, workspace, jobs) {
  const workers = jobs.map((calls) => {
    const child = forkWorker('ignore');
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let outcome;
    child.on('message', (message) => { if (!message.ready) outcome = message; });
    const completed = once(child, 'exit').then(([code, signal]) => {
      if (code === 0 && outcome && !outcome.failure) return outcome.outcomes;
      throw new Error(outcome?.failure || `State worker exited (${code}, ${signal}): ${stderr}`);
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    // The worker's first message is always its ready signal.
    return { child, calls, started: Promise.race([once(child, 'message'), completed]), completed };
  });
  const completed = Promise.all(workers.map((worker) => worker.completed));
  completed.catch(() => {});
  await Promise.all(workers.map((worker) => worker.started));
  for (const worker of workers) worker.child.send({ workspace, calls: worker.calls });
  return completed;
}

function killCommittedCall(t, workspace, call) {
  const child = forkWorker('pipe');
  child.once('message', () => child.send({ workspace, calls: [call], pauseAfterCommit: true }));
  return killAtMarker(t, child, 'committed\n');
}

describe('coordinated MCP state contracts', { timeout: 30000 }, () => {
  it('serializes competing creates from separate processes', async (t) => {
    const { dir: workspace } = await SessionWorkspace.create();
    const outcomes = (await competingCalls(t, workspace, ['first', 'second'].map((id) => [
      { tool: 'create_session', params: sessionParams(id) },
    ]))).flat();
    assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1);
    assert.match(outcomes.find((outcome) => !outcome.ok).error, /already exists/);
    const state = readSessionState(workspace);
    assert.equal(state.status, 'in_progress');
    assert.equal(state.created, state.updated);
    assert.ok(['first', 'second'].includes(state.session_id));
  });

  it('preserves every token increment across separate processes', async (t) => {
    const workspace = await SessionWorkspace.create();
    assert.equal((await workspace.createSession('tokens')).ok, true);
    const jobs = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ({
      tool: 'transition_phase',
      params: { session_id: 'tokens', next_phase_id: 1, token_usage: { input: 3, output: 2, cached: 1 } },
    })));
    const outcomes = (await competingCalls(t, workspace.dir, jobs)).flat();
    assert.ok(outcomes.every((outcome) => outcome.ok), JSON.stringify(outcomes));
    assert.deepEqual(readSessionState(workspace.dir).token_usage, {
      total_input: 60, total_output: 40, total_cached: 20, by_agent: {},
    });
  });

  it('publishes design contents and approval together when create races approval', async (t) => {
    const workspace = await SessionWorkspace.create();
    await workspace.enterGate('gate-race');
    const [[approval], [creation]] = await competingCalls(t, workspace.dir, [
      [{ tool: 'record_design_approval', params: {
        session_id: 'gate-race', design_document_content: '# Approved design\n', design_document_filename: 'design.md',
      } }],
      [{ tool: 'create_session', params: sessionParams('gate-race') }],
    ]);
    assert.equal(approval.ok, true, JSON.stringify(approval));
    if (!creation.ok) {
      assert.equal(creation.code, 'DESIGN_GATE_UNAPPROVED');
      assert.equal((await workspace.createSession('gate-race')).ok, true);
    }
    const state = readSessionState(workspace.dir);
    assert.equal(state.design_document, approval.result.design_document_path);
    assert.equal(fs.readFileSync(state.design_document, 'utf8'), '# Approved design\n');
  });

  it('serializes archive versus update without recreating the active session', async (t) => {
    const workspace = await SessionWorkspace.create();
    assert.equal((await workspace.createSession('archive-race')).ok, true);
    const [[archived], [updated]] = await competingCalls(t, workspace.dir, [
      [{ tool: 'archive_session', params: { session_id: 'archive-race' } }],
      [{ tool: 'update_session', params: { session_id: 'archive-race', current_batch: 'concurrent-update' } }],
    ]);
    assert.equal(archived.ok, true, JSON.stringify(archived));
    assert.equal(fs.existsSync(activeSessionPath(workspace.dir)), false);
    const state = markdownState.parse(fs.readFileSync(archived.result.archive_path, 'utf8')).data;
    assert.equal(state.status, 'completed');
    assert.equal(state.current_batch, updated.ok ? 'concurrent-update' : null);
    if (!updated.ok) assert.match(updated.error, /ENOENT/);
  });

  it('does not publish staged document copies when a later validation fails', async () => {
    const workspace = await SessionWorkspace.create();
    const source = writeTree(workspace.dir, 'external-design.md', '# New design\n');
    const destination = writeTree(workspace.dir, 'docs/maestro/plans/external-design.md', '# Existing design\n');
    const outcome = await workspace.createSession('aborted', {
      design_document: source, implementation_plan_content: '# Missing filename\n',
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /implementation_plan_filename is required/);
    assert.equal(fs.readFileSync(destination, 'utf8'), '# Existing design\n');
    assert.equal(fs.existsSync(activeSessionPath(workspace.dir)), false);
    assert.equal(fs.existsSync(path.join(workspace.dir, 'docs/maestro/state/.maestro/current.json')), false);
  });

  it('keeps duplicate documents, missing documents, and archive destination replacement semantics', async () => {
    const workspace = await SessionWorkspace.create();
    const document = writeTree(workspace.dir, 'docs/maestro/plans/shared.md', '# Shared\n');
    const existingArchive = writeTree(workspace.dir, 'docs/maestro/plans/archive/shared.md', '# Previous\n');
    assert.equal((await workspace.createSession('duplicates', {
      design_document: document, implementation_plan: document,
    })).ok, true);
    const outcome = await workspace.call('archive_session', { session_id: 'duplicates' });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(outcome.result.archived_files, [outcome.result.archive_path, existingArchive]);
    assert.equal(fs.readFileSync(existingArchive, 'utf8'), '# Shared\n');
    const missingDocument = writeTree(workspace.dir, 'docs/maestro/plans/missing.md', '# Removed later\n');
    assert.equal((await workspace.createSession('missing-document', {
      implementation_plan: missingDocument,
    })).ok, true);
    fs.unlinkSync(missingDocument);
    const missing = await workspace.call('archive_session', { session_id: 'missing-document' });
    assert.equal(missing.ok, true, JSON.stringify(missing));
    assert.deepEqual(missing.result.archived_files, [missing.result.archive_path]);
  });

  it('reads absent state without creating the state directory', async () => {
    const workspace = makeTempDir('maestro-readonly-state-');
    const server = packServer([createSessionPack]);
    assert.deepEqual((await server.callTool('get_session_status', {}, workspace)).result, {
      exists: false, message: 'No active session found',
    });
    assert.deepEqual((await server.callTool('get_design_gate_status', { session_id: 'absent' }, workspace)).result, {
      session_id: 'absent', entered_at: null, approved_at: null, design_document_path: null,
    });
    assert.deepEqual(fs.readdirSync(workspace), []);
  });

  it('recovers a committed create after process death using captured timestamps and external document bytes', async (t) => {
    const workspace = await SessionWorkspace.create();
    const external = writeFile(path.join(makeTempDir('maestro-crash-source-'), 'design.md'), '# Captured design\n');
    await killCommittedCall(t, workspace.dir, {
      tool: 'create_session', params: sessionParams('crashed-create', { design_document: external }),
    });
    assert.equal(fs.existsSync(activeSessionPath(workspace.dir)), false);
    const control = path.join(workspace.dir, 'docs/maestro/state/.maestro');
    const current = JSON.parse(fs.readFileSync(path.join(control, 'current.json'), 'utf8'));
    const transaction = path.join(control, 'transactions', current.id);
    const intent = JSON.parse(fs.readFileSync(path.join(transaction, 'intent.json'), 'utf8'));
    const stagedSession = intent.operations.find((operation) => operation.type === 'write' && operation.path === 'state/active-session.md');
    const captured = markdownState.parse(fs.readFileSync(path.join(transaction, 'files', stagedSession.stage), 'utf8')).data;
    fs.unlinkSync(external);
    const mutation = await workspace.call('update_session', {
      session_id: 'crashed-create', current_batch: 'must-not-apply',
    });
    assert.equal(mutation.ok, false);
    assert.equal(mutation.code, 'STATE_RECOVERED');
    assert.equal(mutation.details.transaction_id, current.id);
    assert.match(mutation.recovery_hint, /inspect/);
    const status = await workspace.call('get_session_status', {});
    assert.equal(status.ok, true);
    assert.equal(status.result.session_id, 'crashed-create');
    const recovered = readSessionState(workspace.dir);
    assert.deepEqual(recovered, captured);
    assert.equal(recovered.current_batch, null);
    assert.equal(recovered.created, recovered.updated);
    assert.equal(recovered.phases[0].started, recovered.created);
    assert.equal(fs.readFileSync(recovered.design_document, 'utf8'), '# Captured design\n');
    assert.equal(fs.existsSync(path.join(control, 'current.json')), false);
  });

  it('recovers an archive interrupted after moving a relative document symlink', async (t) => {
    const workspace = await SessionWorkspace.create(fs.realpathSync(makeTempDir('maestro-symlink-archive-')));
    const base = path.join(workspace.dir, 'docs', 'maestro');
    const referent = writeFile(path.join(base, 'design-content.md'), '# Design\n');
    const source = path.join(base, 'plans', 'deep', 'nested', 'design.md');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    const target = path.join('..', '..', '..', 'design-content.md');
    if (!symlinkOrSkip(t, target, source)) return;
    assert.equal((await workspace.createSession('symlink-archive', { design_document: source })).ok, true);
    const destination = path.join(base, 'plans', 'archive', 'design.md');
    const rename = fs.renameSync;
    fs.renameSync = function (from, to) {
      const result = rename.apply(this, arguments);
      if (from === source && to === destination) {
        throw Object.assign(new Error('Interrupted after document rename'), { code: 'EIO' });
      }
      return result;
    };
    try {
      const outcome = await workspace.call('archive_session', { session_id: 'symlink-archive' });
      assert.equal(outcome.code, 'STATE_RECOVERY_REQUIRED');
    } finally { fs.renameSync = rename; }
    const pointer = path.join(base, 'state', '.maestro', 'current.json');
    assert.equal(fs.existsSync(pointer), true);
    const status = await workspace.call('get_session_status', {});
    assert.equal(status.ok, true, JSON.stringify(status));
    assert.equal(status.result.exists, false);
    assert.equal(fs.existsSync(pointer), false);
    assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(destination), target);
    assert.equal(fs.readFileSync(referent, 'utf8'), '# Design\n');
    assert.equal(markdownState.parse(fs.readFileSync(path.join(base, 'state', 'archive', 'symlink-archive.md'), 'utf8')).data.status, 'completed');
  });

  it('skips a plan replaced by a dangling document symlink during archive', async (t) => {
    const workspace = await SessionWorkspace.create(fs.realpathSync(makeTempDir('maestro-symlink-collision-')));
    const base = path.join(workspace.dir, 'docs', 'maestro');
    writeFile(path.join(base, 'design-content.md'), '# Design\n');
    const source = path.join(base, 'plans', 'deep', 'nested', 'design.md');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    if (!symlinkOrSkip(t, path.join('..', '..', '..', 'design-content.md'), source)) return;
    const plan = writeFile(path.join(base, 'plans', 'archive', 'design.md'), '# Prior plan\n');
    assert.equal((await workspace.createSession('symlink-collision', {
      design_document: source, implementation_plan: plan,
    })).ok, true);
    const outcome = await workspace.call('archive_session', { session_id: 'symlink-collision' });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(outcome.result.archived_files, [outcome.result.archive_path, plan]);
    assert.equal(fs.existsSync(plan), false);
    assert.equal(fs.lstatSync(plan).isSymbolicLink(), true);
  });
});
