import { assertSessionId } from '../../lib/validation/index.js';
import { ValidationError, StateError, NotFoundError } from '../../lib/errors/index.js';
import {
  createEmptyDownstreamContext,
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape as describeDownstreamContextShape,
} from '../contracts/downstream-context.js';
import { attributePhaseCost, phaseDurationMs, normalizeTokenUsage } from '../contracts/agent-cost-ledger.js';
import { captureCheckpoint } from '../handlers/checkpoints.js';
import { parseBlockers } from '../handlers/blocker-parser.js';
import { extractFileManifest } from '../handlers/session-state-core.js';
import { withSessionState, withValidatedSession } from './session-repository.js';

function assertTransitionShape(params: any) {
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

  return { hasCompletedPhase, hasNextPhaseId, hasNextPhaseIds };
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

function completePhase(phase: any, params: any, state: any) {
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
  phase.completed = new Date().toISOString();
  phase.downstream_context = normalizedContext;
  phase.files_created = filesCreated;
  phase.files_modified = filesModified;
  phase.files_deleted = filesDeleted;
  phase.requires_reconciliation =
    !hasFiles && !contextProvided ? true : false;
  if (typeof params.task_report === 'string') {
    phase.blocker_count = parseBlockers(params.task_report).length;
  }
  if (
    params.review_finding_count !== undefined &&
    params.review_finding_count !== null
  ) {
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
}

function startPhases(state: any, params: any, nextPhase: any, phasesToStart: any) {
  if (phasesToStart) {
    const now = new Date().toISOString();
    const startedPhaseIds = [];
    for (const phase of phasesToStart) {
      phase.status = 'in_progress';
      phase.started = now;
      startedPhaseIds.push(phase.id);
    }
    state.current_phase = params.next_phase_ids[0];
    return startedPhaseIds;
  }

  if (nextPhase) {
    if (nextPhase.status === 'pending') {
      nextPhase.status = 'in_progress';
      nextPhase.started = new Date().toISOString();
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

  if (startedPhaseIds) {
    response.started_phase_ids = startedPhaseIds;
  }

  return response;
}

function transitionPhase(params: any, projectRoot: any) {
  if (params.session_id) {
    assertSessionId(params.session_id);
  }

  const shape = assertTransitionShape(params);
  const mutator = ({ state }: any) => {
    const completedPhase = shape.hasCompletedPhase
      ? findPhase(state, params.completed_phase_id)
      : null;
    const nextPhase = shape.hasNextPhaseId
      ? findPhase(state, params.next_phase_id, 'next_phase_id')
      : null;
    const phasesToStart = shape.hasNextPhaseIds
      ? resolvePhasesToStart(state, params.next_phase_ids)
      : null;

    if (completedPhase) {
      completePhase(completedPhase, params, state);
    }

    const startedPhaseIds = startPhases(state, params, nextPhase, phasesToStart);

    if (params.batch_id !== undefined) {
      state.current_batch = params.batch_id;
    }

    if (params.token_usage) {
      state.token_usage.total_input += params.token_usage.input || 0;
      state.token_usage.total_output += params.token_usage.output || 0;
      state.token_usage.total_cached += params.token_usage.cached || 0;
    }

    state.updated = new Date().toISOString();
    captureCheckpoint(state, projectRoot);

    return {
      response: buildTransitionResponse(state, startedPhaseIds),
      writeBack: true,
    };
  };

  return params.session_id
    ? withValidatedSession(projectRoot, params.session_id, mutator)
    : withSessionState(projectRoot, mutator);
}

export { transitionPhase };
