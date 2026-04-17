'use strict';

const { isExtensionCachePath } = require('../mcp/contracts/cache-path-rejector');

class WorkspaceResolutionError extends Error {
  constructor(message, { code = 'WORKSPACE_RESOLUTION_FAILED', details = null } = {}) {
    super(message);
    this.name = 'WorkspaceResolutionError';
    this.code = code;
    this.details = details;
  }
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { fileURLToPath } = require('node:url');

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

function resolveProjectRootFromCandidates(candidates) {
  for (const candidate of candidates) {
    const resolvedRoot = resolveExistingRoot(candidate);
    if (resolvedRoot) {
      return resolvedRoot;
    }
  }

  return null;
}

function extractClientRootCandidates(clientRoots) {
  if (!Array.isArray(clientRoots)) {
    return [];
  }

  const candidates = [];
  for (const clientRoot of clientRoots) {
    const uri =
      typeof clientRoot === 'string'
        ? clientRoot
        : clientRoot && typeof clientRoot.uri === 'string'
          ? clientRoot.uri
          : null;

    if (!uri) {
      continue;
    }

    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'file:') {
        continue;
      }

      candidates.push(fileURLToPath(parsed));
    } catch {
      continue;
    }
  }

  return candidates;
}

function resolveProjectRootFromEnv(env, cwd) {
  const candidates = [
    env.MAESTRO_WORKSPACE_PATH,
    env.CLAUDE_PROJECT_DIR,
    env.PWD,
    env.INIT_CWD,
  ];

  const resolvedRoot = resolveProjectRootFromCandidates(candidates);
  if (resolvedRoot) {
    return resolvedRoot;
  }

  return resolveExistingRoot(cwd) || path.resolve(cwd);
}

function resolveProjectRootForRuntime(runtimeConfig = {}, options = {}) {
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const workspaceEnvName =
    runtimeConfig && runtimeConfig.env ? runtimeConfig.env.workspacePath : null;
  const explicitWorkspacePath =
    workspaceEnvName && env[workspaceEnvName] ? env[workspaceEnvName] : null;

  const explicitRoot = resolveExistingRoot(explicitWorkspacePath);
  if (explicitRoot) {
    return explicitRoot;
  }

  const clientRoot = resolveProjectRootFromCandidates(
    extractClientRootCandidates(options.clientRoots)
  );
  if (clientRoot) {
    return clientRoot;
  }

  return resolveProjectRootFromEnv(env, cwd);
}

function resolveProjectRoot() {
  return resolveProjectRootFromEnv(process.env, process.cwd());
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
  resolveProjectRootForRuntime,
  requireExplicitWorkspaceRoot,
  WorkspaceResolutionError,
};
