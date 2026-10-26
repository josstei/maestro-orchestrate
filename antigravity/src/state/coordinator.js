'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { StateError } = require('../lib/errors');
const { resolvePhysicalPath } = require('./paths');
const { acquireStateLock, asRecoveryError, busyError, pollDelay, recoveryError, assertPrivateMetadata } = require('./state-lock');
const {
  createTransaction, journalPath, publishTransaction, replayTransaction,
} = require('./transaction');

function controlDirectory(basePath) {
  try {
    const root = resolvePhysicalPath(basePath);
    const control = path.join(root, 'state', '.maestro');
    if (resolvePhysicalPath(control) !== control) throw recoveryError('The private state directory must not be a symbolic link.');
    return { root, control };
  } catch (error) {
    throw asRecoveryError(error);
  }
}

function journalExists(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw recoveryError('The state recovery journal must be a regular file.');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw asRecoveryError(error);
  }
}

function cleanupAbandonedTransactions(control) {
  const directory = path.join(control, 'transactions');
  let entries;
  try {
    assertPrivateMetadata(directory, 'directory');
    entries = fs.readdirSync(directory);
  }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw recoveryError(`State staging metadata could not be accessed: ${error.message}`);
  }
  for (const entry of entries) {
    if (/^[a-f0-9-]{36}$/.test(entry)) {
      try { fs.rmSync(path.join(directory, entry), { recursive: true, force: true }); } catch {}
    }
  }
}

async function withStateMutation(basePath, metadata, callback, options = {}) {
  const { root, control } = controlDirectory(basePath);
  const release = await acquireStateLock(control, options);
  let transaction;
  let published = false;
  try {
    const recovered = replayTransaction(root, control);
    if (recovered) {
      throw new StateError('An interrupted state operation was completed; inspect the current state before retrying this mutation.', {
        code: 'STATE_RECOVERED', details: { transaction_id: recovered.id, operation: recovered.operation },
      });
    }
    cleanupAbandonedTransactions(control);
    try { transaction = createTransaction(basePath, control); }
    catch (error) { throw recoveryError(`State staging metadata could not be prepared: ${error.message}`); }
    const result = await callback(transaction.tx);
    if (transaction.operations.length) {
      publishTransaction(transaction, control, metadata, result);
      published = true;
      replayTransaction(root, control);
    }
    return result;
  } catch (error) {
    if (transaction && fs.existsSync(journalPath(control)) && !error.code?.startsWith('STATE_')) {
      throw recoveryError(`A committed state operation needs recovery: ${error.message}`, {
        transaction_id: transaction.id, operation: metadata.operation,
      });
    }
    throw error;
  } finally {
    // A committed journal always retains its staging for roll-forward recovery.
    try {
      if (transaction && !published && !fs.existsSync(journalPath(control))) {
        try { fs.rmSync(transaction.directory, { recursive: true, force: true }); } catch {}
      }
    } finally { release(); }
  }
}

function revision(control) {
  try {
    const filename = path.join(control, 'revision');
    assertPrivateMetadata(filename, 'file');
    return fs.readFileSync(filename, 'utf8');
  }
  catch (error) {
    if (error.code === 'ENOENT') return '';
    throw recoveryError(`The state revision could not be read: ${error.message}`);
  }
}

async function withStateRead(basePath, reader, { timeoutMs = 5000 } = {}) {
  const { root, control } = controlDirectory(basePath);
  const currentPath = journalPath(control);
  // The reader gets the read members a transaction offers, over the live files.
  const view = {
    basePath: path.resolve(basePath),
    exists: (filename) => fs.existsSync(filename),
    readFile: (filename, encoding) => fs.readFileSync(filename, encoding),
  };
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (journalExists(currentPath)) {
      const release = await acquireStateLock(control, { timeoutMs: Math.max(0, deadline - Date.now()) });
      try { replayTransaction(root, control); } finally { release(); }
    }
    const before = revision(control);
    if (!journalExists(currentPath)) {
      let value;
      let failure;
      try { value = await reader(view); } catch (error) { failure = error; }
      if (!journalExists(currentPath) && before === revision(control)) {
        if (failure) throw failure;
        return value;
      }
    }
    if (Date.now() >= deadline) throw busyError(timeoutMs);
    await pollDelay(deadline);
  }
}

module.exports = { withStateMutation, withStateRead };
