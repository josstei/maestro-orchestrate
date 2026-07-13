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
 * `projectRoot` and `stateDirPath` are projected from the single injected
 * workspace-state snapshot. The resolver must never fall back to
 * `process.cwd()` or ambient environment variables. Also bridges the inbound
 * cancellation `signal`, carries the shared content-service configuration,
 * and exposes the single `ctx.elicit` consent seam.
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
  } = options;
  const workspaceState = typeof getWorkspaceState === 'function'
    ? await getWorkspaceState()
    : null;
  const inboundServices = options.services || {};

  return {
    projectRoot: workspaceState?.projectRoot || null,
    stateDirPath: workspaceState?.stateDirPath || null,
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
