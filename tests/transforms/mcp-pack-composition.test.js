import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/mcp/core/create-server.js';
import { getRuntimeConfig } from '../../src/mcp/runtime/runtime-config-map.js';
import { DEFAULT_TOOL_PACKS } from '../../src/mcp/tool-packs/index.js';

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
        'enter_design_gate',
        'record_design_approval',
        'get_design_gate_status',
        'scan_phase_changes',
        'reconcile_phase',
        'list_archived_sessions',
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
        'fork_session',
        'list_lineage',
        'list_checkpoints',
        'restore_checkpoint',
        'instantiate_session_blueprint',
        'list_session_blueprints',
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
