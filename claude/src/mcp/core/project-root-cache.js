'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { resolveProjectRootForRuntime } = require('../../core/project-root-resolver');

/**
 * Cache project-root resolution for the lifetime of the MCP session.
 *
 * The MCP client may advertise workspace roots via the capability
 * handshake (`roots/list`), but some runtimes (Claude, Gemini) pin a
 * workspace directly via an env var. The cache prefers the explicit env
 * var when present and otherwise lazily fetches client roots.
 *
 * Returned methods let the protocol dispatcher keep the cache coherent
 * across the `initialize`, `notifications/initialized`, and
 * `notifications/roots/list_changed` events.
 */
function createProjectRootCache(options) {
  const {
    runtimeConfig,
    requestClientRoots,
    env = process.env,
    getCwd = () => process.cwd(),
  } = options;

  let cachedProjectRoot;
  let cachedClientRoots;
  let clientRootsPromise;
  let clientSupportsRoots = false;

  function hasExplicitWorkspaceEnv() {
    const workspaceEnvName =
      runtimeConfig && runtimeConfig.env ? runtimeConfig.env.workspacePath : null;
    const workspaceEnvValue = workspaceEnvName ? env[workspaceEnvName] : null;
    if (!workspaceEnvValue || workspaceEnvValue.includes('${')) {
      return false;
    }

    return fs.existsSync(path.resolve(workspaceEnvValue));
  }

  async function fetchClientRoots(force = false) {
    if (hasExplicitWorkspaceEnv()) {
      return [];
    }

    if (!clientSupportsRoots) {
      return [];
    }

    if (cachedClientRoots !== undefined && !force) {
      return cachedClientRoots;
    }

    if (clientRootsPromise && !force) {
      return clientRootsPromise;
    }

    clientRootsPromise = requestClientRoots()
      .then((result) => {
        const roots =
          result && Array.isArray(result.roots) ? result.roots : [];
        cachedClientRoots = roots;
        return roots;
      })
      .catch(() => {
        cachedClientRoots = [];
        return cachedClientRoots;
      })
      .finally(() => {
        clientRootsPromise = null;
      });

    return clientRootsPromise;
  }

  async function getProjectRoot() {
    if (!cachedProjectRoot) {
      const clientRoots = hasExplicitWorkspaceEnv() ? [] : await fetchClientRoots();
      cachedProjectRoot = resolveProjectRootForRuntime(runtimeConfig, {
        env,
        clientRoots,
        cwd: getCwd(),
      });
    }

    return cachedProjectRoot;
  }

  return {
    getProjectRoot,
    hasExplicitWorkspaceEnv,
    setClientSupportsRoots(supports) {
      clientSupportsRoots = Boolean(supports);
    },
    refreshClientRoots() {
      return fetchClientRoots(true);
    },
    invalidateProjectRoot() {
      cachedProjectRoot = undefined;
    },
    invalidateClientRoots() {
      cachedClientRoots = undefined;
      clientRootsPromise = null;
      cachedProjectRoot = undefined;
    },
  };
}

module.exports = {
  createProjectRootCache,
};
