'use strict';

const { defineTool } = require('../../core/create-server');
const {
  handleInitializeWorkspace,
} = require('../../handlers/initialize-workspace');
const {
  handleAssessTaskComplexity,
} = require('../../handlers/assess-task-complexity');
const { handleValidatePlan } = require('../../handlers/validate-plan');
const { handleResolveSettings } = require('../../handlers/resolve-settings');
const { TASK_COMPLEXITY_SCHEMA } = require('../../contracts/plan-schema');

function createToolPack({ services }) {
  return {
    name: 'workspace',
    tools: [
      defineTool(
        'initialize_workspace',
        'Initialize Maestro workspace directories (state, plans, archives). Requires explicit workspace_path — no cwd or env fallback.',
        {
          workspace_path: {
            type: 'string',
            description:
              'Absolute path to the user workspace. Required. Must not be inside an extension cache directory.',
          },
          state_dir: {
            type: 'string',
            description:
              'State directory relative to workspace_path. Defaults to docs/maestro.',
          },
        },
        async (params, projectRoot) => {
          const result = await handleInitializeWorkspace(params, projectRoot);
          if (typeof services.setWorkspacePath === 'function') {
            services.setWorkspacePath(result.workspace_path);
          }
          return result;
        },
        { required: ['workspace_path'] }
      ),
      defineTool(
        'assess_task_complexity',
        'Analyze repo structure and return factual signals for complexity classification. Does NOT classify — returns signals for the model to interpret.',
        {
          task_description: {
            type: 'string',
            description:
              'The task description (reserved for future keyword analysis).',
          },
        },
        handleAssessTaskComplexity,
        { requiresWorkspace: true }
      ),
      defineTool(
        'validate_plan',
        'Validate an implementation plan against complexity constraints, file ownership, dependency cycles, and agent registry.',
        {
          plan: { type: 'object' },
          task_complexity: TASK_COMPLEXITY_SCHEMA,
        },
        handleValidatePlan,
        { required: ['plan', 'task_complexity'] }
      ),
      defineTool(
        'resolve_settings',
        'Resolve Maestro settings using script-accurate precedence (env var > workspace .env > extension .env). Returns resolved values for requested or all known settings.',
        {
          settings: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Setting names to resolve (e.g., ["MAESTRO_DISABLED_AGENTS"]). If empty or omitted, resolves all known settings.',
          },
        },
        handleResolveSettings
      ),
    ],
  };
}

module.exports = {
  createToolPack,
};
