'use strict';

const { assertSessionId } = require('../../../lib/validation');
const { withStateMutation, withStateRead } = require('../../../state/coordinator');
const { resolveStateDirPath } = require('../../../state/paths');
const { readActiveSession, writeActiveSession, assertSessionMatch } = require('../../../state/session-state');
const { defineTool } = require('../../core/create-server');
const { PHASE_ITEM_SCHEMA, TASK_COMPLEXITY_SCHEMA } = require('../../contracts/plan-schema');
const { HANDOFF_FILE_FIELDS } = require('../../contracts/downstream-context');
const COMMANDS = {
  ...require('../../handlers/session-state-tools'),
  ...require('../../handlers/design-gate'),
  ...require('../../handlers/reconciliation'),
};

const SESSION_ID = { type: 'string' };
const PHASE_ID = { type: ['integer', 'string'] };
const FILE_LIST = { type: 'array' };
const HANDOFF_FILE_LISTS = Object.fromEntries(HANDOFF_FILE_FIELDS.map((field) => [field, FILE_LIST]));

/**
 * Mount tool `name`'s command `{ access, run, prepare }`. `prepare(params)` (default: a valid
 * session_id) runs before any state access, so malformed input never waits on the state lock;
 * its result is `request.input`. `run(request, store)` gets a state view ('read'), the
 * transaction journaled as `name` ('mutate'), or the active session ('session'), which must
 * match a given session_id and is saved with `state.updated = request.now` unless run throws.
 * Without an access, run reaches state itself.
 */
function mountCommand(name, { access, run, prepare = (params) => assertSessionId(params.session_id) }) {
  return (params, projectRoot) => {
    const request = { params, projectRoot, input: prepare(params), basePath: resolveStateDirPath(projectRoot) };
    if (access === 'read') return withStateRead(request.basePath, (view) => run(request, view));
    if (!access) return run(request);
    return withStateMutation(request.basePath, { operation: name, sessionId: params.session_id }, (tx) => {
      if (access === 'mutate') return run(request, tx);
      const session = readActiveSession(tx);
      assertSessionMatch(session.state, params.session_id);
      request.now = new Date().toISOString();
      const result = run(request, session);
      session.state.updated = request.now;
      writeActiveSession(tx, session.state, session.body);
      return result;
    });
  };
}

function sessionTool(name, description, properties, required = ['session_id']) {
  return defineTool(name, description, { session_id: SESSION_ID, ...properties }, mountCommand(name, COMMANDS[name]), {
    required,
    requiresWorkspace: true,
  });
}

function createToolPack() {
  return {
    name: 'session',
    tools: [
      sessionTool(
        'create_session',
        'Create a new Maestro orchestration session. Supply the implementation plan either by path (implementation_plan) or by inline content (implementation_plan_content + implementation_plan_filename); the two variants are mutually exclusive. The content variant is required when the caller cannot guarantee the plan file is visible to the MCP server under the configured workspace (e.g. a Plan Mode that writes to a host tmp directory).',
        {
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
          task_complexity: TASK_COMPLEXITY_SCHEMA,
          execution_mode: { type: 'string' },
          workflow_mode: {
            type: 'string',
            enum: ['express', 'standard'],
            default: 'standard',
          },
        },
        ['session_id', 'task', 'phases']
      ),
      sessionTool(
        'get_session_status',
        'Read current session status including workflow_mode. Returns { exists: false } if no active session, or { exists: true, ...status } if one exists.',
        {},
        []
      ),
      sessionTool(
        'update_session',
        'Update session metadata fields (execution_mode, current_batch) after session creation. Use after execution-mode gate resolves.',
        {
          execution_mode: {
            type: 'string',
            enum: ['parallel', 'sequential'],
          },
          current_batch: { type: ['string', 'null'] },
        }
      ),
      sessionTool(
        'transition_phase',
        'Atomically mark a phase completed and start the next phase(s). Supports single or batch transitions.',
        {
          completed_phase_id: { type: ['number', 'string'] },
          downstream_context: { type: 'object' },
          ...HANDOFF_FILE_LISTS,
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
        }
      ),
      sessionTool(
        'archive_session',
        'Move active session to archive. Also moves associated design document and implementation plan to plans/archive/ if they exist.',
        {}
      ),
      sessionTool(
        'enter_design_gate',
        'Mark a session as having entered the design phase. Idempotent. Blocks create_session until record_design_approval is called.',
        {}
      ),
      sessionTool(
        'record_design_approval',
        'Record user approval of the design document, clearing the design gate for session creation. Supply the document either by path (design_document_path) or by inline content (design_document_content + design_document_filename); exactly one variant is required. Use the content variant when the caller cannot guarantee the file is visible to the MCP server under the configured workspace (e.g. a Plan Mode that resolves relative paths against a host tmp directory).',
        {
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
        }
      ),
      sessionTool(
        'get_design_gate_status',
        'Read the design gate status for a session. Returns entered_at, approved_at, and design_document_path (all nullable).',
        {}
      ),
      sessionTool(
        'scan_phase_changes',
        'Scan the workspace for files created or modified since the phase started. Does not attribute files — returns candidates for the orchestrator to reconcile.',
        {
          phase_id: PHASE_ID,
        },
        ['session_id', 'phase_id']
      ),
      sessionTool(
        'reconcile_phase',
        'Record file manifests and downstream context for a phase that could not be handed off cleanly. Requires at least one of files_created/files_modified/files_deleted or a populated downstream_context. Clears requires_reconciliation on success.',
        {
          phase_id: PHASE_ID,
          ...HANDOFF_FILE_LISTS,
          downstream_context: { type: 'object' },
          reason: { type: 'string' },
        },
        ['session_id', 'phase_id']
      ),
    ],
  };
}

module.exports = {
  createToolPack,
};
