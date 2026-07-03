'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  assertActiveSessionMatches,
  extractBody,
  parseSessionState,
  readActiveSession,
  readActiveSessionOrNull,
  resolveBasePath,
  serializeSessionState,
  writeActiveSession,
} = require('./session-state-core');
const { createEmptyDownstreamContext } = require('../contracts/downstream-context');
const { NotFoundError, StateError, ValidationError } = require('../../lib/errors');
const { assertSessionId } = require('../../lib/validation');
const { readState, writeState } = require('../../state/session-state');

function assertPositiveIntegerPhaseId(value) {
  const phaseId = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(phaseId) || phaseId < 1) {
    throw new ValidationError('phase_id must be a positive integer', {
      details: { value },
    });
  }
  return phaseId;
}

function phaseNumber(value) {
  const phaseId = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(phaseId) && phaseId >= 1 ? phaseId : null;
}

function checkpointRelativePath(sessionId, phaseId) {
  return path.join(
    'state',
    'checkpoints',
    sessionId,
    `phase-${phaseId}.md`
  );
}

function checkpointAbsolutePath(basePath, sessionId, phaseId) {
  return path.join(basePath, checkpointRelativePath(sessionId, phaseId));
}

function latestCompletedPhaseId(state) {
  const completedPhaseIds = (state.phases || [])
    .filter((phase) => phase.status === 'completed')
    .map((phase) => phaseNumber(phase.id))
    .filter((phaseId) => phaseId !== null);

  if (completedPhaseIds.length === 0) return null;
  return Math.max(...completedPhaseIds);
}

function checkpointBody(projectRoot) {
  const active = readActiveSessionOrNull(projectRoot);
  return active ? extractBody(active.content) : '';
}

/**
 * Persist an append-only checkpoint for the latest completed phase.
 *
 * @param {object} state - current active session state
 * @param {string} projectRoot
 * @returns {{ path: string, phase_id: number } | null}
 */
function captureCheckpoint(state, projectRoot) {
  assertSessionId(state.session_id);

  const phaseId = latestCompletedPhaseId(state);
  if (phaseId === null) return null;

  const basePath = resolveBasePath(projectRoot);
  const relativePath = checkpointRelativePath(state.session_id, phaseId);
  const filePath = path.join(basePath, relativePath);

  if (!fs.existsSync(filePath)) {
    writeState(
      relativePath,
      serializeSessionState(state, checkpointBody(projectRoot)),
      basePath
    );
  }

  return { path: filePath, phase_id: phaseId };
}

function readCheckpoint(basePath, sessionId, phaseId) {
  const relativePath = checkpointRelativePath(sessionId, phaseId);
  const filePath = path.join(basePath, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError(
      `Checkpoint phase-${phaseId}.md not found for session '${sessionId}'`
    );
  }
  return {
    filePath,
    content: readState(relativePath, basePath),
  };
}

function resetFuturePhase(phase) {
  const next = { ...phase };
  next.status = 'pending';
  next.started = null;
  next.completed = null;
  next.files_created = [];
  next.files_modified = [];
  next.files_deleted = [];
  next.downstream_context = createEmptyDownstreamContext();
  next.requires_reconciliation = false;
  delete next.duration_ms;
  delete next.token_usage;
  next.errors = [];
  next.retry_count = 0;
  next.blocker_count = 0;
  next.review_finding_count = 0;
  return next;
}

function restoreSnapshotState(snapshotState, phaseId) {
  const phaseIds = (snapshotState.phases || []).map((phase) => phaseNumber(phase.id));
  if (!phaseIds.includes(phaseId)) {
    throw new NotFoundError(`Phase ${phaseId} not found in checkpoint state`);
  }

  const futurePhaseIds = phaseIds
    .filter((candidate) => candidate !== null && candidate > phaseId)
    .sort((a, b) => a - b);

  return {
    ...snapshotState,
    updated: new Date().toISOString(),
    current_phase: futurePhaseIds.length > 0 ? futurePhaseIds[0] : phaseId,
    phases: (snapshotState.phases || []).map((phase) => {
      const id = phaseNumber(phase.id);
      if (id !== null && id > phaseId) {
        return resetFuturePhase(phase);
      }
      return phase;
    }),
  };
}

function handleListCheckpoints(params, projectRoot) {
  assertSessionId(params.session_id);

  const basePath = resolveBasePath(projectRoot);
  const checkpointsDir = path.join(
    basePath,
    'state',
    'checkpoints',
    params.session_id
  );

  if (!fs.existsSync(checkpointsDir)) {
    return {
      session_id: params.session_id,
      checkpoints: [],
    };
  }

  const checkpoints = fs
    .readdirSync(checkpointsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(/^phase-(\d+)\.md$/);
      return match
        ? {
            phase_id: Number(match[1]),
            path: checkpointAbsolutePath(basePath, params.session_id, Number(match[1])),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.phase_id - b.phase_id);

  return {
    session_id: params.session_id,
    checkpoints,
  };
}

function handleRestoreCheckpoint(params, projectRoot) {
  assertSessionId(params.session_id);
  const phaseId = assertPositiveIntegerPhaseId(params.phase_id);

  const active = readActiveSession(projectRoot);
  assertActiveSessionMatches(active.state, params.session_id);

  const checkpoint = readCheckpoint(active.basePath, params.session_id, phaseId);
  const snapshotState = parseSessionState(checkpoint.content);

  if (snapshotState.session_id !== params.session_id) {
    throw new StateError(
      `Checkpoint session mismatch: checkpoint is '${snapshotState.session_id}', got '${params.session_id}'`
    );
  }

  const restored = restoreSnapshotState(snapshotState, phaseId);
  writeActiveSession(active.basePath, restored, extractBody(checkpoint.content));

  return {
    session_id: params.session_id,
    restored_phase_id: phaseId,
    current_phase: restored.current_phase,
  };
}

module.exports = {
  captureCheckpoint,
  handleListCheckpoints,
  handleRestoreCheckpoint,
};
