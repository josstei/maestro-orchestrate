'use strict';

const { defineToolPack } = require('../contracts');
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

function createToolPack() {
  return defineToolPack({
    name: 'session',
    tools: [
      {
        name: 'create_session',
        description: 'Create a new Maestro orchestration session.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            task: { type: 'string' },
            design_document: { type: ['string', 'null'] },
            implementation_plan: { type: ['string', 'null'] },
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
        },
      },
      {
        name: 'get_session_status',
        description:
          'Read current session status including workflow_mode. Returns { exists: false } if no active session, or { exists: true, ...status } if one exists.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
          },
        },
      },
      {
        name: 'update_session',
        description:
          'Update session metadata fields (execution_mode, current_batch) after session creation. Use after execution-mode gate resolves.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            execution_mode: {
              type: 'string',
              enum: ['parallel', 'sequential'],
            },
            execution_backend: { type: 'string' },
            current_batch: { type: ['string', 'null'] },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'transition_phase',
        description:
          'Atomically mark a phase completed and start the next phase(s). Supports single or batch transitions.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            completed_phase_id: { type: 'number' },
            downstream_context: { type: 'object' },
            files_created: { type: 'array' },
            files_modified: { type: 'array' },
            files_deleted: { type: 'array' },
            next_phase_id: { type: ['number', 'null'] },
            next_phase_ids: {
              type: 'array',
              items: { type: 'number' },
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
        },
      },
      {
        name: 'archive_session',
        description:
          'Move active session to archive. Also moves associated design document and implementation plan to plans/archive/ if they exist.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'enter_design_gate',
        description:
          'Mark a session as having entered the design phase. Idempotent. Blocks create_session until record_design_approval is called.',
        inputSchema: {
          type: 'object',
          properties: { session_id: { type: 'string' } },
          required: ['session_id'],
        },
      },
      {
        name: 'record_design_approval',
        description:
          'Record user approval of the design document, clearing the design gate for session creation.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            design_document_path: { type: 'string' },
          },
          required: ['session_id', 'design_document_path'],
        },
      },
      {
        name: 'get_design_gate_status',
        description:
          'Read the design gate status for a session. Returns entered_at, approved_at, and design_document_path (all nullable).',
        inputSchema: {
          type: 'object',
          properties: { session_id: { type: 'string' } },
          required: ['session_id'],
        },
      },
      {
        name: 'scan_phase_changes',
        description:
          'Scan the workspace for files created or modified since the phase started. Does not attribute files — returns candidates for the orchestrator to reconcile.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            phase_id: { type: 'integer' },
          },
          required: ['session_id', 'phase_id'],
        },
      },
      {
        name: 'reconcile_phase',
        description:
          'Record file manifests and downstream context for a phase that could not be handed off cleanly. Clears requires_reconciliation.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            phase_id: { type: 'integer' },
            files_created: { type: 'array' },
            files_modified: { type: 'array' },
            files_deleted: { type: 'array' },
            downstream_context: { type: 'object' },
            reason: { type: 'string' },
          },
          required: ['session_id', 'phase_id'],
        },
      },
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
  });
}

module.exports = {
  createToolPack,
};
