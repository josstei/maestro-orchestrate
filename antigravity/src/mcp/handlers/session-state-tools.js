'use strict';

const { assertSessionId } = require('../../lib/validation');
const { validatePhases } = require('../contracts/plan-schema');
const {
  HANDOFF_FILE_FIELDS,
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape: describeDownstreamContextShape,
} = require('../contracts/downstream-context');
const { ValidationError, StateError } = require('../../lib/errors');
const { readGateForCreateSession, removeDesignGate } = require('../../state/design-gate');
const {
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  archiveActiveSession,
  assertSessionMatch,
  findPhaseOrThrow,
} = require('../../state/session-state');
const {
  materializeSessionDocument,
  materializeDocumentInput,
  archivePlansDocuments,
} = require('../../state/session-documents');
const { parseDocumentInput } = require('../contracts/document-input');

const UPDATABLE_SESSION_FIELDS = ['execution_mode', 'current_batch'];

/** Mark `phase` in_progress, started at `now`. */
function startPhase(phase, now) {
  phase.status = 'in_progress';
  phase.started = now;
}

/**
 * Mark `phase` completed with the handoff (file lists and downstream context)
 * carried by transition_phase `params`. Flags the phase for reconciliation
 * when the handoff is entirely empty.
 *
 * @throws {ValidationError} HANDOFF_INCOMPLETE when files were reported but downstream_context is empty after normalization
 */
function completePhase(phase, params, now) {
  const files = Object.fromEntries(HANDOFF_FILE_FIELDS.map((field) => [field, params[field] ?? []]));
  // Summed, not some(): a non-array value passed through `?? []` makes the
  // sum NaN, which counts as no files instead of throwing.
  const hasFiles =
    HANDOFF_FILE_FIELDS.map((field) => files[field].length).reduce((sum, length) => sum + length) > 0;
  const normalizedContext = normalizeDownstreamContext(params.downstream_context);
  const contextProvided = isDownstreamContextPopulated(normalizedContext);

  if (hasFiles && !contextProvided) {
    throw new ValidationError(
      `Phase ${phase.id} produced files but downstream_context is empty after normalization. ${describeDownstreamContextShape()}`,
      {
        code: 'HANDOFF_INCOMPLETE',
        details: {
          phase_id: phase.id,
          ...Object.fromEntries(
            HANDOFF_FILE_FIELDS.map((field) => [`${field}_count`, files[field].length])
          ),
          received_downstream_context: params.downstream_context ?? null,
        },
      }
    );
  }

  phase.status = 'completed';
  phase.completed = now;
  phase.downstream_context = normalizedContext;
  Object.assign(phase, files);
  phase.requires_reconciliation = !hasFiles && !contextProvided;
}

/** Ids of the phases whose status is `status`, in phase order. */
function phaseIdsWithStatus(phases, status) {
  return phases.filter((phase) => phase.status === status).map((phase) => phase.id);
}

function createSession({ params, projectRoot }, tx) {
  const gate = readGateForCreateSession(tx, params.session_id);

  const phasesValidation = validatePhases(params.phases);
  if (!phasesValidation.valid) {
    const rules = phasesValidation.violations.map((v) => v.rule).join(', ');
    throw new ValidationError(`Invalid phases payload: ${rules}`, {
      details: phasesValidation.violations,
    });
  }

  const existing = readActiveSessionOrNull(tx);
  if (existing && existing.state.status === 'in_progress') {
    throw new StateError(
      `Active session '${existing.state.session_id}' already exists (status: in_progress). Archive it first with archive_session.`
    );
  }

  const designDocumentCandidate =
    params.design_document ||
    (gate && gate.approved_at ? gate.design_document_path : null);
  const resolvedDesignDocument = materializeSessionDocument(
    projectRoot,
    designDocumentCandidate,
    'design_document',
    tx
  );
  const implementationPlan = parseDocumentInput(params, {
    pathKey: 'implementation_plan',
    prefix: 'implementation_plan',
  });
  const resolvedImplementationPlan = materializeDocumentInput(implementationPlan,
    (planPath) => materializeSessionDocument(projectRoot, planPath, 'implementation_plan', tx), tx);

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
      downstream_context: normalizeDownstreamContext(null),
      errors: [],
      retry_count: 0,
    })),
  };

  if (state.phases.length > 0) {
    startPhase(state.phases[0], now);
  }

  const sessionPath = writeActiveSession(
    tx,
    state,
    `# ${params.task} Orchestration Log\n`
  );

  return {
    success: true,
    path: sessionPath,
  };
}

function getSessionStatus(_request, view) {
  const session = readActiveSessionOrNull(view);
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

function prepareTransition(params) {
  if (params.session_id) {
    assertSessionId(params.session_id);
  }

  const batch = Array.isArray(params.next_phase_ids) && params.next_phase_ids.length > 0;
  if (batch && params.next_phase_id != null) {
    throw new ValidationError(
      'next_phase_id and next_phase_ids are mutually exclusive'
    );
  }

  const nextIds = batch ? params.next_phase_ids : [params.next_phase_id].filter((id) => id != null);
  const hasCompletedPhase = params.completed_phase_id != null;
  if (!hasCompletedPhase && nextIds.length === 0) {
    throw new ValidationError(
      'At least one of completed_phase_id, next_phase_id, or next_phase_ids is required'
    );
  }
  return { batch, nextIds, hasCompletedPhase };
}

function transitionPhase({ params, input: { batch, nextIds, hasCompletedPhase }, now }, { state }) {
  const completedPhase = hasCompletedPhase
    ? findPhaseOrThrow(state.phases, params.completed_phase_id)
    : undefined;

  const nextPhases = nextIds.map((id) => {
    const phase = findPhaseOrThrow(state.phases, id,
      batch ? undefined : `next_phase_id ${id} does not match any phase in session state`);
    if (batch && (phase.status === 'completed' || phase.status === 'failed')) {
      throw new StateError(`Cannot start phase ${id}: status is '${phase.status}'`);
    }
    return phase;
  });
  // Picked before completion, so a batch restarts a pending phase it also completes.
  const phasesToStart = nextPhases.filter(
    (phase) => phase.status === 'pending' && (batch || phase !== completedPhase)
  );

  if (completedPhase) {
    completePhase(completedPhase, params, now);
  }
  for (const phase of phasesToStart) {
    startPhase(phase, now);
  }
  if (nextIds.length > 0) {
    state.current_phase = nextIds[0];
  }

  if (params.batch_id !== undefined) {
    state.current_batch = params.batch_id;
  }

  if (params.token_usage) {
    state.token_usage.total_input += params.token_usage.input || 0;
    state.token_usage.total_output += params.token_usage.output || 0;
    state.token_usage.total_cached += params.token_usage.cached || 0;
  }

  return {
    success: true,
    session_state_summary: {
      current_phase: state.current_phase,
      completed_phases: phaseIdsWithStatus(state.phases, 'completed'),
      pending_phases: phaseIdsWithStatus(state.phases, 'pending'),
    },
    ...(batch ? { started_phase_ids: phasesToStart.map((phase) => phase.id) } : {}),
  };
}

function archiveSession({ params, projectRoot }, tx) {
  const { state, body } = readActiveSession(tx);
  const now = new Date().toISOString();
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
  state.updated = now;
  writeActiveSession(tx, state, body);
  const archivePath = archiveActiveSession(tx, params.session_id);
  const archivedFiles = [
    archivePath,
    ...archivePlansDocuments(projectRoot, [
      state.design_document,
      state.implementation_plan,
    ], tx),
  ];
  removeDesignGate(tx, params.session_id);
  return { success: true, archive_path: archivePath, archived_files: archivedFiles };
}

function updateSession({ params }, { state }) {
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
}

module.exports = {
  create_session: { access: 'mutate', run: createSession },
  get_session_status: { access: 'read', run: getSessionStatus, prepare: () => {} },
  transition_phase: { access: 'session', run: transitionPhase, prepare: prepareTransition },
  archive_session: { access: 'mutate', run: archiveSession },
  update_session: { access: 'session', run: updateSession },
};
