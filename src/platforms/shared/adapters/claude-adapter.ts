import { defineAdapter } from './factory.js';
import type { HookContext, HookResult, RuntimeHookOutput } from './factory.js';

/**
 * Claude Code hook I/O adapter.
 * Normalizes Claude Code stdin JSON to the internal context contract
 * and formats internal responses for Claude Code stdout.
 */

function withAgentHeader(agentName: string | null, prompt: string | null): string | null {
  if (!agentName) return prompt || null;
  if (typeof prompt === 'string' && /(?:^|\n)\s*agent:\s*[a-z0-9_-]+/i.test(prompt)) {
    return prompt;
  }
  return `Agent: ${agentName}\n\n${prompt || ''}`;
}

function normalizeInput(raw: Record<string, any>): HookContext {
  const agentName = raw.tool_input?.subagent_type || null;
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    event: raw.hook_event_name || '',
    agentName: null,
    agentInput: withAgentHeader(agentName, raw.tool_input?.prompt || null),
    agentResult: raw.tool_result || null,
    stopHookActive: false,
  };
}

function formatOutput(result: HookResult): RuntimeHookOutput {
  return {
    continue: result.action !== 'deny',
    systemMessage: result.message || result.reason || undefined,
    decision: result.action === 'deny' ? 'block' : 'approve',
    reason: result.reason || undefined,
  };
}

function errorFallback(): RuntimeHookOutput {
  return { continue: false, decision: 'block' };
}

export default defineAdapter({ normalizeInput, formatOutput, errorFallback });
