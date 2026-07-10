import { z } from 'zod';
import { parseSessionId } from '../../lib/validation/index.js';
import type {
  SessionId,
  sessionIdBrand,
} from '../../lib/validation/index.js';
import { CanonicalDownstreamContextSchema } from './downstream-context.js';
import { PlanPhaseIdSchema, WirePhaseIdSchema } from './plan-schema.js';

function sessionIdZodIssue(error: unknown) {
  return {
    code: z.ZodIssueCode.custom,
    message:
      error instanceof Error
        ? error.message
        : 'Invalid session_id: must match pattern [a-zA-Z0-9_-]+',
  } as const;
}

const SessionIdSchema: z.ZodType<SessionId, z.ZodTypeDef, string> = z
  .string()
  .transform((value, context): SessionId => {
    try {
      return parseSessionId(value);
    } catch (error) {
      context.addIssue(sessionIdZodIssue(error));
      return z.NEVER;
    }
  });

const PhaseTokenUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cached: z.number(),
}).strict();

const AgentTokenUsageSchema = PhaseTokenUsageSchema.extend({
  phases: z.number(),
  duration_ms: z.number(),
}).strict();

const SessionTokenUsageSchema = z.object({
  total_input: z.number(),
  total_output: z.number(),
  total_cached: z.number(),
  by_agent: z.record(AgentTokenUsageSchema),
}).strict();

const SessionPhaseStateSchema = z.object({
  id: PlanPhaseIdSchema,
  name: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']),
  agents: z.array(z.string()),
  parallel: z.boolean(),
  started: z.string().nullable(),
  completed: z.string().nullable(),
  blocked_by: z.array(PlanPhaseIdSchema),
  files_created: z.array(z.string()),
  files_modified: z.array(z.string()),
  files_deleted: z.array(z.string()),
  planned_files: z.array(z.string()).optional(),
  downstream_context: CanonicalDownstreamContextSchema,
  errors: z.array(z.unknown()),
  retry_count: z.number(),
  blocker_count: z.number(),
  review_finding_count: z.number(),
  requires_reconciliation: z.boolean().optional(),
  reconciliation_reason: z.string().optional(),
  duration_ms: z.number().optional(),
  token_usage: PhaseTokenUsageSchema.optional(),
}).strict();

const SessionStateSchema = z.object({
  schema_version: z.number().int().nonnegative(),
  session_id: SessionIdSchema,
  parent_session_id: SessionIdSchema.nullable(),
  branch: z.string().nullable(),
  task: z.string().nullable(),
  created: z.string(),
  updated: z.string(),
  status: z.enum(['in_progress', 'completed']),
  workflow_mode: z.string(),
  design_document: z.string().nullable(),
  implementation_plan: z.string().nullable(),
  current_phase: PlanPhaseIdSchema.nullable(),
  total_phases: z.number().int().nonnegative(),
  execution_mode: z.string().nullable(),
  execution_backend: z.string(),
  current_batch: z.string().nullable(),
  task_complexity: z.string().nullable(),
  token_usage: SessionTokenUsageSchema,
  phases: z.array(SessionPhaseStateSchema),
}).strict();

const ReadableCanonicalDownstreamContextSchema =
  CanonicalDownstreamContextSchema.partial().passthrough();

const ReadablePhaseTokenUsageSchema =
  PhaseTokenUsageSchema.partial().passthrough();

const ReadableAgentTokenUsageSchema =
  AgentTokenUsageSchema.partial().passthrough();

const ReadableSessionTokenUsageSchema = z.object({
  total_input: z.number().optional(),
  total_output: z.number().optional(),
  total_cached: z.number().optional(),
  by_agent: z.record(ReadableAgentTokenUsageSchema).optional(),
}).passthrough();

const ReadableSessionPhaseStateSchema = z.object({
  id: WirePhaseIdSchema,
  name: z.string(),
  status: z.string(),
  agents: z.array(z.string()),
  parallel: z.boolean().optional(),
  started: z.string().nullable().optional(),
  completed: z.string().nullable().optional(),
  blocked_by: z.array(WirePhaseIdSchema).optional(),
  files_created: z.array(z.string()).optional(),
  files_modified: z.array(z.string()).optional(),
  files_deleted: z.array(z.string()).optional(),
  planned_files: z.array(z.string()).optional(),
  downstream_context: ReadableCanonicalDownstreamContextSchema.optional(),
  errors: z.array(z.unknown()).optional(),
  retry_count: z.number().optional(),
  blocker_count: z.number().optional(),
  review_finding_count: z.number().optional(),
  requires_reconciliation: z.boolean().optional(),
  reconciliation_reason: z.string().optional(),
  duration_ms: z.number().optional(),
  token_usage: ReadablePhaseTokenUsageSchema.optional(),
}).passthrough();

const ReadableSessionStateSchema = z.object({
  schema_version: z.number().int().nonnegative(),
  session_id: SessionIdSchema,
  status: z.string(),
  phases: z.array(ReadableSessionPhaseStateSchema),
  parent_session_id: SessionIdSchema.nullable().optional(),
  branch: z.string().nullable().optional(),
  task: z.string().nullable().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  workflow_mode: z.string().optional(),
  design_document: z.string().nullable().optional(),
  implementation_plan: z.string().nullable().optional(),
  current_phase: WirePhaseIdSchema.nullable().optional(),
  total_phases: z.number().int().nonnegative().optional(),
  execution_mode: z.string().nullable().optional(),
  execution_backend: z.string().optional(),
  current_batch: z.string().nullable().optional(),
  task_complexity: z.string().nullable().optional(),
  token_usage: ReadableSessionTokenUsageSchema.optional(),
}).passthrough();

type SessionPhaseState = z.infer<typeof SessionPhaseStateSchema>;
type ReadableSessionPhaseState = z.infer<typeof ReadableSessionPhaseStateSchema>;
type SessionState = z.infer<typeof SessionStateSchema>;
type ReadableSessionState = z.infer<typeof ReadableSessionStateSchema>;
type SessionTokenUsage = z.infer<typeof SessionTokenUsageSchema>;

export {
  AgentTokenUsageSchema,
  PhaseTokenUsageSchema,
  ReadableSessionPhaseStateSchema,
  ReadableSessionStateSchema,
  SessionIdSchema,
  SessionPhaseStateSchema,
  SessionStateSchema,
  SessionTokenUsageSchema,
  sessionIdZodIssue,
};
export type {
  ReadableSessionPhaseState,
  ReadableSessionState,
  SessionPhaseState,
  SessionState,
  SessionTokenUsage,
};
