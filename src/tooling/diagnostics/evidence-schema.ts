import { z } from 'zod';

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, 'Expected a 64-character SHA-256 digest');
export const GitCommitShaSchema = z.string().regex(/^[0-9a-f]{40}$/i, 'Expected a full 40-character Git commit SHA');
export const IsoTimestampSchema = z.string().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  'Expected an ISO-8601 timestamp',
);

export const RepositoryMetadataSchema = z.object({
  url_or_name: z.string().min(1),
  branch: z.string().min(1),
  commit_sha: GitCommitShaSchema,
  dirty: z.boolean(),
  diff_hash: Sha256Schema.nullable(),
});

export const RuntimeMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).nullable(),
  maestro_version: z.string().min(1).nullable().optional(),
  model: z.string().min(1).nullable(),
  model_id: z.string().min(1).nullable().optional(),
});

export const EnvironmentMetadataSchema = z.object({
  node_version: z.string(),
  npm_version: z.string(),
  platform: z.string(),
  arch: z.string(),
  agy_cli_version: z.string().min(1).nullable().optional(),
  maestro_version: z.string().min(1).nullable().optional(),
});

export const TimestampMetadataSchema = z.object({
  start: IsoTimestampSchema,
  end: IsoTimestampSchema,
  wall_duration_ms: z.number().nonnegative(),
});

export const EvidenceFileEntrySchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
});

export const EvidenceOutcomeSummarySchema = z.object({
  overall: z.boolean(),
  protocol_compliant: z.boolean(),
  delegation_successful: z.boolean(),
  code_review_passed: z.boolean(),
  production_ready: z.boolean(),
});

export const EvidenceManifestSchema = z.object({
  schema_version: z.literal(2),
  run_id: z.string().min(1),
  repository: RepositoryMetadataSchema,
  runtime: RuntimeMetadataSchema,
  environment: EnvironmentMetadataSchema,
  timestamps: TimestampMetadataSchema,
  evidence_files: z.array(EvidenceFileEntrySchema),
  redaction_policy_version: z.string().min(1),
  outcome: EvidenceOutcomeSummarySchema,
  report_path: z.string().nullable(),
});

export const TimelineEventSchema = z.object({
  offset_ms: z.number().nonnegative(),
  timestamp: IsoTimestampSchema,
  stage_id: z.string().min(1),
  operation: z.string().min(1),
  duration_ms: z.number().nonnegative().nullable(),
  outcome: z.enum(['success', 'failed', 'in_progress', 'skipped']),
  linked_mcp_call_ids: z.array(z.string()).default([]),
  linked_dispatch_ids: z.array(z.string()).default([]),
  error_code: z.string().nullable().default(null),
});

export const TimelineSchema = z.array(TimelineEventSchema);

export const McpCallRecordSchema = z.object({
  call_id: z.string().min(1),
  tool_name: z.string().min(1),
  start_offset_ms: z.number().nonnegative(),
  end_offset_ms: z.number().nonnegative(),
  status: z.enum(['success', 'error']),
  error_code: z.string().nullable(),
  request_summary: z.record(z.unknown()).default({}),
  response_summary: z.record(z.unknown()).default({}),
});

export const AgentDispatchRecordSchema = z.object({
  dispatch_id: z.string().min(1),
  agent: z.string().min(1),
  runtime: z.string().min(1),
  model: z.string().min(1),
  tool_name: z.string().min(1),
  started_at: IsoTimestampSchema,
  completed_at: IsoTimestampSchema,
  start_offset_ms: z.number().nonnegative(),
  end_offset_ms: z.number().nonnegative(),
  status: z.enum(['success', 'error']),
  response_sha256: Sha256Schema.nullable(),
  task_report_sha256: Sha256Schema.nullable(),
  files_reported: z.array(z.string()),
  output_retained: z.boolean(),
  output_file: z.string().nullable(),
  provenance: z.enum(['agy_tui_runtime_capture', 'synthetic_fixture']),
});

export const ArtifactEntrySchema = z.object({
  relative_path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: Sha256Schema,
  mime_category: z.string().min(1),
  tracked: z.boolean(),
  created_or_modified: z.enum(['created', 'modified', 'untracked']),
  validation_results: z.array(z.string()).default([]),
  content_available: z.boolean().default(false),
  provenance: z.enum(['filesystem_capture', 'agy_tui_runtime_capture', 'synthetic_fixture']).default('filesystem_capture'),
});

export const ArtifactManifestSchema = z.object({
  generated_at: IsoTimestampSchema,
  files: z.array(ArtifactEntrySchema),
});

export const OrchestrationOutcomeSchema = z.object({
  workspace_initialized: z.boolean(),
  complexity_classified: z.string(),
  design_approved: z.boolean(),
  session_created: z.boolean(),
  agent_dispatched: z.boolean(),
  transition_completed: z.boolean(),
  reconciliation_status: z.enum(['none_required', 'reconciled', 'failed', 'pending']),
  code_review_status: z.enum(['not_required', 'pending', 'passed', 'blocked']),
  archive_status: z.enum(['archived', 'not_archived', 'failed']),
  protocol_compliant: z.boolean(),
});

export const DelegationOutcomeSchema = z.object({
  assigned_agent: z.string().min(1),
  registered_dispatch_tool: z.string().min(1),
  dispatch_ids: z.array(z.string()).min(1),
  attempt_count: z.number().int().positive(),
  success: z.boolean(),
  failure_type: z.string().nullable(),
  parent_direct_implementation: z.boolean(),
  escalation_result: z.string().nullable(),
  response_sha256: Sha256Schema.nullable(),
  task_report_sha256: Sha256Schema.nullable(),
  files_reported: z.array(z.string()),
});

export const CodeReviewOutcomeSchema = z.object({
  reviewer_agent: z.string(),
  dispatch_id: z.string().nullable(),
  reviewed_phase_ids: z.array(z.union([z.number(), z.string()])),
  reviewed_files: z.array(z.string()),
  finding_count: z.number().int().nonnegative(),
  blocking_finding_count: z.number().int().nonnegative(),
  status: z.enum(['not_required', 'pending', 'passed', 'blocked']),
  reviewed_at: IsoTimestampSchema.nullable(),
  review_output_hash: Sha256Schema.nullable(),
  output_retained: z.boolean(),
  output_file: z.string().nullable(),
  archive_gate_result: z.enum(['passed', 'blocked', 'skipped']),
});

export const ReadinessCheckSchema = z.object({
  status: z.enum(['passed', 'failed', 'not_assessed']),
  tool: z.string().min(1).nullable(),
  version: z.string().min(1).nullable(),
  output_file: z.string().min(1).nullable(),
});

export const ProductionReadinessSchema = z.object({
  html_validation: ReadinessCheckSchema,
  accessibility: ReadinessCheckSchema,
  responsive_viewports: ReadinessCheckSchema,
  console_check: ReadinessCheckSchema.extend({
    error_count: z.number().int().nonnegative().nullable(),
  }),
  link_check: ReadinessCheckSchema.extend({
    broken_count: z.number().int().nonnegative().nullable(),
  }),
  code_review_passed: z.boolean(),
  unresolved_blocking_findings: z.number().int().nonnegative(),
  production_ready: z.boolean(),
  scope_caveats: z.array(z.string()).default([]),
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type McpCallRecord = z.infer<typeof McpCallRecordSchema>;
export type AgentDispatchRecord = z.infer<typeof AgentDispatchRecordSchema>;
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
export type OrchestrationOutcome = z.infer<typeof OrchestrationOutcomeSchema>;
export type DelegationOutcome = z.infer<typeof DelegationOutcomeSchema>;
export type CodeReviewOutcome = z.infer<typeof CodeReviewOutcomeSchema>;
export type ProductionReadiness = z.infer<typeof ProductionReadinessSchema>;
