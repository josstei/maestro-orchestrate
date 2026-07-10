import { assertSessionId } from '../../lib/validation/index.js';
import { validatePhases } from '../contracts/plan-schema.js';
import type { PlanPhase } from '../contracts/plan-schema.js';
import type { SessionPhaseState, SessionState } from '../contracts/session-state-schema.js';
import { ValidationError, StateError } from '../../lib/errors/index.js';
import {
  isDesignGateBlockingCreate,
  hasDesignGate,
  getApprovedDesignDocumentPath,
  removeDesignGate,
} from '../handlers/design-gate.js';
import { recordAgentPerformance } from '../handlers/agent-performance.js';
import { recordPlanAccuracy } from '../handlers/plan-accuracy.js';
import { recordArchitectureMemory } from '../handlers/architecture-memory.js';
import { SCHEMA_VERSION } from '../handlers/session-migrations.js';
import { attempt } from '../handlers/attempt.js';
import { findOrphanedApprovedGates } from './design-gate-repository.js';
import {
  archivePlansDocuments,
  materializeSessionDocument,
  resolveImplementationPlan,
} from './document-repository.js';
import {
  archiveActiveSessionFile,
  assertNoInProgressSession,
  assertValidActiveSession,
  extractBody,
  readCurrentSessionOrNull,
  withValidatedSession,
  writeActiveSession,
  writeNewActiveSession,
} from './session-repository.js';
import {
  createEmptySessionTokenUsage,
  createPendingPhaseState,
} from './session-state-factory.js';

function assertNoOrphanedApprovedGate(projectRoot: any, currentSessionId: any) {
  const orphans = findOrphanedApprovedGates(projectRoot, currentSessionId);
  if (orphans.length === 0) return;

  if (hasDesignGate(projectRoot, currentSessionId)) return;

  const orphanedIds = orphans.map((gate: any) => gate.session_id);
  const idList = orphanedIds.map((id: any) => `'${id}'`).join(', ');
  const stalePaths = orphans
    .map((g: any) => `<state_dir>/state/${g.session_id}.design-gate.json`)
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

function initialPhaseState(phase: PlanPhase): SessionPhaseState {
  return createPendingPhaseState({
    id: phase.id,
    name: phase.name,
    agents: [phase.agent],
    parallel: phase.parallel,
    blockedBy: phase.blocked_by,
    plannedFiles: phase.files || [],
  });
}

function buildInitialSessionState(params: any, documents: any): SessionState {
  const now = new Date().toISOString();
  const phases = (params.phases as PlanPhase[]).map(initialPhaseState);
  const state: SessionState = {
    schema_version: SCHEMA_VERSION,
    session_id: params.session_id,
    parent_session_id: params.parent_session_id || null,
    branch: params.branch || null,
    task: params.task,
    created: now,
    updated: now,
    status: 'in_progress',
    workflow_mode: params.workflow_mode || 'standard',
    design_document: documents.designDocument || null,
    implementation_plan: documents.implementationPlan,
    current_phase: phases[0]?.id ?? null,
    total_phases: phases.length,
    execution_mode: params.execution_mode || null,
    execution_backend: 'native',
    current_batch: null,
    task_complexity: params.task_complexity || null,
    token_usage: createEmptySessionTokenUsage(),
    phases,
  };

  const firstPhase = state.phases[0];
  if (firstPhase) {
    firstPhase.status = 'in_progress';
    firstPhase.started = now;
  }

  return state;
}

function createSession(params: any, projectRoot: any) {
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
    const rules = phasesValidation.violations.map((v: any) => v.rule || v.field).join(', ');
    throw new ValidationError(`Invalid phases payload: ${rules}`, {
      details: phasesValidation.violations,
    });
  }

  assertNoInProgressSession(projectRoot);

  const designDocumentCandidate =
    params.design_document ||
    getApprovedDesignDocumentPath(projectRoot, params.session_id);
  const designDocument = designDocumentCandidate
    ? materializeSessionDocument(projectRoot, designDocumentCandidate, 'design_document')
    : null;
  const implementationPlan = resolveImplementationPlan(params, projectRoot);

  const state = buildInitialSessionState(params, { designDocument, implementationPlan });
  const sessionPath = writeNewActiveSession(
    projectRoot,
    state,
    `# ${params.task} Orchestration Log\n`
  );

  return {
    success: true,
    path: sessionPath,
  };
}

function getSessionStatus(_params: any, projectRoot: any) {
  const session = readCurrentSessionOrNull(projectRoot);
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
    phases: (state.phases || []).map((phase: any) => ({
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

function archiveSession(params: any, projectRoot: any) {
  const { state, basePath, sessionPath, content } = assertValidActiveSession(
    projectRoot,
    params.session_id
  );

  const pendingRec = (state.phases || []).find(
    (phase: any) => phase.requires_reconciliation === true
  );
  if (pendingRec) {
    throw new StateError(
      `Phase ${pendingRec.id} requires reconciliation before archiving. Call scan_phase_changes or reconcile_phase to resolve.`,
      { code: 'RECONCILIATION_PENDING', details: { phase_id: pendingRec.id } }
    );
  }

  for (const record of [recordAgentPerformance, recordPlanAccuracy, recordArchitectureMemory]) {
    attempt(() => record(state, projectRoot));
  }

  state.status = 'completed';
  state.updated = new Date().toISOString();
  writeActiveSession(basePath, state, extractBody(content));

  const archivePath = archiveActiveSessionFile(basePath, sessionPath, params.session_id);
  const archivedFiles = [
    archivePath,
    ...archivePlansDocuments(basePath, projectRoot, [state.design_document, state.implementation_plan]),
  ];

  removeDesignGate(projectRoot, params.session_id);

  return {
    success: true,
    archive_path: archivePath,
    archived_files: archivedFiles,
  };
}

function updateSession(params: any, projectRoot: any) {
  return withValidatedSession(projectRoot, params.session_id, ({ state }: any) => {
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

export { archiveSession, createSession, getSessionStatus, updateSession };
