import { createToolPipeline } from '../server/tool-pipeline.js';
/**
 * Create maestro's own cross-pack tool registry, tracking metadata
 * (`requiresWorkspace`) the SDK's `registerTool` config silently drops.
 * Shared across every `defineTool` call in a composition so duplicate tool
 * names across packs are caught at registration time.
 *
 * @returns {{register: (name: string, metadata: {requiresWorkspace?: boolean}) => void, requiresWorkspace: (name: string) => boolean, has: (name: string) => boolean}}
 */
function createMaestroToolRegistry() {
    const requiresWorkspaceByName = new Map();
    return {
        register(name, { requiresWorkspace = false } = {}) {
            if (requiresWorkspaceByName.has(name)) {
                throw new Error(`Duplicate tool name "${name}" is already registered.`);
            }
            requiresWorkspaceByName.set(name, requiresWorkspace === true);
        },
        requiresWorkspace(name) {
            return requiresWorkspaceByName.get(name) === true;
        },
        has(name) {
            return requiresWorkspaceByName.has(name);
        },
    };
}
function defineTool(options = {}) {
    const { server, registry, name, description, schema, handler, requiresWorkspace = false, onPostCall, ...contextOptions } = options;
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
        ...(contextOptions.getProjectRoot === undefined ? {} : { getProjectRoot: contextOptions.getProjectRoot }),
        ...(contextOptions.clock === undefined ? {} : { clock: contextOptions.clock }),
        ...(contextOptions.services === undefined ? {} : { services: contextOptions.services }),
    };
    const callback = createToolPipeline({ name, handler, onPostCall }, pipelineOptions);
    return server.registerTool(name, { description, inputSchema: schema }, callback);
}
export { createMaestroToolRegistry, defineTool };
