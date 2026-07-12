import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA,
  connectMaestroMcpServer,
  createMaestroMcpServer,
  createMaestroStdioTransport,
} from '../../dist/src/mcp/server/mcp-sdk-adapter.js';
import { createMcpServer, startMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';

describe('MCP SDK adapter', () => {
  it('creates the SDK-backed Maestro MCP server through the adapter boundary', () => {
    const server = createMaestroMcpServer({ name: 'adapter-test', version: '0.0.0' });

    assert.ok(server instanceof McpServer);
    assert.equal(typeof server.registerTool, 'function');
    assert.equal(typeof server.connect, 'function');
  });

  it('constructs the SDK stdio transport through the adapter boundary', () => {
    const transport = createMaestroStdioTransport();

    assert.ok(transport instanceof StdioServerTransport);
  });

  it('delegates connect calls to the supplied server and transport', async () => {
    const observed = [];
    const fakeTransport = { kind: 'fake-transport' };
    const fakeServer = {
      async connect(transport) {
        observed.push(transport);
      },
    };

    await connectMaestroMcpServer(fakeServer, fakeTransport);

    assert.deepEqual(observed, [fakeTransport]);
  });

  it('keeps create-mcp-server on the adapter boundary', async () => {
    const server = createMcpServer();

    assert.ok(server instanceof McpServer);

    const observed = [];
    await startMcpServer({
      async connect(transport) {
        observed.push(transport);
      },
    });

    assert.ok(observed[0] instanceof StdioServerTransport);
  });

  it('exports the roots-list-changed notification schema for runtime wiring', () => {
    assert.equal(typeof ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA, 'object');
    assert.equal(
      ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA.safeParse({
        method: 'notifications/roots/list_changed',
        params: {},
      }).success,
      true
    );
    assert.equal(ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA.safeParse({ method: 'unknown' }).success, false);
  });
});
