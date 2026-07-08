import fs from 'fs';
import path from 'path';
import * as markdownState from '../../core/markdown-state.js';
import { StateError } from '../../lib/errors/index.js';
import { assertSessionId } from '../../lib/validation/index.js';
import { readState, writeState, resolveStateDirPath } from '../../state/session-state.js';
import { createEmptyDownstreamContext } from '../contracts/downstream-context.js';
import { migrateSessionState } from './session-migrations.js';
const ACTIVE_SESSION_REL = path.join('state', 'active-session.md');

function resolveBasePath(projectRoot: any) {
  return resolveStateDirPath(projectRoot);
}

function resolveActiveSessionPath(basePath: any) {
  return path.join(basePath, ACTIVE_SESSION_REL);
}

function parseSessionState(content: any) {
  return migrateSessionState(markdownState.parse(content).data);
}

function serializeSessionState(data: any, bodyContent: any) {
  return markdownState.serialize(data, bodyContent);
}

function extractBody(content: any) {
  return markdownState.parse(content).body;
}

function readActiveSession(projectRoot: any) {
  const basePath = resolveBasePath(projectRoot);
  const content = readState(ACTIVE_SESSION_REL, basePath);
  return {
    basePath,
    sessionPath: resolveActiveSessionPath(basePath),
    content,
    state: parseSessionState(content),
  };
}

function readActiveSessionOrNull(projectRoot: any) {
  const basePath = resolveBasePath(projectRoot);
  const sessionPath = resolveActiveSessionPath(basePath);
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  const content = readState(ACTIVE_SESSION_REL, basePath);
  return {
    basePath,
    sessionPath,
    content,
    state: parseSessionState(content),
  };
}

function writeActiveSession(basePath: any, state: any, body: any) {
  writeState(ACTIVE_SESSION_REL, serializeSessionState(state, body), basePath);
}

/**
 * Read the active session, run a mutator against it, and conditionally
 * persist the result. Callers MUST return an outcome object of shape
 * `{ response, writeBack, body? }`:
 *
 *   - `response` is what `withSessionState` will return to the caller.
 *   - `writeBack: true` persists the (mutated-in-place) state; the body
 *     defaults to the existing body unless `body` is set explicitly.
 *   - For read-only flows, return `{ response, writeBack: false }` (or
 *     simply `{ response }`) — do NOT rely on returning `undefined` to
 *     signal read-only, because the coalesce below silently discards
 *     any in-memory state mutation the caller made before returning.
 *
 * Returning `undefined` is tolerated (the coalesce falls back to `{}`
 * so the helper does not crash), but it is a footgun: a mutator that
 * mutates `session.state` in place and forgets to return
 * `{ writeBack: true }` will see its mutation silently dropped. Always
 * return an explicit outcome object.
 */
function withSessionState(projectRoot: any, mutator: any) {
  const session = readActiveSession(projectRoot);
  const outcome = mutator(session) || {};

  if (outcome.writeBack) {
    const body =
      Object.prototype.hasOwnProperty.call(outcome, 'body')
        ? outcome.body
        : extractBody(session.content);
    writeActiveSession(session.basePath, session.state, body);
  }

  return outcome.response;
}

/**
 * Guard shared by every handler that mutates or reads the active session
 * on behalf of a caller-supplied `session_id`. Throws when the id the
 * caller passed does not match the session currently on disk, so a
 * request never silently operates against the wrong session.
 *
 * @param {{ session_id: string }} state - parsed active-session state
 * @param {string} sessionId - session_id supplied by the caller
 * @throws {StateError} when `state.session_id !== sessionId`
 */
function assertActiveSessionMatches(state: any, sessionId: any) {
  if (state.session_id !== sessionId) {
    throw new StateError(
      `Session mismatch: active session is '${state.session_id}', got '${sessionId}'`
    );
  }
}

/** The shared "not run yet" progress block for a pending phase. */
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

/** Folds assertSessionId + readActiveSession + assertActiveSessionMatches. */
function assertValidActiveSession(projectRoot: any, sessionId: any) {
  assertSessionId(sessionId);
  const session = readActiveSession(projectRoot);
  assertActiveSessionMatches(session.state, sessionId);
  return session;
}

/** Folds assertSessionId + withSessionState + assertActiveSessionMatches. */
function withValidatedSession(projectRoot: any, sessionId: any, mutator: any) {
  assertSessionId(sessionId);
  return withSessionState(projectRoot, (session: any) => {
    assertActiveSessionMatches(session.state, sessionId);
    return mutator(session);
  });
}

/**
 * Normalize the file-manifest fields (`files_created`, `files_modified`,
 * `files_deleted`) shared by `transition_phase` and `reconcile_phase`.
 * Absent fields default to `[]`; `FILE_ARRAY` at the zod boundary owns
 * array-ness.
 *
 * @param {{ files_created?: unknown, files_modified?: unknown, files_deleted?: unknown }} params
 * @returns {{ filesCreated: unknown[], filesModified: unknown[], filesDeleted: unknown[], hasFiles: boolean }}
 */
function extractFileManifest(params: any) {
  const arr = (field: any) => params[field] ?? [];
  const filesCreated = arr('files_created');
  const filesModified = arr('files_modified');
  const filesDeleted = arr('files_deleted');
  return {
    filesCreated,
    filesModified,
    filesDeleted,
    hasFiles: filesCreated.length > 0 || filesModified.length > 0 || filesDeleted.length > 0,
  };
}

export { resolveBasePath, resolveActiveSessionPath, parseSessionState, serializeSessionState, extractBody, readActiveSession, readActiveSessionOrNull, writeActiveSession, withSessionState, assertActiveSessionMatches, extractFileManifest, createPendingPhaseProgress, assertValidActiveSession, withValidatedSession };
