'use strict';

const { resolveHookWorkspaceRoot } = require('../../core/project-root-resolver');
const hookState = require('./hook-state');
const state = require('../../state/session-state');

/**
 * Session-start hook logic (runtime-agnostic).
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @param {string} ctx.cwd
 * @returns {{ action: string, message: null, reason: null }}
 */
function handleSessionStart(ctx) {
  hookState.pruneStale();
  if (state.hasActiveSession(resolveHookWorkspaceRoot(ctx.cwd))) hookState.ensureSessionDir(ctx.sessionId);
  return { action: 'advisory', message: null, reason: null };
}

module.exports = { handleSessionStart };
