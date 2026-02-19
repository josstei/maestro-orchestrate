#!/usr/bin/env node
'use strict';

const { readJson, getBool } = require('../src/lib/stdin');
const { allow, deny } = require('../src/lib/response');
const hookState = require('../src/lib/hook-state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';
  const stopHookActive = getBool(input, 'stop_hook_active');

  const agentName = hookState.getActiveAgent(sessionId);
  const agentLower = agentName.toLowerCase();

  if (agentName && agentLower !== 'techlead' && agentLower !== 'orchestrator') {
    const promptResponse = input.prompt_response || '';
    const hasTaskReport = promptResponse.includes('## Task Report') || promptResponse.includes('# Task Report');
    const hasDownstream = promptResponse.includes('## Downstream Context') || promptResponse.includes('# Downstream Context');

    const warnings = [];
    if (!hasTaskReport) warnings.push('Missing Task Report section (expected ## Task Report heading)');
    if (!hasDownstream) warnings.push('Missing Downstream Context section (expected ## Downstream Context heading)');

    if (warnings.length > 0) {
      const reason = warnings.join('; ');
      if (stopHookActive) {
        log('WARN', `AfterAgent [${agentName}]: Retry still malformed: ${reason} — allowing to prevent infinite loop`);
      } else {
        log('WARN', `AfterAgent [${agentName}]: WARN: ${reason} — requesting retry`);
        hookState.clearActiveAgent(sessionId);
        process.stdout.write(deny(`Handoff report validation failed: ${reason}. Please include both a ## Task Report section and a ## Downstream Context section in your response.`) + '\n');
        return;
      }
    } else {
      log('INFO', `AfterAgent [${agentName}]: Handoff report validated`);
    }
  }

  hookState.clearActiveAgent(sessionId);
  process.stdout.write(allow() + '\n');
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(allow() + '\n');
});
