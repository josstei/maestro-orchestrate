'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId, coercePositiveInteger } = require('../../lib/validation');
const { validatePhases } = require('../contracts/plan-schema');
const { ValidationError, StateError, NotFoundError } = require('../../lib/errors');
const {
  resolveBasePath,
  resolveActiveSessionPath,
  parseSessionState,
  serializeSessionState,
  extractBody,
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
} = require('./session-state-core');

function handleCreateSession(params, projectRoot) {
  assertSessionId(params.session_id);

  const phasesValidation = validatePhases(params.phases);
  if (!phasesValidation.valid) {
    const rules = phasesValidation.violations.map((v) => v.rule || v.field).join(', ');
    throw new ValidationError(`Invalid phases payload: ${rules}`, {
      details: phasesValidation.violations,
    });
  }

  const basePath = resolveBasePath(projectRoot);
  const sessionPath = resolveActiveSessionPath(basePath);

  if (fs.existsSync(sessionPath)) {
    const existing = parseSessionState(fs.readFileSync(sessionPath, 'utf8'));
    if (existing.status === 'in_progress') {
      throw new StateError(
        `Active session '${existing.session_id}' already exists (status: in_progress). Archive it first with archive_session.`
      );
    }
  }

  const now = new Date().toISOString();
  const state = {
    session_id: params.session_id,
    task: params.task,
    created: now,
    updated: now,
    status: 'in_progress',
    workflow_mode: params.workflow_mode || 'standard',
    design_document: params.design_document,
    implementation_plan: params.implementation_plan,
    current_phase:
      params.phases && params.phases.length > 0
        ? Number.isFinite(Number(params.phases[0].id)) &&
          Number(params.phases[0].id) > 0
          ? Number(params.phases[0].id)
          : 1
        : null,
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
    phases: params.phases.map((phase, index) => ({
      id:
        Number.isFinite(Number(phase.id)) && Number(phase.id) > 0
          ? Number(phase.id)
          : index + 1,
      name: phase.name,
      status: 'pending',
      agents: phase.agent ? [phase.agent] : [],
      parallel: phase.parallel || false,
      started: null,
      completed: null,
      blocked_by: phase.blocked_by || [],
      files_created: [],
      files_modified: [],
      files_deleted: [],
      planned_files: phase.files || [],
      downstream_context: {
        key_interfaces_introduced: [],
        patterns_established: [],
        integration_points: [],
        assumptions: [],
        warnings: [],
      },
      errors: [],
      retry_count: 0,
    })),
  };

  if (state.phases.length > 0) {
    state.phases[0].status = 'in_progress';
    state.phases[0].started = now;
  }

  writeActiveSession(basePath, state, `# ${params.task} Orchestration Log\n`);

  return {
    success: true,
    path: sessionPath,
  };
}

function handleGetSessionStatus(_params, projectRoot) {
  const session = readActiveSessionOrNull(projectRoot);
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
  params.next_phase_id = coercePositiveInteger(params.next_phase_id);
  params.completed_phase_id = coercePositiveInteger(params.completed_phase_id);
  if (Array.isArray(params.next_phase_ids)) {
    params.next_phase_ids = params.next_phase_ids.map(coercePositiveInteger);
  }

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

  return withSessionState(projectRoot, ({ state }) => {
    if (params.session_id && state.session_id !== params.session_id) {
      throw new StateError(
        `Session mismatch: active session is '${state.session_id}', got '${params.session_id}'`
      );
    }

    let completedPhase;
    if (hasCompletedPhase) {
      completedPhase = state.phases.find(
        (phase) => phase.id === params.completed_phase_id
      );
      if (!completedPhase) {
        throw new NotFoundError(
          `Phase ${params.completed_phase_id} not found in session state`
        );
      }
    }

    let nextPhase;
    if (hasNextPhaseId) {
      nextPhase = state.phases.find((phase) => phase.id === params.next_phase_id);
      if (!nextPhase) {
        throw new NotFoundError(
          `next_phase_id ${params.next_phase_id} does not match any phase in session state`
        );
      }
    }

    const phasesToStart = [];
    if (hasNextPhaseIds) {
      for (const id of params.next_phase_ids) {
        const phase = state.phases.find((candidate) => candidate.id === id);
        if (!phase) {
          throw new NotFoundError(`Phase ${id} not found in session state`);
        }
        if (phase.status === 'completed' || phase.status === 'failed') {
          throw new StateError(`Cannot start phase ${id}: status is '${phase.status}'`);
        }
        if (phase.status === 'pending') {
          phasesToStart.push(phase);
        }
      }
    }

    if (completedPhase) {
      completedPhase.status = 'completed';
      completedPhase.completed = new Date().toISOString();
      completedPhase.downstream_context =
        params.downstream_context ?? completedPhase.downstream_context;
      completedPhase.files_created =
        params.files_created ?? completedPhase.files_created;
      completedPhase.files_modified =
        params.files_modified ?? completedPhase.files_modified;
      completedPhase.files_deleted =
        params.files_deleted ?? completedPhase.files_deleted;
    }

    let startedPhaseIds;
    if (hasNextPhaseIds) {
      const now = new Date().toISOString();
      startedPhaseIds = [];
      for (const phase of phasesToStart) {
        phase.status = 'in_progress';
        phase.started = now;
        startedPhaseIds.push(phase.id);
      }
      state.current_phase = params.next_phase_ids[0];
    } else if (nextPhase) {
      if (nextPhase.status === 'pending') {
        nextPhase.status = 'in_progress';
        nextPhase.started = new Date().toISOString();
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

    state.updated = new Date().toISOString();

    const response = {
      success: true,
      session_state_summary: {
        current_phase: state.current_phase,
        completed_phases: state.phases
          .filter((phase) => phase.status === 'completed')
          .map((phase) => phase.id),
        pending_phases: state.phases
          .filter((phase) => phase.status === 'pending')
          .map((phase) => phase.id),
      },
    };

    if (startedPhaseIds) {
      response.started_phase_ids = startedPhaseIds;
    }

    return { response, writeBack: true };
  });
}

function handleArchiveSession(params, projectRoot) {
  assertSessionId(params.session_id);

  const session = readActiveSession(projectRoot);
  const { state, basePath, sessionPath, content } = session;

  if (state.session_id !== params.session_id) {
    throw new StateError(
      `Session mismatch: active session is '${state.session_id}', requested '${params.session_id}'`
    );
  }

  state.status = 'completed';
  state.updated = new Date().toISOString();
  writeActiveSession(basePath, state, extractBody(content));

  const archivePath = path.join(
    basePath,
    'state',
    'archive',
    `${params.session_id}.md`
  );
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.renameSync(sessionPath, archivePath);

  const archivedFiles = [archivePath];
  const plansArchiveDir = path.join(basePath, 'plans', 'archive');
  fs.mkdirSync(plansArchiveDir, { recursive: true });

  const resolvedPlansDir = path.resolve(path.join(basePath, 'plans')) + path.sep;
  const documentPaths = [state.design_document, state.implementation_plan].filter(
    Boolean
  );

  for (const documentPath of documentPaths) {
    const absoluteDocumentPath = path.resolve(
      path.isAbsolute(documentPath)
        ? documentPath
        : path.join(projectRoot, documentPath)
    );

    if (!absoluteDocumentPath.startsWith(resolvedPlansDir)) {
      continue;
    }

    if (fs.existsSync(absoluteDocumentPath)) {
      const destinationPath = path.join(
        plansArchiveDir,
        path.basename(absoluteDocumentPath)
      );
      fs.renameSync(absoluteDocumentPath, destinationPath);
      archivedFiles.push(destinationPath);
    }
  }

  return {
    success: true,
    archive_path: archivePath,
    archived_files: archivedFiles,
  };
}

function handleUpdateSession(params, projectRoot) {
  assertSessionId(params.session_id);

  return withSessionState(projectRoot, ({ state }) => {
    if (state.session_id !== params.session_id) {
      throw new StateError(
        `Session mismatch: active session is '${state.session_id}', got '${params.session_id}'`
      );
    }

    const updatableFields = [
      'execution_mode',
      'execution_backend',
      'current_batch',
    ];
    const updatedFields = [];

    for (const field of updatableFields) {
      if (params[field] !== undefined) {
        state[field] = params[field];
        updatedFields.push(field);
      }
    }

    if (updatedFields.length === 0) {
      throw new ValidationError(
        'At least one updatable field (execution_mode, execution_backend, current_batch) is required'
      );
    }

    state.updated = new Date().toISOString();

    return {
      response: { success: true, updated_fields: updatedFields },
      writeBack: true,
    };
  });
}

module.exports = {
  handleCreateSession,
  handleGetSessionStatus,
  handleTransitionPhase,
  handleArchiveSession,
  handleUpdateSession,
  parseSessionState,
  serializeSessionState,
};
