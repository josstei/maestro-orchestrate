'use strict';

const hookState = require('./hook-state');

/**
 * Session-start hook logic (runtime-agnostic). It only prunes stale hook
 * state, so it needs nothing from the hook context: the per-session directory
 * is created by before-agent when it records the active agent, and removed by
 * session-end.
 *
 * @returns {{ action: string, message: null, reason: null }}
 */
function handleSessionStart() {
  hookState.pruneStale();
  return { action: 'advisory', message: null, reason: null };
}

module.exports = { handleSessionStart };
