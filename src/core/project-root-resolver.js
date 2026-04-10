'use strict';

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

module.exports = {
  resolveProjectRoot,
  resolveProjectRootForRuntime,
};
