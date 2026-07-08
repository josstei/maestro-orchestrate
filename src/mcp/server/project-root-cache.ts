import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExtensionCachePath } from '../contracts/cache-path-rejector.js';

/**
 * Project-root cache for the MCP session.
 *
 * After this refactor, the workspace path is authoritative only when the
 * orchestrator has passed it to `initialize_workspace`. Before that call,
 * stateful tools reject with a structured error.
 *
 * The cache also computes a `workspace_suggestion` from the env var declared
 * by the runtime-config or any MCP roots supplied by the client. The
 * suggestion is exposed through `get_runtime_context` so the orchestrator can
 * present it to the user before calling `initialize_workspace`. It is never
 * used as a fallback for other tools.
 */
function createProjectRootCache(options: any) {
  const {
    runtimeConfig,
    requestClientRoots,
    env = process.env,
  } = options;

  let explicitWorkspacePath: string | null = null;
  let clientRoots: any[] = [];
  let clientSupportsRoots = false;

  function envSuggestion() {
    const envVarName =
      runtimeConfig && runtimeConfig.env ? runtimeConfig.env.workspacePath : null;
    if (!envVarName) return null;
    const value = env[envVarName];
    if (!value || value.includes('${')) return null;
    const resolved = path.resolve(value);
    if (!fs.existsSync(resolved)) return null;
    if (isExtensionCachePath(resolved)) return null;
    return resolved;
  }

  function rootsSuggestion() {
    for (const root of clientRoots) {
      const uri = typeof root === 'string' ? root : root && root.uri;
      if (typeof uri !== 'string') continue;
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== 'file:') continue;
        const resolved = fileURLToPath(parsed);
        if (!fs.existsSync(resolved)) continue;
        if (isExtensionCachePath(resolved)) continue;
        return resolved;
      } catch {
        continue;
      }
    }
    return null;
  }

  async function refreshClientRoots() {
    if (!clientSupportsRoots || typeof requestClientRoots !== 'function') {
      clientRoots = [];
      return clientRoots;
    }
    try {
      const result = await requestClientRoots();
      clientRoots = result && Array.isArray(result.roots) ? result.roots : [];
    } catch {
      clientRoots = [];
    }
    return clientRoots;
  }

  function workspaceSuggestion() {
    return envSuggestion() || rootsSuggestion();
  }

  function setExplicitWorkspacePath(value: any) {
    explicitWorkspacePath = value || null;
  }

  async function getProjectRoot() {
    if (!explicitWorkspacePath) {
      const error = new Error(
        'Workspace not initialized. Call initialize_workspace(workspace_path=...) before any stateful tool.'
      ) as Error & { code?: string };
      error.code = 'WORKSPACE_NOT_INITIALIZED';
      throw error;
    }
    return explicitWorkspacePath;
  }

  /**
   * Non-throwing, synchronous projectRoot resolver for the SDK cutover path
   * (injected into `buildHandlerContext` as `getProjectRoot`). Returns `null`
   * absent an explicit `initialize_workspace` call so the gate is enforced
   * uniformly by `requireWorkspaceRoot` inside the tool pipeline, never here.
   *
   * @returns {string|null}
   */
  function resolveProjectRoot() {
    return explicitWorkspacePath;
  }

  return {
    getProjectRoot,
    resolveProjectRoot,
    setExplicitWorkspacePath,
    workspaceSuggestion,
    setClientSupportsRoots(supports: any) {
      clientSupportsRoots = Boolean(supports);
    },
    refreshClientRoots,
    invalidateProjectRoot() {
      explicitWorkspacePath = null;
    },
    invalidateClientRoots() {
      clientRoots = [];
    },
  };
}

export { createProjectRootCache };
