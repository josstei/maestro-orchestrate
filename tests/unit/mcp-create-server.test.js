import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/mcp/server/create-mcp-server.js';

test('createMcpServer returns an McpServer instance', () => {
  const server = createMcpServer();
  assert.ok(server instanceof McpServer);
});

test('StdioServerTransport constructs without throwing', () => {
  const transport = new StdioServerTransport();
  assert.ok(transport);
});

test('createMcpServer connects successfully over an in-memory transport', async () => {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await clientTransport.close();
  await server.close();
});
