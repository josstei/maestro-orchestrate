import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  defineCommandTable,
  registerCommandTable,
  withArgsOnly,
  withHandlerContext,
  withOptionalProjectRoot,
  withRequiredProjectRoot,
} from '../../dist/src/mcp/tool-packs/command-table.js';
import { createMaestroToolRegistry } from '../../dist/src/mcp/tool-packs/contracts.js';

const RUNTIME_CONFIG = Object.freeze({ env: { workspacePath: 'MAESTRO_TEST_WORKSPACE_PATH' } });

function createRecordingServer() {
  const registered = [];
  return {
    registered,
    registerTool(name, config, callback) {
      registered.push({ name, config, callback });
      return { name };
    },
  };
}

test('defineCommandTable rejects runtime schema/command key drift with a clear message', () => {
  assert.throws(
    () =>
      defineCommandTable(
        { one: {} },
        {
          two: {
            handler: withArgsOnly(() => ({})),
          },
        },
      ),
    /Command table keys must match schema keys/,
  );
});

test('defineCommandTable rejects required project root projections without workspace gating at runtime', () => {
  assert.throws(
    () =>
      defineCommandTable(
        {
          needs_workspace: {},
        },
        {
          needs_workspace: {
            handler: withRequiredProjectRoot(() => ({ ok: true })),
          },
        },
      ),
    /must set requiresWorkspace: true/,
  );
});

test('registerCommandTable registers metadata, schemas, projections, and post-call hooks', async () => {
  const zodSchemas = {
    echo: {
      text: z.string(),
    },
    needs_workspace: {
      value: z.number(),
    },
    maybe_workspace: {},
    full_context: {},
  };
  const postCallResults = [];
  const commands = defineCommandTable(zodSchemas, {
    echo: {
      description: 'Echo text',
      handler: withArgsOnly((args) => ({ echoed: args.text })),
      onPostCall: (result, args) => {
        postCallResults.push({ result, args });
      },
    },
    needs_workspace: {
      description: 'Needs workspace',
      requiresWorkspace: true,
      handler: withRequiredProjectRoot((args, projectRoot) => ({
        value: args.value,
        projectRoot,
      })),
    },
    maybe_workspace: {
      handler: withOptionalProjectRoot((_args, projectRoot) => ({ projectRoot })),
    },
    full_context: {
      requiresWorkspace: true,
      handler: withHandlerContext((_args, ctx) => ({ projectRoot: ctx.projectRoot })),
    },
  });
  const server = createRecordingServer();
  const registry = createMaestroToolRegistry();

  registerCommandTable(zodSchemas, commands, {
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
    getProjectRoot: () => '/repo/root',
  });

  assert.deepEqual(
    server.registered.map((entry) => entry.name),
    ['echo', 'needs_workspace', 'maybe_workspace', 'full_context'],
  );
  assert.equal(server.registered[0].config.description, 'Echo text');
  assert.equal(server.registered[0].config.inputSchema, zodSchemas.echo);
  assert.equal(registry.requiresWorkspace('echo'), false);
  assert.equal(registry.requiresWorkspace('needs_workspace'), true);
  assert.equal(registry.requiresWorkspace('full_context'), true);

  const echoResult = await server.registered[0].callback({ text: 'hello' }, {});
  assert.deepEqual(JSON.parse(echoResult.content[0].text), { echoed: 'hello' });
  assert.deepEqual(postCallResults, [
    {
      result: { echoed: 'hello' },
      args: { text: 'hello' },
    },
  ]);

  const requiredRootResult = await server.registered[1].callback({ value: 3 }, {});
  assert.deepEqual(JSON.parse(requiredRootResult.content[0].text), {
    value: 3,
    projectRoot: '/repo/root',
  });

  const optionalRootResult = await server.registered[2].callback({}, {});
  assert.deepEqual(JSON.parse(optionalRootResult.content[0].text), {
    projectRoot: '/repo/root',
  });

  const fullContextResult = await server.registered[3].callback({}, {});
  assert.deepEqual(JSON.parse(fullContextResult.content[0].text), {
    projectRoot: '/repo/root',
  });
});

test('args-only projection does not skip the workspace gate', async () => {
  const zodSchemas = {
    blueprint: {},
  };
  const commands = defineCommandTable(zodSchemas, {
    blueprint: {
      requiresWorkspace: true,
      handler: withArgsOnly(() => ({ ok: true })),
    },
  });
  const server = createRecordingServer();
  const registry = createMaestroToolRegistry();

  registerCommandTable(zodSchemas, commands, {
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
    env: {},
  });

  const result = await server.registered[0].callback({}, {});
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).code, 'WORKSPACE_NOT_INITIALIZED');
});

test('registerCommandTable works through the real MCP SDK path', async () => {
  const zodSchemas = {
    sdk_echo: {
      text: z.string(),
    },
  };
  const commands = defineCommandTable(zodSchemas, {
    sdk_echo: {
      description: 'SDK echo',
      handler: withArgsOnly((args) => ({ echoed: args.text })),
    },
  });
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = createMaestroToolRegistry();

  registerCommandTable(zodSchemas, commands, {
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
  });

  const client = new Client({ name: 'c', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  const tool = tools.tools.find((entry) => entry.name === 'sdk_echo');
  assert.ok(tool);
  assert.equal(tool.description, 'SDK echo');
  assert.equal(tool.inputSchema.properties.text.type, 'string');

  const result = await client.callTool({ name: 'sdk_echo', arguments: { text: 'hello' } });
  assert.deepEqual(JSON.parse(result.content[0].text), { echoed: 'hello' });

  await client.close();
  await server.close();
});
