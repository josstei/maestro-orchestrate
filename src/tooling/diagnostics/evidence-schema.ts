import { z } from 'zod';

export const RepositoryMetadataSchema = z.object({
  url_or_name: z.string(),
  branch: z.string(),
  commit_sha: z.string(),
  dirty: z.boolean(),
  diff_hash: z.string().nullable(),
});

export const RuntimeMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  model: z.string().nullable(),
});

export const EnvironmentMetadataSchema = z.object({
  node_version: z.string(),
  npm_version: z.string(),
  platform: z.string(),
  arch: z.string(),
});

export const TimestampMetadataSchema = z.object({
  start: z.string(),
  end: z.string(),
  wall_duration_ms: z.number().nonnegative(),
});

export const EvidenceFileEntrySchema = z.object({
  path: z.string(),
  sha256: z.string(),
  bytes: z.number().nonnegative(),
});

export const EvidenceOutcomeSummarySchema = z.object({
  overall: z.boolean(),
  protocol_compliant: z.boolean(),
  delegation_successful: z.boolean(),
  code_review_passed: z.boolean(),
  production_ready: z.boolean(),
});

export const EvidenceManifestSchema = z.object({
  schema_version: z.literal(1),
  run_id: z.string(),
  repository: RepositoryMetadataSchema,
  runtime: RuntimeMetadataSchema,
  environment: EnvironmentMetadataSchema,
  timestamps: TimestampMetadataSchema,
  evidence_files: z.array(EvidenceFileEntrySchema),
  redaction_policy_version: z.string(),
  outcome: EvidenceOutcomeSummarySchema,
  report_path: z.string().nullable(),
});

export const TimelineEventSchema = z.object({
  offset_ms: z.number().nonnegative(),
  timestamp: z.string(),
  stage_id: z.string(),
  operation: z.string(),
  duration_ms: z.number().nonnegative().nullable(),
  outcome: z.enum(['success', 'failed', 'in_progress', 'skipped']),
  linked_mcp_call_ids: z.array(z.string()).default([]),
  error_code: z.string().nullable().default(null),
});

export const TimelineSchema = z.array(TimelineEventSchema);

export const McpCallRecordSchema = z.object({
  call_id: z.string(),
  tool_name: z.string(),
  start_offset_ms: z.number().nonnegative(),
  end_offset_ms: z.number().nonnegative(),
  status: z.enum(['success', 'error']),
  error_code: z.string().nullable(),
  request_summary: z.record(z.unknown()).default({}),
  response_summary: z.record(z.unknown()).default({}),
});

export const ArtifactEntrySchema = z.object({
  relative_path: z.string(),
  bytes: z.number().nonnegative(),
  sha256: z.string(),
  mime_category: z.string(),
  tracked: z.boolean(),
  created_or_modified: z.enum(['created', 'modified', 'untracked']),
  validation_results: z.array(z.string()).default([]),
});

export const ArtifactManifestSchema = z.object({
  generated_at: z.string(),
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
  assigned_agent: z.string(),
  registered_dispatch_tool: z.string(),
  attempt_count: z.number().int().positive(),
  success: z.boolean(),
  failure_type: z.string().nullable(),
  parent_direct_implementation: z.boolean(),
  escalation_result: z.string().nullable(),
});

export const CodeReviewOutcomeSchema = z.object({
  reviewer_agent: z.string(),
  reviewed_phase_ids: z.array(z.union([z.number(), z.string()])),
  reviewed_files: z.array(z.string()),
  finding_count: z.number().int().nonnegative(),
  blocking_finding_count: z.number().int().nonnegative(),
  status: z.enum(['not_required', 'pending', 'passed', 'blocked']),
  reviewed_at: z.string().nullable(),
  review_output_hash: z.string().nullable(),
  archive_gate_result: z.enum(['passed', 'blocked', 'skipped']),
});

export const ProductionReadinessSchema = z.object({
  html_validation: z.boolean(),
  accessibility: z.boolean(),
  responsive_viewports: z.boolean(),
  console_errors: z.boolean(),
  broken_links: z.boolean(),
  code_review_passed: z.boolean(),
  unresolved_blocking_findings: z.number().int().nonnegative(),
  production_ready: z.boolean(),
  scope_caveats: z.array(z.string()).default([]),
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type McpCallRecord = z.infer<typeof McpCallRecordSchema>;
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
export type OrchestrationOutcome = z.infer<typeof OrchestrationOutcomeSchema>;
export type DelegationOutcome = z.infer<typeof DelegationOutcomeSchema>;
export type CodeReviewOutcome = z.infer<typeof CodeReviewOutcomeSchema>;
export type ProductionReadiness = z.infer<typeof ProductionReadinessSchema>;
