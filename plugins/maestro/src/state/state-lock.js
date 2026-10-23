'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { StateError } = require('../lib/errors');

const OWNER_PATTERN = /^owner-([a-f0-9-]{36})\.json$/;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function recoveryError(message, details = {}) {
  return new StateError(message, { code: 'STATE_RECOVERY_REQUIRED', details });
}

function syncDirectory(directory) {
  let fd;
  try {
    fd = fs.openSync(directory, 'r');
    fs.fsyncSync(fd);
  } catch (error) {
    // Windows does not support opening directories for fsync through Node.
    if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EINVAL', 'EBADF'].includes(error.code)) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function durableWrite(filename, content, mode = 0o600, exactMode = false, temporaryPath) {
  const temporary = temporaryPath || `${filename}.tmp.${randomUUID()}`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(fd, content);
    if (exactMode && process.platform !== 'win32') fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, filename);
    syncDirectory(path.dirname(filename));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function ownerIsDead(owner) {
  if (!owner || owner.version !== 1 || owner.hostname !== os.hostname() ||
      !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

function removeOwnedLock(lockPath, ownerName) {
  try { fs.unlinkSync(path.join(lockPath, ownerName)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  // Another owner may replace an empty directory between unlink and rmdir.
  // Its unique owner file makes rmdir fail; never recursively delete lockPath.
  try { fs.rmdirSync(lockPath); }
  catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
}

function reclaimDeadLock(lockPath) {
  let names;
  try {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw recoveryError('State lock must be a directory, not a symbolic link.');
    names = fs.readdirSync(lockPath);
  }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (names.length === 0) {
    try { fs.rmdirSync(lockPath); }
    catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
    return;
  }
  if (names.length !== 1 || !OWNER_PATTERN.test(names[0])) {
    throw recoveryError('State lock ownership is malformed; inspect the private state lock before retrying.');
  }
  let owner;
  try {
    assertPrivateMetadata(path.join(lockPath, names[0]), 'file');
    owner = JSON.parse(fs.readFileSync(path.join(lockPath, names[0]), 'utf8'));
  }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw recoveryError('State lock ownership is unreadable; inspect the private state lock before retrying.');
  }
  if (!owner || typeof owner !== 'object' || owner.token !== names[0].slice(6, -5)) {
    throw recoveryError('State lock ownership token does not match its filename.');
  }
  if (ownerIsDead(owner)) removeOwnedLock(lockPath, names[0]);
}

function assertPrivateMetadata(filename, kind) {
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())) {
    throw recoveryError(`Private state ${kind} metadata must not be a symbolic link or another file type.`);
  }
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertPrivateMetadata(directory, 'directory');
}

function cleanupDeadCandidates(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    const candidate = path.join(directory, entry.name);
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(candidate, `owner-${entry.name}.json`), 'utf8'));
      if (owner.token === entry.name && ownerIsDead(owner)) fs.rmSync(candidate, { recursive: true, force: true });
    } catch (error) { if (error.code !== 'ENOENT') continue; }
  }
}

async function acquireStateLockInternal(controlPath, { timeoutMs = 5000 } = {}) {
  ensurePrivateDirectory(controlPath);
  ensurePrivateDirectory(path.join(controlPath, 'candidates'));
  cleanupDeadCandidates(path.join(controlPath, 'candidates'));
  syncDirectory(path.dirname(controlPath));
  syncDirectory(controlPath);
  const token = randomUUID();
  const candidate = path.join(controlPath, 'candidates', token);
  const lockPath = path.join(controlPath, 'lock');
  const ownerName = `owner-${token}.json`;
  const deadline = Date.now() + timeoutMs;
  try {
    fs.mkdirSync(candidate, { mode: 0o700 });
    durableWrite(path.join(candidate, ownerName), JSON.stringify({
      version: 1, token, pid: process.pid, hostname: os.hostname(), created: new Date().toISOString(),
    }));
    for (;;) {
      try {
        fs.renameSync(candidate, lockPath);
        try { syncDirectory(controlPath); }
        catch (error) { removeOwnedLock(lockPath, ownerName); throw error; }
        let released = false;
        return () => {
          if (!released) {
            removeOwnedLock(lockPath, ownerName);
            released = true;
          }
        };
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        if (!fs.existsSync(lockPath)) throw error;
      }
      reclaimDeadLock(lockPath);
      if (!fs.existsSync(lockPath)) continue;
      if (Date.now() >= deadline) {
        throw new StateError('Session state is busy; retry after the active operation completes.', {
          code: 'STATE_BUSY', details: { retryable: true, timeout_ms: timeoutMs },
        });
      }
      await sleep(Math.min(50, Math.max(1, deadline - Date.now())));
    }
  } finally {
    fs.rmSync(candidate, { recursive: true, force: true });
  }
}

async function acquireStateLock(controlPath, options) {
  try {
    const release = await acquireStateLockInternal(controlPath, options);
    return () => {
      try { release(); }
      catch (error) { throw recoveryError(`State lock ownership could not be released: ${error.message}`); }
    };
  }
  catch (error) {
    if (error.code?.startsWith('STATE_')) throw error;
    throw recoveryError(`State coordination metadata could not be accessed: ${error.message}`);
  }
}

module.exports = { assertPrivateMetadata, ensurePrivateDirectory, acquireStateLock, durableWrite, syncDirectory, recoveryError, sleep };
