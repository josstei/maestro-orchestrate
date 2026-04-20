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
 * persist the result. Callers return `{ response, writeBack, body? }`:
 *
 *   - `response` is what `withSessionState` will return to the caller.
 *   - `writeBack: true` persists the (mutated-in-place) state; the body
 *     defaults to the existing body unless `body` is set explicitly.
 *   - Omit `writeBack` for read-only flows.
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
  ACTIVE_SESSION_REL,
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
