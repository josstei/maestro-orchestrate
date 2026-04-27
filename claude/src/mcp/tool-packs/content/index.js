'use strict';

const { defineToolPack } = require('../contracts');
const { createHandler: createSkillContentHandler } = require('../../handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../handlers/get-agent');
const { createHandler: createRuntimeContextHandler } = require('../../handlers/get-runtime-context');
const { createHandler: createAgentRecommendationHandler } = require('../../handlers/agent-recommendation');
const { getDefaultRuntimeConfig } = require('../../runtime/runtime-config-map');

function createToolPack(context = {}) {
  const runtimeConfig = context.runtimeConfig || getDefaultRuntimeConfig();
  const canonicalSrcRoot =
    context.services &&
    typeof context.services.canonicalSrcRoot === 'string' &&
    context.services.canonicalSrcRoot.length > 0
      ? context.services.canonicalSrcRoot
      : undefined;

  return defineToolPack({
    name: 'content',
    tools: [
      {
        name: 'get_skill_content',
        description:
          'Read one or more Maestro skills, protocols, templates, or references from the runtime-configured Maestro content source and apply runtime-specific transforms before returning them.',
        inputSchema: {
          type: 'object',
          properties: {
            resources: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Resource identifiers to read. Skills: "delegation", "execution", "validation", "session-management", "implementation-planning", "code-review", "design-dialogue". Protocols: "agent-base-protocol", "filesystem-safety-protocol". Templates: "design-document", "implementation-plan", "session-state". References: "architecture", "orchestration-steps".',
            },
          },
          required: ['resources'],
        },
      },
      {
        name: 'get_agent',
        description:
          'Read one or more Maestro agent methodology definitions. Returns the methodology body, declared tool restrictions, and a runtime-specific tool_name for dispatch.',
        inputSchema: {
          type: 'object',
          properties: {
            agents: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Agent identifiers (kebab-case or snake_case): "coder", "code-reviewer" / "code_reviewer", "ux-designer" / "ux_designer", etc.',
            },
          },
          required: ['agents'],
        },
      },
      {
        name: 'get_runtime_context',
        description:
          'Returns tool mappings, agent dispatch syntax, MCP prefixes, and path variables for the current Maestro runtime. Call once at session start (step 0) and carry the returned context through the session.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_agent_recommendation',
        description:
          'Recommend a specialist from the Maestro agent roster for a given phase deliverable. Extracts signals from the deliverable text and matches them against each agent\'s declared signals; returns the best match, or falls back to "coder" when no agent meets the minimum match score.',
        inputSchema: {
          type: 'object',
          properties: {
            phase_deliverable: {
              type: 'string',
              description:
                'Free-form text describing what the phase produces (e.g. "build the login API endpoint with rate limiting and security audit").',
            },
          },
          required: ['phase_deliverable'],
        },
      },
    ],
    handlers: {
      get_skill_content: createSkillContentHandler(runtimeConfig, canonicalSrcRoot),
      get_agent: createAgentHandler(runtimeConfig, canonicalSrcRoot),
      get_runtime_context: createRuntimeContextHandler(
        runtimeConfig,
        typeof context.services?.workspaceSuggestion === 'function'
          ? context.services.workspaceSuggestion
          : () => null
      ),
      get_agent_recommendation: createAgentRecommendationHandler(),
    },
  });
}

module.exports = {
  createToolPack,
};
