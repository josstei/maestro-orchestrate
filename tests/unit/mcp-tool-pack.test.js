import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  defineCommandTable,
  registerCommandTable,
  withArgsOnly,
  withPostCall,
  withRequiredProjectRoot,
} from '../../dist/src/mcp/tool-packs/command-table.js';
import { createMaestroToolRegistry } from '../../dist/src/mcp/tool-packs/contracts.js';
import {
  defineToolPack,
  registerToolPack,
  toolSchemas,
} from '../../dist/src/mcp/tool-packs/tool-pack.js';

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

function parseResult(result) {
  return JSON.parse(result.content[0].text);
}

test('defineToolPack applies pack defaults and explicit workspace overrides', () => {
  const pack = defineToolPack({ requiresWorkspace: false }, (tool) => ({
    inherited: tool.tool({
      inputSchema: { value: z.string() },
      description: 'Inherited policy',
      handler: withArgsOnly((args) => args.value),
    }),
    required: tool.required({
      inputSchema: { id: z.string() },
      description: 'Required override',
      handler: withRequiredProjectRoot((args, projectRoot) => ({ id: args.id, projectRoot })),
    }),
    optional: tool.optional({
      inputSchema: {},
      description: 'Optional override',
      handler: withArgsOnly(() => ({ ok: true })),
    }),
  }));

  assert.equal(pack.defaults.requiresWorkspace, false);
  assert.equal(pack.tools.inherited.requiresWorkspace, false);
  assert.equal(pack.tools.required.requiresWorkspace, true);
  assert.equal(pack.tools.optional.requiresWorkspace, false);

  const schemas = toolSchemas(pack);
  assert.deepEqual(Object.keys(schemas), ['inherited', 'required', 'optional']);
  assert.equal(schemas.inherited, pack.tools.inherited.inputSchema);
  assert.equal(schemas.required, pack.tools.required.inputSchema);
  assert.equal(schemas.optional, pack.tools.optional.inputSchema);
});

test('registerToolPack delegates schemas, projections, metadata, and post-call behavior to the command pipeline', async () => {
  const postCalls = [];
  const pack = defineToolPack({ requiresWorkspace: true }, (tool) => ({
    echo: tool.tool({
      inputSchema: { text: z.string() },
      description: 'Echo text',
      handler: withPostCall(
        withArgsOnly((args) => ({ echoed: args.text })),
        (result, args) => {
          postCalls.push({ result, args });
        },
      ),
    }),
    public_status: tool.optional({
      inputSchema: {},
      description: 'Public status',
      handler: withArgsOnly(() => ({ available: true })),
    }),
    rooted: tool.required({
      inputSchema: { id: z.string() },
      description: 'Rooted lookup',
      handler: withRequiredProjectRoot((args, projectRoot) => ({
        id: args.id,
        projectRoot,
      })),
    }),
  }));
  const server = createRecordingServer();
  const registry = createMaestroToolRegistry();

  registerToolPack(pack, {
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
    getProjectRoot: () => '/repo/root',
  });

  assert.deepEqual(
    server.registered.map(({ name }) => name),
    ['echo', 'public_status', 'rooted'],
  );
  assert.equal(server.registered[0].config.description, 'Echo text');
  assert.equal(server.registered[0].config.inputSchema, pack.tools.echo.inputSchema);
  assert.equal(registry.requiresWorkspace('echo'), true);
  assert.equal(registry.requiresWorkspace('public_status'), false);
  assert.equal(registry.requiresWorkspace('rooted'), true);

  const echoResult = await server.registered[0].callback({ text: 'hello' }, {});
  assert.deepEqual(parseResult(echoResult), { echoed: 'hello' });
  assert.deepEqual(postCalls, [
    {
      result: { echoed: 'hello' },
      args: { text: 'hello' },
    },
  ]);

  const publicResult = await server.registered[1].callback({}, {});
  assert.deepEqual(parseResult(publicResult), { available: true });

  const rootedResult = await server.registered[2].callback({ id: 'phase-8' }, {});
  assert.deepEqual(parseResult(rootedResult), {
    id: 'phase-8',
    projectRoot: '/repo/root',
  });
});

test('registerToolPack validates every descriptor before mutating the server registry', () => {
  const invalidPack = {
    defaults: { requiresWorkspace: false },
    tools: {
      valid: {
        inputSchema: {},
        description: 'Valid descriptor',
        requiresWorkspace: false,
        handler: withArgsOnly(() => ({ ok: true })),
      },
      invalid: {
        inputSchema: {},
        description: 'Invalid descriptor',
        requiresWorkspace: false,
        handler: withRequiredProjectRoot((_args, projectRoot) => ({ projectRoot })),
      },
    },
  };
  const server = createRecordingServer();
  const registry = createMaestroToolRegistry();

  assert.throws(
    () => registerToolPack(invalidPack, { server, registry, runtimeConfig: RUNTIME_CONFIG }),
    /must set requiresWorkspace: true/,
  );
  assert.equal(server.registered.length, 0);
  assert.equal(registry.has('valid'), false);
  assert.equal(registry.has('invalid'), false);
});

test('command-table top-level post-call retains precedence over a projected handler post-call', async () => {
  const postCalls = [];
  const schemas = { precedence: {} };
  const commands = defineCommandTable(schemas, {
    precedence: {
      handler: withPostCall(
        withArgsOnly(() => ({ ok: true })),
        () => postCalls.push('projected'),
      ),
      onPostCall: () => postCalls.push('command'),
    },
  });
  const server = createRecordingServer();
  const registry = createMaestroToolRegistry();

  registerCommandTable(schemas, commands, {
    server,
    registry,
    runtimeConfig: RUNTIME_CONFIG,
  });
  await server.registered[0].callback({}, {});

  assert.deepEqual(postCalls, ['command']);
});
