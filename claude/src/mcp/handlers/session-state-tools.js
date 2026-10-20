'use strict';

const { assertSessionId } = require('../../lib/session-id');
const { validatePhases } = require('../contracts/plan-schema');
const {
  DOWNSTREAM_CONTEXT_SHAPE,
  normalizeDownstreamContext,
  readDownstreamContext,
} = require('../contracts/downstream-context');
const { ValidationError, StateError } = require('../../lib/errors');
const {
  resolveStateDirPath,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
  archiveActiveSession,
  assertSessionMatch,
  findPhaseOrThrow,
} = require('../../state/session-state');
const {
  materializeSessionDocument,
  writePlansDocument,
  archivePlansDocuments,
} = require('../../state/session-documents');
const {
  GATE_FILENAME,
  readGate,
  removeGate,
  approvedGateSessionIds,
} = require('../../state/design-gate');
const { readDocumentInput } = require('../contracts/document-input');

const UPDATABLE_SESSION_FIELDS = ['execution_mode', 'execution_backend', 'current_batch'];

/**
 * Enforce create_session's design-gate preconditions and return the design
 * document recorded by the session's approved gate.
 *
 * The orchestrator must use one session_id from enter_design_gate through
 * archive_session. When this session has no gate but another session has an
 * approved one, the orchestrator either drifted from the id it entered the
 * gate with or left a prior run unfinished; proceeding would strand the
 * approved design document, because create_session looks the gate up by
 * session_id. So the call fails fast, naming the orphaned ids and the stale
 * gate files so the caller can align on the original id or delete them. The
 * scan runs only when this session has no gate: a current-session gate
 * (approved or not) is the normal approve-then-create flow, and a leftover
 * gate from a prior workflow is benign alongside it.
 *
 * @param {string} stateDir - Resolved state dir
 * @param {string} sessionId
 * @returns {string | null} the approved gate's design document path, or null when the session has no approved gate
 * @throws {ValidationError} DESIGN_GATE_SESSION_MISMATCH when the session has no gate and another session has an approved one
 * @throws {StateError} DESIGN_GATE_UNAPPROVED when the gate was entered but not approved
 */
function approvedDesignDocumentPath(stateDir, sessionId) {
  const gate = readGate(stateDir, sessionId);
  if (gate === null) {
    const orphanedIds = approvedGateSessionIds(stateDir);
    if (orphanedIds.length > 0) {
      const idList = orphanedIds.map((id) => `'${id}'`).join(', ');
      const stalePaths = orphanedIds
        .map((id) => `<state_dir>/state/${id}${GATE_FILENAME}`)
        .join(', ');
      throw new ValidationError(
        `Approved design gate exists for session ${idList} but create_session was called with '${sessionId}'. Session IDs must match across enter_design_gate, record_design_approval, and create_session. Either call create_session with the matching session_id, or delete the stale gate file(s) at ${stalePaths} and re-enter the gate with '${sessionId}'.`,
        {
          code: 'DESIGN_GATE_SESSION_MISMATCH',
          details: {
            current_session_id: sessionId,
            orphaned_session_ids: orphanedIds,
          },
        }
      );
    }
  }

  if (gate && gate.entered_at && !gate.approved_at) {
    throw new StateError(
      'Design gate entered but not approved. Call record_design_approval before create_session.',
      { code: 'DESIGN_GATE_UNAPPROVED' }
    );
  }

  return gate?.approved_at ? gate.design_document_path : null;
}

/**
 * Mark `phase` in_progress, started at `now`.
 *
 * @param {object} phase - mutated in place
 * @param {string} now - ISO timestamp recorded as `started`
 */
function startPhase(phase, now) {
  phase.status = 'in_progress';
  phase.started = now;
}

/**
 * Mark `phase` completed with the handoff (file lists and downstream context)
 * carried by transition_phase `params`. Flags the phase for reconciliation
 * when the handoff is entirely empty.
 *
 * @param {object} phase - mutated in place
 * @param {object} params - transition_phase params
 * @param {string} now - ISO timestamp recorded as `completed`
 * @throws {ValidationError} HANDOFF_INCOMPLETE when files were reported but downstream_context is empty after normalization
 */
function completePhase(phase, params, now) {
  const filesCreated = params.files_created ?? [];
  const filesModified = params.files_modified ?? [];
  const filesDeleted = params.files_deleted ?? [];
  const hasFiles =
    filesCreated.length + filesModified.length + filesDeleted.length > 0;
  const { context, populated } = readDownstreamContext(params.downstream_context);

  if (hasFiles && !populated) {
    throw new ValidationError(
      `Phase ${phase.id} produced files but downstream_context is empty after normalization. ${DOWNSTREAM_CONTEXT_SHAPE}`,
      {
        code: 'HANDOFF_INCOMPLETE',
        details: {
          phase_id: phase.id,
          files_created_count: filesCreated.length,
          files_modified_count: filesModified.length,
          files_deleted_count: filesDeleted.length,
          received_downstream_context: params.downstream_context ?? null,
        },
      }
    );
  }

  phase.status = 'completed';
  phase.completed = now;
  phase.downstream_context = context;
  phase.files_created = filesCreated;
  phase.files_modified = filesModified;
  phase.files_deleted = filesDeleted;
  phase.requires_reconciliation = !hasFiles && !populated;
}

/**
 * Ids of the phases whose status is `status`, in phase order.
 *
 * @param {Array<{ id: number | string, status: string }>} phases
 * @param {string} status
 * @returns {Array<number | string>}
 */
function phaseIdsWithStatus(phases, status) {
  return phases.filter((phase) => phase.status === status).map((phase) => phase.id);
}

function handleCreateSession(params, projectRoot) {
  assertSessionId(params.session_id);
  const stateDir = resolveStateDirPath(projectRoot);
  const approvedDesignDocument = approvedDesignDocumentPath(stateDir, params.session_id);

  const phaseViolations = validatePhases(params.phases);
  if (phaseViolations.length > 0) {
    const rules = phaseViolations.map((v) => v.rule).join(', ');
    throw new ValidationError(`Invalid phases payload: ${rules}`, { details: phaseViolations });
  }

  const existing = readActiveSessionOrNull(stateDir);
  if (existing && existing.state.status === 'in_progress') {
    throw new StateError(
      `Active session '${existing.state.session_id}' already exists (status: in_progress). Archive it first with archive_session.`
    );
  }

  const resolvedDesignDocument = materializeSessionDocument(
    projectRoot,
    stateDir,
    params.design_document || approvedDesignDocument,
    'design_document'
  );
  const plan = readDocumentInput(params, 'implementation_plan', 'implementation_plan');
  let resolvedImplementationPlan = null;
  if (plan) {
    resolvedImplementationPlan = plan.path
      ? materializeSessionDocument(projectRoot, stateDir, plan.path, 'implementation_plan')
      : writePlansDocument(stateDir, plan.filename, plan.content);
  }

  const now = new Date().toISOString();
  const state = {
    session_id: params.session_id,
    task: params.task,
    created: now,
    updated: now,
    status: 'in_progress',
    workflow_mode: params.workflow_mode || 'standard',
    design_document: resolvedDesignDocument,
    implementation_plan: resolvedImplementationPlan,
    current_phase: params.phases.length > 0 ? params.phases[0].id : null,
    total_phases: params.phases.length,
    execution_mode: params.execution_mode || null,
    execution_backend: 'native',
    current_batch: null,
    task_complexity: params.task_complexity || null,
    token_usage: {
      total_input: 0,
      total_output: 0,
      total_cached: 0,
      by_agent: {},
    },
    phases: params.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      status: 'pending',
      agents: [phase.agent],
      parallel: phase.parallel,
      started: null,
      completed: null,
      blocked_by: phase.blocked_by,
      files_created: [],
      files_modified: [],
      files_deleted: [],
      planned_files: phase.files || [],
      downstream_context: normalizeDownstreamContext(),
      errors: [],
      retry_count: 0,
    })),
  };

  if (state.phases.length > 0) {
    startPhase(state.phases[0], now);
  }

  const sessionPath = writeActiveSession(
    stateDir,
    state,
    `# ${params.task} Orchestration Log\n`
  );

  return {
    success: true,
    path: sessionPath,
  };
}

function handleGetSessionStatus(_params, projectRoot) {
  const session = readActiveSessionOrNull(resolveStateDirPath(projectRoot));
  if (!session) {
    return {
      exists: false,
      message: 'No active session found',
    };
  }

  const { state } = session;
  return {
    exists: true,
    session_id: state.session_id,
    status: state.status,
    workflow_mode: state.workflow_mode || 'standard',
    current_phase: state.current_phase,
    total_phases: state.total_phases,
    phases: (state.phases || []).map((phase) => ({
      id: phase.id,
      name: phase.name,
      status: phase.status,
      agent: (phase.agents || [])[0],
    })),
    task_complexity: state.task_complexity,
    execution_mode: state.execution_mode,
    current_batch: state.current_batch ?? null,
    token_usage: state.token_usage,
  };
}

function handleTransitionPhase(params, projectRoot) {
  if (params.session_id) {
    assertSessionId(params.session_id);
  }

  const hasNextPhaseId = params.next_phase_id != null;
  const hasNextPhaseIds =
    Array.isArray(params.next_phase_ids) && params.next_phase_ids.length > 0;
  if (hasNextPhaseId && hasNextPhaseIds) {
    throw new ValidationError(
      'next_phase_id and next_phase_ids are mutually exclusive'
    );
  }

  const hasCompletedPhase = params.completed_phase_id != null;
  if (!hasCompletedPhase && !hasNextPhaseIds && !hasNextPhaseId) {
    throw new ValidationError(
      'At least one of completed_phase_id, next_phase_id, or next_phase_ids is required'
    );
  }

  return withSessionState(resolveStateDirPath(projectRoot), (state, now) => {
    assertSessionMatch(state, params.session_id);

    const completedPhase = hasCompletedPhase
      ? findPhaseOrThrow(state.phases, params.completed_phase_id)
      : undefined;

    const nextPhase = hasNextPhaseId
      ? findPhaseOrThrow(
          state.phases,
          params.next_phase_id,
          `next_phase_id ${params.next_phase_id} does not match any phase in session state`
        )
      : undefined;

    const phasesToStart = [];
    if (hasNextPhaseIds) {
      for (const id of params.next_phase_ids) {
        const phase = findPhaseOrThrow(state.phases, id);
        if (phase.status === 'completed' || phase.status === 'failed') {
          throw new StateError(`Cannot start phase ${id}: status is '${phase.status}'`);
        }
        if (phase.status === 'pending') {
          phasesToStart.push(phase);
        }
      }
    }

    if (completedPhase) {
      completePhase(completedPhase, params, now);
    }

    if (hasNextPhaseIds) {
      for (const phase of phasesToStart) {
        startPhase(phase, now);
      }
      state.current_phase = params.next_phase_ids[0];
    } else if (nextPhase) {
      if (nextPhase.status === 'pending') {
        startPhase(nextPhase, now);
      }
      state.current_phase = params.next_phase_id;
    }

    if (params.batch_id !== undefined) {
      state.current_batch = params.batch_id;
    }

    if (params.token_usage) {
      state.token_usage.total_input += params.token_usage.input || 0;
      state.token_usage.total_output += params.token_usage.output || 0;
      state.token_usage.total_cached += params.token_usage.cached || 0;
    }

    const response = {
      success: true,
      session_state_summary: {
        current_phase: state.current_phase,
        completed_phases: phaseIdsWithStatus(state.phases, 'completed'),
        pending_phases: phaseIdsWithStatus(state.phases, 'pending'),
      },
    };

    if (hasNextPhaseIds) {
      response.started_phase_ids = phasesToStart.map((phase) => phase.id);
    }

    return response;
  });
}

function handleArchiveSession(params, projectRoot) {
  assertSessionId(params.session_id);
  const stateDir = resolveStateDirPath(projectRoot);

  const archived = withSessionState(stateDir, (state) => {
    assertSessionMatch(state, params.session_id, 'requested');

    const pendingRec = (state.phases || []).find(
      (phase) => phase.requires_reconciliation === true
    );
    if (pendingRec) {
      throw new StateError(
        `Phase ${pendingRec.id} requires reconciliation before archiving. Call scan_phase_changes or reconcile_phase to resolve.`,
        { code: 'RECONCILIATION_PENDING', details: { phase_id: pendingRec.id } }
      );
    }

    state.status = 'completed';
    return state;
  });

  const archivePath = archiveActiveSession(stateDir, params.session_id);
  const archivedFiles = [
    archivePath,
    ...archivePlansDocuments(projectRoot, stateDir, [
      archived.design_document,
      archived.implementation_plan,
    ]),
  ];

  removeGate(stateDir, params.session_id);

  return {
    success: true,
    archive_path: archivePath,
    archived_files: archivedFiles,
  };
}

function handleUpdateSession(params, projectRoot) {
  assertSessionId(params.session_id);

  return withSessionState(resolveStateDirPath(projectRoot), (state) => {
    assertSessionMatch(state, params.session_id);

    const updatedFields = [];

    for (const field of UPDATABLE_SESSION_FIELDS) {
      if (params[field] !== undefined) {
        state[field] = params[field];
        updatedFields.push(field);
      }
    }

    if (updatedFields.length === 0) {
      throw new ValidationError(
        `At least one updatable field (${UPDATABLE_SESSION_FIELDS.join(', ')}) is required`
      );
    }

    return { success: true, updated_fields: updatedFields };
  });
}

module.exports = {
  handleCreateSession,
  handleGetSessionStatus,
  handleTransitionPhase,
  handleArchiveSession,
  handleUpdateSession,
};
