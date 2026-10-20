'use strict';

const { log } = require('../../core/logger');
const hookState = require('./hook-state');

const REQUIRED_SECTIONS = ['Task Report', 'Downstream Context'];

/**
 * After-agent hook logic (runtime-agnostic): checks the finished agent's
 * response for the handoff report headings.
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @param {unknown} [ctx.agentResult] - the agent response text
 * @param {boolean} [ctx.stopHookActive]
 * @returns {{ action: 'allow'|'deny', message: null, reason: string|null }}
 */
function handleAfterAgent(ctx) {
  const agentName = hookState.getActiveAgent(ctx.sessionId);
  hookState.clearActiveAgent(ctx.sessionId);
  if (!agentName) {
    return { action: 'allow', message: null, reason: null };
  }

  // The response comes straight from hook stdin JSON; one that is not text has
  // no headings. '# X' also finds the '## X' heading.
  const agentResult = typeof ctx.agentResult === 'string' ? ctx.agentResult : '';
  const warnings = REQUIRED_SECTIONS
    .filter((section) => !agentResult.includes(`# ${section}`))
    .map((section) => `Missing ${section} section (expected ## ${section} heading)`);

  if (warnings.length > 0) {
    const reason = warnings.join('; ');
    if (ctx.stopHookActive) {
      log('WARN', `AfterAgent [${agentName}]: Retry still malformed: ${reason} — allowing to prevent infinite loop`);
    } else {
      log('WARN', `AfterAgent [${agentName}]: WARN: ${reason} — requesting retry`);
      return {
        action: 'deny',
        message: null,
        reason: `Handoff report validation failed: ${reason}. Please include both a ## Task Report section and a ## Downstream Context section in your response.`,
      };
    }
  } else {
    log('INFO', `AfterAgent [${agentName}]: Handoff report validated`);
  }

  return { action: 'allow', message: null, reason: null };
}

module.exports = { handleAfterAgent };
