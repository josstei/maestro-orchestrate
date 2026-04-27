'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { assertSessionId } = require('../../lib/validation');
const { validatePhases, PHASE_KINDS } = require('../contracts/plan-schema');
const { validateHandoff } = require('../contracts/handoff-contract');
const {
  createEmptyDownstreamContext,
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
} = require('../contracts/downstream-context');
const { ValidationError, NotFoundError, StateError } = require('../../lib/errors');
const {
  isDesignGateBlockingCreate,
  hasDesignGate,
  getApprovedDesignDocumentPath,
  findOrphanedApprovedGates,
  removeDesignGate,
} = require('./design-gate');
const {
  resolveDocumentInput,
  materializePlansDocument,
  relocatePlansDocumentToArchive,
} = require('./plans-document');
const {
  resolveBasePath,
  resolveActiveSessionPath,
  parseSessionState,
  extractBody,
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  mutateSessionState,
} = require('./session-state-core');

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

/**
 * @private
 * Coerce a phase id to an integer when its representation is unambiguous.
 *
 * Accepts native integers and strings whose trimmed form matches an optional
 * leading minus followed by digits. Anything else (floats, mixed alphanumeric,
 * empty/whitespace) is treated as non-coercible.
 *
 * @param {unknown} id
 * @returns {number | null} The coerced integer, or null when the id is not
 *   safely representable as an integer.
 */
function asNumericId(id) {
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  }
  return null;
}

/**
 * Determine the effective `kind` for a phase, honoring an explicit `kind`
 * field when present and falling back to a position-based heuristic for
 * legacy sessions (created before phase.kind existed).
 *
 * Rules:
 * - If `phase.kind` is a non-empty string (after trim), return it. The caller
 *   is responsible for upstream membership validation against PHASE_KINDS;
 *   this helper does not coerce or validate the value.
 * - Otherwise, if the phase is the terminal (highest-id) phase in
 *   `allPhases`, infer `'verification'`.
 * - Otherwise, infer `'implementation'`.
 *
 * Phase IDs may be integers OR strings. Terminal-phase determination compares
 * numerically when every id in `allPhases` is integer-coercible (via
 * {@link asNumericId}); otherwise it compares lexicographically over
 * stringified ids. Empty `allPhases` defaults to `'implementation'` since
 * terminal status cannot be established.
 *
 * @param {object} phase - The phase whose kind should be resolved.
 * @param {Array<object>} allPhases - All phases in the session, used to
 *   identify the terminal phase.
 * @returns {string} An inferred kind (`'implementation'` or `'verification'`)
 *   when `phase.kind` is absent; otherwise the explicit string value as-is.
 *   Caller validates membership in PHASE_KINDS.
 */
function resolveEffectivePhaseKind(phase, allPhases) {
  if (typeof phase.kind === 'string' && phase.kind.trim().length > 0) {
    return phase.kind;
  }

  if (!Array.isArray(allPhases) || allPhases.length === 0) {
    return 'implementation';
  }

  const numericIds = allPhases.map((candidate) => asNumericId(candidate.id));
  const allNumeric = numericIds.every((value) => value !== null);

  let terminalId;
  if (allNumeric) {
    terminalId = numericIds.reduce((max, value) => (value > max ? value : max));
    const phaseNumericId = asNumericId(phase.id);
    return phaseNumericId === terminalId ? 'verification' : 'implementation';
  }

  const stringIds = allPhases.map((candidate) => String(candidate.id));
  terminalId = stringIds.reduce((max, value) => (value > max ? value : max));
  return String(phase.id) === terminalId ? 'verification' : 'implementation';
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
    ? materializePlansDocument(projectRoot, designDocumentCandidate, 'design_document')
    : null;

  const implementationPlanCandidate = resolveDocumentInput(params, projectRoot, {
    pathKey: 'implementation_plan',
    contentKey: 'implementation_plan_content',
    filenameKey: 'implementation_plan_filename',
    documentKind: 'implementation_plan',
  });
  const resolvedImplementationPlan = implementationPlanCandidate
    ? materializePlansDocument(
        projectRoot,
        implementationPlanCandidate,
        'implementation_plan'
      )
    : null;

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
    phases: params.phases.map((phase) => {
      const phaseState = {
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
      };
      if (phase.kind !== undefined) phaseState.kind = phase.kind;
      if (phase.parent_phase_id !== undefined) {
        phaseState.parent_phase_id = phase.parent_phase_id;
      }
      return phaseState;
    }),
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

  return mutateSessionState(projectRoot, ({ state }) => {
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

      const kindIsExplicit =
        typeof completedPhase.kind === 'string' &&
        completedPhase.kind.trim().length > 0;
      const phaseKind = resolveEffectivePhaseKind(completedPhase, state.phases);

      if (!PHASE_KINDS.includes(phaseKind)) {
        throw new ValidationError(
          `Phase ${completedPhase.id} has unrecognized kind '${phaseKind}'. Allowed: ${PHASE_KINDS.join(', ')}.`,
          {
            code: 'PHASE_KIND_INVALID',
            details: {
              phase_id: completedPhase.id,
              phase_kind: phaseKind,
              allowed_kinds: [...PHASE_KINDS],
            },
          }
        );
      }

      const handoffPayload = {
        files_created: filesCreated,
        files_modified: filesModified,
        files_deleted: filesDeleted,
        downstream_context: params.downstream_context,
        findings: params.findings,
        addressed_finding_ids: params.addressed_finding_ids,
        final_artifacts: params.final_artifacts,
      };

      const handoffResult = validateHandoff(phaseKind, handoffPayload, {
        strict: kindIsExplicit,
      });
      if (!handoffResult.valid) {
        const first = handoffResult.violations[0];
        throw new ValidationError(first.message, {
          code: first.code,
          details: {
            phase_id: completedPhase.id,
            phase_kind: phaseKind,
            kind_is_explicit: kindIsExplicit,
            files_created_count: filesCreated.length,
            files_modified_count: filesModified.length,
            files_deleted_count: filesDeleted.length,
            received_downstream_context: params.downstream_context ?? null,
          },
        });
      }

      const normalizedContext = normalizeDownstreamContext(params.downstream_context);
      const contextProvided = isDownstreamContextPopulated(normalizedContext);

      completedPhase.status = 'completed';
      completedPhase.completed = new Date().toISOString();
      completedPhase.kind = phaseKind;
      completedPhase.downstream_context = normalizedContext;
      completedPhase.files_created = filesCreated;
      completedPhase.files_modified = filesModified;
      completedPhase.files_deleted = filesDeleted;

      if (params.findings !== undefined) {
        completedPhase.findings = params.findings;
      }
      if (params.addressed_finding_ids !== undefined) {
        completedPhase.addressed_finding_ids = params.addressed_finding_ids;
      }
      if (params.final_artifacts !== undefined) {
        completedPhase.final_artifacts = params.final_artifacts;
      }

      completedPhase.requires_reconciliation =
        phaseKind === 'implementation' && !hasFiles && !contextProvided;
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
      if (!state.token_usage || typeof state.token_usage !== 'object') {
        state.token_usage = {
          total_input: 0,
          total_output: 0,
          total_cached: 0,
          by_agent: {},
        };
      }

      const usage = params.token_usage;
      state.token_usage.total_input =
        (Number(state.token_usage.total_input) || 0) + (Number(usage.input) || 0);
      state.token_usage.total_output =
        (Number(state.token_usage.total_output) || 0) + (Number(usage.output) || 0);
      state.token_usage.total_cached =
        (Number(state.token_usage.total_cached) || 0) + (Number(usage.cached) || 0);

      if (
        !state.token_usage.by_agent ||
        typeof state.token_usage.by_agent !== 'object' ||
        Array.isArray(state.token_usage.by_agent)
      ) {
        state.token_usage.by_agent = {};
      }

      const phaseAgents = Array.isArray(completedPhase && completedPhase.agents)
        ? completedPhase.agents.filter(
            (name) => typeof name === 'string' && name.length > 0
          )
        : [];
      const explicitNames =
        Array.isArray(params.agent_name) && params.agent_name.length > 0
          ? params.agent_name.filter(
              (name) => typeof name === 'string' && name.length > 0
            )
          : typeof params.agent_name === 'string' && params.agent_name.length > 0
            ? [params.agent_name]
            : null;

      const targets =
        explicitNames && explicitNames.length > 0
          ? explicitNames
          : phaseAgents.length > 0
            ? phaseAgents
            : ['unknown'];

      const splitInput = Math.floor((Number(usage.input) || 0) / targets.length);
      const splitOutput = Math.floor((Number(usage.output) || 0) / targets.length);
      const splitCached = Math.floor((Number(usage.cached) || 0) / targets.length);

      for (const agentKey of targets) {
        if (!state.token_usage.by_agent[agentKey]) {
          state.token_usage.by_agent[agentKey] = { input: 0, output: 0, cached: 0 };
        }
        state.token_usage.by_agent[agentKey].input += splitInput;
        state.token_usage.by_agent[agentKey].output += splitOutput;
        state.token_usage.by_agent[agentKey].cached += splitCached;
      }
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

  const documentPaths = [state.design_document, state.implementation_plan].filter(
    Boolean
  );

  for (const documentPath of documentPaths) {
    const destination = relocatePlansDocumentToArchive(
      documentPath,
      projectRoot,
      plansArchiveDir
    );
    if (destination) {
      archivedFiles.push(destination);
    }
  }

  removeDesignGate(projectRoot, params.session_id);

  const phaseBreakdown = summarizePhaseBreakdown(state.phases);

  return {
    success: true,
    archive_path: archivePath,
    archived_files: archivedFiles,
    phase_breakdown: phaseBreakdown,
  };
}

/**
 * Build a per-kind count of phases for the archive response.
 *
 * Phases without an explicit `kind` are tallied under `'implementation'` —
 * this matches the back-compat heuristic the runtime uses for non-terminal
 * legacy phases. The breakdown is intentionally additive: unknown kinds
 * (e.g., from a hand-edited future state) are returned under `unknown_kinds`
 * so the count never silently drops phases.
 *
 * @param {Array<object>} phases
 * @returns {{ by_kind: Record<string, number>, unknown_kinds: Record<string, number> }}
 */
function summarizePhaseBreakdown(phases) {
  const byKind = { implementation: 0, review: 0, revision: 0, verification: 0 };
  const unknownKinds = {};
  for (const phase of phases || []) {
    const rawKind = phase && phase.kind;
    const kind =
      typeof rawKind === 'string' && rawKind.trim().length > 0
        ? rawKind
        : 'implementation';
    if (Object.prototype.hasOwnProperty.call(byKind, kind)) {
      byKind[kind] += 1;
    } else {
      unknownKinds[kind] = (unknownKinds[kind] || 0) + 1;
    }
  }
  return { by_kind: byKind, unknown_kinds: unknownKinds };
}

function handleUpdateSession(params, projectRoot) {
  assertSessionId(params.session_id);

  return mutateSessionState(projectRoot, ({ state }) => {
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
  resolveEffectivePhaseKind,
};
