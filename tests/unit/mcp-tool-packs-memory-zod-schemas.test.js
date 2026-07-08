import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { zodSchemas } from '../../dist/src/mcp/tool-packs/memory/zod-schemas.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(moduleDirname, 'golden', 'tool-packs', 'memory');

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
  const client = new Client({ name: 'memory-zod-schemas-test-client', version: '0.0.0' });
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

test('record_validation_commands.commands passthrough retains an unknown key', () => {
  const result = zodSchemas.record_validation_commands.commands.parse({
    build: ['npm run build'],
    totally_unknown_field: 'kept',
  });
  assert.equal(result.totally_unknown_field, 'kept');
});

test('record_validation_commands.commands is required', () => {
  assert.throws(() => zodSchemas.record_validation_commands.commands.parse(undefined));
});

test('rate.rating rejects a value outside the enum', () => {
  assert.throws(() => zodSchemas.rate.rating.parse('sideways'));
});

test('rate.phase_id accepts an integer or a string', () => {
  assert.equal(zodSchemas.rate.phase_id.parse(1), 1);
  assert.equal(zodSchemas.rate.phase_id.parse('phase-1'), 'phase-1');
});

test('recall_similar_sessions.limit defaults to 5 and enforces a minimum of 1', () => {
  assert.equal(zodSchemas.recall_similar_sessions.limit.parse(undefined), 5);
  assert.throws(() => zodSchemas.recall_similar_sessions.limit.parse(0));
});
