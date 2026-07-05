import { z } from 'zod';

export const zodSchemas = {
  initialize_workspace: {
    workspace_path: z
      .string()
      .describe(
        'Absolute path to the user workspace. Required. Must not be inside an extension cache directory.',
      ),
    state_dir: z
      .string()
      .describe('State directory relative to workspace_path. Defaults to docs/maestro.')
      .optional(),
  },
  assess_task_complexity: {
    task_description: z
      .string()
      .describe('The task description (reserved for future keyword analysis).')
      .optional(),
  },
  validate_plan: {
    plan: z.record(z.unknown()),
    task_complexity: z.enum(['simple', 'medium', 'complex']),
  },
  resolve_settings: {
    settings: z
      .array(z.string())
      .describe(
        'Setting names to resolve (e.g., ["MAESTRO_DISABLED_AGENTS"]). If empty or omitted, resolves all known settings.',
      )
      .optional(),
  },
};
