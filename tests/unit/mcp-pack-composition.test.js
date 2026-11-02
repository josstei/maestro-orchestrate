'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/mcp/core/create-server');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { DEFAULT_TOOL_PACKS } = require('../../src/mcp/maestro-server');

// Each default pack, in mount order, with the tools it registers in order.
const PACK_TOOLS = {
  workspace: ['initialize_workspace', 'assess_task_complexity', 'validate_plan', 'resolve_settings'],
  session: [
    'create_session', 'get_session_status', 'update_session', 'transition_phase', 'archive_session',
    'enter_design_gate', 'record_design_approval', 'get_design_gate_status', 'scan_phase_changes', 'reconcile_phase',
  ],
  content: ['get_skill_content', 'get_agent', 'get_runtime_context'],
};

describe('mcp pack composition', () => {
  const context = { runtimeConfig: getRuntimeConfig('codex'), services: {} };
  const kernel = createServer({ ...context, toolPacks: DEFAULT_TOOL_PACKS });

  it('mounts the default tool packs in a stable order', () => {
    assert.deepEqual(kernel.getToolSchemas().map((schema) => schema.name), Object.values(PACK_TOOLS).flat());
    const packs = DEFAULT_TOOL_PACKS.map((createPack) => createPack(context));
    assert.deepEqual(
      packs.map(({ name, tools }) => [name, tools.map((tool) => tool.name)]),
      Object.entries(PACK_TOOLS)
    );
  });

  it('propagates runtime config through the composed tool surface', async () => {
    const result = await kernel.callTool('get_runtime_context');

    assert.equal(result.ok, true);
    assert.equal(result.result.runtime, 'codex');
    assert.equal(result.result.mcp_prefix, 'mcp__maestro_maestro__');
  });
});
