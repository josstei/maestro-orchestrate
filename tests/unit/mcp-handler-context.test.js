import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { buildHandlerContext } from '../../dist/src/mcp/server/handler-context.js';
import { KnowledgeStore } from '../../dist/src/mcp/memory/knowledge-store.js';

const RUNTIME_CONFIG = Object.freeze({ env: { workspacePath: 'MAESTRO_TEST_WORKSPACE_PATH' } });

function fakeSdkServer({ capabilities = {}, elicitInput } = {}) {
  return {
    server: {
      getClientCapabilities: () => capabilities,
      elicitInput: elicitInput || (async () => {
        throw new Error('elicitInput should not be called when unsupported');
      }),
    },
  };
}

test('projectRoot is null when no getProjectRoot resolver is supplied', async () => {
  const ctx = await buildHandlerContext(
    {},
    { signal: new AbortController().signal },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG }
  );
  assert.equal(ctx.projectRoot, null);
});

test('projectRoot is null when the injected resolver returns null, never falling back to cwd/env', async () => {
  const ctx = await buildHandlerContext(
    {},
    {},
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG, getProjectRoot: () => null }
  );
  assert.equal(ctx.projectRoot, null);
});

test('projectRoot resolves from the injected getProjectRoot resolver (sync)', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-handler-ctx-'));
  try {
    const ctx = await buildHandlerContext(
      {},
      { signal: new AbortController().signal },
      {
        server: fakeSdkServer(),
        runtimeConfig: RUNTIME_CONFIG,
        getProjectRoot: () => tmpRoot,
      }
    );
    assert.equal(ctx.projectRoot, tmpRoot);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('projectRoot resolves from the injected getProjectRoot resolver (async)', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-handler-ctx-'));
  try {
    const ctx = await buildHandlerContext(
      {},
      {},
      {
        server: fakeSdkServer(),
        runtimeConfig: RUNTIME_CONFIG,
        getProjectRoot: async () => tmpRoot,
      }
    );
    assert.equal(ctx.projectRoot, tmpRoot);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('signal is bridged verbatim from extra.signal', async () => {
  const signal = new AbortController().signal;
  const ctx = await buildHandlerContext(
    {},
    { signal },
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG }
  );
  assert.equal(ctx.signal, signal);
});

test('runtimeConfig is passed through composition-stable', async () => {
  const ctx = await buildHandlerContext(
    {},
    {},
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG }
  );
  assert.equal(ctx.runtimeConfig, RUNTIME_CONFIG);
});

test('services.knowledgeStore throws WORKSPACE_NOT_INITIALIZED when projectRoot is null (no cwd fallback)', async () => {
  const ctx = await buildHandlerContext(
    {},
    {},
    { server: fakeSdkServer(), runtimeConfig: RUNTIME_CONFIG }
  );
  assert.equal(ctx.projectRoot, null);
  assert.throws(() => ctx.services.knowledgeStore, /WORKSPACE_NOT_INITIALIZED|initialized workspace/i);
});

test('knowledgeStore is lazily constructed and reused while carrying an injected clock', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-handler-ctx-'));
  try {
    const clock = { now: () => new Date('2021-06-01T00:00:00.000Z') };
    const ctx = await buildHandlerContext(
      {},
      {},
      {
        server: fakeSdkServer(),
        runtimeConfig: RUNTIME_CONFIG,
        getProjectRoot: () => tmpRoot,
        clock,
      }
    );

    const first = ctx.services.knowledgeStore;
    assert.ok(first instanceof KnowledgeStore);
    const second = ctx.services.knowledgeStore;
    assert.equal(first, second);

    assert.equal(ctx.services.clock, clock);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('services carries io, canonicalSrcRoot, workspaceSuggestion through from options', async () => {
  const workspaceSuggestion = () => '/suggested/path';
  const ctx = await buildHandlerContext(
    {},
    {},
    {
      server: fakeSdkServer(),
      runtimeConfig: RUNTIME_CONFIG,
      services: { canonicalSrcRoot: '/src/root', workspaceSuggestion },
    }
  );
  assert.equal(ctx.services.canonicalSrcRoot, '/src/root');
  assert.equal(ctx.services.workspaceSuggestion, workspaceSuggestion);
  assert.equal(typeof ctx.services.io.atomicWriteSync, 'function');
});

test('ctx.elicit returns null when the client capability precheck fails, without calling elicitInput', async () => {
  let calls = 0;
  const server = fakeSdkServer({
    capabilities: {},
    elicitInput: async () => {
      calls += 1;
      return { action: 'accept', content: {} };
    },
  });
  const ctx = await buildHandlerContext({}, {}, { server, runtimeConfig: RUNTIME_CONFIG });
  const result = await ctx.elicit({ message: 'Approve?', requestedSchema: { type: 'object', properties: {} } });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('ctx.elicit passes an explicit long timeout and returns the accept outcome', async () => {
  let observedOptions;
  const server = fakeSdkServer({
    capabilities: { elicitation: { form: true } },
    elicitInput: async (params, options) => {
      observedOptions = options;
      return { action: 'accept', content: { approved: true } };
    },
  });
  const ctx = await buildHandlerContext({}, {}, { server, runtimeConfig: RUNTIME_CONFIG });
  const result = await ctx.elicit({
    message: 'Approve?',
    requestedSchema: { type: 'object', properties: { approved: { type: 'boolean' } } },
  });
  assert.deepEqual(result, { action: 'accept', content: { approved: true } });
  assert.ok(observedOptions && typeof observedOptions.timeout === 'number');
  assert.ok(observedOptions.timeout > 60000);
});

test('ctx.elicit returns decline/cancel outcomes verbatim', async () => {
  const declineServer = fakeSdkServer({
    capabilities: { elicitation: { form: true } },
    elicitInput: async () => ({ action: 'decline' }),
  });
  const declineCtx = await buildHandlerContext({}, {}, { server: declineServer, runtimeConfig: RUNTIME_CONFIG });
  assert.deepEqual(await declineCtx.elicit({ message: 'x', requestedSchema: {} }), { action: 'decline' });

  const cancelServer = fakeSdkServer({
    capabilities: { elicitation: { form: true } },
    elicitInput: async () => ({ action: 'cancel' }),
  });
  const cancelCtx = await buildHandlerContext({}, {}, { server: cancelServer, runtimeConfig: RUNTIME_CONFIG });
  assert.deepEqual(await cancelCtx.elicit({ message: 'x', requestedSchema: {} }), { action: 'cancel' });
});

test('ctx.elicit catches a thrown error (client lacks form capability) and returns null instead of leaking', async () => {
  const server = fakeSdkServer({
    capabilities: { elicitation: {} },
    elicitInput: async () => {
      throw new Error('Client does not support form elicitation.');
    },
  });
  const ctx = await buildHandlerContext({}, {}, { server, runtimeConfig: RUNTIME_CONFIG });
  const result = await ctx.elicit({ message: 'x', requestedSchema: {} });
  assert.equal(result, null);
});

test('ctx.elicit catches an McpError thrown on requestedSchema validation failure and returns null', async () => {
  const server = fakeSdkServer({
    capabilities: { elicitation: { form: true } },
    elicitInput: async () => {
      const error = new Error('Elicitation response content does not match requested schema');
      error.code = -32602;
      throw error;
    },
  });
  const ctx = await buildHandlerContext({}, {}, { server, runtimeConfig: RUNTIME_CONFIG });
  const result = await ctx.elicit({ message: 'x', requestedSchema: {} });
  assert.equal(result, null);
});

test('ctx.elicit end-to-end over a real SDK McpServer/Client pair without elicitation capability', async () => {
  const mcpServer = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  let capturedCtx = null;
  mcpServer.registerTool(
    'probe',
    { description: 'probe', inputSchema: {} },
    async (args, extra) => {
      capturedCtx = await buildHandlerContext(args, extra, {
        server: mcpServer,
        runtimeConfig: RUNTIME_CONFIG,
      });
      const elicited = await capturedCtx.elicit({ message: 'hi', requestedSchema: { type: 'object', properties: {} } });
      return { content: [{ type: 'text', text: JSON.stringify({ elicited }) }] };
    }
  );

  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

  const response = await client.callTool({ name: 'probe', arguments: {} });
  const payload = JSON.parse(response.content[0].text);
  assert.equal(payload.elicited, null);
  assert.equal(capturedCtx.signal instanceof AbortSignal, true);

  await client.close();
  await mcpServer.close();
});

test('ctx.elicit end-to-end accepts over a real SDK McpServer/Client pair with elicitation capability', async () => {
  const mcpServer = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  mcpServer.registerTool(
    'probe',
    { description: 'probe', inputSchema: {} },
    async (args, extra) => {
      const ctx = await buildHandlerContext(args, extra, {
        server: mcpServer,
        runtimeConfig: RUNTIME_CONFIG,
      });
      const elicited = await ctx.elicit({
        message: 'Approve?',
        requestedSchema: { type: 'object', properties: { approved: { type: 'boolean' } } },
      });
      return { content: [{ type: 'text', text: JSON.stringify({ elicited }) }] };
    }
  );

  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: { elicitation: {} } }
  );
  client.setRequestHandler(ElicitRequestSchema, async () => ({
    action: 'accept',
    content: { approved: true },
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

  const response = await client.callTool({ name: 'probe', arguments: {} });
  const payload = JSON.parse(response.content[0].text);
  assert.deepEqual(payload.elicited, { action: 'accept', content: { approved: true } });

  await client.close();
  await mcpServer.close();
});
