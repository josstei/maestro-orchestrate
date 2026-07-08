import { defineTool } from '../contracts.js';
import { zodSchemas } from './zod-schemas.js';
import { handleInitializeWorkspace } from '../../handlers/initialize-workspace.js';
import { handleAssessTaskComplexity } from '../../handlers/assess-task-complexity.js';
import { handleValidatePlan } from '../../handlers/validate-plan.js';
import { handleResolveSettings } from '../../handlers/resolve-settings.js';
/**
 * Register the `workspace` pack's tools (`initialize_workspace`,
 * `assess_task_complexity`, `validate_plan`, `resolve_settings`) via
 * `defineTool`, each consuming its shape from `./zod-schemas.js`.
 *
 * `onInitializeWorkspace` is wired as `initialize_workspace`'s pipeline
 * post-call effect, invoked by `createToolPipeline` after a successful
 * handler run, so the caller (the live server) can feed its project-root
 * cache without the pack knowing about it.
 *
 * @param {{server: object, registry: object, onInitializeWorkspace?: (result: object) => void}} options
 */
function registerWorkspacePack({ server, registry, onInitializeWorkspace, ...contextOptions } = {}) {
    defineTool({
        server,
        registry,
        name: 'initialize_workspace',
        description: 'Initialize Maestro workspace directories (state, plans, archives). Requires explicit workspace_path — no cwd or env fallback. Writes a workspace marker for session persistence.',
        schema: zodSchemas.initialize_workspace,
        handler: (args) => handleInitializeWorkspace(args),
        onPostCall: onInitializeWorkspace,
        ...contextOptions,
    });
    defineTool({
        server,
        registry,
        name: 'assess_task_complexity',
        description: 'Analyze repo structure and return factual signals for complexity classification. Does NOT classify — returns signals for the model to interpret.',
        requiresWorkspace: true,
        schema: zodSchemas.assess_task_complexity,
        handler: (args, ctx) => handleAssessTaskComplexity(args, ctx.projectRoot),
        ...contextOptions,
    });
    defineTool({
        server,
        registry,
        name: 'validate_plan',
        description: 'Validate an implementation plan against complexity constraints, file ownership, dependency cycles, and agent registry.',
        schema: zodSchemas.validate_plan,
        handler: (args, ctx) => handleValidatePlan(args, ctx.projectRoot),
        ...contextOptions,
    });
    defineTool({
        server,
        registry,
        name: 'resolve_settings',
        description: 'Resolve Maestro settings using script-accurate precedence (env var > workspace .env > extension .env). Returns resolved values for requested or all known settings.',
        schema: zodSchemas.resolve_settings,
        handler: (args, ctx) => handleResolveSettings(args, ctx.projectRoot),
        ...contextOptions,
    });
}
export { registerWorkspacePack };
