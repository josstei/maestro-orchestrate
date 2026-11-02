'use strict';

const hookState = require('./hook-state');

/** Session-end hook logic (runtime-agnostic). */
function handleSessionEnd(ctx) {
  hookState.removeSessionDir(ctx.sessionId);
  return { action: 'advisory', message: null, reason: null };
}

module.exports = { handleSessionEnd };
