'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const {
  DEFAULT_PROTOCOL_VERSION,
  writeMessage,
  buildInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  createProtocolHandlers,
} = require('../../src/mcp/core/protocol-dispatcher');

function captureWrites(stream) {
  const frames = [];
  stream.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.length === 0) continue;
      frames.push(JSON.parse(line));
    }
  });
  return frames;
}

function makeServerStub(overrides = {}) {
  return {
    getToolSchemas: () => [{ name: 'echo', description: 'echoes' }],
    callTool: async () => ({ ok: true, result: { ok: true } }),
    ...overrides,
  };
}

function makeHandlers(serverOverrides = {}, dispatcherOverrides = {}) {
  const stdout = new PassThrough();
  const frames = captureWrites(stdout);
  const server = makeServerStub(serverOverrides);
  const getProjectRoot = dispatcherOverrides.getProjectRoot || (async () => '/tmp/ws');
  const options = {
    serverInfo: { name: 'maestro-test', version: '0.0.0' },
    ...dispatcherOverrides.options,
  };
  const handlers = createProtocolHandlers(server, getProjectRoot, stdout, options);
  return { handlers, frames, stdout, server };
}

describe('writeMessage', () => {
  it('writes a newline-terminated JSON frame', () => {
    const out = new PassThrough();
    const captured = [];
    out.on('data', (chunk) => captured.push(chunk.toString('utf8')));
    writeMessage(out, { jsonrpc: '2.0', id: 1, result: {} });
    assert.equal(captured.join(''), '{"jsonrpc":"2.0","id":1,"result":{}}\n');
  });
});

describe('buildInitializeResult', () => {
  it('uses the default protocol version when none is supplied', () => {
    const result = buildInitializeResult(undefined, { name: 's', version: '1' });
    assert.equal(result.protocolVersion, DEFAULT_PROTOCOL_VERSION);
    assert.deepEqual(result.capabilities, { tools: {} });
    assert.deepEqual(result.serverInfo, { name: 's', version: '1' });
  });

  it('passes through a client-supplied protocol version', () => {
    const result = buildInitializeResult('2025-06-01', { name: 's', version: '1' });
    assert.equal(result.protocolVersion, '2025-06-01');
  });
});

describe('createToolErrorResult', () => {
  it('wraps a plain error with a recovery hint', () => {
    const result = createToolErrorResult('boom', 'try again');
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.error, 'boom');
    assert.equal(payload.recovery_hint, 'try again');
  });

  it('passes through an outcome object with code and details', () => {
    const result = createToolErrorResult({
      error: 'bad input',
      recovery_hint: 'check args',
      code: 'INVALID_ARG',
      details: { field: 'name' },
    });
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.error, 'bad input');
    assert.equal(payload.code, 'INVALID_ARG');
    assert.deepEqual(payload.details, { field: 'name' });
  });

  it('defaults recovery_hint to null when neither is provided', () => {
    const result = createToolErrorResult('boom');
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.recovery_hint, null);
  });

  it('treats arrays as error values rather than outcome objects', () => {
    const result = createToolErrorResult(['a', 'b'], 'hint');
    const payload = JSON.parse(result.content[0].text);
    assert.deepEqual(payload.error, ['a', 'b']);
    assert.equal(payload.recovery_hint, 'hint');
  });
});

describe('createToolSuccessResult', () => {
  it('wraps the result as a stringified JSON text block', () => {
    const result = createToolSuccessResult({ ok: true, value: 42 });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].type, 'text');
    assert.deepEqual(JSON.parse(result.content[0].text), { ok: true, value: 42 });
  });
});

describe('createProtocolHandlers.respond', () => {
  it('ignores non-object messages', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond(null);
    await handlers.respond(undefined);
    await handlers.respond('garbage');
    assert.equal(frames.length, 0);
  });

  it('ignores messages without a string method and no matching pending id', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ id: 'unknown', result: {} });
    await handlers.respond({ method: 123 });
    assert.equal(frames.length, 0);
  });

  it('responds to initialize with the default protocol version', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(frames.length, 1);
    assert.equal(frames[0].id, 1);
    assert.equal(frames[0].result.protocolVersion, DEFAULT_PROTOCOL_VERSION);
  });

  it('invokes onInitialize callback with params', async () => {
    const seen = [];
    const { handlers } = makeHandlers(
      {},
      { options: { serverInfo: { name: 's', version: '1' }, callbacks: { onInitialize: (p) => seen.push(p) } } }
    );
    await handlers.respond({ id: 1, method: 'initialize', params: { clientInfo: 'test' } });
    assert.deepEqual(seen, [{ clientInfo: 'test' }]);
  });

  it('responds to ping with an empty result', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ id: 7, method: 'ping' });
    assert.deepEqual(frames[0], { jsonrpc: '2.0', id: 7, result: {} });
  });

  it('responds to tools/list with schemas from the server', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ id: 2, method: 'tools/list' });
    assert.equal(frames[0].result.tools[0].name, 'echo');
  });

  it('responds with a success frame when callTool returns ok', async () => {
    const { handlers, frames } = makeHandlers({
      callTool: async (name, args) => {
        assert.equal(name, 'echo');
        assert.deepEqual(args, { text: 'hi' });
        return { ok: true, result: { echoed: 'hi' } };
      },
    });
    await handlers.respond({
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'hi' } },
    });
    assert.equal(frames[0].id, 3);
    assert.deepEqual(JSON.parse(frames[0].result.content[0].text), { echoed: 'hi' });
    assert.equal(frames[0].result.isError, undefined);
  });

  it('responds with an error frame when callTool returns !ok', async () => {
    const { handlers, frames } = makeHandlers({
      callTool: async () => ({
        ok: false,
        error: 'bad thing',
        code: 'OOPS',
        recovery_hint: 'retry',
      }),
    });
    await handlers.respond({
      id: 4,
      method: 'tools/call',
      params: { name: 'echo', arguments: {} },
    });
    assert.equal(frames[0].result.isError, true);
    const payload = JSON.parse(frames[0].result.content[0].text);
    assert.equal(payload.error, 'bad thing');
    assert.equal(payload.code, 'OOPS');
  });

  it('defaults arguments to an empty object when params.arguments is missing or non-object', async () => {
    let captured;
    const { handlers } = makeHandlers({
      callTool: async (_name, args) => {
        captured = args;
        return { ok: true, result: {} };
      },
    });
    await handlers.respond({ id: 5, method: 'tools/call', params: { name: 'echo' } });
    assert.deepEqual(captured, {});
    await handlers.respond({
      id: 6,
      method: 'tools/call',
      params: { name: 'echo', arguments: 'not-an-object' },
    });
    assert.deepEqual(captured, {});
  });

  it('passes the project root from getProjectRoot to callTool', async () => {
    let sawRoot;
    const { handlers } = makeHandlers(
      {
        callTool: async (_n, _a, root) => {
          sawRoot = root;
          return { ok: true, result: {} };
        },
      },
      { getProjectRoot: async () => '/ws/alpha' }
    );
    await handlers.respond({ id: 8, method: 'tools/call', params: { name: 'echo' } });
    assert.equal(sawRoot, '/ws/alpha');
  });

  it('passes null project root when WORKSPACE_NOT_INITIALIZED is thrown', async () => {
    let sawRoot = 'sentinel';
    const err = Object.assign(new Error('ws missing'), { code: 'WORKSPACE_NOT_INITIALIZED' });
    const { handlers } = makeHandlers(
      {
        callTool: async (_n, _a, root) => {
          sawRoot = root;
          return { ok: true, result: {} };
        },
      },
      { getProjectRoot: async () => { throw err; } }
    );
    await handlers.respond({ id: 9, method: 'tools/call', params: { name: 'echo' } });
    assert.equal(sawRoot, null);
  });

  it('still calls the tool (with null root) when getProjectRoot fails unexpectedly', async () => {
    let sawRoot = 'sentinel';
    const { handlers } = makeHandlers(
      {
        callTool: async (_n, _a, root) => {
          sawRoot = root;
          return { ok: true, result: {} };
        },
      },
      { getProjectRoot: async () => { throw new Error('disk on fire'); } }
    );
    await handlers.respond({ id: 10, method: 'tools/call', params: { name: 'echo' } });
    assert.equal(sawRoot, null);
  });

  it('silently consumes notifications/initialized, cancelled, and $/cancelRequest', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ method: 'notifications/initialized' });
    await handlers.respond({ method: 'notifications/cancelled' });
    await handlers.respond({ method: '$/cancelRequest' });
    assert.equal(frames.length, 0);
  });

  it('invokes onRootsListChanged callback for notifications/roots/list_changed', async () => {
    let called = 0;
    const { handlers } = makeHandlers(
      {},
      { options: { serverInfo: { name: 's', version: '1' }, callbacks: { onRootsListChanged: () => { called++; } } } }
    );
    await handlers.respond({ method: 'notifications/roots/list_changed' });
    assert.equal(called, 1);
  });

  it('returns -32601 Method not found for unknown methods with an id', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ id: 99, method: 'does/not/exist' });
    assert.equal(frames[0].id, 99);
    assert.equal(frames[0].error.code, -32601);
    assert.ok(frames[0].error.message.includes('does/not/exist'));
  });

  it('does not respond to unknown notifications (no id)', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ method: 'unknown/notification' });
    assert.equal(frames.length, 0);
  });
});

describe('createProtocolHandlers.requestFromClient', () => {
  it('writes a request frame and resolves when a matching response arrives', async () => {
    const { handlers, frames } = makeHandlers();
    const pending = handlers.requestFromClient('roots/list', { foo: 'bar' });

    assert.equal(frames.length, 1);
    assert.equal(frames[0].method, 'roots/list');
    assert.deepEqual(frames[0].params, { foo: 'bar' });

    const id = frames[0].id;
    await handlers.respond({ id, result: { roots: ['/a'] } });

    assert.deepEqual(await pending, { roots: ['/a'] });
  });

  it('rejects when the client responds with an error', async () => {
    const { handlers, frames } = makeHandlers();
    const pending = handlers.requestFromClient('roots/list');
    const id = frames[0].id;
    await handlers.respond({ id, error: { message: 'client oopsed' } });
    await assert.rejects(pending, /client oopsed/);
  });

  it('times out if no response arrives within the configured window', async () => {
    const { handlers } = makeHandlers(
      {},
      { options: { serverInfo: { name: 's', version: '1' }, clientRequestTimeoutMs: 10 } }
    );
    await assert.rejects(
      handlers.requestFromClient('roots/list'),
      /Timed out waiting for client response to roots\/list/
    );
  });
});

describe('createProtocolHandlers.drain', () => {
  it('rejects all pending client requests with a shutdown message', async () => {
    const { handlers } = makeHandlers(
      {},
      { options: { serverInfo: { name: 's', version: '1' }, clientRequestTimeoutMs: 60000 } }
    );
    const p1 = handlers.requestFromClient('a');
    const p2 = handlers.requestFromClient('b');
    handlers.drain();
    await assert.rejects(p1, /MCP server closing; request .* aborted/);
    await assert.rejects(p2, /MCP server closing; request .* aborted/);
  });

  it('is a no-op when no client requests are pending', () => {
    const { handlers } = makeHandlers();
    assert.doesNotThrow(() => handlers.drain());
  });
});
