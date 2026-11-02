'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const { isConcretePath, isExtensionCachePath } = require('../../core/project-root-resolver');

// A suggestion must exist and must not be inside an extension cache.
function usableDir(candidate) {
  return fs.existsSync(candidate) && !isExtensionCachePath(candidate);
}

/** The path of a `file://` MCP client root (a URI string or `{ uri }`), else null. */
function clientRootPath(root) {
  const uri = typeof root === 'string' ? root : root && root.uri;
  if (typeof uri !== 'string') return null;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'file:' ? fileURLToPath(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Project-root cache for the MCP session.
 *
 * The project root handed to tools is the workspace path the orchestrator
 * passed to `initialize_workspace`; until then it is null, and tools that
 * require a workspace reject with a structured error.
 *
 * The cache also computes a `workspace_suggestion` from, in order, the env var
 * named by the runtime config's `env.workspacePath`, the first existing
 * `file://` MCP client root, and the server's cwd, skipping extension-cache
 * paths. The suggestion is exposed through `get_runtime_context` so the
 * orchestrator can pass it into `initialize_workspace`. It is never used as a
 * fallback for other tools.
 */
function createProjectRootCache({ runtimeConfig, requestClientRoots }) {
  const envVarName = runtimeConfig?.env?.workspacePath;
  let explicitWorkspacePath = null;
  let clientRoots = [];
  let clientSupportsRoots = false;

  return {
    getProjectRoot: () => explicitWorkspacePath,
    setExplicitWorkspacePath(value) {
      explicitWorkspacePath = value || null;
    },
    workspaceSuggestion() {
      const value = envVarName ? process.env[envVarName] : null;
      const env = isConcretePath(value) ? path.resolve(value) : null;
      const found = [env, ...clientRoots.map(clientRootPath)].find(usableDir);
      if (found) return found;
      // Read the cwd only now: a plugin update can delete the server's install-dir cwd.
      const cwd = path.resolve(process.cwd());
      return isExtensionCachePath(cwd) ? null : cwd;
    },
    setClientSupportsRoots(supports) {
      clientSupportsRoots = Boolean(supports);
    },
    async refreshClientRoots() {
      try {
        const result = clientSupportsRoots ? await requestClientRoots() : null;
        clientRoots = result && Array.isArray(result.roots) ? result.roots : [];
      } catch {
        clientRoots = [];
      }
    },
  };
}

module.exports = { createProjectRootCache };
