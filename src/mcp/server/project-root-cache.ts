import {
  extractClientRootCandidates,
  normalizeExistingWorkspaceCandidate,
} from '../../core/project-root-resolver.js';

/**
 * Project-root cache for the MCP session.
 *
 * The workspace path becomes authoritative when the orchestrator passes it to
 * `initialize_workspace`. Before that call, stateful tools reject with a
 * structured error.
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
  let explicitStateDirPath: string | null = null;
  let clientRoots: any[] = [];
  let clientSupportsRoots = false;

  function envSuggestion() {
    const envVarName =
      runtimeConfig && runtimeConfig.env ? runtimeConfig.env.workspacePath : null;
    if (!envVarName) return null;
    const value = env[envVarName];
    return normalizeExistingWorkspaceCandidate(value, {
      rejectExtensionCache: true,
    });
  }

  function rootsSuggestion() {
    for (const candidate of extractClientRootCandidates(clientRoots)) {
      const normalized = normalizeExistingWorkspaceCandidate(candidate, {
        rejectExtensionCache: true,
      });
      if (normalized) {
        return normalized;
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
    if (!explicitWorkspacePath) {
      explicitStateDirPath = null;
    }
  }

  function setExplicitWorkspaceState(workspacePath: any, stateDirPath: any) {
    explicitWorkspacePath = workspacePath || null;
    explicitStateDirPath = explicitWorkspacePath && stateDirPath ? stateDirPath : null;
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
   * Non-throwing, synchronous projectRoot resolver injected into
   * `buildHandlerContext` as `getProjectRoot`. Returns `null`
   * absent an explicit `initialize_workspace` call so the gate is enforced
   * uniformly by `requireWorkspaceRoot` inside the tool pipeline, never here.
   *
   * @returns {string|null}
   */
  function resolveProjectRoot() {
    return explicitWorkspacePath;
  }

  function resolveStateDirPath() {
    return explicitStateDirPath;
  }

  function resolveWorkspaceState() {
    return {
      projectRoot: explicitWorkspacePath,
      stateDirPath: explicitStateDirPath,
    };
  }

  return {
    getProjectRoot,
    resolveProjectRoot,
    resolveStateDirPath,
    resolveWorkspaceState,
    setExplicitWorkspacePath,
    setExplicitWorkspaceState,
    workspaceSuggestion,
    setClientSupportsRoots(supports: any) {
      clientSupportsRoots = Boolean(supports);
    },
    refreshClientRoots,
    invalidateProjectRoot() {
      explicitWorkspacePath = null;
      explicitStateDirPath = null;
    },
    invalidateClientRoots() {
      clientRoots = [];
    },
  };
}

export { createProjectRootCache };
