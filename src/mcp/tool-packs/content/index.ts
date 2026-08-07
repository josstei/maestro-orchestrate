import { defineCommandTable, registerCommandTable, withHandlerContext, type ToolSchemaMap } from '../command-table.js';
import { z } from 'zod';
import { handleGetSkillContent } from '../../handlers/get-skill-content.js';
import { handleGetAgent } from '../../handlers/get-agent.js';
import { handleGetRuntimeContext } from '../../handlers/get-runtime-context.js';

const zodSchemas = {
  get_skill_content: {
    resources: z
      .array(z.string())
      .min(1)
      .describe(
        'Resource identifiers to read. Skills: "delegation", "execution", "validation", "session-management", "implementation-planning", "code-review", "design-dialogue". Protocols: "agent-base-protocol", "filesystem-safety-protocol". Templates: "design-document", "implementation-plan", "session-state". References: "architecture", "orchestration-steps".',
      ),
  },
  get_agent: {
    agents: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Canonical agent list or scalar string (e.g. ["coder"], "coder", ["code_reviewer"]).',
      ),
    agent: z
      .string()
      .optional()
      .describe(
        'Compatibility alias for a single agent identifier (e.g. "coder"). Canonical form is agents array.',
      ),
  },
  get_runtime_context: {},
} satisfies ToolSchemaMap;

const contentCommands = defineCommandTable(zodSchemas, {
  get_skill_content: {
    description:
      'Read one or more Maestro skills, protocols, templates, or references from the runtime-configured Maestro content source and apply runtime-specific transforms before returning them.',
    handler: withHandlerContext(handleGetSkillContent),
  },
  get_agent: {
    description:
      'Read one or more Maestro agent methodology definitions. Accepts canonical agents array or compatibility scalar/alias forms. Returns the methodology body, declared tool restrictions, and a runtime-specific tool_name for dispatch.',
    handler: withHandlerContext(handleGetAgent),
  },
  get_runtime_context: {
    description:
      'Returns tool mappings, agent dispatch syntax, MCP prefixes, and path variables for the current Maestro runtime. Call once at session start (step 0) and carry the returned context through the session.',
    handler: withHandlerContext(handleGetRuntimeContext),
  },
});

function registerContentPack({ server, registry, ...contextOptions }: any = {}) {
  registerCommandTable(zodSchemas, contentCommands, {
    server,
    registry,
    ...contextOptions,
  });
}

export { registerContentPack, zodSchemas };
