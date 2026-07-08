import { requireWorkspaceRoot } from '../../core/project-root-resolver.js';
import { createToolSuccess, normalizeToolError } from './tool-outcome.js';
import { buildHandlerContext } from './handler-context.js';
import { toolOutcomeToCallToolResult } from './tool-result.js';
/**
 * Compose the reduced decorator pipeline for one registered tool into a
 * ready-to-hand-to-`server.registerTool` SDK callback. Zod/the SDK own
 * argument validation before this callback ever runs, so there is
 * deliberately no validate stage here. Order: workspace gate (resolved from
 * `registry.requiresWorkspace(name)` — the registry is the single source of
 * truth for tool metadata) -> handler -> error normalization (on throw) ->
 * post-call effect (only after a non-throwing handler return; its own errors
 * are swallowed so they never mask the tool result).
 *
 */
function createToolPipeline(tool, contextOptions) {
    const { name, handler, onPostCall } = tool;
    const { registry, ...handlerContextOptions } = contextOptions;
    return async function sdkCallback(args, extra) {
        const ctx = await buildHandlerContext(args, extra, handlerContextOptions);
        let outcome;
        try {
            if (registry.requiresWorkspace(name)) {
                requireWorkspaceRoot(ctx.projectRoot, name);
            }
            const result = await handler(args, ctx);
            outcome = createToolSuccess(result);
            if (typeof onPostCall === 'function') {
                try {
                    await onPostCall(result, args);
                }
                catch {
                }
            }
        }
        catch (error) {
            outcome = normalizeToolError(name, error);
        }
        return toolOutcomeToCallToolResult(outcome);
    };
}
export { createToolPipeline };
