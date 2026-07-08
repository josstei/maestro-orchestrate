import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import codex from '../../dist/src/platforms/codex/runtime-config.js';
import claude from '../../dist/src/platforms/claude/runtime-config.js';
import { handleGetRuntimeContext } from '../../dist/src/mcp/handlers/get-runtime-context.js';

describe('get_runtime_context response shape', () => {
  const legacyDispatchKey = ['agent', 'dispatch'].join('_');

  it('codex returns delegation.constraints and plan_mode_native=false', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: codex, services: { workspaceSuggestion: () => '/workspace/suggestion' } });
    const result = handler({});
    assert.equal(result.plan_mode_native, false);
    assert.deepEqual(
      result.delegation.constraints.fork_full_context_incompatible_with,
      ['agent_type', 'model', 'reasoning_effort']
    );
    assert.equal(result.workspace_suggestion, '/workspace/suggestion');
  });

  it('claude returns plan_mode_native=true', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: claude, services: { workspaceSuggestion: () => null } });
    const result = handler({});
    assert.equal(result.plan_mode_native, true);
    assert.equal(result.delegation.constraints.result_surface, 'synchronous');
    assert.equal(result.workspace_suggestion, null);
  });

  it('does not expose legacy dispatch fields', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: codex, services: { workspaceSuggestion: () => null } });
    const result = handler({});
    assert.equal(Object.hasOwn(result, legacyDispatchKey), false);
    assert.equal(result.delegation.pattern, 'spawn_agent(...)');
    assert.equal(result.delegation.naming, 'kebab-case');
  });

  it('codex nudges the user to enter Plan mode instead of pointing at update_plan', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: codex, services: { workspaceSuggestion: () => null } });
    const result = handler({});
    assert.equal(
      result.tools.enter_plan_mode,
      'not available — nudge the user to enter Plan mode manually before proceeding'
    );
    assert.notEqual(result.tools.enter_plan_mode, 'update_plan');
  });
});
