import { z } from 'zod';
import { parseSessionId } from '../../lib/validation/index.js';
import type {
  SessionId,
  sessionIdBrand,
} from '../../lib/validation/index.js';
import {
  CanonicalDownstreamContextSchema,
  createEmptyDownstreamContext,
} from './downstream-context.js';
import { PlanPhaseIdSchema, WirePhaseIdSchema } from './plan-schema.js';
import type { PhaseId } from './plan-schema.js';

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

const CompletionReviewStatusSchema = z.enum([
  'not_required',
  'pending',
  'passed',
  'blocked',
]);

const CompletionReviewSchema = z.object({
  required: z.boolean(),
  status: CompletionReviewStatusSchema,
  reviewer_agent: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  reviewed_phase_ids: z.array(PlanPhaseIdSchema),
  finding_count: z.number().int().nonnegative(),
  blocking_finding_count: z.number().int().nonnegative(),
  reviewed_files: z.array(z.string()),
  summary: z.string().nullable(),
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
  completion_review: CompletionReviewSchema.optional(),
  phases: z.array(SessionPhaseStateSchema),
}).strict();

const ReadableCanonicalDownstreamContextSchema =
  CanonicalDownstreamContextSchema.partial().passthrough();

const ReadablePhaseTokenUsageSchema =
  PhaseTokenUsageSchema.partial().passthrough();

const ReadableAgentTokenUsageSchema =
  AgentTokenUsageSchema.partial().passthrough();

const ReadableSessionTokenUsageSchema = SessionTokenUsageSchema.partial()
  .extend({
    by_agent: z.record(ReadableAgentTokenUsageSchema).optional(),
  })
  .passthrough();

const ReadableCompletionReviewSchema = CompletionReviewSchema.partial().passthrough();

const ReadableSessionPhaseStateSchema = SessionPhaseStateSchema.partial()
  .extend({
    id: WirePhaseIdSchema,
    name: z.string(),
    status: z.string(),
    agents: SessionPhaseStateSchema.shape.agents,
    blocked_by: z.array(WirePhaseIdSchema).optional(),
    downstream_context: ReadableCanonicalDownstreamContextSchema.optional(),
    token_usage: ReadablePhaseTokenUsageSchema.optional(),
  })
  .passthrough();

const ReadableOptionalSessionFieldsSchema = SessionStateSchema.omit({
  schema_version: true,
  session_id: true,
  status: true,
  phases: true,
}).partial().extend({
  current_phase: WirePhaseIdSchema.nullable().optional(),
  token_usage: ReadableSessionTokenUsageSchema.optional(),
  completion_review: ReadableCompletionReviewSchema.optional(),
});

const ReadableSessionStateSchema = z.object({
  schema_version: SessionStateSchema.shape.schema_version,
  session_id: SessionIdSchema,
  status: z.string(),
  phases: z.array(ReadableSessionPhaseStateSchema),
}).extend(ReadableOptionalSessionFieldsSchema.shape).passthrough();

type CompletionReview = z.infer<typeof CompletionReviewSchema>;
type SessionPhaseState = z.infer<typeof SessionPhaseStateSchema>;
type ReadableSessionPhaseState = z.infer<typeof ReadableSessionPhaseStateSchema>;
type SessionState = z.infer<typeof SessionStateSchema>;
type ReadableSessionState = z.infer<typeof ReadableSessionStateSchema>;
type SessionTokenUsage = z.infer<typeof SessionTokenUsageSchema>;

type PendingPhaseSeed = {
  id: PhaseId;
  name: string;
  agents: readonly string[];
  parallel: boolean;
  blockedBy: readonly PhaseId[];
  plannedFiles?: readonly string[];
};

function createDefaultCompletionReview(): CompletionReview {
  return {
    required: false,
    status: 'not_required',
    reviewer_agent: null,
    reviewed_at: null,
    reviewed_phase_ids: [],
    finding_count: 0,
    blocking_finding_count: 0,
    reviewed_files: [],
    summary: null,
  };
}

function createPendingPhaseProgress() {
  return {
    started: null,
    completed: null,
    files_created: [],
    files_modified: [],
    files_deleted: [],
    downstream_context: createEmptyDownstreamContext(),
    errors: [],
    retry_count: 0,
    blocker_count: 0,
    review_finding_count: 0,
  };
}

function createPendingPhaseState(seed: PendingPhaseSeed): SessionPhaseState {
  const progress = createPendingPhaseProgress();
  return {
    id: seed.id,
    name: seed.name,
    status: 'pending',
    agents: [...seed.agents],
    parallel: seed.parallel,
    started: progress.started,
    completed: progress.completed,
    blocked_by: [...seed.blockedBy],
    files_created: progress.files_created,
    files_modified: progress.files_modified,
    files_deleted: progress.files_deleted,
    ...(seed.plannedFiles === undefined
      ? {}
      : { planned_files: [...seed.plannedFiles] }),
    downstream_context: progress.downstream_context,
    errors: progress.errors,
    retry_count: progress.retry_count,
    blocker_count: progress.blocker_count,
    review_finding_count: progress.review_finding_count,
  };
}

function resetPhaseToPending(
  phase: ReadableSessionPhaseState
): ReadableSessionPhaseState {
  const next: Record<string, unknown> = {
    ...phase,
    status: 'pending',
    ...createPendingPhaseProgress(),
    requires_reconciliation: false,
  };
  delete next.duration_ms;
  delete next.token_usage;
  return next as ReadableSessionPhaseState;
}

function createEmptySessionTokenUsage(): SessionTokenUsage {
  return {
    total_input: 0,
    total_output: 0,
    total_cached: 0,
    by_agent: {},
  };
}

export {
  AgentTokenUsageSchema,
  CompletionReviewSchema,
  PhaseTokenUsageSchema,
  ReadableSessionPhaseStateSchema,
  ReadableSessionStateSchema,
  SessionIdSchema,
  SessionPhaseStateSchema,
  SessionStateSchema,
  SessionTokenUsageSchema,
  createDefaultCompletionReview,
  createEmptySessionTokenUsage,
  createPendingPhaseProgress,
  createPendingPhaseState,
  resetPhaseToPending,
  sessionIdZodIssue,
};
export type {
  CompletionReview,
  ReadableSessionPhaseState,
  ReadableSessionState,
  PendingPhaseSeed,
  SessionPhaseState,
  SessionState,
  SessionTokenUsage,
};
