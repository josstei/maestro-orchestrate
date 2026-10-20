'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const { isExtensionCachePath } = require('../core/cache-path-rejector');
const { isConcretePath } = require('../core/project-root-resolver');

/**
 * Project-root cache for the MCP server.
 *
 * The project root handed to tools is the workspace path the orchestrator
 * passed to `initialize_workspace`; until then it is null, and tools that
 * require a workspace reject with a structured error.
 *
 * The cache also computes a `workspace_suggestion` from, in order, the env var
 * the caller names (the runtime config's `env.workspacePath`), the first
 * existing `file://` MCP client root, and the server's cwd, skipping
 * extension-cache paths. The suggestion is exposed through
 * `get_runtime_context` so the orchestrator can pass it into
 * `initialize_workspace`. It is never used as a fallback for other tools.
 */
function createProjectRootCache({ requestClientRoots }) {
  let explicitWorkspacePath = null;
  let clientRoots = [];
  let clientSupportsRoots = false;

  // A suggestion must exist and must not be inside an extension cache.
  function usableDir(candidate) {
    return fs.existsSync(candidate) && !isExtensionCachePath(candidate) ? candidate : null;
  }

  function envSuggestion(envVarName) {
    const value = process.env[envVarName];
    if (!isConcretePath(value)) return null;
    return usableDir(path.resolve(value));
  }

  function rootsSuggestion() {
    for (const root of clientRoots) {
      const uri = typeof root === 'string' ? root : root && root.uri;
      if (typeof uri !== 'string') continue;
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== 'file:') continue;
        const resolved = usableDir(fileURLToPath(parsed));
        if (resolved) return resolved;
      } catch {
        continue;
      }
    }
    return null;
  }

  function cwdSuggestion() {
    const cwd = process.cwd();
    return isExtensionCachePath(cwd) ? null : cwd;
  }

  async function refreshClientRoots() {
    if (!clientSupportsRoots) {
      clientRoots = [];
      return;
    }
    try {
      const result = await requestClientRoots();
      clientRoots = result && Array.isArray(result.roots) ? result.roots : [];
    } catch {
      clientRoots = [];
    }
  }

  return {
    getProjectRoot: () => explicitWorkspacePath,
    setExplicitWorkspacePath(workspacePath) {
      explicitWorkspacePath = workspacePath;
    },
    /** @param {string} envVarName - the runtime config's `env.workspacePath` */
    workspaceSuggestion(envVarName) {
      return envSuggestion(envVarName) || rootsSuggestion() || cwdSuggestion();
    },
    setClientSupportsRoots(supports) {
      clientSupportsRoots = supports;
    },
    refreshClientRoots,
  };
}

module.exports = { createProjectRootCache };
