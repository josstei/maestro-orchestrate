'use strict';

const fs = require('node:fs');
const path = require('node:path');
const markdownState = require('../../core/markdown-state');
const {
  readState,
  writeState,
  resolveStateDirPath,
} = require('../../state/session-state');
const { ConfigError } = require('../../lib/errors');

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

function assertMutatorOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    throw new ConfigError(
      'mutateSessionState mutator must return { response, writeBack: boolean }',
      { code: 'INVALID_MUTATOR_OUTCOME' }
    );
  }
  if (typeof outcome.writeBack !== 'boolean') {
    throw new ConfigError(
      'mutateSessionState mutator must return an explicit writeBack boolean',
      { code: 'INVALID_MUTATOR_OUTCOME' }
    );
  }
}

/**
 * Read the active session, run a mutator against it, and conditionally
 * persist the result. Callers MUST return an explicit outcome object of
 * shape `{ response, writeBack: boolean, body? }`:
 *
 *   - `response` is what `mutateSessionState` will return to the caller.
 *   - `writeBack: true` persists the (mutated-in-place) state; the body
 *     defaults to the existing body unless `body` is set explicitly.
 *   - `writeBack: false` is required for read-only flows and signals
 *     that the session must not be rewritten.
 *
 * A missing or non-boolean `writeBack` throws `ConfigError` —
 * mutators that mutate `session.state` in place and forget to return
 * the outcome will fail loudly rather than silently dropping changes.
 */
function mutateSessionState(projectRoot, mutator) {
  const session = readActiveSession(projectRoot);
  const outcome = mutator(session);
  assertMutatorOutcome(outcome);

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
  mutateSessionState,
};
