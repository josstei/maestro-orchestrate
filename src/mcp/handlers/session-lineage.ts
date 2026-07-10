import path from 'path';
import { NotFoundError } from '../../lib/errors/index.js';
import { assertSessionId } from '../../lib/validation/index.js';
import { readState } from '../../state/session-state.js';
import type { PhaseId } from '../contracts/plan-schema.js';
import type {
  ReadableSessionPhaseState,
  SessionPhaseState,
  SessionState,
} from '../contracts/session-state-schema.js';
import { parseArchivedSessionState, readArchivedSessionSummaries } from './archive-index.js';
import {
  resolveBasePath,
  readActiveSessionOrNull,
  writeActiveSession,
} from './session-state-core.js';
import { SCHEMA_VERSION } from './session-migrations.js';
import { writeGate } from './design-gate.js';
import { attempt } from './attempt.js';
import {
  createEmptySessionTokenUsage,
  createPendingPhaseState,
} from '../session/session-state-factory.js';

type ForkSessionResult = {
  success: boolean;
  session_id: string;
  parent_session_id: string;
  path: string;
};

function normalizeBranch(value: any) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function cloneArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? [...value] : [];
}

function cloneForkPhase(phase: ReadableSessionPhaseState): SessionPhaseState {
  const seed = {
    id: phase.id,
    name: phase.name,
    agents: cloneArray<string>(phase.agents),
    parallel: phase.parallel === true,
    blockedBy: cloneArray<PhaseId>(phase.blocked_by),
  };
  if (Array.isArray(phase.planned_files)) {
    return createPendingPhaseState({
      ...seed,
      plannedFiles: phase.planned_files,
    });
  }
  return createPendingPhaseState(seed);
}

function readArchivedSession(basePath: any, sessionId: any) {
  const relativePath = path.join('state', 'archive', `${sessionId}.md`);
  let content;
  try {
    content = readState(relativePath, basePath);
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      throw new NotFoundError(`Archived session '${sessionId}' not found`);
    }
    throw error;
  }
  return parseArchivedSessionState(content);
}

function toLineageNode(state: any, archivePath: any) {
  return {
    session_id: state.session_id,
    parent_session_id: state.parent_session_id || null,
    branch: state.branch || null,
    status: state.status || null,
    archive_path: archivePath,
  };
}

function readLineageSources(projectRoot: any) {
  const basePath = resolveBasePath(projectRoot);
  const sources = [];
  const active = readActiveSessionOrNull(projectRoot);
  if (active && active.state && typeof active.state.session_id === 'string') {
    sources.push({ state: active.state, archivePath: null });
  }
  for (const summary of readArchivedSessionSummaries(projectRoot)) {
    if (!summary.archive_path) {
      continue;
    }
    const state = attempt(() => parseArchivedSessionState(readState(summary.archive_path, basePath)), null);
    if (state && typeof state.session_id === 'string') {
      sources.push({ state, archivePath: summary.archive_path });
    }
  }
  return sources;
}

/**
 * Fork an archived session into the active session slot with lineage metadata.
 *
 * @param {{ source_session_id: string, new_session_id: string, branch?: string | null }} params
 * @param {string} projectRoot
 * @returns {{ success: boolean, session_id: string, parent_session_id: string, path: string }}
 */
function handleForkSession(params: any, projectRoot: any): ForkSessionResult {
  assertSessionId(params.source_session_id);
  assertSessionId(params.new_session_id);
  const basePath = resolveBasePath(projectRoot);
  const source = readArchivedSession(basePath, params.source_session_id);
  const now = new Date().toISOString();
  const phases: SessionPhaseState[] = Array.isArray(source.phases)
    ? source.phases.map((phase: any) => cloneForkPhase(phase))
    : [];
  const state: SessionState = {
    schema_version: SCHEMA_VERSION,
    session_id: params.new_session_id,
    parent_session_id: params.source_session_id,
    branch: normalizeBranch(params.branch),
    task: source.task || null,
    created: now,
    updated: now,
    status: 'in_progress',
    workflow_mode: source.workflow_mode || 'standard',
    design_document: source.design_document || null,
    implementation_plan: source.implementation_plan || null,
    current_phase: phases[0]?.id ?? null,
    total_phases: phases.length,
    execution_mode: null,
    execution_backend: 'native',
    current_batch: null,
    task_complexity: source.task_complexity || null,
    token_usage: createEmptySessionTokenUsage(),
    phases,
  };

  writeActiveSession(basePath, state, `# ${state.task || state.session_id} Orchestration Log\n`);
  writeGate(projectRoot, state.session_id, {
    session_id: state.session_id,
    entered_at: now,
    approved_at: now,
    design_document_path: state.design_document || null,
  });

  return {
    success: true,
    session_id: params.new_session_id,
    parent_session_id: params.source_session_id,
    path: path.join(basePath, 'state', 'active-session.md'),
  };
}

/**
 * Read a session's direct lineage, including active and archived child sessions.
 *
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 * @returns {{ session_id: string, parent_session_id: string | null, children: object[] }}
 */
function handleListLineage(params: any, projectRoot: any) {
  assertSessionId(params.session_id);
  const sources = readLineageSources(projectRoot);
  const current = sources.find(
    (entry: any) => entry.state.session_id === params.session_id
  );
  if (!current) {
    throw new NotFoundError(`Session '${params.session_id}' not found`);
  }
  const children = sources
    .filter((entry: any) => entry.state.parent_session_id === params.session_id)
    .map((entry: any) => toLineageNode(entry.state, entry.archivePath))
    .sort((a: any, b: any) => a.session_id.localeCompare(b.session_id));

  return {
    session_id: params.session_id,
    parent_session_id: current.state.parent_session_id || null,
    children,
  };
}

export { handleForkSession, handleListLineage };
export type { ForkSessionResult };
