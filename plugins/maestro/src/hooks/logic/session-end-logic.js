'use strict';

const hookState = require('./hook-state');

/**
 * Session-end hook logic (runtime-agnostic).
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @returns {{ action: string, message: null, reason: null }}
 */
function handleSessionEnd(ctx) {
  hookState.removeSessionDir(ctx.sessionId);
  return { action: 'advisory', message: null, reason: null };
}

module.exports = { handleSessionEnd };
