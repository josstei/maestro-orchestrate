import { z } from 'zod';
import { PHASE_ID } from '../zod-fragments.js';
import type { ToolSchemaMap } from '../command-table.js';

export const zodSchemas = {
  fork_session: {
    source_session_id: z.string(),
    new_session_id: z.string(),
    branch: z.string().nullable().optional(),
  },
  list_lineage: {
    session_id: z.string(),
  },
  list_checkpoints: {
    session_id: z.string(),
  },
  restore_checkpoint: {
    session_id: z.string(),
    phase_id: PHASE_ID,
  },
  instantiate_session_blueprint: {
    blueprint_id: z.string(),
    task: z.string(),
  },
  list_session_blueprints: {},
} satisfies ToolSchemaMap;
