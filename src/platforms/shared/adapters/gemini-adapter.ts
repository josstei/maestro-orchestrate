import { defineAdapter } from './factory.js';
import type { HookContext, HookResult, RuntimeHookOutput } from './factory.js';

/**
 * Gemini hook I/O adapter.
 * Normalizes Gemini stdin JSON to the internal context contract
 * and formats internal responses for Gemini stdout.
 */

function normalizeInput(raw: Record<string, any>): HookContext {
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    event: raw.hook_event_name || '',
    agentName: null,
    agentInput: raw.prompt || '',
    agentResult: raw.prompt_response || '',
    stopHookActive: raw.stop_hook_active === true || raw.stop_hook_active === 'true',
  };
}

function formatOutput(result: HookResult): RuntimeHookOutput {
  return {
    continue: result.action !== 'deny',
    systemMessage: result.message || result.reason || undefined,
  };
}

function errorFallback(): RuntimeHookOutput {
  return { continue: false };
}

export default defineAdapter({ normalizeInput, formatOutput, errorFallback });
