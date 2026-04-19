'use strict';

const fs = require('fs');
const path = require('path');
const markdownState = require('../../core/markdown-state');
const {
  readState,
  writeState,
  resolveStateDirPath,
} = require('../../state/session-state');

const ACTIVE_SESSION_REL = path.join('state', 'active-session.md');

function resolveBasePath(projectRoot) {
  return resolveStateDirPath(projectRoot);
}

function resolveActiveSessionPath(basePath) {
  return path.join(basePath, ACTIVE_SESSION_REL);
}

function parseSessionState(content) {
  return markdownState.parse(content).data;
}

function serializeSessionState(data, bodyContent) {
  return markdownState.serialize(data, bodyContent);
}

function extractBody(content) {
  return markdownState.parse(content).body;
}

function readActiveSession(projectRoot) {
  const basePath = resolveBasePath(projectRoot);
  const content = readState(ACTIVE_SESSION_REL, basePath);
  return {
    basePath,
    sessionPath: resolveActiveSessionPath(basePath),
    content,
    state: parseSessionState(content),
  };
}

function readActiveSessionOrNull(projectRoot) {
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

function writeActiveSession(basePath, state, body) {
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
function withSessionState(projectRoot, mutator) {
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

module.exports = {
  resolveBasePath,
  resolveActiveSessionPath,
  parseSessionState,
  serializeSessionState,
  extractBody,
  readActiveSession,
  readActiveSessionOrNull,
  writeActiveSession,
  withSessionState,
};
