import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolPipeline } from '../../src/mcp/server/tool-pipeline.js';
import { MaestroError } from '../../src/lib/errors/index.js';

const RUNTIME_CONFIG = Object.freeze({ env: { workspacePath: 'MAESTRO_TEST_WORKSPACE_PATH' } });

function fakeSdkServer() {
  return { server: { getClientCapabilities: () => ({}), elicitInput: async () => null } };
}

test('workspace gate runs before the handler and rejects when requiresWorkspace and projectRoot is absent', async () => {
  let handlerCalled = false;
  const callback = createToolPipeline(
    {
      name: 'needs_workspace_tool',
      requiresWorkspace: true,
      handler: async () => {
        handlerCalled = true;
        return { ok: true };
      },
    },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, env: {} }
  );

  const result = await callback({}, {});
  assert.equal(handlerCalled, false);
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.code, 'WORKSPACE_NOT_INITIALIZED');
});

test('handler runs and its result is serialized as success when workspace is not required', async () => {
  const callback = createToolPipeline(
    {
      name: 'no_workspace_tool',
      requiresWorkspace: false,
      handler: async (args, ctx) => ({ echoed: args, hasCtx: typeof ctx === 'object' }),
    },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, env: {} }
  );

  const result = await callback({ a: 1 }, {});
  assert.equal(result.isError, undefined);
  const payload = JSON.parse(result.content[0].text);
  assert.deepEqual(payload.echoed, { a: 1 });
  assert.equal(payload.hasCtx, true);
});

test('a handler throw is normalized to a failure outcome with a recovery hint, and post-call is skipped', async () => {
  let postCallInvoked = false;
  const callback = createToolPipeline(
    {
      name: 'create_session',
      requiresWorkspace: false,
      handler: async () => {
        throw new MaestroError('a session already exists', { code: 'ALREADY_EXISTS' });
      },
      onPostCall: () => {
        postCallInvoked = true;
      },
    },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, env: {} }
  );

  const result = await callback({}, {});
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.error, 'a session already exists');
  assert.equal(payload.code, 'ALREADY_EXISTS');
  assert.ok(typeof payload.recovery_hint === 'string' && payload.recovery_hint.length > 0);
  assert.equal(postCallInvoked, false);
});

test('post-call effect runs once, after the handler, only on a non-throwing return', async () => {
  const order = [];
  let postCallArgs = null;
  const callback = createToolPipeline(
    {
      name: 'tracked_tool',
      requiresWorkspace: false,
      handler: async (args) => {
        order.push('handler');
        return { value: args.n };
      },
      onPostCall: (result, args) => {
        order.push('post-call');
        postCallArgs = { result, args };
      },
    },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, env: {} }
  );

  await callback({ n: 7 }, {});
  assert.deepEqual(order, ['handler', 'post-call']);
  assert.deepEqual(postCallArgs, { result: { value: 7 }, args: { n: 7 } });
});

test('a throwing post-call effect is swallowed and does not mask the tool result', async () => {
  const callback = createToolPipeline(
    {
      name: 'tracked_tool',
      requiresWorkspace: false,
      handler: async () => ({ value: 1 }),
      onPostCall: () => {
        throw new Error('post-call boom');
      },
    },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, env: {} }
  );

  const result = await callback({}, {});
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), { value: 1 });
});

test('full order on a workspace-gated tool: gate then handler then post-call, no validate stage', async () => {
  const order = [];
  const callback = createToolPipeline(
    {
      name: 'gated_tracked_tool',
      requiresWorkspace: true,
      handler: async () => {
        order.push('handler');
        return { done: true };
      },
      onPostCall: () => {
        order.push('post-call');
      },
    },
    {
      server: fakeSdkServer(),
      runtimeConfig: RUNTIME_CONFIG,
      getProjectRoot: () => process.cwd(),
    }
  );

  const result = await callback({}, {});
  assert.equal(result.isError, undefined);
  assert.deepEqual(order, ['handler', 'post-call']);
});

test('there is no validate stage: malformed args reach the handler untouched (zod owns validation before the callback)', async () => {
  const callback = createToolPipeline(
    {
      name: 'no_validate_tool',
      requiresWorkspace: false,
      handler: async (args) => ({ receivedType: typeof args.weird }),
    },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, env: {} }
  );

  const result = await callback({ weird: Symbol('nope') }, {});
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.receivedType, 'symbol');
});
