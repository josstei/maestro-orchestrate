import * as io from '../../lib/io/index.js';
import { MemoryStore, createSystemClock } from '../memory/memory-store.js';
import { KnowledgeStore } from '../memory/knowledge-store.js';
import { requireWorkspaceRoot } from '../../core/project-root-resolver.js';

const ELICIT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Build the lazy, clock-injected `ctx.services` facade. Stateful services
 * (`memoryStore`, `knowledgeStore`) are constructed on first access and
 * memoized; they refuse to build against a null `projectRoot` rather than
 * ever falling back to the process cwd.
 *
 * @param {{projectRoot: string|null, clock: {now: () => Date}, canonicalSrcRoot?: string, workspaceSuggestion?: Function}} options
 */
function buildServices({ projectRoot, clock, canonicalSrcRoot, workspaceSuggestion }: any) {
  let memoryStoreInstance: MemoryStore | null = null;
  let knowledgeStoreInstance: KnowledgeStore | null = null;

  return {
    get memoryStore() {
      requireWorkspaceRoot(projectRoot, 'ctx.services.memoryStore');
      if (!memoryStoreInstance) {
        memoryStoreInstance = new MemoryStore(projectRoot, { clock });
      }
      return memoryStoreInstance;
    },
    get knowledgeStore() {
      requireWorkspaceRoot(projectRoot, 'ctx.services.knowledgeStore');
      if (!knowledgeStoreInstance) {
        knowledgeStoreInstance = new KnowledgeStore(projectRoot);
      }
      return knowledgeStoreInstance;
    },
    io,
    clock,
    canonicalSrcRoot,
    workspaceSuggestion,
  };
}

/**
 * Build `ctx.elicit` — the single elicitation seam. Prechecks the client's
 * elicitation capability on the LOW-LEVEL `Server` (never `McpServer`); when
 * absent, returns `null` without calling `elicitInput`. Passes an explicit
 * long timeout so a human answering a form is never auto-failed by the SDK's
 * short default. Any thrown error (missing form capability, or an `McpError`
 * from requestedSchema validation) is caught here and treated as elicitation
 * being unavailable — it never leaks to generic error normalization.
 *
 * @param {{server: {server: {getClientCapabilities: Function, elicitInput: Function}}}} options
 * @returns {(params: {message: string, requestedSchema: object}) => Promise<{action: string, content?: object}|null>}
 */
function buildElicit({ server }: any) {
  return async function elicit(params: any) {
    const lowLevelServer = server && server.server;
    if (!lowLevelServer || typeof lowLevelServer.getClientCapabilities !== 'function') {
      return null;
    }

    const capabilities = lowLevelServer.getClientCapabilities();
    if (!capabilities || !capabilities.elicitation) {
      return null;
    }

    try {
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
 * the inbound cancellation `signal`, assembles lazy clock-injected
 * `services`, and exposes the single `ctx.elicit` consent seam.
 *
 * @param {object} args - the tool's parsed input arguments
 * @param {{signal?: AbortSignal}} extra - the SDK callback's second argument
 * @param {{server: object, runtimeConfig: object, getProjectRoot?: () => (string|null|Promise<string|null>), clock?: {now: () => Date}, services?: {canonicalSrcRoot?: string, workspaceSuggestion?: Function}}} options
 * @returns {Promise<{projectRoot: string|null, runtimeConfig: object, signal: AbortSignal|undefined, elicit: Function, services: object}>}
 */
async function buildHandlerContext(args: any, extra: any, options: any = {}) {
  const { server, runtimeConfig, clock = createSystemClock(), getProjectRoot } = options;
  const projectRoot =
    typeof getProjectRoot === 'function' ? (await getProjectRoot()) || null : null;
  const inboundServices = options.services || {};

  return {
    projectRoot,
    runtimeConfig,
    signal: extra && extra.signal,
    elicit: buildElicit({ server }),
    services: buildServices({
      projectRoot,
      clock,
      canonicalSrcRoot: inboundServices.canonicalSrcRoot,
      workspaceSuggestion: inboundServices.workspaceSuggestion,
    }),
  };
}

export { buildHandlerContext };
