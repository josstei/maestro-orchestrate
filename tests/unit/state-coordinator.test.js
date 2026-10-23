'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const {
  withStateMutation, withStateRead, contentDigest, checkExpectedDigest,
  assertPublicStatePath,
} = require('../../src/state/coordinator');
const { acquireStateLock } = require('../../src/state/state-lock');
const { createTransaction, publishTransaction } = require('../../src/state/transaction');

function workspace(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-transaction-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'state'));
  fs.mkdirSync(path.join(base, 'plans'));
  fs.writeFileSync(path.join(base, 'state', 'active-session.md'), 'original\n');
  fs.writeFileSync(path.join(base, 'state', 'session.design-gate.json'), 'approved\n');
  fs.writeFileSync(path.join(base, 'plans', 'design.md'), 'design\n');
  fs.writeFileSync(path.join(base, 'state', 'unrelated.tmp'), 'keep me');
  return base;
}

function privatePath(base, name) { return path.join(base, 'state', '.maestro', name); }
function assertArchived(base) {
  assert.equal(fs.existsSync(path.join(base, 'state', 'active-session.md')), false);
  assert.equal(fs.readFileSync(path.join(base, 'state', 'archive', 'session.md'), 'utf8'), 'completed\n');
  assert.equal(fs.existsSync(path.join(base, 'plans', 'design.md')), false);
  assert.equal(fs.readFileSync(path.join(base, 'plans', 'archive', 'design.md'), 'utf8'), 'design\n');
  assert.equal(fs.existsSync(path.join(base, 'state', 'session.design-gate.json')), false);
  assert.equal(fs.existsSync(privatePath(base, 'current.json')), false);
  assert.equal(fs.readFileSync(path.join(base, 'state', 'unrelated.tmp'), 'utf8'), 'keep me');
  assert.deepEqual(fs.readdirSync(path.join(base, 'state')).filter((name) => /\.maestro-[a-f0-9-]+-\d+\.tmp$/.test(name)), []);
}

async function killAtBoundary(t, base, boundary) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'support', 'state-transaction-worker.js'), base, boundary], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker did not reach ${boundary}: ${stderr}`)), 10000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (!signal && code !== null) reject(new Error(`Worker exited before ${boundary}: ${stderr}`));
      else resolve();
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes(`paused:${boundary}\n`)) child.kill('SIGKILL');
    });
  });
}

async function leaveCommitted(base, mutate) {
  const control = privatePath(base, '');
  const release = await acquireStateLock(control);
  try {
    const pending = createTransaction(base, control);
    mutate(pending.tx);
    publishTransaction(pending, control, { operation: 'test_operation' }, { success: true });
    return pending;
  } finally { release(); }
}

describe('state coordinator', () => {
  it('stages overlay reads and preserves the filesystem on a validation failure', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    const failure = new Error('validation failed');
    await assert.rejects(withStateMutation(base, { operation: 'update' }, (tx) => {
      tx.writeFile(active, 'staged');
      assert.equal(tx.readFile(active, 'utf8'), 'staged');
      assert.equal(fs.readFileSync(active, 'utf8'), 'original\n');
      throw failure;
    }), (error) => error === failure);
    assert.equal(fs.readFileSync(active, 'utf8'), 'original\n');
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), false);
  });

  it('serializes concurrent read-modify-write operations without lost increments', async (t) => {
    const base = workspace(t);
    const counter = path.join(base, 'state', 'counter');
    fs.writeFileSync(counter, '0');
    await Promise.all(Array.from({ length: 12 }, () => withStateMutation(base, { operation: 'increment' }, async (tx) => {
      const value = Number(tx.readFile(counter, 'utf8'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      tx.writeFile(counter, String(value + 1));
    })));
    assert.equal(fs.readFileSync(counter, 'utf8'), '12');
  });

  it('never steals a live owner even with a short wait budget', async (t) => {
    const base = workspace(t);
    const release = await acquireStateLock(privatePath(base, ''));
    try {
      await assert.rejects(withStateMutation(base, { operation: 'blocked' }, () => assert.fail('must not run'), { timeoutMs: 25 }), { code: 'STATE_BUSY' });
      assert.equal(fs.readdirSync(privatePath(base, 'lock')).length, 1);
    } finally { release(); }
  });

  it('recovers before mutation and asks the caller to inspect state without executing its callback', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    await leaveCommitted(base, (tx) => tx.writeFile(active, 'recovered'));
    await assert.rejects(withStateMutation(base, { operation: 'retry' }, () => assert.fail('must not repeat uncertain mutation')), { code: 'STATE_RECOVERED' });
    assert.equal(fs.readFileSync(active, 'utf8'), 'recovered');
  });

  it('preserves a replacement owner that acquires during the previous owner release', async (t) => {
    const base = workspace(t);
    const control = privatePath(base, '');
    const release = await acquireStateLock(control);
    const originalName = fs.readdirSync(path.join(control, 'lock'))[0];
    const token = randomUUID();
    const candidate = path.join(control, 'candidates', token);
    fs.mkdirSync(candidate);
    const replacement = `owner-${token}.json`;
    fs.writeFileSync(path.join(candidate, replacement), JSON.stringify({ version: 1, token, pid: process.pid, hostname: os.hostname() }));
    const unlink = fs.unlinkSync;
    fs.unlinkSync = function (filename) {
      const result = unlink.apply(this, arguments);
      if (filename === path.join(control, 'lock', originalName)) {
        // POSIX rename replaces an empty directory. Windows requires removing it.
        if (process.platform === 'win32') fs.rmdirSync(path.join(control, 'lock'));
        fs.renameSync(candidate, path.join(control, 'lock'));
      }
      return result;
    };
    try { release(); } finally { fs.unlinkSync = unlink; }
    assert.deepEqual(fs.readdirSync(path.join(control, 'lock')), [replacement]);
  });

  it('fails closed for foreign, ambiguous live-PID, and malformed ownership', async (t) => {
    for (const ownerKind of ['foreign', 'ambiguous', 'malformed']) {
      const base = workspace(t);
      const control = privatePath(base, '');
      fs.mkdirSync(path.join(control, 'lock'), { recursive: true });
      const token = randomUUID();
      const owner = { version: 1, token, pid: process.pid, hostname: ownerKind === 'foreign' ? 'a-different-host' : os.hostname(), created: '1970-01-01' };
      const filename = path.join(control, 'lock', `owner-${token}.json`);
      fs.writeFileSync(filename, ownerKind === 'malformed' ? 'invalid-json' : JSON.stringify(owner));
      await assert.rejects(acquireStateLock(control, { timeoutMs: 5 }), { code: ownerKind === 'malformed' ? 'STATE_RECOVERY_REQUIRED' : 'STATE_BUSY' });
      assert.equal(fs.existsSync(filename), true);
    }
  });

  it('serializes simultaneous reclaimers after a killed owner', async (t) => {
    const base = workspace(t);
    await killAtBoundary(t, base, 'prepared');
    const counter = path.join(base, 'state', 'counter');
    fs.writeFileSync(counter, '0');
    await Promise.all(Array.from({ length: 6 }, () => withStateMutation(base, { operation: 'increment' }, (tx) => {
      tx.writeFile(counter, String(Number(tx.readFile(counter, 'utf8')) + 1));
    })));
    assert.equal(fs.readFileSync(counter, 'utf8'), '6');
  });

  it('uses captured external document bytes during recovery after the source disappears', async (t) => {
    const base = workspace(t);
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-external-'));
    t.after(() => fs.rmSync(externalRoot, { recursive: true, force: true }));
    const source = path.join(externalRoot, 'design.md');
    const destination = path.join(base, 'plans', 'captured.md');
    fs.writeFileSync(source, 'approved document');
    await leaveCommitted(base, (tx) => tx.copyFile(source, destination));
    fs.unlinkSync(source);
    assert.equal(await withStateRead(base, () => fs.readFileSync(destination, 'utf8')), 'approved document');
  });

  it('releases a newly acquired lock when syncing ownership fails', async (t) => {
    const base = workspace(t);
    const control = privatePath(base, '');
    const originalFsync = fs.fsyncSync;
    fs.fsyncSync = function (fd) {
      if (fs.existsSync(path.join(control, 'lock'))) throw Object.assign(new Error('sync denied'), { code: 'EIO' });
      return originalFsync.call(this, fd);
    };
    try { await assert.rejects(acquireStateLock(control), /sync denied/); }
    finally { fs.fsyncSync = originalFsync; }
    assert.equal(fs.existsSync(path.join(control, 'lock')), false);
    const release = await acquireStateLock(control);
    release();
  });

  it('supports compare-and-swap, including an expected absent file', async (t) => {
    const base = workspace(t);
    const filename = path.join(base, 'state', 'new.md');
    await withStateMutation(base, { operation: 'write' }, (tx) => {
      checkExpectedDigest(tx, filename, null);
      tx.writeFile(filename, 'first');
    });
    await assert.rejects(withStateMutation(base, { operation: 'write' }, (tx) => {
      checkExpectedDigest(tx, filename, contentDigest('old'));
      tx.writeFile(filename, 'second');
    }), { code: 'STATE_CONFLICT' });
    assert.equal(fs.readFileSync(filename, 'utf8'), 'first');
  });

  it('leaves a committed journal intact on an external-content recovery conflict', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    await leaveCommitted(base, (tx) => tx.writeFile(active, 'intended'));
    fs.writeFileSync(active, 'external edit');
    await assert.rejects(withStateRead(base, () => fs.readFileSync(active, 'utf8')), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(active, 'utf8'), 'external edit');
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), true);
  });

  it('detects corrupted intent and staged content without applying public changes', async (t) => {
    for (const corrupt of ['intent', 'stage']) {
      const base = workspace(t);
      const active = path.join(base, 'state', 'active-session.md');
      const pending = await leaveCommitted(base, (tx) => tx.writeFile(active, 'intended'));
      const filename = corrupt === 'intent' ? path.join(pending.directory, 'intent.json') : path.join(pending.directory, 'files', '0');
      fs.writeFileSync(filename, 'corrupted');
      await assert.rejects(withStateRead(base, () => 'ignored'), { code: 'STATE_RECOVERY_REQUIRED' });
      assert.equal(fs.readFileSync(active, 'utf8'), 'original\n');
    }
  });

  it('preserves native copy permissions, destination symlinks, and subsequent overlay reads', async (t) => {
    const base = workspace(t);
    const source = path.join(base, 'plans', 'design.md');
    const destination = path.join(base, 'plans', 'copy.md');
    const alias = path.join(base, 'plans', 'alias.md');
    fs.writeFileSync(destination, 'old', { mode: 0o600 });
    fs.chmodSync(source, 0o644);
    let hasAlias = false;
    try { fs.symlinkSync(destination, alias); hasAlias = true; }
    catch (error) { if (process.platform !== 'win32' || error.code !== 'EPERM') throw error; }
    const priorUmask = process.umask(0o077);
    try {
      await withStateMutation(base, { operation: 'copy' }, (tx) => {
        tx.copyFile(source, hasAlias ? alias : destination);
        assert.equal(tx.readFile(destination, 'utf8'), 'design\n');
        if (hasAlias) assert.equal(tx.readFile(alias, 'utf8'), 'design\n');
      });
    } finally { process.umask(priorUmask); }
    assert.equal(fs.readFileSync(destination, 'utf8'), 'design\n');
    if (process.platform !== 'win32') assert.equal(fs.statSync(destination).mode & 0o777, 0o644);
    if (hasAlias) assert.equal(fs.lstatSync(alias).isSymbolicLink(), true);
  });

  it('releases ownership despite staging cleanup failure and does not turn a committed result into an error', async (t) => {
    const base = workspace(t);
    const originalRm = fs.rmSync;
    fs.rmSync = function (filename, options) {
      if (String(filename).startsWith(privatePath(base, 'transactions'))) throw Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
      return originalRm.call(this, filename, options);
    };
    try {
      await assert.rejects(withStateMutation(base, { operation: 'validation' }, () => { throw new Error('invalid input'); }), /invalid input/);
      assert.equal(fs.existsSync(privatePath(base, 'lock')), false);
      assert.equal(await withStateMutation(base, { operation: 'success' }, (tx) => {
        tx.writeFile(path.join(base, 'state', 'active-session.md'), 'committed');
        return 'success';
      }), 'success');
      assert.equal(fs.existsSync(privatePath(base, 'lock')), false);
      assert.equal(fs.existsSync(privatePath(base, 'current.json')), false);
    } finally { fs.rmSync = originalRm; }
  });

  it('retains committed staging on an application failure and finishes after the fault is removed', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    const rename = fs.renameSync;
    fs.renameSync = function (source, destination) {
      if (destination === active) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return rename.apply(this, arguments);
    };
    try {
      await assert.rejects(withStateMutation(base, { operation: 'update' }, (tx) => tx.writeFile(active, 'committed')), { code: 'STATE_RECOVERY_REQUIRED' });
    } finally { fs.renameSync = rename; }
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), true);
    assert.equal(await withStateRead(base, () => fs.readFileSync(active, 'utf8')), 'committed');
  });

  it('preserves directory archive behavior and makes moved descendants visible only at their new path', async (t) => {
    const base = workspace(t);
    const original = path.join(base, 'plans', 'design-folder');
    const destination = path.join(base, 'plans', 'archive-folder');
    fs.mkdirSync(original);
    fs.writeFileSync(path.join(original, 'plan.md'), 'nested plan');
    await withStateMutation(base, { operation: 'archive' }, (tx) => {
      tx.writeFile(path.join(original, 'new.md'), 'new content');
      tx.rename(original, destination);
      assert.equal(tx.exists(path.join(original, 'plan.md')), false);
      assert.equal(tx.exists(path.join(destination, 'plan.md')), true);
      assert.equal(tx.readFile(path.join(destination, 'plan.md'), 'utf8'), 'nested plan');
      assert.equal(tx.readFile(path.join(destination, 'new.md'), 'utf8'), 'new content');
      assert.deepEqual(tx.readdir(destination), ['new.md', 'plan.md']);
    });
    assert.equal(fs.existsSync(original), false);
    assert.equal(fs.readFileSync(path.join(destination, 'plan.md'), 'utf8'), 'nested plan');
  });

  it('does not accept an unrelated directory as an already completed rename', async (t) => {
    const base = workspace(t);
    const source = path.join(base, 'plans', 'source');
    const destination = path.join(base, 'plans', 'destination');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'design.md'), 'approved');
    await leaveCommitted(base, (tx) => tx.rename(source, destination));
    fs.rmSync(source, { recursive: true });
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'other.md'), 'unrelated');
    await assert.rejects(withStateRead(base, () => undefined), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(path.join(destination, 'other.md'), 'utf8'), 'unrelated');
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), true);
  });

  it('never follows a private transaction-directory symlink during garbage collection', async (t) => {
    const base = workspace(t);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const preserved = path.join(outside, randomUUID());
    fs.mkdirSync(preserved);
    fs.writeFileSync(path.join(preserved, 'keep'), 'keep');
    fs.mkdirSync(privatePath(base, ''), { recursive: true });
    fs.symlinkSync(outside, privatePath(base, 'transactions'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(withStateMutation(base, { operation: 'write' }, () => assert.fail('must not run')), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(path.join(preserved, 'keep'), 'utf8'), 'keep');
  });

  it('rejects private intent symlink ancestors on recovery through a mutation', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    const pending = await leaveCommitted(base, (tx) => tx.writeFile(active, 'new'));
    const moved = pending.directory + '-outside';
    fs.renameSync(pending.directory, moved);
    fs.symlinkSync(moved, pending.directory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(withStateMutation(base, { operation: 'retry' }, () => assert.fail('must not run')), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(active, 'utf8'), 'original\n');
  });

  it('rejects invalid directory file operations before committing a journal', async (t) => {
    const base = workspace(t);
    for (const operation of ['writeFile', 'unlink']) {
      await assert.rejects(withStateMutation(base, { operation }, (tx) => tx[operation](path.join(base, 'plans'), 'invalid')), { code: 'EISDIR' });
      assert.equal(fs.existsSync(privatePath(base, 'current.json')), false);
    }
    await withStateMutation(base, { operation: 'still usable' }, (tx) => tx.writeFile(path.join(base, 'plans', 'valid'), 'valid'));
  });

  it('follows dangling copy destinations while preserving the symlink', async (t) => {
    const base = workspace(t);
    const source = path.join(base, 'plans', 'design.md');
    const destination = path.join(base, 'plans', 'new.md');
    const alias = path.join(base, 'plans', 'dangling.md');
    try { fs.symlinkSync(destination, alias); }
    catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return; throw error; }
    await withStateMutation(base, { operation: 'copy' }, (tx) => tx.copyFile(source, alias));
    assert.equal(fs.lstatSync(alias).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'design\n');
  });

  it('normalizes null owner records and inaccessible revision metadata to recovery errors', async (t) => {
    const base = workspace(t);
    const control = privatePath(base, '');
    fs.mkdirSync(path.join(control, 'lock'), { recursive: true });
    fs.writeFileSync(path.join(control, 'lock', `owner-${randomUUID()}.json`), 'null');
    await assert.rejects(acquireStateLock(control), { code: 'STATE_RECOVERY_REQUIRED' });
    fs.writeFileSync(path.join(control, 'revision'), 'previous');
    const read = fs.readFileSync;
    fs.readFileSync = function (filename) {
      if (filename === path.join(control, 'revision')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return read.apply(this, arguments);
    };
    try { await assert.rejects(withStateRead(base, () => assert.fail('must not read session')), { code: 'STATE_RECOVERY_REQUIRED' }); }
    finally { fs.readFileSync = read; }
  });

  it('returns a stable optimistic snapshot and retries across a concurrent commit', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    let reads = 0;
    const value = await withStateRead(base, async () => {
      const result = fs.readFileSync(active, 'utf8');
      if (reads++ === 0) await withStateMutation(base, { operation: 'update' }, (tx) => tx.writeFile(active, 'new'));
      return result;
    });
    assert.equal(value, 'new');
    assert.equal(reads, 2);
  });

  it('does not create metadata just to read an absent state directory', async (t) => {
    const base = workspace(t);
    const absent = path.join(base, 'absent');
    assert.equal(await withStateRead(absent, () => false), false);
    assert.equal(fs.existsSync(absent), false);
  });

  it('rejects private metadata and paths outside the managed root', (t) => {
    const base = workspace(t);
    assert.throws(() => assertPublicStatePath(base, privatePath(base, 'revision')), { code: 'STATE_INTERNAL_PATH' });
    assert.throws(() => assertPublicStatePath(base, path.join(base, '..', 'escape')), { code: 'STATE_PATH_OUTSIDE' });
  });
});

describe('state process crash recovery', () => {
  for (const boundary of ['prepared', 'checkpoint-0', 'before-public-rename', 'applied-write', 'checkpoint-1', 'applied-state-directory', 'checkpoint-2', 'applied-session-rename', 'checkpoint-3', 'applied-plan-directory', 'checkpoint-4', 'applied-document-rename', 'checkpoint-5', 'applied-gate-removal', 'checkpoint-6', 'revision', 'journal-removal', 'owner-removal']) {
    it(`recovers a worker killed at ${boundary}`, async (t) => {
      const base = workspace(t);
      await killAtBoundary(t, base, boundary);
      await withStateRead(base, () => undefined);
      if (boundary === 'prepared') {
        assert.equal(fs.readFileSync(path.join(base, 'state', 'active-session.md'), 'utf8'), 'original\n');
        assert.equal(fs.readFileSync(path.join(base, 'plans', 'design.md'), 'utf8'), 'design\n');
      } else {
        assertArchived(base);
      }
      // Next writer can reclaim dead/empty owner state, including after journal cleanup.
      await withStateMutation(base, { operation: 'next' }, (tx) => tx.writeFile(path.join(base, 'state', 'next'), 'ready'));
      assert.equal(fs.readFileSync(path.join(base, 'state', 'next'), 'utf8'), 'ready');
    });
  }
});
