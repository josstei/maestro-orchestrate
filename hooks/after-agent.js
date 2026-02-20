#!/usr/bin/env node
'use strict';

const { defineHook, response, hookState, log } = require('../src/lib/maestro');

function handler(ctx) {
  const agentName = hookState.getActiveAgent(ctx.sessionId);
  const agentLower = agentName.toLowerCase();

  if (agentName && agentLower !== 'techlead' && agentLower !== 'orchestrator') {
    const hasTaskReport = ctx.promptResponse.includes('## Task Report') || ctx.promptResponse.includes('# Task Report');
    const hasDownstream = ctx.promptResponse.includes('## Downstream Context') || ctx.promptResponse.includes('# Downstream Context');

    const warnings = [];
    if (!hasTaskReport) warnings.push('Missing Task Report section (expected ## Task Report heading)');
    if (!hasDownstream) warnings.push('Missing Downstream Context section (expected ## Downstream Context heading)');

    if (warnings.length > 0) {
      const reason = warnings.join('; ');
      if (ctx.stopHookActive) {
        log('WARN', `AfterAgent [${agentName}]: Retry still malformed: ${reason} — allowing to prevent infinite loop`);
      } else {
        log('WARN', `AfterAgent [${agentName}]: WARN: ${reason} — requesting retry`);
        return response.deny(`Handoff report validation failed: ${reason}. Please include both a ## Task Report section and a ## Downstream Context section in your response.`);
      }
    } else {
      log('INFO', `AfterAgent [${agentName}]: Handoff report validated`);
    }
  }

  hookState.clearActiveAgent(ctx.sessionId);
  return response.allow();
}

defineHook({ handler, fallbackResponse: response.allow });

module.exports = { handler };
