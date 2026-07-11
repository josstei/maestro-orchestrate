import fs from 'node:fs';
import path from 'node:path';

import {
  assertActiveSessionMatches,
  extractBody,
  parseSessionState,
  resolveBasePath,
  serializeSessionState,
  sessionStore,
} from '../session/session-store.js';

import { NotFoundError, StateError, ValidationError } from '../../lib/errors/index.js';
import { assertSessionId } from '../../lib/validation/index.js';
import { readState, writeState } from '../../state/session-state.js';
import type { ReadableSessionState } from '../contracts/session-state-schema.js';
import { resetPhaseToPending } from '../session/session-state-factory.js';

function assertPositiveIntegerPhaseId(value: any) {
  const phaseId = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(phaseId) || phaseId < 1) {
    throw new ValidationError('phase_id must be a positive integer', {
      details: { value },
    });
  }
  return phaseId;
}

function phaseNumber(value: any) {
  const phaseId = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(phaseId) && phaseId >= 1 ? phaseId : null;
}

function checkpointRelativePath(sessionId: any, phaseId: any) {
  return path.join(
    'state',
    'checkpoints',
    sessionId,
    `phase-${phaseId}.md`
  );
}

function checkpointAbsolutePath(basePath: any, sessionId: any, phaseId: any) {
  return path.join(basePath, checkpointRelativePath(sessionId, phaseId));
}

function latestCompletedPhaseId(state: any) {
  const completedPhaseIds = (state.phases || [])
    .filter((phase: any) => phase.status === 'completed')
    .map((phase: any) => phaseNumber(phase.id))
    .filter((phaseId: any) => phaseId !== null);

  if (completedPhaseIds.length === 0) return null;
  return Math.max(...completedPhaseIds);
}

function checkpointBody(projectRoot: any) {
  const active = sessionStore.readOrNull(projectRoot);
  return active ? extractBody(active.content) : '';
}

/**
 * Persist an append-only checkpoint for the latest completed phase.
 *
 * @param {object} state - current active session state
 * @param {string} projectRoot
 * @returns {{ path: string, phase_id: number } | null}
 */
function captureCheckpoint(state: any, projectRoot: any) {
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

function readCheckpoint(basePath: any, sessionId: any, phaseId: any) {
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

function restoreSnapshotState(snapshotState: ReadableSessionState, phaseId: any) {
  const phaseIds = (snapshotState.phases || []).map((phase: any) => phaseNumber(phase.id));
  if (!phaseIds.includes(phaseId)) {
    throw new NotFoundError(`Phase ${phaseId} not found in checkpoint state`);
  }

  const futurePhaseIds = phaseIds
    .filter((candidate: any) => candidate !== null && candidate > phaseId)
    .sort((a: any, b: any) => a - b);

  return {
    ...snapshotState,
    updated: new Date().toISOString(),
    current_phase: futurePhaseIds.length > 0 ? futurePhaseIds[0] : phaseId,
    phases: (snapshotState.phases || []).map((phase: any) => {
      const id = phaseNumber(phase.id);
      if (id !== null && id > phaseId) {
        return resetPhaseToPending(phase);
      }
      return phase;
    }),
  };
}

function handleListCheckpoints(params: any, projectRoot: any) {
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
    .filter((entry: any) => entry.isFile())
    .map((entry: any) => {
      const match = entry.name.match(/^phase-(\d+)\.md$/);
      return match
        ? {
            phase_id: Number(match[1]),
            path: checkpointAbsolutePath(basePath, params.session_id, Number(match[1])),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.phase_id - b.phase_id);

  return {
    session_id: params.session_id,
    checkpoints,
  };
}

function handleRestoreCheckpoint(params: any, projectRoot: any) {
  assertSessionId(params.session_id);
  const phaseId = assertPositiveIntegerPhaseId(params.phase_id);

  const active = sessionStore.read(projectRoot);
  assertActiveSessionMatches(active.state, params.session_id);

  const checkpoint = readCheckpoint(active.basePath, params.session_id, phaseId);
  const snapshotState = parseSessionState(checkpoint.content);

  if (snapshotState.session_id !== params.session_id) {
    throw new StateError(
      `Checkpoint session mismatch: checkpoint is '${snapshotState.session_id}', got '${params.session_id}'`
    );
  }

  const restored = restoreSnapshotState(snapshotState, phaseId);
  sessionStore.write(active, restored, extractBody(checkpoint.content));

  return {
    session_id: params.session_id,
    restored_phase_id: phaseId,
    current_phase: restored.current_phase,
  };
}

export { captureCheckpoint, handleListCheckpoints, handleRestoreCheckpoint };
