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

  function setExplicitWorkspaceState(workspacePath: any, stateDirPath: any) {
    explicitWorkspacePath = workspacePath || null;
    explicitStateDirPath = explicitWorkspacePath && stateDirPath ? stateDirPath : null;
  }

  function resolveWorkspaceState() {
    return {
      projectRoot: explicitWorkspacePath,
      stateDirPath: explicitStateDirPath,
    };
  }

  return {
    resolveWorkspaceState,
    setExplicitWorkspaceState,
    workspaceSuggestion,
    setClientSupportsRoots(supports: any) {
      clientSupportsRoots = Boolean(supports);
    },
    refreshClientRoots,
    invalidateClientRoots() {
      clientRoots = [];
    },
  };
}

export { createProjectRootCache };
