import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { createMaestroToolRegistry } from '../../dist/src/mcp/tool-packs/contracts.js';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';
import { DEFAULT_TOOL_PACKS } from '../../dist/src/mcp/tool-packs/index.js';
import { connectInMemory } from '../support/mcp.js';

async function mountDefaultToolPacks(testContext, runtimeConfig) {
  const server = createMcpServer();
  const registry = createMaestroToolRegistry();

  for (const registerPack of DEFAULT_TOOL_PACKS) {
    registerPack({
      server,
      registry,
      runtimeConfig,
      services: {},
      getWorkspaceState: () => ({ projectRoot: null, stateDirPath: null }),
    });
  }

  const client = await connectInMemory(testContext, server, {
    clientInfo: { name: 'mcp-pack-composition-test', version: '0.0.0' },
    capabilities: {},
  });

  return client;
}

describe('mcp pack composition', () => {
  it('mounts the default tool packs in a stable order', async (t) => {
    const client = await mountDefaultToolPacks(t, getRuntimeConfig('codex'));

    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
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
        'record_code_review',
        'record_phase_failure',
        'enter_design_gate',
        'record_design_approval',
        'get_design_gate_status',
        'scan_phase_changes',
        'reconcile_phase',
        'search_archived_sessions',
        'get_cost_insights',
        'get_skill_content',
        'get_agent',
        'get_runtime_context',
        'get_project_profile',
        'update_project_profile',
        'record_validation_commands',
        'get_agent_performance',
        'recall_similar_sessions',
        'rate',
        'get_plan_accuracy',
        'query_architecture_memory',
        'get_agent_memory',
        'append_agent_memory',
        'compact_archive',
        'record_knowledge',
        'query_knowledge',
        'export_memory_pack',
        'import_memory_pack',
        'fork_session',
        'list_lineage',
        'list_checkpoints',
        'restore_checkpoint',
        'instantiate_session_blueprint',
        'list_session_blueprints',
      ]
    );
  });

  it('propagates runtime config through the composed tool surface', async (t) => {
    const client = await mountDefaultToolPacks(t, getRuntimeConfig('codex'));

    const response = await client.callTool({ name: 'get_runtime_context', arguments: {} });
    const result = JSON.parse(response.content[0].text);

    assert.equal(response.isError, undefined);
    assert.equal(result.runtime, 'codex');
    assert.equal(result.mcp_prefix, 'mcp__maestro_maestro__');
  });
});
