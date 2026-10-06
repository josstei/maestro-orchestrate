'use strict';

const { PHASE_ITEM_SCHEMA } = require('../../contracts/plan-schema');
const {
  handleCreateSession,
  handleGetSessionStatus,
  handleTransitionPhase,
  handleArchiveSession,
  handleUpdateSession,
} = require('../../handlers/session-state-tools');
const {
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
} = require('../../handlers/design-gate');
const {
  handleScanPhaseChanges,
  handleReconcilePhase,
} = require('../../handlers/reconciliation');

const SESSION_ID = { type: 'string' };
const PHASE_ID = { type: ['integer', 'string'] };
const FILE_LIST = { type: 'array' };
const SESSION_ONLY_INPUT = {
  type: 'object',
  properties: { session_id: SESSION_ID },
  required: ['session_id'],
};

function workspaceTool(name, description, inputSchema) {
  return { name, description, requiresWorkspace: true, inputSchema };
}

function createToolPack() {
  return {
    name: 'session',
    tools: [
      workspaceTool(
        'create_session',
        'Create a new Maestro orchestration session. Supply the implementation plan either by path (implementation_plan) or by inline content (implementation_plan_content + implementation_plan_filename); the two variants are mutually exclusive. The content variant is required when the caller cannot guarantee the plan file is visible to the MCP server under the configured workspace (e.g. Gemini Plan Mode writes to a tmp root).',
        {
          type: 'object',
          properties: {
            session_id: SESSION_ID,
            task: { type: 'string' },
            design_document: { type: ['string', 'null'] },
            implementation_plan: { type: ['string', 'null'] },
            implementation_plan_content: {
              type: 'string',
              description:
                'Inline implementation-plan Markdown. Requires implementation_plan_filename; mutually exclusive with implementation_plan.',
            },
            implementation_plan_filename: {
              type: 'string',
              description:
                'Basename-only filename (no separators, no \'..\') used when materializing implementation_plan_content into <state_dir>/plans/.',
            },
            phases: {
              type: 'array',
              minItems: 1,
              items: PHASE_ITEM_SCHEMA,
            },
            task_complexity: {
              type: 'string',
              enum: ['simple', 'medium', 'complex'],
            },
            execution_mode: { type: 'string' },
            workflow_mode: {
              type: 'string',
              enum: ['express', 'standard'],
              default: 'standard',
            },
          },
          required: ['session_id', 'task', 'phases'],
        }
      ),
      workspaceTool(
        'get_session_status',
        'Read current session status including workflow_mode. Returns { exists: false } if no active session, or { exists: true, ...status } if one exists.',
        {
          type: 'object',
          properties: { session_id: SESSION_ID },
        }
      ),
      workspaceTool(
        'update_session',
        'Update session metadata fields (execution_mode, current_batch) after session creation. Use after execution-mode gate resolves.',
        {
          type: 'object',
          properties: {
            session_id: SESSION_ID,
            execution_mode: {
              type: 'string',
              enum: ['parallel', 'sequential'],
            },
            execution_backend: { type: 'string' },
            current_batch: { type: ['string', 'null'] },
          },
          required: ['session_id'],
        }
      ),
      workspaceTool(
        'transition_phase',
        'Atomically mark a phase completed and start the next phase(s). Supports single or batch transitions.',
        {
          type: 'object',
          properties: {
            session_id: SESSION_ID,
            completed_phase_id: { type: ['number', 'string'] },
            downstream_context: { type: 'object' },
            files_created: FILE_LIST,
            files_modified: FILE_LIST,
            files_deleted: FILE_LIST,
            next_phase_id: { type: ['number', 'string', 'null'] },
            next_phase_ids: {
              type: 'array',
              items: { type: ['number', 'string'] },
              description:
                'Start multiple phases (parallel batch). Mutually exclusive with next_phase_id.',
            },
            batch_id: {
              type: ['string', 'null'],
              description:
                'Batch identifier for parallel dispatch. Sets current_batch in state.',
            },
            token_usage: { type: 'object' },
          },
          required: ['session_id'],
        }
      ),
      workspaceTool(
        'archive_session',
        'Move active session to archive. Also moves associated design document and implementation plan to plans/archive/ if they exist.',
        SESSION_ONLY_INPUT
      ),
      workspaceTool(
        'enter_design_gate',
        'Mark a session as having entered the design phase. Idempotent. Blocks create_session until record_design_approval is called.',
        SESSION_ONLY_INPUT
      ),
      workspaceTool(
        'record_design_approval',
        'Record user approval of the design document, clearing the design gate for session creation. Supply the document either by path (design_document_path) or by inline content (design_document_content + design_document_filename); exactly one variant is required. Use the content variant when the caller cannot guarantee the file is visible to the MCP server under the configured workspace (e.g. Gemini Plan Mode resolves relative paths against ~/.gemini/tmp/<uuid>/).',
        {
          type: 'object',
          properties: {
            session_id: SESSION_ID,
            design_document_path: {
              type: 'string',
              description:
                'Absolute or workspace-relative path to the approved design document. Mutually exclusive with design_document_content.',
            },
            design_document_content: {
              type: 'string',
              description:
                'Inline design-document Markdown. Requires design_document_filename; mutually exclusive with design_document_path.',
            },
            design_document_filename: {
              type: 'string',
              description:
                'Basename-only filename (no separators, no \'..\') used when materializing design_document_content into <state_dir>/plans/.',
            },
          },
          required: ['session_id'],
        }
      ),
      workspaceTool(
        'get_design_gate_status',
        'Read the design gate status for a session. Returns entered_at, approved_at, and design_document_path (all nullable).',
        SESSION_ONLY_INPUT
      ),
      workspaceTool(
        'scan_phase_changes',
        'Scan the workspace for files created or modified since the phase started. Does not attribute files — returns candidates for the orchestrator to reconcile.',
        {
          type: 'object',
          properties: {
            session_id: SESSION_ID,
            phase_id: PHASE_ID,
          },
          required: ['session_id', 'phase_id'],
        }
      ),
      workspaceTool(
        'reconcile_phase',
        'Record file manifests and downstream context for a phase that could not be handed off cleanly. Requires at least one of files_created/files_modified/files_deleted or a populated downstream_context. Clears requires_reconciliation on success.',
        {
          type: 'object',
          properties: {
            session_id: SESSION_ID,
            phase_id: PHASE_ID,
            files_created: FILE_LIST,
            files_modified: FILE_LIST,
            files_deleted: FILE_LIST,
            downstream_context: { type: 'object' },
            reason: { type: 'string' },
          },
          required: ['session_id', 'phase_id'],
        }
      ),
    ],
    handlers: {
      create_session: handleCreateSession,
      get_session_status: handleGetSessionStatus,
      update_session: handleUpdateSession,
      transition_phase: handleTransitionPhase,
      archive_session: handleArchiveSession,
      enter_design_gate: handleEnterDesignGate,
      record_design_approval: handleRecordDesignApproval,
      get_design_gate_status: handleGetDesignGateStatus,
      scan_phase_changes: handleScanPhaseChanges,
      reconcile_phase: handleReconcilePhase,
    },
  };
}

module.exports = {
  createToolPack,
};
