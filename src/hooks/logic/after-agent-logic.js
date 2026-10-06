'use strict';

const { log } = require('../../core/logger');
const hookState = require('./hook-state');

const REQUIRED_SECTIONS = ['Task Report', 'Downstream Context'];

/**
 * After-agent hook logic (runtime-agnostic).
 *
 * Field name mapping: the Gemini adapter maps ctx.promptResponse → ctx.agentResult
 * before calling this function.
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @param {string|null} ctx.agentResult  - the agent response text
 * @param {boolean} ctx.stopHookActive
 * @returns {{ action: string, message: null, reason: string|null }}
 */
function handleAfterAgent(ctx) {
  const agentName = hookState.getActiveAgent(ctx.sessionId);
  if (!agentName) {
    hookState.clearActiveAgent(ctx.sessionId);
    return { action: 'allow', message: null, reason: null };
  }

  // agentResult comes straight from hook stdin JSON: for an array '## X' does
  // not imply '# X', and a non-string without includes() must throw before the
  // active agent is cleared, so keep both checks ahead of clearActiveAgent.
  const agentResult = ctx.agentResult || '';
  const warnings = REQUIRED_SECTIONS
    .filter((section) => !agentResult.includes(`## ${section}`) && !agentResult.includes(`# ${section}`))
    .map((section) => `Missing ${section} section (expected ## ${section} heading)`);
  hookState.clearActiveAgent(ctx.sessionId);

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
