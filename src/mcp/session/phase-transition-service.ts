import { assertSessionId } from '../../lib/validation/index.js';
import { ValidationError, StateError, NotFoundError } from '../../lib/errors/index.js';
import {
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape as describeDownstreamContextShape,
} from '../contracts/downstream-context.js';
import { attributePhaseCost, phaseDurationMs, normalizeTokenUsage } from '../contracts/agent-cost-ledger.js';
import { captureCheckpoint } from '../handlers/checkpoints.js';
import { parseBlockers } from '../handlers/blocker-parser.js';
import {
  extractFileManifest,
  sessionStore,
  updateCurrentSession,
} from './session-store.js';
import { isDocumentationPath } from './documentation-classifier.js';

function assertTransitionShape(params: any) {
  const hasNextPhaseIds =
    Array.isArray(params.next_phase_ids) && params.next_phase_ids.length > 0;
  if (params.next_phase_id != null && hasNextPhaseIds) {
    throw new ValidationError(
      'next_phase_id and next_phase_ids are mutually exclusive'
    );
  }

  if (params.completed_phase_id == null && !hasNextPhaseIds && params.next_phase_id == null) {
    throw new ValidationError(
      'At least one of completed_phase_id, next_phase_id, or next_phase_ids is required'
    );
  }
}

function findPhase(state: any, id: any, label: any = 'Phase') {
  const phase = state.phases.find((candidate: any) => candidate.id === id);
  if (!phase) {
    if (label === 'next_phase_id') {
      throw new NotFoundError(
        `next_phase_id ${id} does not match any phase in session state`
      );
    }
    throw new NotFoundError(`${label} ${id} not found in session state`);
  }
  return phase;
}

function resolvePhasesToStart(state: any, phaseIds: any) {
  const phasesToStart = [];
  for (const id of phaseIds) {
    const phase = findPhase(state, id);
    if (phase.status === 'completed' || phase.status === 'failed') {
      throw new StateError(`Cannot start phase ${id}: status is '${phase.status}'`);
    }
    if (phase.status === 'pending') {
      phasesToStart.push(phase);
    }
  }
  return phasesToStart;
}

function createCompletionReviewState(required: boolean) {
  return {
    required,
    status: required ? 'pending' : 'not_required',
    reviewer_agent: null,
    reviewed_at: null,
    reviewed_phase_ids: [],
    finding_count: 0,
    blocking_finding_count: 0,
    reviewed_files: [],
    summary: null,
  };
}

function hasNonDocumentationChanges(phase: any): boolean {
  return [
    ...(phase.files_created || []),
    ...(phase.files_modified || []),
    ...(phase.files_deleted || []),
  ].some((filePath: string) => !isDocumentationPath(filePath));
}

function completePhase(phase: any, params: any, state: any, now: any) {
  const { filesCreated, filesModified, filesDeleted, hasFiles } =
    extractFileManifest(params);
  const normalizedContext = normalizeDownstreamContext(params.downstream_context);
  const contextProvided = isDownstreamContextPopulated(normalizedContext);

  if (hasFiles && !contextProvided) {
    throw new ValidationError(
      `Phase ${phase.id} produced files but downstream_context is empty after normalization. ${describeDownstreamContextShape()}`,
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
  phase.completed = now();
  phase.downstream_context = normalizedContext;
  phase.files_created = filesCreated;
  phase.files_modified = filesModified;
  phase.files_deleted = filesDeleted;
  phase.requires_reconciliation = !hasFiles && !contextProvided;
  if (typeof params.task_report === 'string') {
    phase.blocker_count = parseBlockers(params.task_report).length;
  }
  if (params.review_finding_count != null) {
    const findingCount = Number(params.review_finding_count);
    phase.review_finding_count =
      Number.isFinite(findingCount) && findingCount > 0 ? findingCount : 0;
  }

  const durationMs = phaseDurationMs(phase.started, phase.completed);
  phase.duration_ms = durationMs;
  if (params.token_usage) {
    phase.token_usage = normalizeTokenUsage(params.token_usage);
  }
  if (!state.token_usage.by_agent || typeof state.token_usage.by_agent !== 'object') {
    state.token_usage.by_agent = {};
  }
  attributePhaseCost(state.token_usage.by_agent, {
    agent: (phase.agents || [])[0],
    tokenUsage: params.token_usage,
    durationMs,
  });

  const currentPhaseHasNonDocChanges = hasNonDocumentationChanges(phase);
  const anyCompletedPhaseHasNonDocChanges = (state.phases || [])
    .filter((candidate: any) => candidate.status === 'completed')
    .some(hasNonDocumentationChanges);

  // A passing or blocked review is a snapshot of the change set at review time.
  // Any later completed phase with non-documentation changes invalidates that
  // snapshot, including a modification to a path that was reviewed previously.
  if (currentPhaseHasNonDocChanges) {
    state.completion_review = createCompletionReviewState(true);
  } else if (anyCompletedPhaseHasNonDocChanges && !state.completion_review) {
    // Conservatively upgrade legacy sessions that predate completion_review.
    state.completion_review = createCompletionReviewState(true);
  } else if (
    !anyCompletedPhaseHasNonDocChanges &&
    (!state.completion_review || state.completion_review.status === 'not_required')
  ) {
    state.completion_review = createCompletionReviewState(false);
  }
}

function startPhases(state: any, params: any, nextPhase: any, phasesToStart: any, now: any) {
  if (phasesToStart) {
    const started = now();
    const startedPhaseIds = [];
    for (const phase of phasesToStart) {
      phase.status = 'in_progress';
      phase.started = started;
      startedPhaseIds.push(phase.id);
    }
    state.current_phase = params.next_phase_ids[0];
    return startedPhaseIds;
  }

  if (nextPhase) {
    if (nextPhase.status === 'pending') {
      nextPhase.status = 'in_progress';
      nextPhase.started = now();
    }
    state.current_phase = params.next_phase_id;
  }

  return null;
}

function buildTransitionResponse(state: any, startedPhaseIds: any) {
  const response: Record<string, any> = {
    success: true,
    session_state_summary: {
      current_phase: state.current_phase,
      completed_phases: state.phases
        .filter((phase: any) => phase.status === 'completed')
        .map((phase: any) => phase.id),
      pending_phases: state.phases
        .filter((phase: any) => phase.status === 'pending')
        .map((phase: any) => phase.id),
    },
  };

  if (startedPhaseIds) response.started_phase_ids = startedPhaseIds;

  return response;
}

function deriveTransition(state: any, params: any, now: any) {
  const next = structuredClone(state);
  const completedPhase = params.completed_phase_id == null
    ? null : findPhase(next, params.completed_phase_id);
  const nextPhase = params.next_phase_id == null
    ? null : findPhase(next, params.next_phase_id, 'next_phase_id');
  const phasesToStart = Array.isArray(params.next_phase_ids) && params.next_phase_ids.length > 0
    ? resolvePhasesToStart(next, params.next_phase_ids)
    : null;

  if (completedPhase) completePhase(completedPhase, params, next, now);
  const startedPhaseIds = startPhases(next, params, nextPhase, phasesToStart, now);

  if (params.batch_id !== undefined) next.current_batch = params.batch_id;

  if (params.token_usage) {
    next.token_usage.total_input += params.token_usage.input || 0;
    next.token_usage.total_output += params.token_usage.output || 0;
    next.token_usage.total_cached += params.token_usage.cached || 0;
  }

  next.updated = now();
  return {
    next,
    startedPhaseIds,
  };
}

function transitionPhase(params: any, projectRoot: any) {
  if (params.session_id) {
    assertSessionId(params.session_id);
  }

  assertTransitionShape(params);

  const mutator = ({ state }: any) => {
    const transition = deriveTransition(state, params, () => new Date().toISOString());
    Object.assign(state, transition.next);
    captureCheckpoint(state, projectRoot);

    return {
      response: buildTransitionResponse(state, transition.startedPhaseIds),
      writeBack: true,
    };
  };

  return params.session_id
    ? sessionStore.update(projectRoot, params.session_id, mutator)
    : updateCurrentSession(projectRoot, mutator);
}

export {
  assertTransitionShape,
  deriveTransition,
  transitionPhase,
};
