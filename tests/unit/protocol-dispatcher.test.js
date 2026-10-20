'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { createProtocolHandlers } = require('../../src/mcp/core/protocol-dispatcher');
const { createServer } = require('../../src/mcp/core/create-server');

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

const NO_OP_CALLBACKS = { onInitialize() {}, onInitialized() {}, onRootsListChanged() {} };

function makeHandlers(serverOverrides = {}, dispatcherOverrides = {}) {
  const stdout = new PassThrough();
  const frames = captureWrites(stdout);
  const server = makeServerStub(serverOverrides);
  const { callbacks, ...options } = dispatcherOverrides.options || {};
  const handlers = createProtocolHandlers(server, stdout, {
    serverInfo: { name: 'maestro-test', version: '0.0.0' },
    ...options,
    callbacks: { ...NO_OP_CALLBACKS, ...callbacks },
  });
  return { handlers, frames, stdout, server };
}

/**
 * Feeds `chunks` to `listen` on a fresh dispatcher's stdin and returns the
 * reply frames once the input has ended and been handled.
 */
async function listenTo(...chunks) {
  const { handlers, frames } = makeHandlers();
  const stdin = new PassThrough();
  const closed = new Promise((resolve) => handlers.listen(stdin).once('close', resolve));
  for (const chunk of chunks) stdin.write(chunk);
  stdin.end();
  await closed;
  await new Promise(setImmediate);
  return frames;
}

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

  it('writes each frame as one newline-terminated JSON line', async () => {
    const stdout = new PassThrough();
    const chunks = [];
    stdout.on('data', (chunk) => chunks.push(chunk.toString('utf8')));
    const handlers = createProtocolHandlers(makeServerStub(), stdout, {});
    await handlers.respond({ jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(chunks.join(''), '{"jsonrpc":"2.0","id":1,"result":{}}\n');
  });

  it('responds to initialize with the default protocol version', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(frames.length, 1);
    assert.deepEqual(frames[0], {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'maestro-test', version: '0.0.0' },
      },
    });
  });

  it('passes through a client-supplied protocol version on initialize', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-01' } });
    assert.equal(frames[0].result.protocolVersion, '2025-06-01');
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
    assert.deepEqual(frames[0].result, {
      content: [{ type: 'text', text: '{"echoed":"hi"}' }],
    });
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

  it('serializes a failure outcome without ok, keeping details', async () => {
    const { handlers, frames } = makeHandlers({
      callTool: async () => ({
        ok: false,
        error: 'bad input',
        recovery_hint: 'check args',
        code: 'INVALID_ARG',
        details: { field: 'name' },
      }),
    });
    await handlers.respond({ id: 4, method: 'tools/call', params: { name: 'echo' } });
    assert.equal(
      frames[0].result.content[0].text,
      '{"error":"bad input","recovery_hint":"check args","code":"INVALID_ARG","details":{"field":"name"}}'
    );
  });

  it('frames an unknown-tool failure from a real server with a null recovery_hint', async () => {
    const stdout = new PassThrough();
    const frames = captureWrites(stdout);
    const handlers = createProtocolHandlers(
      createServer({ runtimeConfig: {}, workspace: null, tools: [] }),
      stdout,
      {}
    );
    await handlers.respond({ id: 10, method: 'tools/call', params: { name: 'missing' } });
    assert.deepEqual(Object.keys(frames[0].result), ['content', 'isError']);
    assert.equal(frames[0].result.isError, true);
    assert.equal(
      frames[0].result.content[0].text,
      '{"error":"Unknown tool: missing","recovery_hint":null,"code":"UNKNOWN_TOOL"}'
    );
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

  it('runs a tool call only after what an earlier client reply resolved is applied', async () => {
    let roots = null;
    let seenRoots;
    const { handlers, frames } = makeHandlers({
      callTool: async () => {
        seenRoots = roots;
        return { ok: true, result: {} };
      },
    });
    handlers.requestFromClient('roots/list').then((result) => {
      roots = result.roots;
    });

    // The reply and the call are dispatched back to back, as two lines of one chunk are.
    await Promise.all([
      handlers.respond({ jsonrpc: '2.0', id: frames[0].id, result: { roots: ['file:///ws'] } }),
      handlers.respond({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo' } }),
    ]);

    assert.deepEqual(seenRoots, ['file:///ws']);
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

  it('lets onRootsListChanged re-request roots while the notification is still being handled', async () => {
    let roots;
    const { handlers, frames } = makeHandlers(
      {},
      {
        options: {
          serverInfo: { name: 's', version: '1' },
          callbacks: {
            async onRootsListChanged() {
              roots = (await handlers.requestFromClient('roots/list')).roots;
            },
          },
        },
      }
    );

    const notification = handlers.respond({ method: 'notifications/roots/list_changed' });
    assert.equal(frames.length, 1);
    assert.equal(frames[0].method, 'roots/list');

    await handlers.respond({ jsonrpc: '2.0', id: frames[0].id, result: { roots: ['file:///ws'] } });
    await notification;

    assert.deepEqual(roots, ['file:///ws']);
    assert.equal(frames.length, 1);
  });

  it('answers server/discover, which Antigravity sends before initialize, with -32601', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ jsonrpc: '2.0', id: 0, method: 'server/discover', params: {} });
    assert.deepEqual(frames, [
      { jsonrpc: '2.0', id: 0, error: { code: -32601, message: 'Method not found: server/discover' } },
    ]);
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

describe('createProtocolHandlers.listen', () => {
  it('handles a single JSON line', async () => {
    assert.deepEqual(await listenTo('{"jsonrpc":"2.0","id":1,"method":"ping"}\n'), [
      { jsonrpc: '2.0', id: 1, result: {} },
    ]);
  });

  it('handles newline-delimited messages in order', async () => {
    const frames = await listenTo('{"id":1,"method":"ping"}\n{"id":2,"method":"ping"}\n{"id":3,"method":"ping"}\n');
    assert.deepEqual(frames.map((frame) => frame.id), [1, 2, 3]);
  });

  it('skips blank lines', async () => {
    const frames = await listenTo('\n   \n{"id":7,"method":"ping"}\n\n');
    assert.deepEqual(frames.map((frame) => frame.id), [7]);
  });

  it('drops malformed JSON and keeps handling the following lines', async () => {
    const frames = await listenTo('{not json}\n{"id":42,"method":"ping"}\n');
    assert.deepEqual(frames.map((frame) => frame.id), [42]);
  });

  it('handles CRLF line endings', async () => {
    const frames = await listenTo('{"id":1,"method":"ping"}\r\n{"id":2,"method":"ping"}\r\n');
    assert.deepEqual(frames.map((frame) => frame.id), [1, 2]);
  });

  it('buffers a partial line until its newline arrives', async () => {
    const { handlers, frames } = makeHandlers();
    const stdin = new PassThrough();
    const closed = new Promise((resolve) => handlers.listen(stdin).once('close', resolve));

    stdin.write('{"id":');
    stdin.write('99,"method":"ping"}');
    await new Promise(setImmediate);
    assert.equal(frames.length, 0, 'must not handle a line before its newline');

    stdin.end('\n');
    await closed;
    await new Promise(setImmediate);
    assert.deepEqual(frames.map((frame) => frame.id), [99]);
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
      { options: { serverInfo: { name: 's', version: '1' }, clientRequestTimeoutMs: 100 } }
    );
    await assert.rejects(
      handlers.requestFromClient('roots/list'),
      /Timed out waiting for client response to roots\/list/
    );
  });

  it('ignores a late success response after the request times out', async () => {
    const { handlers, frames } = makeHandlers(
      {},
      { options: { serverInfo: { name: 's', version: '1' }, clientRequestTimeoutMs: 10 } }
    );
    const pending = handlers.requestFromClient('roots/list');
    const id = frames[0].id;

    await assert.rejects(pending, /Timed out waiting for client response to roots\/list/);
    const frameCountAfterTimeout = frames.length;

    await handlers.respond({ jsonrpc: '2.0', id, result: { roots: [] } });

    assert.equal(frames.length, frameCountAfterTimeout);
  });

  it('ignores a late error response after the request times out', async () => {
    const { handlers, frames } = makeHandlers(
      {},
      { options: { serverInfo: { name: 's', version: '1' }, clientRequestTimeoutMs: 10 } }
    );
    const pending = handlers.requestFromClient('roots/list');
    const id = frames[0].id;

    await assert.rejects(pending, /Timed out waiting for client response to roots\/list/);
    const frameCountAfterTimeout = frames.length;

    await handlers.respond({ jsonrpc: '2.0', id, error: { message: 'too late' } });

    assert.equal(frames.length, frameCountAfterTimeout);
  });
});
