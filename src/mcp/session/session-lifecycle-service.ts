import { assertSessionId } from '../../lib/validation/index.js';
import { validatePhases } from '../contracts/plan-schema.js';
import type { PlanPhase } from '../contracts/plan-schema.js';
import {
  createDefaultCompletionReview,
  createEmptySessionTokenUsage,
  createPendingPhaseState,
} from '../contracts/session-state-schema.js';
import type { SessionPhaseState, SessionState } from '../contracts/session-state-schema.js';
import { ValidationError, StateError, NotFoundError } from '../../lib/errors/index.js';
import {
  isDesignGateBlockingCreate,
  hasDesignGate,
  getApprovedDesignDocumentPath,
  removeDesignGate,
} from '../handlers/design-gate.js';
import { normalizePlanPhaseAgentInput } from '../contracts/input-compatibility.js';
import { recordAgentPerformance } from '../handlers/agent-performance.js';
import { recordPlanAccuracy } from '../handlers/plan-accuracy.js';
import { recordArchitectureMemory } from '../handlers/architecture-memory.js';
import { attempt } from '../handlers/attempt.js';
import { findOrphanedApprovedGates } from './design-gate-repository.js';
import {
  archivePlansDocuments,
  materializeSessionDocument,
  resolveImplementationPlan,
} from './document-repository.js';
import {
  SCHEMA_VERSION,
  assertNoInProgressSession,
  assertValidActiveSession,
  sessionStore,
} from './session-store.js';
import { isDocumentationPath } from './documentation-classifier.js';

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
    completion_review: createDefaultCompletionReview(),
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

  if (!Array.isArray(params.phases)) {
    throw new ValidationError('Invalid phases payload: phases must be an array', {
      details: [{ rule: 'invalid_phases', detail: 'phases must be an array', severity: 'error' }],
    });
  }

  const normalizedPhases = params.phases.map((p: any) => normalizePlanPhaseAgentInput(p));
  const phasesValidation = validatePhases(normalizedPhases);
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

  const stateParams = { ...params, phases: normalizedPhases };
  const state = buildInitialSessionState(stateParams, { designDocument, implementationPlan });
  const sessionPath = sessionStore.create(
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
  const session = sessionStore.readOrNull(projectRoot);
  if (!session) {
    return {
      exists: false,
      message: 'No active session found',
    };
  }

  const { state } = session;

  const allPhases = state.phases || [];
  const nonDocFilesExist = allPhases.some((p: any) =>
    [...(p.files_created || []), ...(p.files_modified || []), ...(p.files_deleted || [])].some(
      (f: string) => !isDocumentationPath(f)
    )
  );

  const reviewState = state.completion_review || {
    required: nonDocFilesExist,
    status: nonDocFilesExist ? 'pending' : 'not_required',
    reviewer_agent: null,
    reviewed_at: null,
    reviewed_phase_ids: [],
    finding_count: 0,
    blocking_finding_count: 0,
    reviewed_files: [],
    summary: null,
  };

  return {
    exists: true,
    session_id: state.session_id as string,
    status: state.status,
    workflow_mode: state.workflow_mode || 'standard',
    current_phase: state.current_phase,
    total_phases: state.total_phases,
    phases: allPhases.map((phase: any) => ({
      id: phase.id,
      name: phase.name,
      status: phase.status,
      agent: (phase.agents || [])[0],
    })),
    task_complexity: state.task_complexity,
    execution_mode: state.execution_mode,
    current_batch: state.current_batch ?? null,
    token_usage: state.token_usage,
    completion_review: reviewState,
  };
}

const AUTHORIZED_REVIEWER_AGENTS = new Set([
  'code_reviewer',
  'security_engineer',
  'compliance_reviewer',
  'accessibility_specialist',
  'database_administrator',
  'db2_dba',
  'performance_engineer',
  'architect',
  'cloud_architect',
  'solutions_architect',
  'seo_specialist',
  'qa_engineer',
]);

function recordCodeReview(params: any, projectRoot: any) {
  if (params.session_id) {
    assertSessionId(params.session_id);
  }
  const document = assertValidActiveSession(projectRoot, params.session_id);
  const { state } = document;

  const reviewerRaw = typeof params.reviewer_agent === 'string' ? params.reviewer_agent.trim() : '';
  const reviewer = reviewerRaw.replace(/-/g, '_').toLowerCase();
  if (!reviewer || !AUTHORIZED_REVIEWER_AGENTS.has(reviewer)) {
    throw new ValidationError(
      `reviewer_agent '${reviewerRaw}' is not an authorized code reviewer agent. Authorized agents are: ${Array.from(AUTHORIZED_REVIEWER_AGENTS).join(', ')}`,
      { code: 'INVALID_REVIEWER_AGENT' }
    );
  }

  if (!Array.isArray(params.reviewed_phase_ids) || params.reviewed_phase_ids.length === 0) {
    throw new ValidationError('reviewed_phase_ids is required and must be a non-empty array', {
      code: 'INVALID_REVIEWED_PHASES',
    });
  }

  const reviewedPhaseIds = params.reviewed_phase_ids;
  const statePhases = state.phases || [];
  for (const phaseId of reviewedPhaseIds) {
    const found = statePhases.find((p: any) => String(p.id) === String(phaseId));
    if (!found) {
      throw new NotFoundError(`Reviewed phase ID ${phaseId} not found in session state`, {
        code: 'CODE_REVIEW_INVALID_PHASE',
      });
    }
    if (found.status !== 'completed') {
      throw new StateError(`Cannot review phase ${phaseId}: status is '${found.status}', expected 'completed'`, {
        code: 'CODE_REVIEW_INVALID_PHASE',
      });
    }
  }

  const findingCount = Number(params.finding_count);
  const blockingCount = Number(params.blocking_finding_count);
  if (!Number.isInteger(findingCount) || findingCount < 0) {
    throw new ValidationError('finding_count must be a non-negative integer', {
      code: 'INVALID_REVIEW_COUNTS',
    });
  }
  if (!Number.isInteger(blockingCount) || blockingCount < 0 || blockingCount > findingCount) {
    throw new ValidationError('blocking_finding_count must be a non-negative integer <= finding_count', {
      code: 'INVALID_REVIEW_COUNTS',
    });
  }

  if (!Array.isArray(params.reviewed_files)) {
    throw new ValidationError('reviewed_files must be an array of string file paths', {
      code: 'INVALID_REVIEWED_FILES',
    });
  }

  const targetPhaseFiles = new Set<string>();
  for (const phaseId of reviewedPhaseIds) {
    const phase = statePhases.find((p: any) => String(p.id) === String(phaseId));
    if (phase) {
      const allPhaseFiles = [
        ...(phase.files_created || []),
        ...(phase.files_modified || []),
        ...(phase.files_deleted || []),
      ];
      for (const f of allPhaseFiles) {
        if (!isDocumentationPath(f)) {
          targetPhaseFiles.add(f.replace(/\\/g, '/'));
        }
      }
    }
  }

  const providedFiles = new Set((params.reviewed_files as string[]).map((f) => f.replace(/\\/g, '/')));
  for (const requiredFile of targetPhaseFiles) {
    if (!providedFiles.has(requiredFile)) {
      throw new ValidationError(
        `Code review coverage is missing required non-documentation file: "${requiredFile}"`,
        {
          code: 'CODE_REVIEW_INCOMPLETE_COVERAGE',
          details: { missing_file: requiredFile },
        }
      );
    }
  }

  const reviewStatus = blockingCount > 0 ? 'blocked' : 'passed';
  const updatedReview = {
    required: true,
    status: reviewStatus as 'passed' | 'blocked',
    reviewer_agent: reviewer,
    reviewed_at: new Date().toISOString(),
    reviewed_phase_ids: reviewedPhaseIds,
    finding_count: findingCount,
    blocking_finding_count: blockingCount,
    reviewed_files: Array.from(providedFiles),
    summary: typeof params.summary === 'string' ? params.summary : null,
  };

  state.completion_review = updatedReview;
  state.updated = new Date().toISOString();

  sessionStore.write(document, state);

  return {
    success: true,
    completion_review: updatedReview,
  };
}

function recordPhaseFailure(params: any, projectRoot: any) {
  if (params.session_id) {
    assertSessionId(params.session_id);
  }
  const document = assertValidActiveSession(projectRoot, params.session_id);
  const { state } = document;

  const phaseId = params.phase_id;
  const phase = (state.phases || []).find((p: any) => p.id === phaseId);
  if (!phase) {
    throw new NotFoundError(`Phase ${phaseId} not found in session state`, {
      code: 'PHASE_NOT_FOUND',
    });
  }

  phase.status = 'failed';
  if (!Array.isArray(phase.errors)) {
    phase.errors = [];
  }
  phase.errors.push({
    timestamp: new Date().toISOString(),
    agent: params.agent || (phase.agents && phase.agents[0]) || null,
    failure_type: params.failure_type || 'AGENT_DISPATCH_FAILURE',
    message: params.message || 'Subagent execution failed',
  });

  phase.retry_count = (phase.retry_count || 0) + 1;
  state.current_phase = phase.id;
  state.updated = new Date().toISOString();

  sessionStore.write(document, state);

  return {
    success: true,
    phase_id: phase.id,
    status: 'failed',
    retry_count: phase.retry_count,
  };
}

function archiveSession(params: any, projectRoot: any) {
  const document = assertValidActiveSession(
    projectRoot,
    params.session_id
  );
  const { state, basePath } = document;

  const phases = state.phases || [];

  // Check failed phase
  const failedPhase = phases.find((p: any) => p.status === 'failed');
  if (failedPhase) {
    throw new StateError(
      `Cannot archive session: Phase ${failedPhase.id} failed and has not been resolved.`,
      { code: 'FAILED_PHASE_UNRESOLVED', details: { phase_id: failedPhase.id } }
    );
  }

  // Check incomplete phase
  const incompletePhase = phases.find((p: any) => p.status !== 'completed' && p.status !== 'skipped');
  if (incompletePhase) {
    throw new StateError(
      `Cannot archive session: Phase ${incompletePhase.id} is incomplete (status: ${incompletePhase.status}).`,
      { code: 'INCOMPLETE_PHASE_UNRESOLVED', details: { phase_id: incompletePhase.id } }
    );
  }

  // Check pending reconciliation
  const pendingRec = phases.find((phase: any) => phase.requires_reconciliation === true);
  if (pendingRec) {
    throw new StateError(
      `Phase ${pendingRec.id} requires reconciliation before archiving. Call scan_phase_changes or reconcile_phase to resolve.`,
      { code: 'RECONCILIATION_PENDING', details: { phase_id: pendingRec.id } }
    );
  }

  // Check Code Review Gate
  const allNonDocFiles: string[] = [];
  for (const p of phases) {
    if (p.status === 'completed') {
      const pFiles = [
        ...(p.files_created || []),
        ...(p.files_modified || []),
        ...(p.files_deleted || []),
      ];
      for (const f of pFiles) {
        if (!isDocumentationPath(f)) {
          const norm = f.replace(/\\/g, '/');
          if (!allNonDocFiles.includes(norm)) {
            allNonDocFiles.push(norm);
          }
        }
      }
    }
  }

  const review = state.completion_review || {
    required: allNonDocFiles.length > 0,
    status: allNonDocFiles.length > 0 ? 'pending' : 'not_required',
  };

  const isRequired = review.required || allNonDocFiles.length > 0;

  if (isRequired) {
    if (review.status === 'pending' || !review.reviewed_at) {
      throw new StateError(
        'Cannot archive session: code review is required for non-documentation changes but has not been recorded.',
        { code: 'CODE_REVIEW_REQUIRED' }
      );
    }

    if (review.status === 'blocked') {
      throw new StateError(
        'Cannot archive session: code review is blocked by unresolved findings.',
        { code: 'CODE_REVIEW_BLOCKED', details: { blocking_findings: review.blocking_finding_count } }
      );
    }

    if (review.status === 'passed') {
      const reviewedSet = new Set((review.reviewed_files || []).map((f: string) => f.replace(/\\/g, '/')));
      const missingFiles = allNonDocFiles.filter((f) => !reviewedSet.has(f));
      if (missingFiles.length > 0) {
        throw new StateError(
          `Cannot archive session: code review coverage is stale. Unreviewed files: ${missingFiles.join(', ')}`,
          { code: 'CODE_REVIEW_STALE', details: { unreviewed_files: missingFiles } }
        );
      }
    }
  }

  for (const record of [recordAgentPerformance, recordPlanAccuracy, recordArchitectureMemory]) {
    attempt(() => record(state, projectRoot));
  }

  state.status = 'completed';
  state.updated = new Date().toISOString();
  sessionStore.write(document, state);

  const archivePath = sessionStore.archive(document, params.session_id);
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
  return sessionStore.update(projectRoot, params.session_id, ({ state }: any) => {
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

export {
  archiveSession,
  createSession,
  getSessionStatus,
  recordCodeReview,
  recordPhaseFailure,
  updateSession,
};
