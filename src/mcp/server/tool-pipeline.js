import { requireWorkspaceRoot } from '../../core/project-root-resolver.js';
import { createToolSuccess, normalizeToolError } from '../core/tool-outcome.js';
import { buildHandlerContext } from './handler-context.js';
import { toolOutcomeToCallToolResult } from './tool-result.js';

/**
 * Compose the reduced decorator pipeline for one registered tool into a
 * ready-to-hand-to-`server.registerTool` SDK callback. Zod/the SDK own
 * argument validation before this callback ever runs, so there is
 * deliberately no validate stage here. Order: workspace gate (only when the
 * tool declares `requiresWorkspace`) -> handler -> error normalization (on
 * throw) -> post-call effect (only after a non-throwing handler return; its
 * own errors are swallowed so they never mask the tool result).
 *
 * @param {{name: string, handler: (args: object, ctx: object) => Promise<unknown>, requiresWorkspace?: boolean, onPostCall?: (result: unknown, args: object) => void}} tool
 * @param {{server: object, runtimeConfig: object, env?: object, clientRoots?: Array, clock?: {now: () => Date}, services?: object}} contextOptions
 * @returns {(args: object, extra: object) => Promise<{content: Array<object>, isError?: true}>}
 */
function createToolPipeline(tool, contextOptions) {
  const { name, handler, requiresWorkspace = false, onPostCall } = tool;

  return async function sdkCallback(args, extra) {
    const ctx = await buildHandlerContext(args, extra, contextOptions);
    let outcome;

    try {
      if (requiresWorkspace) {
        requireWorkspaceRoot(ctx.projectRoot, name);
      }

      const result = await handler(args, ctx);
      outcome = createToolSuccess(result);

      if (typeof onPostCall === 'function') {
        try {
          onPostCall(result, args);
        } catch {
          // Post-call effects must never mask the tool result.
        }
      }
    } catch (error) {
      outcome = normalizeToolError(name, error);
    }

    return toolOutcomeToCallToolResult(outcome);
  };
}

export { createToolPipeline };
