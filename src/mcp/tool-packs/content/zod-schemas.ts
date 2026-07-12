import { z } from 'zod';
import type { ToolSchemaMap } from '../command-table.js';

export const zodSchemas = {
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
      .array(z.string())
      .min(1)
      .describe(
        'Agent identifiers (kebab-case or snake_case): "coder", "code-reviewer" / "code_reviewer", "ux-designer" / "ux_designer", etc.',
      ),
  },
  get_runtime_context: {},
} satisfies ToolSchemaMap;
