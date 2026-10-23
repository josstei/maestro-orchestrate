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

function validateContainment(absolutePath, rootDir) {
  let resolved = path.resolve(absolutePath);
  let resolvedRoot = path.resolve(rootDir);
  try { resolved = fs.realpathSync(resolved); } catch {}
  try { resolvedRoot = fs.realpathSync(resolvedRoot); } catch {}
  const rootPrefix = resolvedRoot + path.sep;
  if (!resolved.startsWith(rootPrefix) && resolved !== resolvedRoot) {
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
  resolveStateDirUnder,
  resolveStateDirSetting,
  resolveStateDirPath,
  activeSessionFile,
};
