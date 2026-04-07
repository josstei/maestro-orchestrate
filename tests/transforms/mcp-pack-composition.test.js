const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/lib/mcp/core/create-server');
const { getRuntimeConfig } = require('../../src/lib/mcp/runtime/runtime-config-map');
const { DEFAULT_TOOL_PACKS } = require('../../src/lib/mcp/tool-packs');

describe('mcp pack composition', () => {
  it('mounts the default tool packs in a stable order', () => {
    const kernel = createServer({
      runtimeConfig: getRuntimeConfig('codex'),
      services: {},
      toolPacks: DEFAULT_TOOL_PACKS,
    });

    assert.deepEqual(
      kernel.getToolSchemas().map((schema) => schema.name),
      [
        'initialize_workspace',
        'assess_task_complexity',
        'validate_plan',
        'resolve_settings',
        'create_session',
        'get_session_status',
        'update_session',
        'transition_phase',
        'archive_session',
        'get_skill_content',
        'get_agent',
        'get_runtime_context',
      ]
    );
  });

  it('propagates runtime config through the composed tool surface', async () => {
    const kernel = createServer({
      runtimeConfig: getRuntimeConfig('codex'),
      services: {},
      toolPacks: DEFAULT_TOOL_PACKS,
    });

    const result = await kernel.callTool('get_runtime_context');

    assert.equal(result.ok, true);
    assert.equal(result.result.runtime, 'codex');
    assert.equal(result.result.mcp_prefix, 'mcp__maestro_maestro__');
  });
});
