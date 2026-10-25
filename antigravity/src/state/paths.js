'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveSetting } = require('../config/setting-resolver');

const DEFAULT_STATE_DIR = 'docs/maestro';
const ACTIVE_SESSION_REL = path.join('state', 'active-session.md');
const WORKSPACE_SUBDIRS = Object.freeze(['state', 'state/archive', 'plans', 'plans/archive']);

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error('Path must be relative');
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}

function joinRelative(basePath, relativePath) {
  validateRelativePath(relativePath);
  return path.join(basePath, relativePath);
}

function resolvePhysicalPath(filename, symlinkDepth = 0) {
  if (symlinkDepth > 40) throw Object.assign(new Error('Too many symbolic links in state path'), { code: 'ELOOP' });
  let existing = path.resolve(filename);
  const missing = [];
  for (;;) {
    try { return path.join(fs.realpathSync(existing), ...missing); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      try {
        if (fs.lstatSync(existing).isSymbolicLink()) {
          const destination = path.resolve(path.dirname(existing), fs.readlinkSync(existing));
          return path.join(resolvePhysicalPath(destination, symlinkDepth + 1), ...missing);
        }
      } catch (linkError) {
        if (!['ENOENT', 'ENOTDIR'].includes(linkError.code)) throw linkError;
      }
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

function containmentIdentity(filePath) {
  let existing = filePath;
  const suffix = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(existing), ...suffix); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) return filePath;
      const parent = path.dirname(existing);
      if (parent === existing) return filePath;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

function validateContainment(absolutePath, rootDir) {
  let resolved = path.resolve(absolutePath);
  let resolvedRoot = path.resolve(rootDir);
  try { resolved = fs.realpathSync(resolved); } catch {}
  try { resolvedRoot = fs.realpathSync(resolvedRoot); } catch {}
  // Git for Windows can expand 8.3 aliases and change drive-letter casing.
  // Compare filesystem identities, preserving the caller-visible path spelling.
  const relative = path.relative(containmentIdentity(resolvedRoot), containmentIdentity(resolved));
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('state_dir must be within the project root');
  }
  return resolved;
}

function resolveStateDirUnder(base, stateDir) {
  if (path.isAbsolute(stateDir)) {
    return validateContainment(stateDir, base);
  }

  return joinRelative(base, stateDir);
}

/**
 * Resolve the configured state dir for a workspace, as written (relative or
 * absolute, not yet resolved against the workspace): the override when given,
 * else MAESTRO_STATE_DIR (environment, then the workspace .env, then the
 * extension .env), else DEFAULT_STATE_DIR.
 * @param {string} [cwd] - Workspace root; defaults to process.cwd()
 * @param {string} [stateDirOverride]
 * @returns {string}
 */
function resolveStateDirSetting(cwd, stateDirOverride) {
  return (
    stateDirOverride ||
    resolveSetting('MAESTRO_STATE_DIR', cwd || process.cwd()) ||
    DEFAULT_STATE_DIR
  );
}

/**
 * Resolve the absolute state dir for a workspace from the setting chosen by
 * resolveStateDirSetting.
 * @param {string} [cwd] - Workspace root; defaults to process.cwd()
 * @param {string} [stateDirOverride]
 * @returns {string}
 */
function resolveStateDirPath(cwd, stateDirOverride) {
  const root = cwd || process.cwd();
  return resolveStateDirUnder(root, resolveStateDirSetting(root, stateDirOverride));
}

function activeSessionFile(basePath) {
  return path.join(basePath, ACTIVE_SESSION_REL);
}

module.exports = {
  DEFAULT_STATE_DIR,
  WORKSPACE_SUBDIRS,
  joinRelative,
  resolvePhysicalPath,
  resolveStateDirUnder,
  resolveStateDirSetting,
  resolveStateDirPath,
  activeSessionFile,
};
