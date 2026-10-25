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

/**
 * Variables consulted, in order, for the project root before the cwd. Every
 * runtime config's `env.workspacePath` must be one of them; core cannot read
 * the runtime configs, so a constraint test keeps the two in step.
 */
const WORKSPACE_ENV_VARS = ['MAESTRO_WORKSPACE_PATH', 'CLAUDE_PROJECT_DIR', 'PWD', 'INIT_CWD'];

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
  const cwd = process.cwd();
  for (const name of WORKSPACE_ENV_VARS) {
    const resolvedRoot = resolveExistingRoot(process.env[name]);
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
 * the payload has no cwd, and to the raw cwd when it cannot be resolved.
 *
 * @param {string|undefined} cwd - hook payload cwd
 * @returns {string|undefined}
 */
function resolveHookWorkspaceRoot(cwd) {
  return resolveExistingRoot(cwd || process.cwd()) || cwd;
}

/**
 * Assert that a tool handler was invoked with a resolved workspace root.
 * Used by handlers that cannot function without a workspace (session state,
 * reconciliation, complexity assessment). The dispatcher calls this centrally
 * when `requiresWorkspace` is declared on the tool schema; handlers may also
 * call it directly for defense in depth.
 *
 * @param {string|null|undefined} projectRoot - resolved project root or nullish
 * @param {string} toolName - tool name for the error message
 * @throws {WorkspaceResolutionError} when projectRoot is absent
 */
function requireWorkspaceRoot(projectRoot, toolName) {
  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    return projectRoot;
  }
  throw new WorkspaceResolutionError(
    `${toolName} requires an initialized workspace. Call initialize_workspace(workspace_path=...) first.`,
    { code: 'WORKSPACE_NOT_INITIALIZED', details: { tool_name: toolName } }
  );
}

function requireExplicitWorkspaceRoot({ workspacePath } = {}) {
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
  requireWorkspaceRoot,
  WORKSPACE_ENV_VARS,
  WorkspaceResolutionError,
};
