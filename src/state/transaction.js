'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { ValidationError, StateError } = require('../lib/errors');
const { resolvePhysicalPath } = require('./paths');
const { durableWrite, syncDirectory, recoveryError, ensurePrivateDirectory, assertPrivateMetadata } = require('./state-lock');

function contentDigest(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isWithin(root, filename) {
  const relative = path.relative(root, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertPublicStatePath(basePath, filename) {
  const base = resolvePhysicalPath(basePath);
  const physical = resolvePhysicalPath(filename);
  const control = path.join(base, 'state', '.maestro');
  if (isWithin(control, physical)) {
    throw new ValidationError('The private Maestro state directory cannot be accessed as a state document.', { code: 'STATE_INTERNAL_PATH' });
  }
  if (!isWithin(base, physical)) {
    throw new ValidationError('State transaction paths must remain inside the configured state directory.', { code: 'STATE_PATH_OUTSIDE' });
  }
  // Resolve parent aliases, preserving a leaf symlink for rename/unlink semantics.
  return path.join(resolvePhysicalPath(path.dirname(filename)), path.basename(filename));
}

function fingerprint(filename, deepDirectories = false) {
  let stat;
  try { stat = fs.lstatSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (stat.isSymbolicLink()) return { kind: 'symlink', target: fs.readlinkSync(filename) };
  if (stat.isDirectory()) return deepDirectories
    ? { kind: 'directory', entries: fs.readdirSync(filename).sort().map((name) => [name, fingerprint(path.join(filename, name), true)]) }
    : { kind: 'directory' };
  if (!stat.isFile()) throw recoveryError('State transactions support regular files, directories, and symbolic links only.');
  return { kind: 'file', sha256: contentDigest(fs.readFileSync(filename)), mode: stat.mode & 0o777 };
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function missing(filename) {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${filename}'`), { code: 'ENOENT', path: filename });
}

function createTransaction(basePath, controlPath) {
  const id = randomUUID();
  const root = resolvePhysicalPath(basePath);
  const directory = path.join(controlPath, 'transactions', id);
  ensurePrivateDirectory(path.join(controlPath, 'transactions'));
  ensurePrivateDirectory(path.join(directory, 'files'));
  syncDirectory(path.join(controlPath, 'transactions'));
  syncDirectory(controlPath);
  const operations = [];
  const overlay = new Map();
  const directoryMoves = [];
  const target = (filename) => assertPublicStatePath(root, path.resolve(filename));
  const relative = (filename) => path.relative(root, filename).split(path.sep).join('/');
  function physicalView(filename) {
    let current = filename;
    for (let index = directoryMoves.length - 1; index >= 0; index--) {
      const { from, to } = directoryMoves[index];
      if (isWithin(to, current)) current = path.join(from, path.relative(to, current));
      else if (isWithin(from, current)) return null;
    }
    return current;
  }
  function image(filename) {
    if (overlay.has(filename)) return overlay.get(filename).image;
    const source = physicalView(filename);
    return source === null ? null : fingerprint(source);
  }
  function treeImage(filename) {
    const current = image(filename);
    return current?.kind === 'directory'
      ? { kind: 'directory', entries: tx.readdir(filename).map((name) => [name, treeImage(path.join(filename, name))]) }
      : current;
  }
  const tx = {
    basePath: path.resolve(basePath),
    exists(filename) {
      const normalized = path.join(resolvePhysicalPath(path.dirname(filename)), path.basename(filename));
      if (overlay.has(normalized)) return overlay.get(normalized).image !== null;
      const physical = resolvePhysicalPath(filename);
      if (overlay.has(physical)) return overlay.get(physical).image !== null;
      const source = physicalView(normalized);
      return source !== null && fs.existsSync(source);
    },
    readFile(filename, encoding = null) {
      const normalized = path.join(resolvePhysicalPath(path.dirname(filename)), path.basename(filename));
      const entry = overlay.get(normalized) || overlay.get(resolvePhysicalPath(filename));
      if (entry && !entry.image) throw missing(filename);
      const source = entry?.source || physicalView(normalized);
      if (source === null) throw missing(filename);
      const content = entry && entry.data !== undefined ? entry.data : fs.readFileSync(source);
      return encoding ? content.toString(encoding) : Buffer.from(content);
    },
    readdir(filename) {
      const normalized = target(filename);
      const names = new Set();
      const source = physicalView(normalized);
      if (source && fs.existsSync(source)) for (const name of fs.readdirSync(source)) names.add(name);
      for (const [entry, value] of overlay) {
        if (path.dirname(entry) === normalized) {
          if (value.image) names.add(path.basename(entry));
          else names.delete(path.basename(entry));
        }
      }
      return [...names].sort();
    },
    mkdir(filename, options = {}) {
      const normalized = target(filename);
      const before = image(normalized);
      if (before) {
        if (before.kind !== 'directory') throw Object.assign(new Error(`EEXIST: file already exists, mkdir '${filename}'`), { code: 'EEXIST' });
        return;
      }
      const parent = path.dirname(normalized);
      if (parent !== root && !image(parent)) {
        if (options.recursive === false) throw missing(parent);
        tx.mkdir(parent, options);
      }
      const mode = options.mode === undefined ? (0o777 & ~process.umask()) : options.mode;
      operations.push({ type: 'mkdir', path: relative(normalized), before: null, after: { kind: 'directory' }, mode });
      overlay.set(normalized, { image: { kind: 'directory' } });
    },
    writeFile(filename, content, options = {}) {
      const normalized = target(filename);
      const before = image(normalized);
      if (before?.kind === 'directory') throw Object.assign(new Error('Cannot write file contents to a directory'), { code: 'EISDIR' });
      tx.mkdir(path.dirname(normalized), { recursive: true, mode: 0o700 });
      const data = Buffer.from(content);
      const mode = options.mode === undefined ? 0o600 : options.mode;
      const after = { kind: 'file', sha256: contentDigest(data), mode: process.platform === 'win32' ? (mode & 0o200 ? 0o666 : 0o444) : (options.exactMode ? mode : mode & ~process.umask()) };
      const stage = String(operations.length);
      durableWrite(path.join(directory, 'files', stage), data);
      operations.push({ type: 'write', path: relative(normalized), before, after, stage });
      overlay.set(normalized, { image: after, data });
    },
    copyFile(source, destination) {
      // copyFile follows a destination symlink and preserves source permissions;
      // ordinary atomic writes replace the leaf symlink and apply the umask.
      const normalized = target(resolvePhysicalPath(destination));
      const normalizedSource = path.join(resolvePhysicalPath(path.dirname(source)), path.basename(source));
      const sourceEntry = overlay.get(normalizedSource) || overlay.get(resolvePhysicalPath(source));
      const sourceMode = sourceEntry?.image?.mode ?? (fs.statSync(sourceEntry?.source || physicalView(normalizedSource) || source).mode & 0o777);
      tx.writeFile(normalized, tx.readFile(source), { mode: sourceMode, exactMode: true });
    },
    rename(source, destination) {
      const from = target(source);
      const to = target(destination);
      const beforeSource = image(from);
      if (!beforeSource) throw missing(source);
      if (from === to) return;
      if (!image(path.dirname(to))) throw missing(path.dirname(to));
      const beforeTarget = treeImage(to);
      if (beforeSource.kind === 'directory') {
        if (isWithin(from, to)) throw Object.assign(new Error('Cannot rename a directory into itself'), { code: 'EINVAL' });
        if (beforeTarget && (beforeTarget.kind !== 'directory' || tx.readdir(to).length)) {
          throw Object.assign(new Error('Directory rename destination is not an empty directory'), { code: 'ENOTEMPTY' });
        }
      } else if (beforeTarget?.kind === 'directory') {
        throw Object.assign(new Error('Cannot replace a directory with a file'), { code: 'EISDIR' });
      }
      const entry = overlay.get(from) || { image: beforeSource, source: physicalView(from) };
      const renameImage = treeImage(from);
      operations.push({ type: 'rename', path: relative(from), to: relative(to), before: renameImage, beforeTarget, after: renameImage });
      if (beforeSource.kind === 'directory') {
        const descendants = [...overlay].filter(([filename]) => filename !== from && isWithin(from, filename));
        for (const [filename, value] of descendants) {
          overlay.set(path.join(to, path.relative(from, filename)), value);
          overlay.set(filename, { image: null });
        }
        directoryMoves.push({ from, to });
      }
      overlay.set(to, entry);
      overlay.set(from, { image: null });
    },
    unlink(filename) {
      const normalized = target(filename);
      const before = image(normalized);
      if (!before) throw missing(filename);
      if (before.kind === 'directory') throw Object.assign(new Error('Cannot unlink a directory as a state file'), { code: 'EISDIR' });
      operations.push({ type: 'unlink', path: relative(normalized), before, after: null });
      overlay.set(normalized, { image: null });
    },
  };
  return { id, directory, operations, tx };
}

function checkExpectedDigest(tx, filename, expected) {
  const actual = tx.exists(filename) ? contentDigest(tx.readFile(filename)) : null;
  if (actual !== expected) {
    throw new StateError('State content changed since it was read; read the latest content before retrying.', {
      code: 'STATE_CONFLICT', details: { expected_sha256: expected, actual_sha256: actual },
    });
  }
}

function journalPath(controlPath) { return path.join(controlPath, 'current.json'); }

function publishTransaction(transaction, controlPath, metadata, result) {
  const intent = { version: 1, id: transaction.id, operation: metadata.operation, sessionId: metadata.sessionId || null, operations: transaction.operations, result };
  const bytes = JSON.stringify(intent);
  durableWrite(path.join(transaction.directory, 'intent.json'), bytes);
  durableWrite(journalPath(controlPath), JSON.stringify({ version: 1, id: transaction.id, intentSha256: contentDigest(bytes), cursor: 0 }));
}

function readJournal(controlPath) {
  let current;
  try {
    assertPrivateMetadata(journalPath(controlPath), 'file');
    current = JSON.parse(fs.readFileSync(journalPath(controlPath), 'utf8'));
  }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw recoveryError('The state recovery journal cannot be read.');
  }
  if (!current || current.version !== 1 || !/^[a-f0-9-]{36}$/.test(current.id) || !Number.isInteger(current.cursor) || current.cursor < 0) {
    throw recoveryError('The state recovery journal has an unsupported or invalid format.');
  }
  const directory = path.join(controlPath, 'transactions', current.id);
  let bytes;
  try {
    assertPrivateMetadata(path.join(controlPath, 'transactions'), 'directory');
    assertPrivateMetadata(directory, 'directory');
    assertPrivateMetadata(path.join(directory, 'files'), 'directory');
    assertPrivateMetadata(path.join(directory, 'intent.json'), 'file');
    bytes = fs.readFileSync(path.join(directory, 'intent.json'));
  }
  catch { throw recoveryError('The committed state recovery intent is missing.', { transaction_id: current.id }); }
  if (contentDigest(bytes) !== current.intentSha256) throw recoveryError('The state recovery intent checksum does not match.', { transaction_id: current.id });
  let intent;
  try { intent = JSON.parse(bytes); }
  catch { throw recoveryError('The state recovery intent is invalid JSON.', { transaction_id: current.id }); }
  if (!intent || intent.version !== 1 || intent.id !== current.id || !Array.isArray(intent.operations) || current.cursor > intent.operations.length) {
    throw recoveryError('The state recovery intent has an unsupported or invalid format.', { transaction_id: current.id });
  }
  return { current, intent, directory };
}

function applyOperation(root, directory, operation) {
  if (!['mkdir', 'write', 'rename', 'unlink'].includes(operation.type) || typeof operation.path !== 'string' || path.isAbsolute(operation.path)) {
    throw recoveryError('The state recovery intent contains an unsupported operation.');
  }
  const filename = assertPublicStatePath(root, path.join(root, operation.path));
  const actual = fingerprint(filename, operation.type === 'rename');
  if (operation.type === 'rename') {
    if (typeof operation.to !== 'string' || path.isAbsolute(operation.to)) throw recoveryError('Invalid state rename destination.');
    const destination = assertPublicStatePath(root, path.join(root, operation.to));
    const actualTarget = fingerprint(destination, true);
    if (actual === null && same(actualTarget, operation.after)) return;
    if (!same(actual, operation.before) || !same(actualTarget, operation.beforeTarget)) throw recoveryError('A state document changed during recovery.', { path: operation.path });
    fs.renameSync(filename, destination);
    syncDirectory(path.dirname(filename));
    if (path.dirname(destination) !== path.dirname(filename)) syncDirectory(path.dirname(destination));
    return;
  }
  if (operation.type === 'write') {
    if (!/^\d+$/.test(operation.stage)) throw recoveryError('Invalid state staging filename.');
    const stagedFile = path.join(directory, 'files', operation.stage);
    assertPrivateMetadata(stagedFile, 'file');
    const staged = fs.readFileSync(stagedFile);
    if (contentDigest(staged) !== operation.after?.sha256) throw recoveryError('A staged state document checksum does not match.', { path: operation.path });
    const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.maestro-${path.basename(directory)}-${operation.stage}.tmp`);
    // The committed intent owns this unique sibling, including a partial file
    // left by a killed writer. Never prune unrelated temporary files.
    if (same(actual, operation.after)) {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return;
    }
    if (!same(actual, operation.before)) throw recoveryError('A state document changed during recovery.', { path: operation.path });
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    durableWrite(filename, staged, operation.after.mode, true, temporary);
    return;
  }
  if (same(actual, operation.after)) return;
  if (!same(actual, operation.before)) throw recoveryError('A state document changed during recovery.', { path: operation.path });
  if (operation.type === 'mkdir') fs.mkdirSync(filename, { mode: operation.mode });
  else fs.unlinkSync(filename);
  syncDirectory(path.dirname(filename));
}

function replayTransaction(root, controlPath) {
  const journal = readJournal(controlPath);
  if (!journal) return null;
  const { current, intent, directory } = journal;
  try {
    while (current.cursor < intent.operations.length) {
      applyOperation(root, directory, intent.operations[current.cursor]);
      current.cursor++;
      durableWrite(journalPath(controlPath), JSON.stringify(current));
    }
    durableWrite(path.join(controlPath, 'revision'), current.id);
    fs.unlinkSync(journalPath(controlPath));
    // All document operations and the revision are already durable. Failure to
    // persist journal removal can only replay the completed cursor after reboot.
    let removalDurable = true;
    try { syncDirectory(controlPath); } catch { removalDurable = false; }
    // Data and revision are committed. Scratch cleanup cannot turn success into
    // an uncertain failure; the next lock owner also collects abandoned staging.
    if (removalDurable) {
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
    }
    return intent;
  } catch (error) {
    throw recoveryError(`State recovery could not finish: ${error.message}`, {
      transaction_id: current.id, operation: intent.operation, cursor: current.cursor,
      ...(error.details || {}),
    });
  }
}

module.exports = {
  contentDigest, assertPublicStatePath, createTransaction,
  checkExpectedDigest, publishTransaction, replayTransaction,
};
