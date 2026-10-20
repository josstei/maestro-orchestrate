'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/mcp/core/create-server');
const { createProjectRootCache } = require('../../src/mcp/core/project-root-cache');
const { tools: workspaceTools } = require('../../src/mcp/tools/workspace');
const { tools: sessionTools } = require('../../src/mcp/tools/session');
const { tools: contentTools } = require('../../src/mcp/tools/content');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

// The order maestro-server lists the tools in: workspace, session, content.
const TOOL_NAMES = [
  'initialize_workspace',
  'assess_task_complexity',
  'validate_plan',
  'resolve_settings',
  'create_session',
  'get_session_status',
  'update_session',
  'transition_phase',
  'archive_session',
  'enter_design_gate',
  'record_design_approval',
  'get_design_gate_status',
  'scan_phase_changes',
  'reconcile_phase',
  'get_skill_content',
  'get_agent',
  'get_runtime_context',
];

describe('MCP tool catalog', () => {
  it('lists the 17 tools, each once and with a handler, in a stable order', () => {
    const tools = [...workspaceTools, ...sessionTools, ...contentTools];

    assert.deepEqual(tools.map((tool) => tool.name), TOOL_NAMES);
    for (const tool of tools) {
      assert.equal(typeof tool.handler, 'function', tool.name);
    }
  });

  it('marks exactly the session tools and assess_task_complexity as requiring a workspace', () => {
    const requiring = [...workspaceTools, ...sessionTools, ...contentTools]
      .filter((tool) => tool.requiresWorkspace === true)
      .map((tool) => tool.name);

    assert.deepEqual(requiring, ['assess_task_complexity', ...sessionTools.map((tool) => tool.name)]);
  });

  it('serves the content tools for the runtime the server was built with', async () => {
    const server = createServer({
      runtimeConfig: getRuntimeConfig('claude'),
      workspace: createProjectRootCache({ requestClientRoots: async () => ({}) }),
      tools: contentTools,
    });

    const skillResult = await server.callTool('get_skill_content', { resources: ['delegation'] });
    const agentResult = await server.callTool('get_agent', { agents: ['coder'] });
    const contextResult = await server.callTool('get_runtime_context');

    assert.ok(skillResult.result.contents.delegation.includes('user-invocable: false'));
    assert.equal(agentResult.result.agents.coder.tools[0], 'Read');
    assert.equal(contextResult.result.runtime, 'claude');
    assert.equal(contextResult.result.mcp_prefix, 'mcp__plugin_maestro_maestro__');
  });
});
