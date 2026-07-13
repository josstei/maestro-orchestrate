import { createToolPipeline } from '../server/tool-pipeline.js';
import type { HandlerContextOptions, MaestroToolRegistry, ToolHandler, ToolPostCall, ToolRegistryMetadata } from '../server/tool-types.js';

export type RegisterableMcpServer = {
  registerTool<TRegisteredArgs = unknown>(
    name: string,
    config: { description?: string | undefined; inputSchema?: unknown },
    callback: (args: TRegisteredArgs, extra: { signal?: AbortSignal }) => Promise<unknown>,
  ): unknown;
};

type DefineToolOptions<TArgs = unknown, TResult = unknown> = HandlerContextOptions & {
  server: RegisterableMcpServer;
  registry: MaestroToolRegistry;
  name: string;
  description?: string;
  schema?: unknown;
  handler: ToolHandler<TArgs, TResult>;
  requiresWorkspace?: boolean;
  onPostCall?: ToolPostCall<TArgs, TResult> | undefined;
};

/**
 * Create maestro's own cross-pack tool registry, tracking metadata
 * (`requiresWorkspace`) the SDK's `registerTool` config silently drops.
 * Shared across every `defineTool` call in a composition so duplicate tool
 * names across packs are caught at registration time.
 *
 * @returns {{register: (name: string, metadata: {requiresWorkspace?: boolean}) => void, requiresWorkspace: (name: string) => boolean, has: (name: string) => boolean}}
 */
function createMaestroToolRegistry(): MaestroToolRegistry {
  const requiresWorkspaceByName = new Map<string, boolean>();

  return {
    register(name: string, { requiresWorkspace = false }: ToolRegistryMetadata = {}) {
      if (requiresWorkspaceByName.has(name)) {
        throw new Error(`Duplicate tool name "${name}" is already registered.`);
      }
      requiresWorkspaceByName.set(name, requiresWorkspace === true);
    },
    requiresWorkspace(name: string) {
      return requiresWorkspaceByName.get(name) === true;
    },
    has(name: string) {
      return requiresWorkspaceByName.has(name);
    },
  };
}

/**
 * Register a tool via the SDK's `server.registerTool`, composed with
 * maestro's reduced decorator pipeline (workspace gate -> handler -> error
 * normalization -> post-call). `requiresWorkspace` lives in maestro's own
 * `registry` (see `createMaestroToolRegistry`) — `registerTool` destructures
 * only `{title, description, inputSchema, outputSchema, annotations, _meta}`
 * from its config and silently drops any other field, so the SDK never sees
 * `requiresWorkspace`. The pipeline resolves the workspace gate from
 * `registry.requiresWorkspace(name)` at call time, making the registry the
 * single source of truth for tool metadata. Throws when `name` duplicates a
 * tool already present in `registry` (cross-pack duplicate detection).
 *
 * @param {{server: object, registry: object, name: string, description?: string, schema?: object, handler: Function, requiresWorkspace?: boolean, runtimeConfig?: object, onPostCall?: Function, env?: object, clientRoots?: Array, services?: object}} options
 * @returns {*} the SDK's `RegisteredTool`
 */
function defineTool<TArgs = unknown, TResult = unknown>(options: DefineToolOptions<TArgs, TResult>): unknown;
function defineTool<TArgs = unknown, TResult = unknown>(
  options: Partial<DefineToolOptions<TArgs, TResult>> = {},
) {
  const {
    server,
    registry,
    name,
    description,
    schema,
    handler,
    requiresWorkspace = false,
    onPostCall,
    ...contextOptions
  } = options;

  if (!server || typeof server.registerTool !== 'function') {
    throw new TypeError('defineTool requires an SDK server exposing registerTool.');
  }
  if (!registry || typeof registry.register !== 'function') {
    throw new TypeError('defineTool requires a maestro tool registry (see createMaestroToolRegistry).');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('defineTool requires a non-empty tool name.');
  }
  if (typeof handler !== 'function') {
    throw new TypeError(`defineTool "${name}" requires a handler function.`);
  }
  if (!('runtimeConfig' in contextOptions)) {
    throw new TypeError(`defineTool "${name}" requires runtimeConfig.`);
  }

  registry.register(name, { requiresWorkspace: requiresWorkspace === true });

  const pipelineOptions = {
    server,
    registry,
    runtimeConfig: contextOptions.runtimeConfig,
    ...(contextOptions.getWorkspaceState === undefined ? {} : { getWorkspaceState: contextOptions.getWorkspaceState }),
    ...(contextOptions.getProjectRoot === undefined ? {} : { getProjectRoot: contextOptions.getProjectRoot }),
    ...(contextOptions.getStateDirPath === undefined ? {} : { getStateDirPath: contextOptions.getStateDirPath }),
    ...(contextOptions.services === undefined ? {} : { services: contextOptions.services }),
  };
  const callback = createToolPipeline(
    { name, handler, onPostCall },
    pipelineOptions,
  );

  return server.registerTool(name, { description, inputSchema: schema }, callback);
}

export { createMaestroToolRegistry, defineTool };
