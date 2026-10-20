'use strict';

const hookState = require('./hook-state');

/**
 * Session-start hook logic (runtime-agnostic). It only prunes stale hook
 * state, so it needs nothing from the hook context: the per-session directory
 * is created by before-agent when it records the active agent, and removed by
 * session-end.
 *
 * @returns {{ action: 'allow', message: null, reason: null }}
 */
function handleSessionStart() {
  hookState.pruneStale();
  return { action: 'allow', message: null, reason: null };
}

module.exports = { handleSessionStart };
