'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { withStateMutation, withStateRead } = require('../../src/state/coordinator');
const { acquireStateLock } = require('../../src/state/state-lock');
const { contentDigest, checkExpectedDigest, assertPublicStatePath } = require('../../src/state/transaction');
const { killAtMarker } = require('../support/process');
const { DIR_LINK, leaveCommitted, symlinkOrSkip } = require('../support/state');

// Commits the way withStateMutation does: under the state lock, recording a result.
const COMMIT_OPTIONS = { operation: 'test_operation', result: { success: true }, lock: true };

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

function killAtBoundary(t, base, boundary) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'support', 'state-transaction-worker.js'), base, boundary], { stdio: ['ignore', 'pipe', 'pipe'] });
  return killAtMarker(t, child, `paused:${boundary}\n`);
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
      await assert.rejects(withStateMutation(base, { operation: 'blocked' }, () => assert.fail('must not run'), { timeoutMs: 25 }), {
        code: 'STATE_BUSY', message: 'Session state is busy; retry after the active operation completes.', details: { retryable: true, timeout_ms: 25 },
      });
      assert.equal(fs.readdirSync(privatePath(base, 'lock')).length, 1);
    } finally { release(); }
  });

  it('reports unstable reads as busy and wraps unexpected journal access failures', async (t) => {
    const base = workspace(t);
    const control = privatePath(base, '');
    fs.mkdirSync(control);
    // Every read publishes a new revision, so no snapshot is ever stable.
    let reads = 0;
    await assert.rejects(withStateRead(base, () => fs.writeFileSync(path.join(control, 'revision'), String(++reads)), { timeoutMs: 20 }), {
      code: 'STATE_BUSY', message: 'Session state is busy; retry after the active operation completes.', details: { retryable: true, timeout_ms: 20 },
    });
    const lstat = fs.lstatSync;
    fs.lstatSync = function (filename) {
      if (filename === path.join(control, 'current.json')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return lstat.apply(this, arguments);
    };
    try {
      await assert.rejects(withStateRead(base, () => assert.fail('must not read')), {
        code: 'STATE_RECOVERY_REQUIRED', message: 'State coordination metadata could not be accessed: permission denied', details: {},
      });
    } finally { fs.lstatSync = lstat; }
  });

  it('retries acquisition when a contending owner disappears before a Windows rename error is inspected', async (t) => {
    const base = workspace(t);
    const control = privatePath(base, '');
    const lockPath = path.join(control, 'lock');
    const releaseOwner = await acquireStateLock(control);
    const rename = fs.renameSync;
    let attempts = 0;
    let mutations = 0;
    fs.renameSync = function (source, destination) {
      if (destination === lockPath && ++attempts === 1) {
        assert.equal(fs.existsSync(lockPath), true);
        releaseOwner();
        throw Object.assign(new Error('owner released after blocked rename'), { code: 'EPERM' });
      }
      return rename.apply(this, arguments);
    };
    try {
      await withStateMutation(base, { operation: 'after_release' }, (tx) => {
        mutations++;
        tx.writeFile(path.join(base, 'state', 'active-session.md'), 'updated once');
      });
    } finally { fs.renameSync = rename; releaseOwner(); }
    assert.equal(attempts, 2);
    assert.equal(mutations, 1);
    assert.equal(fs.readFileSync(path.join(base, 'state', 'active-session.md'), 'utf8'), 'updated once');
    assert.equal(fs.existsSync(lockPath), false);
  });

  it('releases without error when Windows refuses to remove the emptied lock, which the next owner reclaims', async (t) => {
    const base = workspace(t);
    const control = privatePath(base, '');
    const lockPath = path.join(control, 'lock');
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const rmdir = fs.rmdirSync;
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    fs.rmdirSync = function (directory) {
      if (directory === lockPath) throw Object.assign(new Error('lock directory in use'), { code: 'EPERM' });
      return rmdir.apply(this, arguments);
    };
    try { (await acquireStateLock(control))(); }
    finally { fs.rmdirSync = rmdir; Object.defineProperty(process, 'platform', platform); }
    assert.deepEqual(fs.readdirSync(lockPath), []);
    (await acquireStateLock(control))();
    assert.equal(fs.existsSync(lockPath), false);
  });

  it('bounds no-owner permission retries, yields between attempts, and preserves the permission failure', async (t) => {
    for (const code of ['EPERM', 'EACCES']) {
      const base = workspace(t);
      const control = privatePath(base, '');
      const lockPath = path.join(control, 'lock');
      const rename = fs.renameSync;
      const now = Date.now;
      let clock = now();
      let attempts = 0;
      let yielded = false;
      const timer = setTimeout(() => { yielded = true; }, 0);
      Date.now = () => clock;
      fs.renameSync = function (source, destination) {
        if (destination === lockPath) {
          if (++attempts === 2) clock += 100;
          throw Object.assign(new Error(`persistent rename permission failure: ${code}`), { code });
        }
        return rename.apply(this, arguments);
      };
      try {
        await assert.rejects(acquireStateLock(control, { timeoutMs: 100 }), (error) => {
          assert.equal(error.code, 'STATE_RECOVERY_REQUIRED');
          assert.match(error.message, new RegExp(`persistent rename permission failure: ${code}`));
          return true;
        });
      } finally {
        fs.renameSync = rename;
        Date.now = now;
        clearTimeout(timer);
      }
      assert.equal(attempts, 2);
      assert.equal(yielded, true);
      assert.equal(fs.existsSync(lockPath), false);
      assert.deepEqual(fs.readdirSync(path.join(control, 'candidates')), []);
      const release = await acquireStateLock(control, { timeoutMs: 0 });
      release();
    }
  });

  it('recovers before mutation and asks the caller to inspect state without executing its callback', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    await leaveCommitted(base, (tx) => tx.writeFile(active, 'recovered'), COMMIT_OPTIONS);
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
    await leaveCommitted(base, (tx) => tx.copyFile(source, destination), COMMIT_OPTIONS);
    fs.unlinkSync(source);
    assert.equal(await withStateRead(base, () => fs.readFileSync(destination, 'utf8')), 'approved document');
  });

  it('does not let cleanup of a consumed candidate strand the acquired lock', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    const candidates = privatePath(base, 'candidates');
    const originalRm = fs.rmSync;
    fs.rmSync = function (filename, options) {
      if (path.dirname(String(filename)) === candidates) {
        throw Object.assign(new Error('candidate cleanup denied'), { code: 'EACCES' });
      }
      return originalRm.call(this, filename, options);
    };
    try {
      assert.equal(await withStateMutation(base, { operation: 'update' }, (tx) => {
        tx.writeFile(active, 'committed');
        return 'success';
      }), 'success');
    } finally { fs.rmSync = originalRm; }
    assert.equal(fs.readFileSync(active, 'utf8'), 'committed');
    assert.equal(fs.existsSync(privatePath(base, 'lock')), false);
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), false);
    assert.deepEqual(fs.readdirSync(candidates), []);
    await withStateMutation(base, { operation: 'next' }, (tx) => tx.writeFile(active, 'next'), { timeoutMs: 0 });
    assert.equal(fs.readFileSync(active, 'utf8'), 'next');
  });

  it('releases a newly acquired lock when syncing ownership fails', async (t) => {
    const codes = process.platform === 'win32' ? ['EIO', 'EACCES'] : ['EIO', 'EPERM', 'EACCES'];
    for (const code of codes) {
      const base = workspace(t);
      const control = privatePath(base, '');
      const originalFsync = fs.fsyncSync;
      let failures = 0;
      fs.fsyncSync = function (fd) {
        if (fs.existsSync(path.join(control, 'lock'))) {
          failures++;
          throw Object.assign(new Error('sync denied'), { code });
        }
        return originalFsync.call(this, fd);
      };
      try { await assert.rejects(acquireStateLock(control), /sync denied/); }
      finally { fs.fsyncSync = originalFsync; }
      assert.equal(failures, 1);
      assert.equal(fs.existsSync(path.join(control, 'lock')), false);
      const release = await acquireStateLock(control);
      release();
    }
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
    await leaveCommitted(base, (tx) => tx.writeFile(active, 'intended'), COMMIT_OPTIONS);
    fs.writeFileSync(active, 'external edit');
    await assert.rejects(withStateRead(base, () => fs.readFileSync(active, 'utf8')), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(active, 'utf8'), 'external edit');
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), true);
  });

  it('detects corrupted intent and staged content without applying public changes', async (t) => {
    for (const corrupt of ['intent', 'stage']) {
      const base = workspace(t);
      const active = path.join(base, 'state', 'active-session.md');
      const pending = await leaveCommitted(base, (tx) => tx.writeFile(active, 'intended'), COMMIT_OPTIONS);
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
    await leaveCommitted(base, (tx) => tx.rename(source, destination), COMMIT_OPTIONS);
    fs.rmSync(source, { recursive: true });
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'other.md'), 'unrelated');
    await assert.rejects(withStateRead(base, () => undefined), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(path.join(destination, 'other.md'), 'utf8'), 'unrelated');
    assert.equal(fs.existsSync(privatePath(base, 'current.json')), true);
  });

  it('renames and removes managed symlink entries without changing their external referents', async (t) => {
    const base = workspace(t);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-symlink-referent-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const referent = path.join(outside, 'keep.md');
    fs.writeFileSync(referent, 'preserved');
    const source = path.join(base, 'plans', 'source-link.md');
    const destination = path.join(base, 'plans', 'destination-link.md');
    if (!symlinkOrSkip(t, referent, source)) return;
    fs.symlinkSync(referent, destination);
    await withStateMutation(base, { operation: 'move_link' }, (tx) => tx.rename(source, destination));
    assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
    assert.equal(fs.existsSync(source), false);
    await withStateMutation(base, { operation: 'remove_link' }, (tx) => tx.unlink(destination));
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.readFileSync(referent, 'utf8'), 'preserved');
  });

  it('checks moved relative symlink existence against the staged referent at its new location', async (t) => {
    const base = workspace(t);
    const source = path.join(base, 'plans', 'source.md');
    const destination = path.join(base, 'plans', 'nested', 'source.md');
    fs.mkdirSync(path.dirname(destination));
    if (!symlinkOrSkip(t, path.join('..', 'state', 'active-session.md'), source)) return;
    await withStateMutation(base, { operation: 'move_link' }, (tx) => {
      assert.equal(tx.exists(source), true);
      tx.rename(source, destination);
      assert.equal(tx.exists(destination), false);
      const referent = path.join(base, 'plans', 'state', 'active-session.md');
      tx.writeFile(referent, 'staged referent');
      assert.equal(tx.exists(destination), true);
      tx.unlink(referent);
      assert.equal(tx.exists(destination), false);
    });
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
  });

  it('still rejects rename and unlink paths through external or private parent aliases', async (t) => {
    const base = workspace(t);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-symlink-parent-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const externalAlias = path.join(base, 'plans', 'external');
    const privateAlias = path.join(base, 'plans', 'private');
    fs.symlinkSync(outside, externalAlias, DIR_LINK);
    fs.symlinkSync(privatePath(base, ''), privateAlias, DIR_LINK);
    for (const [alias, code] of [[externalAlias, 'STATE_PATH_OUTSIDE'], [privateAlias, 'STATE_INTERNAL_PATH']]) {
      for (const operation of ['rename', 'unlink']) {
        await assert.rejects(withStateMutation(base, { operation }, (tx) => {
          if (operation === 'rename') tx.rename(path.join(alias, 'file.md'), path.join(base, 'plans', 'moved.md'));
          else tx.unlink(path.join(alias, 'file.md'));
        }), { code });
      }
    }
  });

  it('never follows a private transaction-directory symlink during garbage collection', async (t) => {
    const base = workspace(t);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const preserved = path.join(outside, randomUUID());
    fs.mkdirSync(preserved);
    fs.writeFileSync(path.join(preserved, 'keep'), 'keep');
    fs.mkdirSync(privatePath(base, ''), { recursive: true });
    fs.symlinkSync(outside, privatePath(base, 'transactions'), DIR_LINK);
    await assert.rejects(withStateMutation(base, { operation: 'write' }, () => assert.fail('must not run')), { code: 'STATE_RECOVERY_REQUIRED' });
    assert.equal(fs.readFileSync(path.join(preserved, 'keep'), 'utf8'), 'keep');
  });

  it('rejects private intent symlink ancestors on recovery through a mutation', async (t) => {
    const base = workspace(t);
    const active = path.join(base, 'state', 'active-session.md');
    const pending = await leaveCommitted(base, (tx) => tx.writeFile(active, 'new'), COMMIT_OPTIONS);
    const moved = pending.directory + '-outside';
    fs.renameSync(pending.directory, moved);
    fs.symlinkSync(moved, pending.directory, DIR_LINK);
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
    if (!symlinkOrSkip(t, destination, alias)) return;
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

  it('fails closed for a null recovery journal instead of treating it as absent', async (t) => {
    const base = workspace(t);
    fs.mkdirSync(privatePath(base, ''), { recursive: true });
    fs.writeFileSync(privatePath(base, 'current.json'), 'null');
    await assert.rejects(withStateRead(base, () => assert.fail('must not read session')), {
      code: 'STATE_RECOVERY_REQUIRED', message: 'The state recovery journal has an unsupported or invalid format.',
    });
    assert.equal(fs.readFileSync(privatePath(base, 'current.json'), 'utf8'), 'null');
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
