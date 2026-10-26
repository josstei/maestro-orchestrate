'use strict';

const path = require('node:path');
const { defineTool } = require('../../core/create-server');
const { createHandler: createSkillContentHandler } = require('../../handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../handlers/get-agent');
const { createHandler: createRuntimeContextHandler } = require('../../handlers/get-runtime-context');

// Content comes from the src/ tree this module runs from, like the registries.
const CANONICAL_SRC_ROOT = path.resolve(__dirname, '..', '..', '..');

function createToolPack({ runtimeConfig, services }) {
  const srcRoot = services.canonicalSrcRoot || CANONICAL_SRC_ROOT;

  return {
    name: 'content',
    tools: [
      defineTool(
        'get_skill_content',
        'Read one or more Maestro skills, protocols, templates, or references from the runtime-configured Maestro content source and apply runtime-specific transforms before returning them.',
        {
          resources: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Resource identifiers to read. Skills: "delegation", "execution", "validation", "session-management", "implementation-planning", "code-review", "design-dialogue". Protocols: "agent-base-protocol", "filesystem-safety-protocol". Templates: "design-document", "implementation-plan", "session-state". References: "architecture", "orchestration-steps".',
          },
        },
        createSkillContentHandler(runtimeConfig, srcRoot),
        { required: ['resources'] }
      ),
      defineTool(
        'get_agent',
        'Read one or more Maestro agent methodology definitions. Returns the methodology body, declared tool restrictions, and a runtime-specific tool_name for dispatch.',
        {
          agents: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Agent identifiers (kebab-case or snake_case): "coder", "code-reviewer" / "code_reviewer", "ux-designer" / "ux_designer", etc.',
          },
        },
        createAgentHandler(runtimeConfig, srcRoot),
        { required: ['agents'] }
      ),
      defineTool(
        'get_runtime_context',
        'Returns tool mappings, agent dispatch syntax, MCP prefixes, and path variables for the current Maestro runtime. Call once at session start (step 0) and carry the returned context through the session.',
        {},
        createRuntimeContextHandler(runtimeConfig, services.workspaceSuggestion)
      ),
    ],
  };
}

module.exports = {
  createToolPack,
};
