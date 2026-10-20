'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { isExtensionCachePath } = require('./cache-path-rejector');
const { defineErrorType } = require('../lib/errors');

const WorkspaceResolutionError = defineErrorType(
  'WorkspaceResolutionError',
  'WORKSPACE_RESOLUTION_FAILED'
);

/** A non-empty string that is not an unexpanded `${...}` host placeholder. */
function isConcretePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('${');
}

function gitRootOrSelf(dir) {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return dir;
  }
}

function resolveExistingRoot(candidate) {
  if (!isConcretePath(candidate)) {
    return null;
  }

  const resolvedCandidate = path.resolve(candidate);
  if (!fs.existsSync(resolvedCandidate)) {
    return null;
  }

  return gitRootOrSelf(resolvedCandidate);
}

function resolveProjectRoot() {
  const env = process.env;
  const cwd = process.cwd();
  for (const candidate of [env.MAESTRO_WORKSPACE_PATH, env.CLAUDE_PROJECT_DIR, env.PWD, env.INIT_CWD]) {
    const resolvedRoot = resolveExistingRoot(candidate);
    if (resolvedRoot) {
      return resolvedRoot;
    }
  }

  return resolveExistingRoot(cwd) || path.resolve(cwd);
}

/**
 * Resolve the workspace root for a hook payload's `cwd`. MCP anchors session
 * state at the git toplevel of the workspace, so a hook fired from a
 * subdirectory must resolve the same root. Falls back to `process.cwd()` when
 * the payload has no cwd, and to the raw path when it cannot be resolved.
 *
 * @param {string|undefined} cwd - hook payload cwd
 * @returns {string}
 */
function resolveHookWorkspaceRoot(cwd) {
  return resolveExistingRoot(cwd || process.cwd()) || cwd || process.cwd();
}

/**
 * Validate the workspace path `initialize_workspace` was given and return
 * its git toplevel, or the path itself outside a git repository.
 *
 * @param {string|null|undefined} workspacePath
 * @returns {string}
 * @throws {WorkspaceResolutionError} WORKSPACE_REQUIRED, WORKSPACE_NOT_FOUND
 *   or WORKSPACE_IN_EXTENSION_CACHE
 */
function requireExplicitWorkspaceRoot(workspacePath) {
  if (!isConcretePath(workspacePath)) {
    throw new WorkspaceResolutionError(
      'initialize_workspace requires an explicit workspace_path. No implicit cwd or env fallback is used.',
      { code: 'WORKSPACE_REQUIRED' }
    );
  }
  const resolved = path.resolve(workspacePath);
  if (!fs.existsSync(resolved)) {
    throw new WorkspaceResolutionError(
      `workspace_path does not exist: ${resolved}`,
      { code: 'WORKSPACE_NOT_FOUND', details: { workspace_path: resolved } }
    );
  }
  if (isExtensionCachePath(resolved)) {
    throw new WorkspaceResolutionError(
      `workspace_path resolves inside an extension cache directory: ${resolved}. Provide the user workspace path instead.`,
      { code: 'WORKSPACE_IN_EXTENSION_CACHE', details: { workspace_path: resolved } }
    );
  }
  return gitRootOrSelf(resolved);
}

module.exports = {
  isConcretePath,
  resolveHookWorkspaceRoot,
  resolveProjectRoot,
  requireExplicitWorkspaceRoot,
};
