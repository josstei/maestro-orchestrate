import { createEmptyDownstreamContext } from '../contracts/downstream-context.js';
import type { PhaseId } from '../contracts/plan-schema.js';
import type {
  ReadableSessionPhaseState,
  SessionPhaseState,
  SessionTokenUsage,
} from '../contracts/session-state-schema.js';

type PendingPhaseSeed = {
  id: PhaseId;
  name: string;
  agents: readonly string[];
  parallel: boolean;
  blockedBy: readonly PhaseId[];
  plannedFiles?: readonly string[];
};

function createPendingPhaseProgress() {
  return {
    started: null,
    completed: null,
    files_created: [],
    files_modified: [],
    files_deleted: [],
    downstream_context: createEmptyDownstreamContext(),
    errors: [],
    retry_count: 0,
    blocker_count: 0,
    review_finding_count: 0,
  };
}

function createPendingPhaseState(seed: PendingPhaseSeed): SessionPhaseState {
  const progress = createPendingPhaseProgress();
  return {
    id: seed.id,
    name: seed.name,
    status: 'pending',
    agents: [...seed.agents],
    parallel: seed.parallel,
    started: progress.started,
    completed: progress.completed,
    blocked_by: [...seed.blockedBy],
    files_created: progress.files_created,
    files_modified: progress.files_modified,
    files_deleted: progress.files_deleted,
    ...(seed.plannedFiles === undefined
      ? {}
      : { planned_files: [...seed.plannedFiles] }),
    downstream_context: progress.downstream_context,
    errors: progress.errors,
    retry_count: progress.retry_count,
    blocker_count: progress.blocker_count,
    review_finding_count: progress.review_finding_count,
  };
}

function resetPhaseToPending(
  phase: ReadableSessionPhaseState
): ReadableSessionPhaseState {
  const next: Record<string, unknown> = {
    ...phase,
    status: 'pending',
    ...createPendingPhaseProgress(),
    requires_reconciliation: false,
  };
  delete next.duration_ms;
  delete next.token_usage;
  return next as ReadableSessionPhaseState;
}

function createEmptySessionTokenUsage(): SessionTokenUsage {
  return {
    total_input: 0,
    total_output: 0,
    total_cached: 0,
    by_agent: {},
  };
}

export {
  createEmptyDownstreamContext,
  createEmptySessionTokenUsage,
  createPendingPhaseState,
  resetPhaseToPending,
};
export type { PendingPhaseSeed };
