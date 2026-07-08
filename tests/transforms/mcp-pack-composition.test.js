import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { createMaestroToolRegistry } from '../../dist/src/mcp/tool-packs/contracts.js';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';
import { DEFAULT_TOOL_PACKS } from '../../dist/src/mcp/tool-packs/index.js';

async function mountDefaultToolPacks(runtimeConfig) {
  const server = createMcpServer();
  const registry = createMaestroToolRegistry();

  for (const registerPack of DEFAULT_TOOL_PACKS) {
    registerPack({ server, registry, runtimeConfig, services: {}, getProjectRoot: () => null });
  }

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mcp-pack-composition-test', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { server, client };
}

describe('mcp pack composition', () => {
  it('mounts the default tool packs in a stable order', async () => {
    const { server, client } = await mountDefaultToolPacks(getRuntimeConfig('codex'));

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

    await client.close();
    await server.close();
  });

  it('propagates runtime config through the composed tool surface', async () => {
    const { server, client } = await mountDefaultToolPacks(getRuntimeConfig('codex'));

    const response = await client.callTool({ name: 'get_runtime_context', arguments: {} });
    const result = JSON.parse(response.content[0].text);

    assert.equal(response.isError, undefined);
    assert.equal(result.runtime, 'codex');
    assert.equal(result.mcp_prefix, 'mcp__maestro_maestro__');

    await client.close();
    await server.close();
  });
});
