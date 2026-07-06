import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeConfig } from '../../src/mcp/runtime/runtime-config-map.js';
import { handleGetRuntimeContext } from '../../src/mcp/handlers/get-runtime-context.js';

describe('get-runtime-context handler', () => {
  const legacyDispatchKey = ['agent', 'dispatch'].join('_');

  it('returns structured runtime config with required fields', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: {
      name: 'claude',
      tools: { read_file: 'Read', write_file: 'Write' },
      agentNaming: 'kebab-case',
      delegation: {
        pattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',
      },
      paths: { skills: '${CLAUDE_PLUGIN_ROOT}/skills/' },
      env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' },
    }, services: { workspaceSuggestion: () => null } });

    const result = handler({});

    assert.equal(result.runtime, 'claude');
    assert.equal(result.tools.read_file, 'Read');
    assert.equal(result.tools.write_file, 'Write');
    assert.equal(result.delegation.naming, 'kebab-case');
    assert.ok(result.delegation.pattern.includes('maestro:'));
    assert.equal(Object.hasOwn(result, legacyDispatchKey), false);
    assert.ok(Array.isArray(result.agents));
    assert.ok(result.agents.length >= 22);
    assert.ok(result.agent_capabilities);
    assert.equal(result.agent_capabilities.architect, 'read_only');
    assert.equal(result.agent_capabilities.coder, 'full');
  });

  it('includes MCP prefix for claude runtime', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: {
      name: 'claude',
      tools: {},
      agentNaming: 'kebab-case',
      delegation: { pattern: 'Agent(subagent_type: "maestro:{{agent}}")' },
      paths: {},
      env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' },
    }, services: { workspaceSuggestion: () => null } });
    const result = handler({});
    assert.equal(result.mcp_prefix, 'mcp__plugin_maestro_maestro__');
  });

  it('returns gemini MCP prefix for gemini runtime', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: {
      name: 'gemini',
      tools: {},
      agentNaming: 'snake_case',
      delegation: { pattern: '{{agent}}(query: "...")' },
      paths: {},
      env: { extensionPath: 'extensionPath' },
    }, services: { workspaceSuggestion: () => null } });
    const result = handler({});
    assert.equal(result.mcp_prefix, 'mcp_maestro_');
    assert.equal(result.delegation.naming, 'snake_case');
  });

  it('returns codex MCP prefix and kebab-case naming for codex runtime', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: {
      name: 'codex',
      tools: { run_shell_command: 'exec_command' },
      agentNaming: 'kebab-case',
      delegation: { pattern: 'spawn_agent(...)' },
      paths: { skills: './skills/' },
      env: { extensionPath: '.' },
    }, services: { workspaceSuggestion: () => null } });
    const result = handler({});
    assert.equal(result.runtime, 'codex');
    assert.equal(result.mcp_prefix, 'mcp__maestro_maestro__');
    assert.equal(result.delegation.naming, 'kebab-case');
    assert.equal(Object.hasOwn(result.delegation, 'prefix'), false);
    assert.equal(result.tools.run_shell_command, 'exec_command');
  });

  it('accepts a runtime name and resolves it through the shared runtime config map', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: 'codex', services: { workspaceSuggestion: () => null } });
    const result = handler({});

    assert.equal(result.runtime, getRuntimeConfig('codex').name);
    assert.equal(result.mcp_prefix, 'mcp__maestro_maestro__');
    assert.equal(result.tools.read_file, 'direct file reads');
  });

  it('projects claude runtime facts unchanged (co-location is byte-identical)', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: 'claude', services: { workspaceSuggestion: () => null } });
    const result = handler({});

    assert.equal(result.mcp_prefix, 'mcp__plugin_maestro_maestro__');
    assert.equal(result.plan_mode_native, true);
  });

  it('projects gemini runtime facts unchanged (co-location is byte-identical)', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: 'gemini', services: { workspaceSuggestion: () => null } });
    const result = handler({});

    assert.equal(result.mcp_prefix, 'mcp_maestro_');
    assert.equal(result.plan_mode_native, true);
  });

  it('fixes Qwen mcp_prefix to mcp_maestro_ (Qwen is a Gemini fork)', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: 'qwen', services: { workspaceSuggestion: () => null } });
    const result = handler({});

    assert.equal(result.mcp_prefix, 'mcp_maestro_');
    assert.equal(result.plan_mode_native, false);
  });

  it('fixes the Codex enter_plan_mode projection to a user-action nudge', () => {
    const handler = (params = {}) => handleGetRuntimeContext(params, { runtimeConfig: 'codex', services: { workspaceSuggestion: () => null } });
    const result = handler({});

    assert.equal(
      result.tools.enter_plan_mode,
      'not available — nudge the user to enter Plan mode manually before proceeding'
    );
    assert.equal(result.plan_mode_native, false);
  });
});
