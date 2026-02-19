#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { readJson } = require('../src/lib/stdin');
const { allow, allowWithContext } = require('../src/lib/response');
const { validateSessionId, detectAgentFromPrompt } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { resolveActiveSessionPath } = require('../src/lib/state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';
  const cwd = input.cwd || '';
  const prompt = input.prompt || '';
  const hookEventName = input.hook_event_name || 'BeforeAgent';

  hookState.pruneStale();

  const agentName = detectAgentFromPrompt(prompt);

  if (agentName && validateSessionId(sessionId)) {
    hookState.setActiveAgent(sessionId, agentName);
    log('INFO', `BeforeAgent: Detected agent '${agentName}' — set active agent [session=${sessionId}]`);
  }

  const sessionPath = resolveActiveSessionPath(cwd);
  let contextParts = '';

  try {
    if (fs.existsSync(sessionPath)) {
      const content = fs.readFileSync(sessionPath, 'utf8');
      const parts = [];
      const phaseMatch = content.match(/current_phase:\s*(\S+)/);
      if (phaseMatch) parts.push(`current_phase=${phaseMatch[1]}`);
      const statusMatch = content.match(/status:\s*(\S+)/);
      if (statusMatch) parts.push(`status=${statusMatch[1]}`);
      if (parts.length > 0) {
        contextParts = `Active session: ${parts.join(', ')}`;
      }
    }
  } catch {}

  if (contextParts) {
    process.stdout.write(allowWithContext(contextParts, hookEventName) + '\n');
  } else {
    process.stdout.write(allow() + '\n');
  }
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(allow() + '\n');
});
