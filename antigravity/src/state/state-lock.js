'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { StateError } = require('../lib/errors');

const OWNER_PATTERN = /^owner-([a-f0-9-]{36})\.json$/;

function recoveryError(message, details = {}) {
  return new StateError(message, { code: 'STATE_RECOVERY_REQUIRED', details });
}

// State errors pass through; any other failure to reach the private metadata
// needs recovery.
function asRecoveryError(error) {
  if (error.code?.startsWith('STATE_')) return error;
  return recoveryError(`State coordination metadata could not be accessed: ${error.message}`);
}

function busyError(timeoutMs) {
  return new StateError('Session state is busy; retry after the active operation completes.', {
    code: 'STATE_BUSY', details: { retryable: true, timeout_ms: timeoutMs },
  });
}

// Wait one polling interval, at most 50ms and never past the deadline.
function pollDelay(deadline) {
  return new Promise((resolve) => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))));
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

// Windows briefly refuses rmdir while another process holds or deletes the directory. An empty
// lock is never owned, so leaving it is safe: the next acquirer reclaims it.
function removeDirIfEmpty(directory) {
  try { fs.rmdirSync(directory); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EBUSY'].includes(error.code)) return;
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  }
}

function removeOwnedLock(lockPath, ownerName) {
  try { fs.unlinkSync(path.join(lockPath, ownerName)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  // Another owner may replace an empty directory between unlink and rmdir.
  // Its unique owner file makes rmdir fail; never recursively delete lockPath.
  removeDirIfEmpty(lockPath);
}

function reclaimDeadLock(lockPath) {
  let names;
  try {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw recoveryError('State lock must be a directory, not a symbolic link.');
    names = fs.readdirSync(lockPath);
  }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (names.length === 0) return removeDirIfEmpty(lockPath);
  if (names.length !== 1 || !OWNER_PATTERN.test(names[0])) {
    throw recoveryError('State lock ownership is malformed; inspect the private state lock before retrying.');
  }
  const owner = readPrivateJson(path.join(lockPath, names[0]),
    'State lock ownership is unreadable; inspect the private state lock before retrying.');
  if (owner === undefined) return;
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

// Returns undefined for an absent file, a value JSON.parse never produces.
function readPrivateJson(filename, message) {
  try {
    assertPrivateMetadata(filename, 'file');
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  }
  catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw recoveryError(message);
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
    // Any candidate that cannot be read or removed is skipped.
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(candidate, `owner-${entry.name}.json`), 'utf8'));
      if (owner.token === entry.name && ownerIsDead(owner)) fs.rmSync(candidate, { recursive: true, force: true });
    } catch {}
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
  let candidateMoved = false;
  try {
    fs.mkdirSync(candidate, { mode: 0o700 });
    durableWrite(path.join(candidate, ownerName), JSON.stringify({
      version: 1, token, pid: process.pid, hostname: os.hostname(), created: new Date().toISOString(),
    }));
    for (;;) {
      try {
        fs.renameSync(candidate, lockPath);
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        // The previous owner can release between a failed rename and this check.
        reclaimDeadLock(lockPath);
        if (Date.now() >= deadline) {
          if (['EPERM', 'EACCES'].includes(error.code) && !fs.existsSync(lockPath)) throw error;
          throw busyError(timeoutMs);
        }
        await pollDelay(deadline);
        continue;
      }
      candidateMoved = true;
      try { syncDirectory(controlPath); }
      catch (error) { removeOwnedLock(lockPath, ownerName); throw error; }
      let released = false;
      return () => {
        if (!released) {
          removeOwnedLock(lockPath, ownerName);
          released = true;
        }
      };
    }
  } finally {
    // A successful rename consumed the candidate. Its cleanup must not prevent
    // returning the release callback for the lock we now own.
    if (!candidateMoved) fs.rmSync(candidate, { recursive: true, force: true });
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
  catch (error) { throw asRecoveryError(error); }
}

module.exports = {
  assertPrivateMetadata, ensurePrivateDirectory, readPrivateJson, acquireStateLock, durableWrite, syncDirectory,
  recoveryError, asRecoveryError, busyError, pollDelay,
};
