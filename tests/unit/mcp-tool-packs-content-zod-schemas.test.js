import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { zodSchemas } from '../../dist/src/mcp/tool-packs/content/zod-schemas.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(moduleDirname, 'golden', 'tool-packs', 'content');

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
  const client = new Client({ name: 'content-zod-schemas-test-client', version: '0.0.0' });
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

test('get_skill_content.resources is required', () => {
  assert.throws(() => zodSchemas.get_skill_content.resources.parse(undefined));
});

test('get_skill_content.resources rejects a non-string array item', () => {
  assert.throws(() => zodSchemas.get_skill_content.resources.parse(['delegation', 42]));
});

test('get_agent.agents is required', () => {
  assert.throws(() => zodSchemas.get_agent.agents.parse(undefined));
});
