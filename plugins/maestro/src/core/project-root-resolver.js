'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { isExtensionCachePath } = require('../mcp/contracts/cache-path-rejector');
const { MaestroError } = require('../lib/errors');

class WorkspaceResolutionError extends MaestroError {
  constructor(message, { code = 'WORKSPACE_RESOLUTION_FAILED', details = null } = {}) {
    super(message, { code, details });
    this.name = 'WorkspaceResolutionError';
  }
}

function resolveGitRoot(baseDir) {
  return execSync('git rev-parse --show-toplevel', {
    cwd: baseDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function resolveExistingRoot(candidate) {
  if (!candidate || candidate.includes('${')) {
    return null;
  }

  const resolvedCandidate = path.resolve(candidate);
  if (!fs.existsSync(resolvedCandidate)) {
    return null;
  }

  try {
    return resolveGitRoot(resolvedCandidate);
  } catch {
    return resolvedCandidate;
  }
}

/**
 * Resolve the project root used by in-process scripts (hooks, session
 * readers). Prefers the explicit workspace env vars that runtime
 * configurations inject, then falls back to inherited env and cwd.
 * The MCP server does not use this helper — it requires an explicit
 * workspace via `requireExplicitWorkspaceRoot`.
 */
function resolveProjectRoot() {
  const env = process.env;
  const candidates = [
    env.MAESTRO_WORKSPACE_PATH,
    env.CLAUDE_PROJECT_DIR,
    env.PWD,
    env.INIT_CWD,
  ];

  for (const candidate of candidates) {
    const resolved = resolveExistingRoot(candidate);
    if (resolved) return resolved;
  }

  const cwd = process.cwd();
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
  try {
    return resolveGitRoot(resolved);
  } catch {
    return resolved;
  }
}

module.exports = {
  resolveProjectRoot,
  requireExplicitWorkspaceRoot,
  requireWorkspaceRoot,
  WorkspaceResolutionError,
};
