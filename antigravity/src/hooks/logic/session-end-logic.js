'use strict';

const hookState = require('./hook-state');

/**
 * Session-end hook logic (runtime-agnostic).
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @returns {{ action: 'allow', message: null, reason: null }}
 */
function handleSessionEnd(ctx) {
  hookState.removeSessionDir(ctx.sessionId);
  return { action: 'allow', message: null, reason: null };
}

module.exports = { handleSessionEnd };
