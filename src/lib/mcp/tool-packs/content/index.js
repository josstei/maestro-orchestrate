'use strict';

const { defineToolPack } = require('../contracts');
const { createHandler: createSkillContentHandler } = require('../../handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../handlers/get-agent');
const { createHandler: createRuntimeContextHandler } = require('../../handlers/get-runtime-context');
const { getDefaultRuntimeConfig } = require('../../runtime/runtime-config-map');

function createToolPack(context = {}) {
  const runtimeConfig = context.runtimeConfig || getDefaultRuntimeConfig();

  return defineToolPack({
    name: 'content',
    tools: [
      {
        name: 'get_skill_content',
        description:
          'Read one or more Maestro skills, protocols, templates, or references from canonical src/ content and apply runtime-specific transforms before returning them.',
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
          'Read one or more Maestro agent methodology definitions by kebab-case name. Returns the runtime-appropriate methodology body plus declared tool restrictions.',
        inputSchema: {
          type: 'object',
          properties: {
            agents: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Agent names (kebab-case): "coder", "code-reviewer", "architect", etc.',
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
    ],
    handlers: {
      get_skill_content: createSkillContentHandler(runtimeConfig),
      get_agent: createAgentHandler(runtimeConfig),
      get_runtime_context: createRuntimeContextHandler(runtimeConfig),
    },
  });
}

module.exports = {
  createToolPack,
};
