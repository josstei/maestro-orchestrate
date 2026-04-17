'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const codex = require('../../src/platforms/codex/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');
const { createHandler } = require('../../src/mcp/handlers/get-runtime-context');

describe('get_runtime_context response shape', () => {
  it('codex returns delegation.constraints and plan_mode_native=false', () => {
    const handler = createHandler(codex, () => '/workspace/suggestion');
    const result = handler({});
    assert.equal(result.plan_mode_native, false);
    assert.deepEqual(
      result.delegation.constraints.fork_full_context_incompatible_with,
      ['agent_type', 'model', 'reasoning_effort']
    );
    assert.equal(result.workspace_suggestion, '/workspace/suggestion');
  });

  it('claude returns plan_mode_native=true', () => {
    const handler = createHandler(claude, () => null);
    const result = handler({});
    assert.equal(result.plan_mode_native, true);
    assert.equal(result.delegation.constraints.result_surface, 'synchronous');
    assert.equal(result.workspace_suggestion, null);
  });

  it('preserves the legacy agent_dispatch.pattern field', () => {
    const handler = createHandler(codex, () => null);
    const result = handler({});
    assert.equal(result.agent_dispatch.pattern, 'spawn_agent(...)');
  });
});
