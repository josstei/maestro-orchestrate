import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { zodSchemas } from '../../dist/src/mcp/tool-packs/history/zod-schemas.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(moduleDirname, 'golden', 'tool-packs', 'history');

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
  const client = new Client({ name: 'history-zod-schemas-test-client', version: '0.0.0' });
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

test('fork_session requires source_session_id and new_session_id', () => {
  const shape = zodSchemas.fork_session;
  assert.throws(() => shape.source_session_id.parse(undefined));
  assert.throws(() => shape.new_session_id.parse(undefined));
});

test('fork_session.branch is nullable and optional', () => {
  assert.equal(zodSchemas.fork_session.branch.parse(null), null);
  assert.equal(zodSchemas.fork_session.branch.parse(undefined), undefined);
});

test('restore_checkpoint.phase_id accepts an integer or a string', () => {
  assert.equal(zodSchemas.restore_checkpoint.phase_id.parse(2), 2);
  assert.equal(zodSchemas.restore_checkpoint.phase_id.parse('phase-2'), 'phase-2');
});
