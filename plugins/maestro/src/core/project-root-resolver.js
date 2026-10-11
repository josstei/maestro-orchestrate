'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { isExtensionCachePath } = require('../mcp/contracts/cache-path-rejector');
const { defineErrorType } = require('../lib/errors');

const WorkspaceResolutionError = defineErrorType(
  'WorkspaceResolutionError',
  'WORKSPACE_RESOLUTION_FAILED'
);

function resolveGitRoot(baseDir) {
  return execSync('git rev-parse --show-toplevel', {
    cwd: baseDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function gitRootOrSelf(resolved) {
  try {
    return resolveGitRoot(resolved);
  } catch {
    return resolved;
  }
}

function resolveExistingRoot(candidate) {
  if (typeof candidate !== 'string' || !candidate || candidate.includes('${')) {
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
  if (!workspacePath || typeof workspacePath !== 'string' || workspacePath.includes('${')) {
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
  resolveExistingRoot,
  resolveProjectRoot,
  requireExplicitWorkspaceRoot,
  requireWorkspaceRoot,
  WorkspaceResolutionError,
};
