'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');

const { makeTempDir, writeFile } = require('../support/fs');
const { activeSessionPath, readSessionState } = require('../support/session-file');
const { createInitializedSessionServer, sessionParams } = require('../support/session-server');
const markdownState = require('../../src/core/markdown-state');
const { handleGetSessionStatus } = require('../../src/mcp/handlers/session-state-tools');
const { handleGetDesignGateStatus } = require('../../src/mcp/handlers/design-gate');

const workerPath = path.join(__dirname, '..', 'support', 'mcp-state-worker.js');

async function competingCalls(t, workspace, jobs) {
  const workers = jobs.map((calls) => {
    const child = fork(workerPath, [], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, MAESTRO_STATE_DIR: 'docs/maestro' },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let ready;
    let failed;
    const started = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
    const completed = new Promise((resolve, reject) => {
      let outcome;
      child.on('message', (message) => {
        if (message.ready) ready();
        else outcome = message;
      });
      child.once('error', (error) => { failed(error); reject(error); });
      child.once('exit', (code, signal) => {
        if (code !== 0 || !outcome || outcome.failure) {
          const error = new Error(outcome?.failure || `State worker exited (${code}, ${signal}): ${stderr}`);
          failed(error);
          reject(error);
        } else resolve(outcome.outcomes);
      });
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    return { child, calls, started, completed };
  });
  const completed = Promise.all(workers.map((worker) => worker.completed));
  completed.catch(() => {});
  await Promise.all(workers.map((worker) => worker.started));
  for (const worker of workers) worker.child.send({ workspace, calls: worker.calls });
  return completed;
}

async function killCommittedCall(t, workspace, call) {
  const child = fork(workerPath, [], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, MAESTRO_STATE_DIR: 'docs/maestro' },
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await new Promise((resolve, reject) => {
    let committed = false;
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Worker did not commit: ${stderr}`));
    }, 10000);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('message', () => child.send({ workspace, calls: [call], pauseAfterCommit: true }));
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes('committed\n')) { committed = true; child.kill('SIGKILL'); }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => {
      clearTimeout(timer);
      if (committed) resolve();
      else reject(new Error(`Worker exited before committing: ${stderr}`));
    });
  });
}

describe('coordinated MCP state contracts', { timeout: 30000 }, () => {
  it('serializes competing creates from separate processes', async (t) => {
    const workspace = makeTempDir('maestro-concurrent-create-');
    await createInitializedSessionServer(workspace);
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
    const workspace = makeTempDir('maestro-concurrent-tokens-');
    const server = await createInitializedSessionServer(workspace);
    assert.equal((await server.callTool('create_session', sessionParams('tokens'), workspace)).ok, true);
    const jobs = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ({
      tool: 'transition_phase',
      params: { session_id: 'tokens', next_phase_id: 1, token_usage: { input: 3, output: 2, cached: 1 } },
    })));
    const outcomes = (await competingCalls(t, workspace, jobs)).flat();
    assert.ok(outcomes.every((outcome) => outcome.ok), JSON.stringify(outcomes));
    assert.deepEqual(readSessionState(workspace).token_usage, {
      total_input: 60, total_output: 40, total_cached: 20, by_agent: {},
    });
  });

  it('publishes design contents and approval together when create races approval', async (t) => {
    const workspace = makeTempDir('maestro-concurrent-gate-');
    const server = await createInitializedSessionServer(workspace);
    await server.callTool('enter_design_gate', { session_id: 'gate-race' }, workspace);
    const [[approval], [creation]] = await competingCalls(t, workspace, [
      [{ tool: 'record_design_approval', params: {
        session_id: 'gate-race', design_document_content: '# Approved design\n', design_document_filename: 'design.md',
      } }],
      [{ tool: 'create_session', params: sessionParams('gate-race') }],
    ]);
    assert.equal(approval.ok, true, JSON.stringify(approval));
    if (!creation.ok) {
      assert.equal(creation.code, 'DESIGN_GATE_UNAPPROVED');
      assert.equal((await server.callTool('create_session', sessionParams('gate-race'), workspace)).ok, true);
    }
    const state = readSessionState(workspace);
    assert.equal(state.design_document, approval.result.design_document_path);
    assert.equal(fs.readFileSync(state.design_document, 'utf8'), '# Approved design\n');
  });

  it('serializes archive versus update without recreating the active session', async (t) => {
    const workspace = makeTempDir('maestro-concurrent-archive-');
    const server = await createInitializedSessionServer(workspace);
    assert.equal((await server.callTool('create_session', sessionParams('archive-race'), workspace)).ok, true);
    const [[archived], [updated]] = await competingCalls(t, workspace, [
      [{ tool: 'archive_session', params: { session_id: 'archive-race' } }],
      [{ tool: 'update_session', params: { session_id: 'archive-race', current_batch: 'concurrent-update' } }],
    ]);
    assert.equal(archived.ok, true, JSON.stringify(archived));
    assert.equal(fs.existsSync(activeSessionPath(workspace)), false);
    const state = markdownState.parse(fs.readFileSync(archived.result.archive_path, 'utf8')).data;
    assert.equal(state.status, 'completed');
    assert.equal(state.current_batch, updated.ok ? 'concurrent-update' : null);
    if (!updated.ok) assert.match(updated.error, /ENOENT/);
  });

  it('does not publish staged document copies when a later validation fails', async () => {
    const workspace = makeTempDir('maestro-staging-abort-');
    const source = writeFile(path.join(workspace, 'external-design.md'), '# New design\n');
    const server = await createInitializedSessionServer(workspace);
    const destination = writeFile(path.join(workspace, 'docs/maestro/plans/external-design.md'), '# Existing design\n');
    const outcome = await server.callTool('create_session', sessionParams('aborted', {
      design_document: source, implementation_plan_content: '# Missing filename\n',
    }), workspace);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /implementation_plan_filename is required/);
    assert.equal(fs.readFileSync(destination, 'utf8'), '# Existing design\n');
    assert.equal(fs.existsSync(activeSessionPath(workspace)), false);
    assert.equal(fs.existsSync(path.join(workspace, 'docs/maestro/state/.maestro/current.json')), false);
  });

  it('keeps duplicate documents, missing documents, and archive destination replacement semantics', async () => {
    const workspace = makeTempDir('maestro-archive-documents-');
    const server = await createInitializedSessionServer(workspace);
    const document = writeFile(path.join(workspace, 'docs/maestro/plans/shared.md'), '# Shared\n');
    const existingArchive = writeFile(path.join(workspace, 'docs/maestro/plans/archive/shared.md'), '# Previous\n');
    assert.equal((await server.callTool('create_session', sessionParams('duplicates', {
      design_document: document, implementation_plan: document,
    }), workspace)).ok, true);
    const outcome = await server.callTool('archive_session', { session_id: 'duplicates' }, workspace);
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(outcome.result.archived_files, [outcome.result.archive_path, existingArchive]);
    assert.equal(fs.readFileSync(existingArchive, 'utf8'), '# Shared\n');
    const missingDocument = writeFile(path.join(workspace, 'docs/maestro/plans/missing.md'), '# Removed later\n');
    assert.equal((await server.callTool('create_session', sessionParams('missing-document', {
      implementation_plan: missingDocument,
    }), workspace)).ok, true);
    fs.unlinkSync(missingDocument);
    const missing = await server.callTool('archive_session', { session_id: 'missing-document' }, workspace);
    assert.equal(missing.ok, true, JSON.stringify(missing));
    assert.deepEqual(missing.result.archived_files, [missing.result.archive_path]);
  });

  it('reads absent state without creating the state directory', async () => {
    const workspace = makeTempDir('maestro-readonly-state-');
    assert.deepEqual(await handleGetSessionStatus({}, workspace), { exists: false, message: 'No active session found' });
    assert.deepEqual(await handleGetDesignGateStatus({ session_id: 'absent' }, workspace), {
      session_id: 'absent', entered_at: null, approved_at: null, design_document_path: null,
    });
    assert.deepEqual(fs.readdirSync(workspace), []);
  });

  it('recovers a committed create after process death using captured timestamps and external document bytes', async (t) => {
    const workspace = makeTempDir('maestro-create-crash-');
    const server = await createInitializedSessionServer(workspace);
    const external = writeFile(path.join(makeTempDir('maestro-crash-source-'), 'design.md'), '# Captured design\n');
    await killCommittedCall(t, workspace, {
      tool: 'create_session', params: sessionParams('crashed-create', { design_document: external }),
    });
    assert.equal(fs.existsSync(activeSessionPath(workspace)), false);
    const control = path.join(workspace, 'docs/maestro/state/.maestro');
    const current = JSON.parse(fs.readFileSync(path.join(control, 'current.json'), 'utf8'));
    const transaction = path.join(control, 'transactions', current.id);
    const intent = JSON.parse(fs.readFileSync(path.join(transaction, 'intent.json'), 'utf8'));
    const stagedSession = intent.operations.find((operation) => operation.type === 'write' && operation.path === 'state/active-session.md');
    const captured = markdownState.parse(fs.readFileSync(path.join(transaction, 'files', stagedSession.stage), 'utf8')).data;
    fs.unlinkSync(external);
    const mutation = await server.callTool('update_session', {
      session_id: 'crashed-create', current_batch: 'must-not-apply',
    }, workspace);
    assert.equal(mutation.ok, false);
    assert.equal(mutation.code, 'STATE_RECOVERED');
    assert.equal(mutation.details.transaction_id, current.id);
    assert.match(mutation.recovery_hint, /inspect/);
    const status = await server.callTool('get_session_status', {}, workspace);
    assert.equal(status.ok, true);
    assert.equal(status.result.session_id, 'crashed-create');
    const recovered = readSessionState(workspace);
    assert.deepEqual(recovered, captured);
    assert.equal(recovered.current_batch, null);
    assert.equal(recovered.created, recovered.updated);
    assert.equal(recovered.phases[0].started, recovered.created);
    assert.equal(fs.readFileSync(recovered.design_document, 'utf8'), '# Captured design\n');
    assert.equal(fs.existsSync(path.join(control, 'current.json')), false);
  });

  it('recovers an archive interrupted after moving a relative document symlink', async (t) => {
    const workspace = fs.realpathSync(makeTempDir('maestro-symlink-archive-'));
    const server = await createInitializedSessionServer(workspace);
    const base = path.join(workspace, 'docs', 'maestro');
    const referent = writeFile(path.join(base, 'design-content.md'), '# Design\n');
    const source = path.join(base, 'plans', 'deep', 'nested', 'design.md');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    const target = path.join('..', '..', '..', 'design-content.md');
    try { fs.symlinkSync(target, source); }
    catch (error) {
      if (process.platform === 'win32' && error.code === 'EPERM') return t.skip('File symlinks require privileges');
      throw error;
    }
    assert.equal((await server.callTool('create_session', sessionParams('symlink-archive', {
      design_document: source,
    }), workspace)).ok, true);
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
      const outcome = await server.callTool('archive_session', { session_id: 'symlink-archive' }, workspace);
      assert.equal(outcome.code, 'STATE_RECOVERY_REQUIRED');
    } finally { fs.renameSync = rename; }
    const pointer = path.join(base, 'state', '.maestro', 'current.json');
    assert.equal(fs.existsSync(pointer), true);
    const status = await server.callTool('get_session_status', {}, workspace);
    assert.equal(status.ok, true, JSON.stringify(status));
    assert.equal(status.result.exists, false);
    assert.equal(fs.existsSync(pointer), false);
    assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(destination), target);
    assert.equal(fs.readFileSync(referent, 'utf8'), '# Design\n');
    assert.equal(markdownState.parse(fs.readFileSync(path.join(base, 'state', 'archive', 'symlink-archive.md'), 'utf8')).data.status, 'completed');
  });

  it('skips a plan replaced by a dangling document symlink during archive', async (t) => {
    const workspace = fs.realpathSync(makeTempDir('maestro-symlink-collision-'));
    const server = await createInitializedSessionServer(workspace);
    const base = path.join(workspace, 'docs', 'maestro');
    writeFile(path.join(base, 'design-content.md'), '# Design\n');
    const source = path.join(base, 'plans', 'deep', 'nested', 'design.md');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    try { fs.symlinkSync(path.join('..', '..', '..', 'design-content.md'), source); }
    catch (error) {
      if (process.platform === 'win32' && error.code === 'EPERM') return t.skip('File symlinks require privileges');
      throw error;
    }
    const plan = writeFile(path.join(base, 'plans', 'archive', 'design.md'), '# Prior plan\n');
    assert.equal((await server.callTool('create_session', sessionParams('symlink-collision', {
      design_document: source, implementation_plan: plan,
    }), workspace)).ok, true);
    const outcome = await server.callTool('archive_session', { session_id: 'symlink-collision' }, workspace);
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(outcome.result.archived_files, [outcome.result.archive_path, plan]);
    assert.equal(fs.existsSync(plan), false);
    assert.equal(fs.lstatSync(plan).isSymbolicLink(), true);
  });
});
