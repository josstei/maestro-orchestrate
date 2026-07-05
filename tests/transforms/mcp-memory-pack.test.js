import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpServer } from '../support/mcp.js';
import { createToolPack as createMemoryPack } from '../../src/mcp/tool-packs/memory/index.js';

describe('memory tool pack', () => {
  it('registers the memory profile tools through the kernel', () => {
    const server = buildMcpServer({ toolPacks: [createMemoryPack] });

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      [
        'get_project_profile',
        'update_project_profile',
        'record_validation_commands',
        'get_agent_performance',
        'recall_similar_sessions',
        'rate_phase',
        'rate_session',
        'get_plan_accuracy',
        'query_architecture_memory',
        'get_agent_memory',
        'append_agent_memory',
        'compact_archive',
        'record_knowledge',
        'query_knowledge',
        'export_memory_pack',
        'import_memory_pack',
      ]
    );
  });
});
