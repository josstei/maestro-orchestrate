import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/mcp/server/create-mcp-server.js';
import { zodSchemas } from '../../src/mcp/tool-packs/session/zod-schemas.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(moduleDirname, 'golden', 'tool-packs', 'session');

function readGolden(toolName) {
  return JSON.parse(readFileSync(path.join(goldenDir, `${toolName}.json`), 'utf8'));
}

async function emittedInputSchemaFor(toolName) {
  const server = createMcpServer();
  server.registerTool(
    toolName,
    { inputSchema: zodSchemas[toolName] },
    async () => ({ content: [] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'session-zod-schemas-test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const tool = tools.find((entry) => entry.name === toolName);
  await client.close();
  await server.close();
  return tool.inputSchema;
}

for (const toolName of Object.keys(zodSchemas)) {
  test(`${toolName} emitted JSON Schema matches golden snapshot`, async () => {
    const emitted = await emittedInputSchemaFor(toolName);
    assert.deepEqual(emitted, readGolden(toolName));
  });
}

test('create_session requires session_id, task, and phases', () => {
  const shape = zodSchemas.create_session;
  assert.throws(() => shape.session_id.parse(undefined));
  assert.throws(() => shape.task.parse(undefined));
  assert.throws(() => shape.phases.parse(undefined));
});

test('create_session.phases enforces minimum length of 1', () => {
  assert.throws(() => zodSchemas.create_session.phases.parse([]));
});

test('create_session.workflow_mode rejects a value outside the enum', () => {
  assert.throws(() => zodSchemas.create_session.workflow_mode.parse('turbo'));
});

test('create_session.workflow_mode defaults to standard when omitted', () => {
  assert.equal(zodSchemas.create_session.workflow_mode.parse(undefined), 'standard');
});

test('transition_phase.downstream_context passthrough retains an unknown field', () => {
  const result = zodSchemas.transition_phase.downstream_context.parse({
    warnings: 'none',
    totally_unknown_field: 'kept',
  });
  assert.equal(result.totally_unknown_field, 'kept');
});

test('transition_phase.completed_phase_id accepts a number or a string', () => {
  assert.equal(zodSchemas.transition_phase.completed_phase_id.parse(3), 3);
  assert.equal(zodSchemas.transition_phase.completed_phase_id.parse('phase-3'), 'phase-3');
});

test('transition_phase.session_id is the only required field', () => {
  assert.throws(() => zodSchemas.transition_phase.session_id.parse(undefined));
});
