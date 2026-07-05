import { z } from 'zod';
import { PHASE_ID, FILE_ARRAY, DOWNSTREAM_CONTEXT, PHASE_ITEM } from '../zod-fragments.js';

export const zodSchemas = {
  create_session: {
    session_id: z.string(),
    task: z.string(),
    design_document: z.string().nullable().optional(),
    implementation_plan: z.string().nullable().optional(),
    implementation_plan_content: z
      .string()
      .describe(
        'Inline implementation-plan Markdown. Requires implementation_plan_filename; mutually exclusive with implementation_plan.',
      )
      .optional(),
    implementation_plan_filename: z
      .string()
      .describe(
        "Basename-only filename (no separators, no '..') used when materializing implementation_plan_content into <state_dir>/plans/.",
      )
      .optional(),
    phases: z.array(PHASE_ITEM).min(1),
    task_complexity: z.enum(['simple', 'medium', 'complex']).optional(),
    execution_mode: z.string().optional(),
    workflow_mode: z.enum(['express', 'standard']).default('standard'),
  },
  get_session_status: {
    session_id: z.string().optional(),
  },
  update_session: {
    session_id: z.string(),
    execution_mode: z.enum(['parallel', 'sequential']).optional(),
    execution_backend: z.string().optional(),
    current_batch: z.string().nullable().optional(),
  },
  transition_phase: {
    session_id: z.string(),
    completed_phase_id: z.union([z.number(), z.string()]).optional(),
    downstream_context: DOWNSTREAM_CONTEXT.optional(),
    files_created: FILE_ARRAY.optional(),
    files_modified: FILE_ARRAY.optional(),
    files_deleted: FILE_ARRAY.optional(),
    next_phase_id: z.union([z.number(), z.string()]).nullable().optional(),
    next_phase_ids: z
      .array(z.union([z.number(), z.string()]))
      .describe('Start multiple phases (parallel batch). Mutually exclusive with next_phase_id.')
      .optional(),
    batch_id: z
      .string()
      .nullable()
      .describe('Batch identifier for parallel dispatch. Sets current_batch in state.')
      .optional(),
    token_usage: z.record(z.unknown()).optional(),
    task_report: z
      .string()
      .describe(
        'Full agent Task Report text for the completed phase. The server derives blocker_count by parsing its Blockers section.',
      )
      .optional(),
    review_finding_count: z
      .number()
      .nullable()
      .describe(
        'Number of Completion-phase code-review findings recorded for the completed phase. Stored as review_finding_count.',
      )
      .optional(),
  },
  archive_session: {
    session_id: z.string(),
  },
  enter_design_gate: {
    session_id: z.string(),
  },
  record_design_approval: {
    session_id: z.string(),
    design_document_path: z
      .string()
      .describe(
        'Absolute or workspace-relative path to the approved design document. Mutually exclusive with design_document_content.',
      )
      .optional(),
    design_document_content: z
      .string()
      .describe(
        'Inline design-document Markdown. Requires design_document_filename; mutually exclusive with design_document_path.',
      )
      .optional(),
    design_document_filename: z
      .string()
      .describe(
        "Basename-only filename (no separators, no '..') used when materializing design_document_content into <state_dir>/plans/.",
      )
      .optional(),
  },
  get_design_gate_status: {
    session_id: z.string(),
  },
  scan_phase_changes: {
    session_id: z.string(),
    phase_id: PHASE_ID,
  },
  reconcile_phase: {
    session_id: z.string(),
    phase_id: PHASE_ID,
    files_created: FILE_ARRAY.optional(),
    files_modified: FILE_ARRAY.optional(),
    files_deleted: FILE_ARRAY.optional(),
    downstream_context: DOWNSTREAM_CONTEXT.optional(),
    reason: z.string().optional(),
  },
  list_archived_sessions: {},
  search_archived_sessions: {
    created_after: z
      .string()
      .describe('ISO-8601 timestamp (e.g. 2026-07-02T00:00:00.000Z)')
      .optional(),
    created_before: z
      .string()
      .describe('ISO-8601 timestamp (e.g. 2026-07-02T00:00:00.000Z)')
      .optional(),
    agent: z.string().optional(),
    outcome: z.enum(['completed', 'failed']).optional(),
  },
  get_cost_insights: {
    include_active: z.boolean().default(false),
  },
};
