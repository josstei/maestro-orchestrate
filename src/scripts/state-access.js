'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteSync } = require('../lib/io');
const { ValidationError } = require('../lib/errors');
const { createSettingResolver } = require('../config/setting-resolver');
const { DEFAULT_STATE_DIR, joinRelative, resolveStateDirPath, resolvePhysicalPath } = require('../state/paths');
const { withStateRead, withStateMutation } = require('../state/coordinator');
const {
  contentDigest,
  checkExpectedDigest,
  privateStatePathError,
  assertPublicStatePath,
} = require('../state/transaction');

function isWithin(root, target) {
  return root !== null && (target === root || target.startsWith(root + path.sep));
}

// A proven link cycle cannot contain a successfully resolved document. Other
// resolution failures stay fatal because an inaccessible alias may contain it.
function stateRootIdentity(root) {
  try { return resolvePhysicalPath(root); }
  catch (error) {
    if (error.code !== 'ELOOP') throw error;
    const seen = new Set();
    let current = path.resolve(root);
    for (let depth = 0; depth < 40; depth++) {
      if (seen.has(current)) return null;
      seen.add(current);
      try { current = path.resolve(path.dirname(current), fs.readlinkSync(current)); }
      catch (linkError) {
        // A suffix below a cyclic ancestor cannot itself be inspected. Ascend
        // only for ELOOP; other failures do not establish a cycle.
        const parent = path.dirname(current);
        if (linkError.code !== 'ELOOP' || parent === current) throw error;
        current = parent;
      }
    }
    throw error;
  }
}

function assertNotPrivateMetadata(...filenames) {
  for (const filename of filenames) {
    const segments = filename.split(path.sep);
    if (segments.some((segment, index) => segment === 'state' && segments[index + 1] === '.maestro')) {
      throw privateStatePathError();
    }
  }
}

function resolveAccess(relativePath, workspace) {
  const filePath = joinRelative(workspace, relativePath);
  const physicalFile = resolvePhysicalPath(filePath);
  // Metadata remains private even if a caller changes or invalidates the
  // configured root, or reaches another workspace's metadata through an alias.
  assertNotPrivateMetadata(filePath, physicalFile);
  const warnings = [];
  const resolveSetting = createSettingResolver(workspace, { onWarning: (message) => warnings.push(message) });
  const stateDir = resolveSetting('MAESTRO_STATE_DIR') || DEFAULT_STATE_DIR;
  const reportWarnings = () => { for (const warning of warnings) console.warn(warning); };
  let stateRoot;
  try {
    stateRoot = resolveStateDirPath(workspace, stateDir);
  } catch (error) {
    // Generic raw files historically did not depend on state configuration.
    // Preserve that behavior only when they cannot overlap the invalid root.
    const candidate = path.resolve(workspace, stateDir);
    if (isWithin(candidate, filePath) || isWithin(stateRootIdentity(candidate), physicalFile)) {
      reportWarnings();
      throw error;
    }
    return { filePath, managed: false };
  }
  const physicalRoot = stateRootIdentity(stateRoot);
  const managed = isWithin(stateRoot, filePath) || isWithin(physicalRoot, physicalFile);
  if (managed) {
    reportWarnings();
    assertPublicStatePath(stateRoot, filePath);
  }
  return {
    filePath,
    stateRoot,
    managed,
  };
}

async function readStateFile(relativePath, workspace, { withDigest = false } = {}) {
  const { filePath, stateRoot, managed } = resolveAccess(relativePath, workspace);
  const read = () => {
    const bytes = fs.readFileSync(filePath);
    const content = bytes.toString('utf8');
    return withDigest ? JSON.stringify({ content, sha256: contentDigest(bytes) }) : content;
  };
  return managed ? withStateRead(stateRoot, read) : read();
}

async function writeStateFile(relativePath, content, workspace, { expectedSha256 } = {}) {
  const { filePath, stateRoot, managed } = resolveAccess(relativePath, workspace);
  if (expectedSha256 !== undefined && !managed) {
    throw new ValidationError('--expected-sha256 requires a path within the configured state directory');
  }
  if (!managed) {
    atomicWriteSync(filePath, content);
    return;
  }
  return withStateMutation(stateRoot, { operation: 'write_state' }, (tx) => {
    if (expectedSha256 !== undefined) checkExpectedDigest(tx, filePath, expectedSha256);
    tx.writeFile(filePath, content);
  });
}

function isCoordinationError(error) {
  return /^STATE_(?:BUSY|RECOVERED|RECOVERY_REQUIRED|CONFLICT)$/.test(error.code);
}

function stateErrorMessage(error) {
  if (!isCoordinationError(error)) return error.message;
  const transactionId = error.details?.transaction_id;
  const transaction = typeof transactionId === 'string' && transactionId.length > 0
    ? ` (transaction: ${transactionId})`
    : '';
  return `${error.code}: ${error.message}${transaction}`;
}

module.exports = { readStateFile, writeStateFile, isCoordinationError, stateErrorMessage };
