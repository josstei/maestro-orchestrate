'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { defineErrorType } = require('../lib/errors');

const WorkspaceResolutionError = defineErrorType(
  'WorkspaceResolutionError',
  'WORKSPACE_RESOLUTION_FAILED'
);

// Checked in order before the cwd. Core cannot read runtime configs, so a constraint
// test ties each runtime's env.workspacePath to this list.
const WORKSPACE_ENV_VARS = ['MAESTRO_WORKSPACE_PATH', 'CLAUDE_PROJECT_DIR', 'PWD', 'INIT_CWD'];

const CACHE_PATH_SEGMENTS = [
  path.join('.codex', 'plugins'),
  path.join('.claude', 'plugins'),
  // Antigravity installs plugins to ~/.gemini/config/plugins/<name>/ and
  // links its older ~/.gemini/antigravity-cli/plugins/ location there.
  path.join('.gemini', 'config', 'plugins'),
  path.join('.gemini', 'antigravity-cli', 'plugins'),
];

// Whether a path lies inside a host extension cache. Padding with separators matches
// whole segments only, so `.codex-plugins-research` is not a cache.
function isExtensionCachePath(candidate) {
  const resolved = path.resolve(candidate) + path.sep;
  return CACHE_PATH_SEGMENTS.some((segment) => resolved.includes(path.sep + segment + path.sep));
}

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
  for (const candidate of [...WORKSPACE_ENV_VARS.map((name) => process.env[name]), process.cwd()]) {
    const resolvedRoot = resolveExistingRoot(candidate);
    if (resolvedRoot) {
      return resolvedRoot;
    }
  }

  return path.resolve(process.cwd());
}

/**
 * Resolve the workspace root for a hook payload's `cwd`. MCP anchors session
 * state at the git toplevel of the workspace, so a hook fired from a
 * subdirectory must resolve the same root. Falls back to `process.cwd()` when
 * the payload has no cwd, and to the raw cwd when it cannot be resolved.
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

function requireExplicitWorkspaceRoot(workspacePath) {
  const fail = (message, code, details) => {
    throw new WorkspaceResolutionError(message, { code, details });
  };
  if (!isConcretePath(workspacePath)) {
    fail(
      'initialize_workspace requires an explicit workspace_path. No implicit cwd or env fallback is used.',
      'WORKSPACE_REQUIRED'
    );
  }
  const resolved = path.resolve(workspacePath);
  const details = { workspace_path: resolved };
  if (!fs.existsSync(resolved)) {
    fail(`workspace_path does not exist: ${resolved}`, 'WORKSPACE_NOT_FOUND', details);
  }
  if (isExtensionCachePath(resolved)) {
    fail(
      `workspace_path resolves inside an extension cache directory: ${resolved}. Provide the user workspace path instead.`,
      'WORKSPACE_IN_EXTENSION_CACHE',
      details
    );
  }
  return gitRootOrSelf(resolved);
}

module.exports = {
  isConcretePath,
  isExtensionCachePath,
  resolveHookWorkspaceRoot,
  resolveProjectRoot,
  requireExplicitWorkspaceRoot,
  requireWorkspaceRoot,
  WORKSPACE_ENV_VARS,
  WorkspaceResolutionError,
};
