'use strict';

const { defineToolPack } = require('../contracts');
const {
  handleInitializeWorkspace,
} = require('../../handlers/initialize-workspace');
const {
  handleAssessTaskComplexity,
} = require('../../handlers/assess-task-complexity');
const { handleValidatePlan } = require('../../handlers/validate-plan');
const { handleResolveSettings } = require('../../handlers/resolve-settings');

function createToolPack() {
  return defineToolPack({
    name: 'workspace',
    tools: [
      {
        name: 'initialize_workspace',
        description:
          'Initialize Maestro workspace directories (state, plans, archives). Idempotent.',
        inputSchema: {
          type: 'object',
          properties: {
            state_dir: {
              type: 'string',
              description:
                'State directory relative to project root. Defaults to docs/maestro.',
            },
          },
        },
      },
      {
        name: 'assess_task_complexity',
        description:
          'Analyze repo structure and return factual signals for complexity classification. Does NOT classify — returns signals for the model to interpret.',
        inputSchema: {
          type: 'object',
          properties: {
            task_description: {
              type: 'string',
              description:
                'The task description (reserved for future keyword analysis).',
            },
          },
        },
      },
      {
        name: 'validate_plan',
        description:
          'Validate an implementation plan against complexity constraints, file ownership, dependency cycles, and agent registry.',
        inputSchema: {
          type: 'object',
          properties: {
            plan: { type: 'object' },
            task_complexity: {
              type: 'string',
              enum: ['simple', 'medium', 'complex'],
            },
          },
          required: ['plan', 'task_complexity'],
        },
      },
      {
        name: 'resolve_settings',
        description:
          'Resolve Maestro settings using script-accurate precedence (env var > workspace .env > extension .env). Returns resolved values for requested or all known settings.',
        inputSchema: {
          type: 'object',
          properties: {
            settings: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Setting names to resolve (e.g., ["MAESTRO_DISABLED_AGENTS"]). If empty or omitted, resolves all known settings.',
            },
          },
        },
      },
    ],
    handlers: {
      initialize_workspace: handleInitializeWorkspace,
      assess_task_complexity: handleAssessTaskComplexity,
      validate_plan: handleValidatePlan,
      resolve_settings: handleResolveSettings,
    },
  });
}

module.exports = {
  createToolPack,
};
