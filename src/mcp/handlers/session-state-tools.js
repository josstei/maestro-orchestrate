'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId } = require('../../lib/validation');
const { validatePhases } = require('../contracts/plan-schema');
const {
  createEmptyDownstreamContext,
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape: describeDownstreamContextShape,
} = require('../contracts/downstream-context');
const { ValidationError, StateError, NotFoundError } = require('../../lib/errors');
const {
  isDesignGateBlockingCreate,
  hasDesignGate,
  getApprovedDesignDocumentPath,
  findOrphanedApprovedGates,
  ensureDesignDocumentInPlans,
  writePlansDocumentContent,
  removeDesignGate,
} = require('./design-gate');
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

/**
 * Materialize a session document (design or plan) into `<state_dir>/plans/`.
 * Mirrors the design-gate contract so both documents are reachable by
 * `archive_session` regardless of where Plan Mode wrote them.
 *
 * Used at `create_session` time rather than `record_design_approval` because
 * Gemini's parallel dispatch can fire a write and an MCP tool in the same
 * turn; the write isn't yet visible when the MCP handler runs. Deferring the
 * copy to `create_session` guarantees the file has settled on disk.
 *
 * @param {string} projectRoot
 * @param {string} documentPath - absolute or workspace-relative path
 * @param {'design_document' | 'implementation_plan'} documentKind
 * @returns {string | null} absolute path to the canonical location inside plans/, or null if documentPath was absent
 */
function materializeSessionDocument(projectRoot, documentPath, documentKind) {
  if (typeof documentPath !== 'string' || documentPath.length === 0) {
    return null;
  }
  const absolutePath = path.isAbsolute(documentPath)
    ? documentPath
    : path.join(projectRoot, documentPath);
  if (!fs.existsSync(absolutePath)) {
    const context =
      documentKind === 'design_document'
        ? ' (recorded via record_design_approval but not found at create_session time — confirm the file was materialized after Plan Mode exit)'
        : ' (confirm the plan was written to disk before calling create_session)';
    throw new NotFoundError(`${documentKind} does not exist: ${absolutePath}${context}`);
  }
  return ensureDesignDocumentInPlans(projectRoot, absolutePath);
}

/**
 * Resolve the caller's implementation-plan input to a canonical absolute path.
 * At-most-one-of (implementation_plan) or (implementation_plan_content +
 * implementation_plan_filename); absent entirely is valid and returns null
 * (the session simply has no recorded plan). The content variant closes the
 * same path-resolution gap that `resolveApprovedDesignDocument` addresses for
 * design docs: a runtime whose write surface resolves relative paths against
 * a different root than the MCP workspace cannot pass a path the server can
 * find, so it passes content instead.
 *
 * @param {object} params
 * @param {string} [params.implementation_plan]
 * @param {string} [params.implementation_plan_content]
 * @param {string} [params.implementation_plan_filename]
 * @param {string} projectRoot
 * @returns {string | null} canonical absolute path inside plans/, or null when no plan was supplied
 * @throws {ValidationError} when both variants are provided or the content variant is incomplete
 */
function resolveImplementationPlan(params, projectRoot) {
  const hasPath =
    typeof params.implementation_plan === 'string' &&
    params.implementation_plan.length > 0;
  const hasContent =
    typeof params.implementation_plan_content === 'string' &&
    params.implementation_plan_content.length > 0;
  const hasFilename =
    typeof params.implementation_plan_filename === 'string' &&
    params.implementation_plan_filename.length > 0;
  const contentVariantProvided = hasContent || hasFilename;

  if (hasPath && contentVariantProvided) {
    throw new ValidationError(
      'implementation_plan is mutually exclusive with implementation_plan_content/implementation_plan_filename'
    );
  }

  if (contentVariantProvided) {
    if (!hasContent) {
      throw new ValidationError('implementation_plan_content is required');
    }
    if (!hasFilename) {
      throw new ValidationError('implementation_plan_filename is required');
    }
    return writePlansDocumentContent(
      projectRoot,
      params.implementation_plan_filename,
      params.implementation_plan_content,
      'implementation_plan_filename'
    );
  }

  if (hasPath) {
    return materializeSessionDocument(projectRoot, params.implementation_plan, 'implementation_plan');
  }

  return null;
}

/**
 * Reject create_session when an approved design gate exists for a different
 * session_id and the current session has no gate of its own. This signals the
 * orchestrator drifted away from the session_id it entered the gate with —
 * silently proceeding would strand the approved design document because
 * `getApprovedDesignDocumentPath` looks the path up by session_id. The error
 * names the orphaned ids and describes remediation so the caller can either
 * align on the original id or delete the stale gate file before retrying.
 *
 * A current-session gate (approved or not) suppresses the check: that path is
 * the normal approve-then-create flow, and any leftover gate from a prior
 * workflow in the same workspace is benign alongside the valid one.
 *
 * @param {string} projectRoot
 * @param {string} currentSessionId
 * @throws {ValidationError} when an orphaned approved gate is detected
 */
function assertNoOrphanedApprovedGate(projectRoot, currentSessionId) {
  const orphans = findOrphanedApprovedGates(projectRoot, currentSessionId);
  if (orphans.length === 0) return;

  if (hasDesignGate(projectRoot, currentSessionId)) return;

  const orphanedIds = orphans.map((gate) => gate.session_id);
  const idList = orphanedIds.map((id) => `'${id}'`).join(', ');
  const stalePaths = orphans
    .map((g) => `<state_dir>/state/${g.session_id}.design-gate.json`)
    .join(', ');
  throw new ValidationError(
    `Approved design gate exists for session ${idList} but create_session was called with '${currentSessionId}'. Session IDs must match across enter_design_gate, record_design_approval, and create_session. Either call create_session with the matching session_id, or delete the stale gate file(s) at ${stalePaths} and re-enter the gate with '${currentSessionId}'.`,
    {
      code: 'DESIGN_GATE_SESSION_MISMATCH',
      details: {
        current_session_id: currentSessionId,
        orphaned_session_ids: orphanedIds,
      },
    }
  );
}

function handleCreateSession(params, projectRoot) {
  assertSessionId(params.session_id);

  assertNoOrphanedApprovedGate(projectRoot, params.session_id);

  if (isDesignGateBlockingCreate(projectRoot, params.session_id)) {
    throw new StateError(
      'Design gate entered but not approved. Call record_design_approval before create_session.',
      { code: 'DESIGN_GATE_UNAPPROVED' }
    );
  }

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

  const designDocumentCandidate =
    params.design_document ||
    getApprovedDesignDocumentPath(projectRoot, params.session_id);
  const resolvedDesignDocument = designDocumentCandidate
    ? materializeSessionDocument(projectRoot, designDocumentCandidate, 'design_document')
    : null;
  const resolvedImplementationPlan = resolveImplementationPlan(params, projectRoot);

  const now = new Date().toISOString();
  const state = {
    session_id: params.session_id,
    task: params.task,
    created: now,
    updated: now,
    status: 'in_progress',
    workflow_mode: params.workflow_mode || 'standard',
    design_document: resolvedDesignDocument || null,
    implementation_plan: resolvedImplementationPlan,
    current_phase:
      params.phases && params.phases.length > 0 ? params.phases[0].id : null,
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
      agents: phase.agent ? [phase.agent] : [],
      parallel: phase.parallel || false,
      started: null,
      completed: null,
      blocked_by: phase.blocked_by || [],
      files_created: [],
      files_modified: [],
      files_deleted: [],
      planned_files: phase.files || [],
      downstream_context: createEmptyDownstreamContext(),
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
      const filesCreated = params.files_created ?? [];
      const filesModified = params.files_modified ?? [];
      const filesDeleted = params.files_deleted ?? [];
      const hasFiles =
        filesCreated.length + filesModified.length + filesDeleted.length > 0;
      const normalizedContext = normalizeDownstreamContext(params.downstream_context);
      const contextProvided = isDownstreamContextPopulated(normalizedContext);

      if (hasFiles && !contextProvided) {
        throw new ValidationError(
          `Phase ${completedPhase.id} produced files but downstream_context is empty after normalization. ${describeDownstreamContextShape()}`,
          {
            code: 'HANDOFF_INCOMPLETE',
            details: {
              phase_id: completedPhase.id,
              files_created_count: filesCreated.length,
              files_modified_count: filesModified.length,
              files_deleted_count: filesDeleted.length,
              received_downstream_context: params.downstream_context ?? null,
            },
          }
        );
      }

      completedPhase.status = 'completed';
      completedPhase.completed = new Date().toISOString();
      completedPhase.downstream_context = normalizedContext;
      completedPhase.files_created = filesCreated;
      completedPhase.files_modified = filesModified;
      completedPhase.files_deleted = filesDeleted;
      completedPhase.requires_reconciliation =
        !hasFiles && !contextProvided ? true : false;
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

  removeDesignGate(projectRoot, params.session_id);

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
};
