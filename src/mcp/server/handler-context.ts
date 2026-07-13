import type { ElicitParams, ElicitResult, HandlerContext, HandlerContextOptions } from './tool-types.js';

const ELICIT_TIMEOUT_MS = 10 * 60 * 1000;

type ElicitServer = {
  server?: {
    getClientCapabilities?: () => { elicitation?: unknown } | null;
    elicitInput?: (params: ElicitParams, options: { timeout: number }) => Promise<Exclude<ElicitResult, null>>;
  };
};

/**
 * Build `ctx.elicit` — the single elicitation seam. Prechecks the client's
 * elicitation capability on the LOW-LEVEL `Server` (never `McpServer`); when
 * absent, returns `null` without calling `elicitInput`. Passes an explicit
 * long timeout so a human answering a form is never auto-failed by the SDK's
 * short default. Any thrown error (missing form capability, or an `McpError`
 * from requestedSchema validation) is caught here and treated as elicitation
 * being unavailable — it never leaks to generic error normalization.
 *
 */
function buildElicit({ server }: { server: unknown }) {
  return async function elicit(params: ElicitParams): Promise<ElicitResult> {
    const candidate = server as ElicitServer | null;
    const lowLevelServer = candidate && candidate.server;
    if (!lowLevelServer || typeof lowLevelServer.getClientCapabilities !== 'function') {
      return null;
    }

    const capabilities = lowLevelServer.getClientCapabilities();
    if (!capabilities || !capabilities.elicitation) {
      return null;
    }

    try {
      if (typeof lowLevelServer.elicitInput !== 'function') {
        return null;
      }
      return await lowLevelServer.elicitInput(params, { timeout: ELICIT_TIMEOUT_MS });
    } catch {
      return null;
    }
  };
}

/**
 * Bridge an SDK tool callback's `extra` into maestro's `ctx` DI surface.
 * `projectRoot` is resolved by calling the INJECTED `options.getProjectRoot`
 * resolver (sync or async; must return a workspace path string or `null` —
 * it must never throw, and it must never fall back to `process.cwd()` or
 * ambient environment variables). The server wires `cache.resolveProjectRoot`
 * in; the test harness wires the test's workspace holder in. Also bridges
 * the inbound cancellation `signal`, carries the shared content-service
 * configuration, and exposes the single `ctx.elicit` consent seam.
 *
 */
async function buildHandlerContext(
  args: unknown,
  extra: { signal?: AbortSignal } | null | undefined,
  options: HandlerContextOptions,
): Promise<HandlerContext> {
  const {
    server,
    runtimeConfig,
    getWorkspaceState,
    getProjectRoot,
    getStateDirPath,
  } = options;
  const workspaceState = typeof getWorkspaceState === 'function'
    ? await getWorkspaceState()
    : null;
  const projectRoot = workspaceState
    ? workspaceState.projectRoot || null
    : typeof getProjectRoot === 'function'
      ? (await getProjectRoot()) || null
      : null;
  const stateDirPath = workspaceState
    ? workspaceState.stateDirPath || null
    : typeof getStateDirPath === 'function'
      ? (await getStateDirPath()) || null
      : null;
  const inboundServices = options.services || {};

  return {
    projectRoot,
    stateDirPath,
    runtimeConfig,
    signal: extra?.signal,
    elicit: buildElicit({ server }),
    services: {
      canonicalSrcRoot: inboundServices.canonicalSrcRoot,
      workspaceSuggestion: inboundServices.workspaceSuggestion,
    },
  };
}

export { buildHandlerContext };
