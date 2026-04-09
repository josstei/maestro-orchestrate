'use strict';

const { log } = require('../../core/logger');
const hookState = require('./hook-state');

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

  const agentResult = ctx.agentResult || '';
  const hasTaskReport = agentResult.includes('## Task Report') || agentResult.includes('# Task Report');
  const hasDownstream = agentResult.includes('## Downstream Context') || agentResult.includes('# Downstream Context');

  const warnings = [];
  if (!hasTaskReport) warnings.push('Missing Task Report section (expected ## Task Report heading)');
  if (!hasDownstream) warnings.push('Missing Downstream Context section (expected ## Downstream Context heading)');

  if (warnings.length > 0) {
    const reason = warnings.join('; ');
    if (ctx.stopHookActive) {
      log('WARN', `AfterAgent [${agentName}]: Retry still malformed: ${reason} — allowing to prevent infinite loop`);
    } else {
      log('WARN', `AfterAgent [${agentName}]: WARN: ${reason} — requesting retry`);
      hookState.clearActiveAgent(ctx.sessionId);
      return {
        action: 'deny',
        message: null,
        reason: `Handoff report validation failed: ${reason}. Please include both a ## Task Report section and a ## Downstream Context section in your response.`,
      };
    }
  } else {
    log('INFO', `AfterAgent [${agentName}]: Handoff report validated`);
  }

  hookState.clearActiveAgent(ctx.sessionId);
  return { action: 'allow', message: null, reason: null };
}

module.exports = { handleAfterAgent };
