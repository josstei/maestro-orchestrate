#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { defineHook, response, validation, hookState, state, log } = require('../src/lib/maestro');

function handler(ctx) {
  hookState.pruneStale();

  const agentName = validation.detectAgentFromPrompt(ctx.prompt);

  if (agentName && validation.validateSessionId(ctx.sessionId)) {
    hookState.setActiveAgent(ctx.sessionId, agentName);
    log('INFO', `BeforeAgent: Detected agent '${agentName}' — set active agent [session=${ctx.sessionId}]`);
  }

  const sessionPath = state.resolveActiveSessionPath(ctx.cwd);
  let contextParts = '';

  try {
    const content = fs.readFileSync(sessionPath, 'utf8');
    const parts = [];
    const phaseMatch = content.match(/current_phase:\s*(\S+)/);
    if (phaseMatch) parts.push(`current_phase=${phaseMatch[1]}`);
    const statusMatch = content.match(/status:\s*(\S+)/);
    if (statusMatch) parts.push(`status=${statusMatch[1]}`);
    if (parts.length > 0) {
      contextParts = `Active session: ${parts.join(', ')}`;
    }
  } catch {}

  const hookEventName = ctx.hookEventName || 'BeforeAgent';
  if (contextParts) {
    return response.allowWithContext(contextParts, hookEventName);
  }
  return response.allow();
}

defineHook({ handler, fallbackResponse: response.allow });

module.exports = { handler };
