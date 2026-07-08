import { defineCommandTable, registerCommandTable, withHandlerContext, withRequiredProjectRoot, } from '../command-table.js';
import { zodSchemas } from './zod-schemas.js';
import { handleCreateSession, handleGetSessionStatus, handleTransitionPhase, handleArchiveSession, handleUpdateSession, } from '../../handlers/session-state-tools.js';
import { handleEnterDesignGate, handleRecordDesignApproval, handleGetDesignGateStatus, } from '../../handlers/design-gate.js';
import { handleScanPhaseChanges, handleReconcilePhase } from '../../handlers/reconciliation.js';
import { handleSearchArchivedSessions, handleGetCostInsights, } from '../../handlers/archive-index.js';
const sessionCommands = defineCommandTable(zodSchemas, {
    create_session: {
        description: 'Create a new Maestro orchestration session. Supply the implementation plan either by path (implementation_plan) or by inline content (implementation_plan_content + implementation_plan_filename); the two variants are mutually exclusive. The content variant is required when the caller cannot guarantee the plan file is visible to the MCP server under the configured workspace (e.g. Gemini Plan Mode writes to a tmp root).',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleCreateSession(args, projectRoot)),
    },
    get_session_status: {
        description: 'Read current session status including workflow_mode. Returns { exists: false } if no active session, or { exists: true, ...status } if one exists.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleGetSessionStatus(args, projectRoot)),
    },
    update_session: {
        description: 'Update session metadata fields (execution_mode, current_batch) after session creation. Use after execution-mode gate resolves.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleUpdateSession(args, projectRoot)),
    },
    transition_phase: {
        description: 'Atomically mark a phase completed and start the next phase(s). Supports single or batch transitions.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleTransitionPhase(args, projectRoot)),
    },
    archive_session: {
        description: 'Move active session to archive. Also moves associated design document and implementation plan to plans/archive/ if they exist.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleArchiveSession(args, projectRoot)),
    },
    enter_design_gate: {
        description: 'Mark a session as having entered the design phase. Idempotent. Blocks create_session until record_design_approval is called.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleEnterDesignGate(args, projectRoot)),
    },
    record_design_approval: {
        description: 'Record user approval of the design document, clearing the design gate for session creation. Supply the document either by path (design_document_path) or by inline content (design_document_content + design_document_filename); exactly one variant is required. Use the content variant when the caller cannot guarantee the file is visible to the MCP server under the configured workspace (e.g. Gemini Plan Mode resolves relative paths against ~/.gemini/tmp/<uuid>/).',
        requiresWorkspace: true,
        handler: withHandlerContext(handleRecordDesignApproval),
    },
    get_design_gate_status: {
        description: 'Read the design gate status for a session. Returns entered_at, approved_at, and design_document_path (all nullable).',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleGetDesignGateStatus(args, projectRoot)),
    },
    scan_phase_changes: {
        description: 'Scan the workspace for files created or modified since the phase started. Does not attribute files — returns candidates for the orchestrator to reconcile.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleScanPhaseChanges(args, projectRoot)),
    },
    reconcile_phase: {
        description: 'Record file manifests and downstream context for a phase that could not be handed off cleanly. Requires at least one of files_created/files_modified/files_deleted or a populated downstream_context. Clears requires_reconciliation on success.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleReconcilePhase(args, projectRoot)),
    },
    search_archived_sessions: {
        description: 'Search archived Maestro sessions filtered by created_after/created_before (ISO-8601), agent, and/or outcome (completed|failed). Call with no filters to list all archived sessions (newest first).',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleSearchArchivedSessions(args, projectRoot)),
    },
    get_cost_insights: {
        description: 'Aggregate a deterministic cross-session per-agent token and latency rollup from archived sessions. Set include_active to fold the current active session into the rollup.',
        requiresWorkspace: true,
        handler: withRequiredProjectRoot((args, projectRoot) => handleGetCostInsights(args, projectRoot)),
    },
});
/**
 * Register the `session` pack's 12 tools via the command-table helper, each
 * consuming its shape from `./zod-schemas.js`. Every tool in this pack
 * requires an initialized workspace.
 *
 * @param {{server: object, registry: object}} options
 */
function registerSessionPack({ server, registry, ...contextOptions } = {}) {
    registerCommandTable(zodSchemas, sessionCommands, {
        server,
        registry,
        ...contextOptions,
    });
}
export { registerSessionPack };
