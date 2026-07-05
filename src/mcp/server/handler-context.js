import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as io from '../../lib/io/index.js';
import { MemoryStore, createSystemClock } from '../memory/memory-store.js';
import { KnowledgeStore } from '../memory/knowledge-store.js';
import { requireWorkspaceRoot, resolveProjectRootForRuntime } from '../../core/project-root-resolver.js';
import { isExtensionCachePath } from '../contracts/cache-path-rejector.js';

const CWD_FALLBACK_SENTINEL = path.join(
  os.tmpdir(),
  '.maestro-handler-context-no-cwd-fallback-sentinel'
);
const ELICIT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Validate one candidate workspace path: must be a non-empty, non-template
 * string resolving to an existing, non-extension-cache directory. Mirrors
 * `project-root-cache.js`'s `envSuggestion`/`rootsSuggestion` existence gate.
 *
 * @param {unknown} candidatePath
 * @returns {string|null}
 */
function existingWorkspaceCandidate(candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.length === 0 || candidatePath.includes('${')) {
    return null;
  }
  const resolved = path.resolve(candidatePath);
  if (!fs.existsSync(resolved) || isExtensionCachePath(resolved)) {
    return null;
  }
  return resolved;
}

/**
 * @param {object} runtimeConfig
 * @param {object} env
 * @returns {string|null}
 */
function resolveExplicitWorkspaceCandidate(runtimeConfig, env) {
  const workspaceEnvName = runtimeConfig && runtimeConfig.env ? runtimeConfig.env.workspacePath : null;
  if (!workspaceEnvName) {
    return null;
  }
  return existingWorkspaceCandidate(env[workspaceEnvName]);
}

/**
 * @param {Array} clientRoots
 * @returns {string|null}
 */
function resolveClientRootCandidate(clientRoots) {
  for (const root of Array.isArray(clientRoots) ? clientRoots : []) {
    const uri = typeof root === 'string' ? root : root && root.uri;
    if (typeof uri !== 'string') continue;
    let filePath;
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'file:') continue;
      filePath = fileURLToPath(parsed);
    } catch {
      continue;
    }
    const candidate = existingWorkspaceCandidate(filePath);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve the per-call project root using ONLY maestro's runtime-declared
 * workspace signal (env var) or client roots — never the process env's
 * ambient candidate list (`CLAUDE_PROJECT_DIR`/`PWD`/`INIT_CWD`) and never
 * the process cwd. `initialize_workspace` establishes the actual workspace
 * root in the (separately wired) project-root cache, not in an env var, so
 * absent an explicit declared signal this returns `null` rather than
 * guessing from ambient environment. When a genuine signal is present, the
 * candidate -> git-root resolution is delegated to
 * `resolveProjectRootForRuntime`, fed a sentinel `cwd` so its own internal
 * cwd-fallback branch can never be reached.
 *
 * @param {object} runtimeConfig
 * @param {{env?: object, clientRoots?: Array}} options
 * @returns {string|null}
 */
function resolveHandlerProjectRoot(runtimeConfig, options = {}) {
  const env = options.env || process.env;
  const clientRoots = Array.isArray(options.clientRoots) ? options.clientRoots : [];

  const hasGenuineSignal =
    Boolean(resolveExplicitWorkspaceCandidate(runtimeConfig, env)) ||
    Boolean(resolveClientRootCandidate(clientRoots));

  if (!hasGenuineSignal) {
    return null;
  }

  let resolved;
  try {
    resolved = resolveProjectRootForRuntime(runtimeConfig, {
      env,
      cwd: CWD_FALLBACK_SENTINEL,
      clientRoots,
    });
  } catch {
    return null;
  }

  return resolved === CWD_FALLBACK_SENTINEL ? null : resolved;
}

/**
 * Build the lazy, clock-injected `ctx.services` facade. Stateful services
 * (`memoryStore`, `knowledgeStore`) are constructed on first access and
 * memoized; they refuse to build against a null `projectRoot` rather than
 * ever falling back to the process cwd.
 *
 * @param {{projectRoot: string|null, clock: {now: () => Date}, canonicalSrcRoot?: string, workspaceSuggestion?: Function}} options
 */
function buildServices({ projectRoot, clock, canonicalSrcRoot, workspaceSuggestion }) {
  let memoryStoreInstance = null;
  let knowledgeStoreInstance = null;

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
function buildElicit({ server }) {
  return async function elicit(params) {
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
 * Resolves `projectRoot` per call (nullable, never cwd-fallback), bridges the
 * inbound cancellation `signal`, assembles lazy clock-injected `services`,
 * and exposes the single `ctx.elicit` consent seam.
 *
 * @param {object} args - the tool's parsed input arguments
 * @param {{signal?: AbortSignal}} extra - the SDK callback's second argument
 * @param {{server: object, runtimeConfig: object, env?: object, clientRoots?: Array, clock?: {now: () => Date}, services?: {canonicalSrcRoot?: string, workspaceSuggestion?: Function}}} options
 * @returns {{projectRoot: string|null, runtimeConfig: object, signal: AbortSignal|undefined, elicit: Function, services: object}}
 */
function buildHandlerContext(args, extra, options = {}) {
  const { server, runtimeConfig, clock = createSystemClock() } = options;
  const projectRoot = resolveHandlerProjectRoot(runtimeConfig, options);
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
