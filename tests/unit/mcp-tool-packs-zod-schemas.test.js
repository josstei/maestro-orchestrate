import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { zodSchemas as contentSchemas } from '../../dist/src/mcp/tool-packs/content/zod-schemas.js';
import { zodSchemas as historySchemasFromPack } from '../../dist/src/mcp/tool-packs/history/index.js';
import { zodSchemas as historySchemas } from '../../dist/src/mcp/tool-packs/history/zod-schemas.js';
import { zodSchemas as memorySchemas } from '../../dist/src/mcp/tool-packs/memory/zod-schemas.js';
import { zodSchemas as sessionSchemas } from '../../dist/src/mcp/tool-packs/session/zod-schemas.js';
import { zodSchemas as workspaceSchemas } from '../../dist/src/mcp/tool-packs/workspace/zod-schemas.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));

const packs = [
  { name: 'content', schemas: contentSchemas },
  { name: 'history', schemas: historySchemas },
  { name: 'memory', schemas: memorySchemas },
  { name: 'session', schemas: sessionSchemas },
  { name: 'workspace', schemas: workspaceSchemas },
];

function goldenDirFor(packName) {
  return path.join(moduleDirname, 'golden', 'tool-packs', packName);
}

function readGolden(packName, toolName) {
  return JSON.parse(readFileSync(path.join(goldenDirFor(packName), `${toolName}.json`), 'utf8'));
}

function goldenToolNames(packName) {
  return readdirSync(goldenDirFor(packName))
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.basename(name, '.json'))
    .sort();
}

async function emittedInputSchemaFor(packName, schemas, toolName) {
  const server = createMcpServer();
  server.registerTool(
    toolName,
    { inputSchema: schemas[toolName] },
    async () => ({ content: [] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: `${packName}-zod-schemas-test-client`, version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const tool = tools.find((entry) => entry.name === toolName);
  await client.close();
  await server.close();
  return tool.inputSchema;
}

for (const { name, schemas } of packs) {
  test(`golden snapshots match ${name} schema tool names`, () => {
    assert.deepEqual(goldenToolNames(name), Object.keys(schemas).sort());
  });

  for (const toolName of Object.keys(schemas)) {
    test(`${name}/${toolName} emitted JSON Schema matches golden snapshot`, async () => {
      const emitted = await emittedInputSchemaFor(name, schemas, toolName);
      assert.deepEqual(emitted, readGolden(name, toolName));
    });
  }
}

test('history schema compatibility module re-exports the co-located schema projection', () => {
  assert.equal(historySchemas, historySchemasFromPack);
});

test('get_skill_content.resources is required', () => {
  assert.throws(() => contentSchemas.get_skill_content.resources.parse(undefined));
});

test('get_skill_content.resources rejects a non-string array item', () => {
  assert.throws(() => contentSchemas.get_skill_content.resources.parse(['delegation', 42]));
});

test('get_agent.agents is required', () => {
  assert.throws(() => contentSchemas.get_agent.agents.parse(undefined));
});

test('fork_session requires source_session_id and new_session_id', () => {
  const shape = historySchemas.fork_session;
  assert.throws(() => shape.source_session_id.parse(undefined));
  assert.throws(() => shape.new_session_id.parse(undefined));
});

test('fork_session.branch is nullable and optional', () => {
  assert.equal(historySchemas.fork_session.branch.parse(null), null);
  assert.equal(historySchemas.fork_session.branch.parse(undefined), undefined);
});

test('restore_checkpoint.phase_id accepts an integer or a string', () => {
  assert.equal(historySchemas.restore_checkpoint.phase_id.parse(2), 2);
  assert.equal(historySchemas.restore_checkpoint.phase_id.parse('phase-2'), 'phase-2');
});

test('record_validation_commands.commands passthrough retains an unknown key', () => {
  const result = memorySchemas.record_validation_commands.commands.parse({
    build: ['npm run build'],
    totally_unknown_field: 'kept',
  });
  assert.equal(result.totally_unknown_field, 'kept');
});

test('record_validation_commands.commands is required', () => {
  assert.throws(() => memorySchemas.record_validation_commands.commands.parse(undefined));
});

test('rate.rating rejects a value outside the enum', () => {
  assert.throws(() => memorySchemas.rate.rating.parse('sideways'));
});

test('rate.phase_id accepts an integer or a string', () => {
  assert.equal(memorySchemas.rate.phase_id.parse(1), 1);
  assert.equal(memorySchemas.rate.phase_id.parse('phase-1'), 'phase-1');
});

test('recall_similar_sessions.limit defaults to 5 and enforces a minimum of 1', () => {
  assert.equal(memorySchemas.recall_similar_sessions.limit.parse(undefined), 5);
  assert.throws(() => memorySchemas.recall_similar_sessions.limit.parse(0));
});

test('create_session requires session_id, task, and phases', () => {
  const shape = sessionSchemas.create_session;
  assert.throws(() => shape.session_id.parse(undefined));
  assert.throws(() => shape.task.parse(undefined));
  assert.throws(() => shape.phases.parse(undefined));
});

test('create_session.phases enforces minimum length of 1', () => {
  assert.throws(() => sessionSchemas.create_session.phases.parse([]));
});

test('create_session.workflow_mode rejects a value outside the enum', () => {
  assert.throws(() => sessionSchemas.create_session.workflow_mode.parse('turbo'));
});

test('create_session.workflow_mode defaults to standard when omitted', () => {
  assert.equal(sessionSchemas.create_session.workflow_mode.parse(undefined), 'standard');
});

test('transition_phase.downstream_context passthrough retains an unknown field', () => {
  const result = sessionSchemas.transition_phase.downstream_context.parse({
    warnings: 'none',
    totally_unknown_field: 'kept',
  });
  assert.equal(result.totally_unknown_field, 'kept');
});

test('transition_phase.completed_phase_id accepts a number or a string', () => {
  assert.equal(sessionSchemas.transition_phase.completed_phase_id.parse(3), 3);
  assert.equal(sessionSchemas.transition_phase.completed_phase_id.parse('phase-3'), 'phase-3');
});

test('transition_phase.session_id is the only required field', () => {
  assert.throws(() => sessionSchemas.transition_phase.session_id.parse(undefined));
});

test('validate_plan requires plan and task_complexity', () => {
  const shape = workspaceSchemas.validate_plan;
  assert.throws(() => shape.plan.parse(undefined));
  assert.throws(() => shape.task_complexity.parse(undefined));
});

test('validate_plan.plan accepts an arbitrary free-form object', () => {
  const result = workspaceSchemas.validate_plan.plan.parse({ anything: 'goes', nested: { a: 1 } });
  assert.deepEqual(result, { anything: 'goes', nested: { a: 1 } });
});

test('validate_plan.task_complexity rejects a value outside the enum', () => {
  assert.throws(() => workspaceSchemas.validate_plan.task_complexity.parse('extreme'));
});

test('initialize_workspace.workspace_path is required', () => {
  assert.throws(() => workspaceSchemas.initialize_workspace.workspace_path.parse(undefined));
});

test('initialize_workspace.state_dir is optional', () => {
  assert.equal(workspaceSchemas.initialize_workspace.state_dir.parse(undefined), undefined);
});
