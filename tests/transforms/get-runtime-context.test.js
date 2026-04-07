const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeConfig } = require('../../src/lib/mcp/runtime/runtime-config-map');

describe('get-runtime-context handler', () => {
  it('returns structured runtime config with required fields', () => {
    const { createHandler } = require('../../src/lib/mcp/handlers/get-runtime-context');

    const handler = createHandler({
      name: 'claude',
      tools: { read_file: 'Read', write_file: 'Write' },
      agentNaming: 'kebab-case',
      delegationPattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',
      paths: { skills: '${CLAUDE_PLUGIN_ROOT}/skills/' },
      env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' },
    });

    const result = handler({});

    assert.equal(result.runtime, 'claude');
    assert.equal(result.tools.read_file, 'Read');
    assert.equal(result.tools.write_file, 'Write');
    assert.equal(result.agent_dispatch.naming, 'kebab-case');
    assert.ok(result.agent_dispatch.pattern.includes('maestro:'));
    assert.ok(Array.isArray(result.agents));
    assert.ok(result.agents.length >= 22);
    assert.ok(result.agent_capabilities);
    assert.equal(result.agent_capabilities.architect, 'read_only');
    assert.equal(result.agent_capabilities.coder, 'full');
  });

  it('includes MCP prefix for claude runtime', () => {
    const { createHandler } = require('../../src/lib/mcp/handlers/get-runtime-context');
    const handler = createHandler({
      name: 'claude',
      tools: {},
      agentNaming: 'kebab-case',
      delegationPattern: 'Agent(subagent_type: "maestro:{{agent}}")',
      paths: {},
      env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' },
    });
    const result = handler({});
    assert.equal(result.mcp_prefix, 'mcp__plugin_maestro_maestro__');
  });

  it('returns gemini MCP prefix for gemini runtime', () => {
    const { createHandler } = require('../../src/lib/mcp/handlers/get-runtime-context');
    const handler = createHandler({
      name: 'gemini',
      tools: {},
      agentNaming: 'snake_case',
      delegationPattern: '{{agent}}(query: "...")',
      paths: {},
      env: { extensionPath: 'extensionPath' },
    });
    const result = handler({});
    assert.equal(result.mcp_prefix, 'mcp_maestro_');
    assert.equal(result.agent_dispatch.naming, 'snake_case');
  });

  it('returns codex MCP prefix and kebab-case naming for codex runtime', () => {
    const { createHandler } = require('../../src/lib/mcp/handlers/get-runtime-context');
    const handler = createHandler({
      name: 'codex',
      tools: { run_shell_command: 'exec_command' },
      agentNaming: 'kebab-case',
      delegationPattern: 'spawn_agent(...)',
      paths: { skills: './skills/' },
      env: { extensionPath: '.' },
    });
    const result = handler({});
    assert.equal(result.runtime, 'codex');
    assert.equal(result.mcp_prefix, 'mcp__maestro_maestro__');
    assert.equal(result.agent_dispatch.naming, 'kebab-case');
    assert.equal(result.agent_dispatch.prefix, '');
    assert.equal(result.tools.run_shell_command, 'exec_command');
  });

  it('accepts a runtime name and resolves it through the shared runtime config map', () => {
    const { createHandler } = require('../../src/lib/mcp/handlers/get-runtime-context');
    const handler = createHandler('codex');
    const result = handler({});

    assert.equal(result.runtime, getRuntimeConfig('codex').name);
    assert.equal(result.mcp_prefix, 'mcp__maestro_maestro__');
    assert.equal(result.tools.read_file, 'direct file reads');
  });
});
