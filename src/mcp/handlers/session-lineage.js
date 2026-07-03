'use strict';

const path = require('path');

const { NotFoundError } = require('../../lib/errors');
const { assertSessionId } = require('../../lib/validation');
const { readState, writeState } = require('../../state/session-state');
const { createEmptyDownstreamContext } = require('../contracts/downstream-context');
const {
  parseArchivedSessionState,
  readArchivedSessionSummaries,
} = require('./archive-index');
const {
  resolveBasePath,
  readActiveSessionOrNull,
  writeActiveSession,
} = require('./session-state-core');
const { SCHEMA_VERSION } = require('./session-migrations');

function normalizeBranch(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function cloneStringArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function cloneForkPhase(phase) {
  const next = {
    id: phase.id,
    name: phase.name,
    status: 'pending',
    agents: cloneStringArray(phase.agents),
    parallel: phase.parallel === true,
    started: null,
    completed: null,
    blocked_by: cloneStringArray(phase.blocked_by),
    files_created: [],
    files_modified: [],
    files_deleted: [],
    downstream_context: createEmptyDownstreamContext(),
    errors: [],
    retry_count: 0,
    blocker_count: 0,
    review_finding_count: 0,
  };
  if (Array.isArray(phase.planned_files)) {
    next.planned_files = [...phase.planned_files];
  }
  return next;
}

function readArchivedSession(basePath, sessionId) {
  const relativePath = path.join('state', 'archive', `${sessionId}.md`);
  let content;
  try {
    content = readState(relativePath, basePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new NotFoundError(`Archived session '${sessionId}' not found`);
    }
    throw error;
  }
  return parseArchivedSessionState(content);
}

function writeApprovedDesignGate(basePath, state, timestamp) {
  const gate = {
    session_id: state.session_id,
    entered_at: timestamp,
    approved_at: timestamp,
    design_document_path: state.design_document || null,
  };
  writeState(
    path.join('state', `${state.session_id}.design-gate.json`),
    JSON.stringify(gate, null, 2),
    basePath
  );
}

function toLineageNode(state, archivePath) {
  return {
    session_id: state.session_id,
    parent_session_id: state.parent_session_id || null,
    branch: state.branch || null,
    status: state.status || null,
    archive_path: archivePath,
  };
}

function readLineageSources(projectRoot) {
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
    try {
      const content = readState(summary.archive_path, basePath);
      const state = parseArchivedSessionState(content);
      if (state && typeof state.session_id === 'string') {
        sources.push({ state, archivePath: summary.archive_path });
      }
    } catch {
      continue;
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
function handleForkSession(params, projectRoot) {
  assertSessionId(params.source_session_id);
  assertSessionId(params.new_session_id);
  const basePath = resolveBasePath(projectRoot);
  const source = readArchivedSession(basePath, params.source_session_id);
  const now = new Date().toISOString();
  const phases = Array.isArray(source.phases)
    ? source.phases.map(cloneForkPhase)
    : [];
  const state = {
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
    current_phase: phases.length > 0 ? phases[0].id : null,
    total_phases: phases.length,
    execution_mode: null,
    execution_backend: 'native',
    current_batch: null,
    task_complexity: source.task_complexity || null,
    token_usage: {
      total_input: 0,
      total_output: 0,
      total_cached: 0,
      by_agent: {},
    },
    phases,
  };

  writeActiveSession(basePath, state, `# ${state.task || state.session_id} Orchestration Log\n`);
  writeApprovedDesignGate(basePath, state, now);

  return {
    success: true,
    session_id: state.session_id,
    parent_session_id: state.parent_session_id,
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
function handleListLineage(params, projectRoot) {
  assertSessionId(params.session_id);
  const sources = readLineageSources(projectRoot);
  const current = sources.find(
    (entry) => entry.state.session_id === params.session_id
  );
  if (!current) {
    throw new NotFoundError(`Session '${params.session_id}' not found`);
  }
  const children = sources
    .filter((entry) => entry.state.parent_session_id === params.session_id)
    .map((entry) => toLineageNode(entry.state, entry.archivePath))
    .sort((a, b) => a.session_id.localeCompare(b.session_id));

  return {
    session_id: params.session_id,
    parent_session_id: current.state.parent_session_id || null,
    children,
  };
}

module.exports = {
  handleForkSession,
  handleListLineage,
};
