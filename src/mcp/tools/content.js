'use strict';

const { handleGetAgent, handleGetSkillContent } = require('../handlers/content');
const { handleGetRuntimeContext } = require('../handlers/get-runtime-context');

module.exports = {
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
      handler: handleGetSkillContent,
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
      handler: handleGetAgent,
    },
    {
      name: 'get_runtime_context',
      description:
        'Returns tool mappings, agent dispatch syntax, MCP prefixes, and path variables for the current Maestro runtime. Call once at session start (step 0) and carry the returned context through the session.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: handleGetRuntimeContext,
    },
  ],
};
