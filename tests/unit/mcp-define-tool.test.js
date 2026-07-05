import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createMaestroToolRegistry,
  defineTool,
} from '../../src/mcp/tool-packs/contracts.js';

const RUNTIME_CONFIG = Object.freeze({ env: { workspacePath: 'MAESTRO_TEST_WORKSPACE_PATH' } });

test('defineTool registers a tool via server.registerTool with the given description/inputSchema', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = createMaestroToolRegistry();

  defineTool({
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
    name: 'greet',
    description: 'Greets a name',
    schema: { name: z.string() },
    handler: async (args) => ({ greeting: `hello ${args.name}` }),
  });

  const client = new Client({ name: 'c', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  const greet = tools.tools.find((t) => t.name === 'greet');
  assert.ok(greet);
  assert.equal(greet.description, 'Greets a name');

  const result = await client.callTool({ name: 'greet', arguments: { name: 'ada' } });
  assert.deepEqual(JSON.parse(result.content[0].text), { greeting: 'hello ada' });

  await client.close();
  await server.close();
});

test('defineTool carries requiresWorkspace in maestro\'s own registry, not the SDK config (SDK silently drops unknown fields)', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = createMaestroToolRegistry();

  defineTool({
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
    env: {},
    name: 'needs_workspace',
    description: 'requires a workspace',
    schema: {},
    requiresWorkspace: true,
    handler: async () => ({ ok: true }),
  });

  assert.equal(registry.requiresWorkspace('needs_workspace'), true);

  const client = new Client({ name: 'c', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: 'needs_workspace', arguments: {} });
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.code, 'WORKSPACE_NOT_INITIALIZED');

  await client.close();
  await server.close();
});

test('cross-pack duplicate tool name throws at registration', () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = createMaestroToolRegistry();

  defineTool({
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
    name: 'duplicate_tool',
    description: 'first pack',
    schema: {},
    handler: async () => ({}),
  });

  assert.throws(
    () =>
      defineTool({
        server,
        registry,
        runtimeConfig: RUNTIME_CONFIG,
        name: 'duplicate_tool',
        description: 'second pack',
        schema: {},
        handler: async () => ({}),
      }),
    /duplicate/i
  );
});

test('defineTool requires a name and a handler function', () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = createMaestroToolRegistry();

  assert.throws(() =>
    defineTool({ server, registry, runtimeConfig: RUNTIME_CONFIG, schema: {}, handler: async () => ({}) })
  );
  assert.throws(() =>
    defineTool({ server, registry, runtimeConfig: RUNTIME_CONFIG, name: 'x', schema: {} })
  );
});
