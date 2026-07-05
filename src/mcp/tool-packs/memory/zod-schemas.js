import { z } from 'zod';
import { PHASE_ID } from '../zod-fragments.js';

export const zodSchemas = {
  get_project_profile: {},
  update_project_profile: {
    build_commands: z.array(z.string()).optional(),
    test_commands: z.array(z.string()).optional(),
    lint_commands: z.array(z.string()).optional(),
    conventions: z.array(z.string()).optional(),
    do_not_touch: z.array(z.string()).optional(),
    preferred_agents: z.array(z.string()).optional(),
    blocked_agents: z.array(z.string()).optional(),
  },
  record_validation_commands: {
    commands: z
      .object({
        build: z.array(z.string()).optional(),
        test: z.array(z.string()).optional(),
        lint: z.array(z.string()).optional(),
      })
      .passthrough(),
  },
  get_agent_performance: {
    agent: z
      .string()
      .describe('Optional agent name to narrow the priors to a single agent.')
      .optional(),
  },
  recall_similar_sessions: {
    query: z
      .string()
      .describe('Free-text task description to match against archived sessions.'),
    limit: z
      .number()
      .int()
      .min(1)
      .default(5)
      .describe('Maximum number of ranked precedents to return.'),
  },
  rate_phase: {
    session_id: z.string(),
    phase_id: PHASE_ID,
    rating: z.enum(['up', 'down']),
    note: z.string().optional(),
  },
  rate_session: {
    session_id: z.string(),
    rating: z.enum(['up', 'down']),
    note: z.string().optional(),
  },
  get_plan_accuracy: {},
  query_architecture_memory: {
    query: z
      .string()
      .describe(
        'Optional case-insensitive substring to match against architecture-memory entry values.',
      )
      .optional(),
  },
  get_agent_memory: {
    agent: z.string().describe('Agent identifier to read memory for.'),
  },
  append_agent_memory: {
    agent: z.string().describe('Agent identifier to append memory for.'),
    note: z.string().describe('Non-empty memory note to append.'),
  },
  compact_archive: {},
  record_knowledge: {
    topic: z.string().describe('Short topic label for the knowledge note.'),
    note: z.string().describe('Non-empty note content. Do not store secrets.'),
  },
  query_knowledge: {
    query: z
      .string()
      .describe('Optional case-insensitive substring to match against topic or note.')
      .optional(),
  },
  export_memory_pack: {},
  import_memory_pack: {
    path: z
      .string()
      .describe(
        'Optional path to a memory pack under the resolved Maestro state directory. Defaults to memory-pack.json.',
      )
      .optional(),
  },
};
