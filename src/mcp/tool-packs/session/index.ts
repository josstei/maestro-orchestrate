import {
  defineCommandTable,
  registerCommandTable,
  withHandlerContext,
  withRequiredProjectRoot,
} from '../command-table.js';
import { zodSchemas } from './zod-schemas.js';

import {
  archiveSession,
  createSession,
  getSessionStatus,
  recordCodeReview,
  recordPhaseFailure,
  updateSession,
} from '../../session/session-lifecycle-service.js';
import { transitionPhase } from '../../session/phase-transition-service.js';

import {
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
} from '../../handlers/design-gate.js';

import { handleScanPhaseChanges, handleReconcilePhase } from '../../handlers/reconciliation.js';

import {
  handleSearchArchivedSessions,
  handleGetCostInsights,
} from '../../handlers/archive-index.js';

const sessionCommands = defineCommandTable(zodSchemas, {
  create_session: {
    description:
      'Create a new Maestro orchestration session. Supply the implementation plan either by path (implementation_plan) or by inline content (implementation_plan_content + implementation_plan_filename); the two variants are mutually exclusive. The content variant is required when the caller cannot guarantee the plan file is visible to the MCP server under the configured workspace (e.g. Gemini Plan Mode writes to a tmp root).',
    handler: withRequiredProjectRoot((args, projectRoot) => createSession(args, projectRoot)),
  },
  get_session_status: {
    description:
      'Read current session status including workflow_mode and completion_review. Returns { exists: false } if no active session, or { exists: true, ...status } if one exists.',
    handler: withRequiredProjectRoot((args, projectRoot) => getSessionStatus(args, projectRoot)),
  },
  update_session: {
    description:
      'Update session metadata fields (execution_mode, current_batch) after session creation. Use after execution-mode gate resolves.',
    handler: withRequiredProjectRoot((args, projectRoot) => updateSession(args, projectRoot)),
  },
  transition_phase: {
    description:
      'Atomically mark a phase completed and start the next phase(s). Supports single or batch transitions.',
    handler: withRequiredProjectRoot((args, projectRoot) => transitionPhase(args, projectRoot)),
  },
  archive_session: {
    description:
      'Move active session to archive. Requires completed phases, no failed phases, resolved reconciliation, and passing code review for non-documentation changes.',
    handler: withRequiredProjectRoot((args, projectRoot) => archiveSession(args, projectRoot)),
  },
  record_code_review: {
    description:
      'Record mandatory code-review results for completed phases. Evaluates finding counts, blocking findings, and file coverage before allowing session archival.',
    handler: withRequiredProjectRoot((args, projectRoot) => recordCodeReview(args, projectRoot)),
  },
  record_phase_failure: {
    description:
      'Record a subagent delegation failure for a phase without marking the phase complete. Increments retry count and records error trace in session state.',
    handler: withRequiredProjectRoot((args, projectRoot) => recordPhaseFailure(args, projectRoot)),
  },
  enter_design_gate: {
    description:
      'Mark a session as having entered the design phase. Idempotent. Blocks create_session until record_design_approval is called.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleEnterDesignGate(args, projectRoot)),
  },
  record_design_approval: {
    description:
      'Record user approval of the design document, clearing the design gate for session creation. Supply the document either by path (design_document_path) or by inline content (design_document_content + design_document_filename); exactly one variant is required. Use the content variant when the caller cannot guarantee the file is visible to the MCP server under the configured workspace (e.g. Gemini Plan Mode resolves relative paths against ~/.gemini/tmp/<uuid>/).',
    handler: withHandlerContext(handleRecordDesignApproval),
  },
  get_design_gate_status: {
    description:
      'Read the design gate status for a session. Returns entered_at, approved_at, and design_document_path (all nullable).',
    handler: withRequiredProjectRoot((args, projectRoot) => handleGetDesignGateStatus(args, projectRoot)),
  },
  scan_phase_changes: {
    description:
      'Scan the workspace for files created or modified since the phase started. Does not attribute files — returns candidates for the orchestrator to reconcile.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleScanPhaseChanges(args, projectRoot)),
  },
  reconcile_phase: {
    description:
      'Record file manifests and downstream context for a phase that could not be handed off cleanly. Requires at least one of files_created/files_modified/files_deleted or a populated downstream_context. Clears requires_reconciliation on success.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleReconcilePhase(args, projectRoot)),
  },
  search_archived_sessions: {
    description:
      'Search archived Maestro sessions filtered by created_after/created_before (ISO-8601), agent, and/or outcome (completed|failed). Call with no filters to list all archived sessions (newest first).',
    handler: withRequiredProjectRoot((args, projectRoot) => handleSearchArchivedSessions(args, projectRoot)),
  },
  get_cost_insights: {
    description:
      'Aggregate a deterministic cross-session per-agent token and latency rollup from archived sessions. Set include_active to fold the current active session into the rollup.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleGetCostInsights(args, projectRoot)),
  },
}, { requiresWorkspace: true });

function registerSessionPack({ server, registry, ...contextOptions }: any = {}) {
  registerCommandTable(zodSchemas, sessionCommands, {
    server,
    registry,
    ...contextOptions,
  });
}

export { registerSessionPack };
