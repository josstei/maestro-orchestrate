'use strict';

const { log } = require('../../core/logger');
const hookState = require('./hook-state');

/**
 * Parse categorized known-good validation commands from an agent handoff.
 * Recognizes a `## Validation Commands` heading section whose lines are
 * prefixed with `build:`, `test:`, or `lint:`. Advisory: returns empty
 * categories when the section is absent and never affects the allow/deny gate.
 *
 * @param {string} agentResult
 * @returns {{ build: string[], test: string[], lint: string[] }}
 */
function extractValidationCommands(agentResult) {
  if (typeof agentResult !== 'string' || agentResult.length === 0) {
    return { build: [], test: [], lint: [] };
  }
  const lines = agentResult.split('\n');
  const start = lines.findIndex((line) =>
    /^#{1,6}\s+Validation Commands\s*$/i.test(line.trim())
  );
  if (start === -1) {
    return { build: [], test: [], lint: [] };
  }
  const result = { build: [], test: [], lint: [] };
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^#{1,6}\s+/.test(line)) break;
    const match = line
      .replace(/^[-*]\s*/, '')
      .match(/^(build|test|lint)\s*:\s*(.+)$/i);
    if (!match) continue;
    const category = match[1].toLowerCase();
    const command = match[2].trim().replace(/^`+|`+$/g, '').trim();
    if (command.length > 0 && !result[category].includes(command)) {
      result[category].push(command);
    }
  }
  return result;
}

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
 * @returns {{ action: string, message: null, reason: string|null, validation_commands: { build: string[], test: string[], lint: string[] } }}
 */
function handleAfterAgent(ctx) {
  const agentName = hookState.getActiveAgent(ctx.sessionId);
  if (!agentName) {
    hookState.clearActiveAgent(ctx.sessionId);
    return {
      action: 'allow',
      message: null,
      reason: null,
      validation_commands: { build: [], test: [], lint: [] },
    };
  }

  const agentResult = ctx.agentResult || '';
  const validationCommands = extractValidationCommands(agentResult);
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
        validation_commands: validationCommands,
      };
    }
  } else {
    log('INFO', `AfterAgent [${agentName}]: Handoff report validated`);
  }

  hookState.clearActiveAgent(ctx.sessionId);
  return {
    action: 'allow',
    message: null,
    reason: null,
    validation_commands: validationCommands,
  };
}

module.exports = { handleAfterAgent, extractValidationCommands };
