'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');

const { McpConnection } = require('../../src/mcp/core/protocol-dispatcher');
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

/** A connection with an `echo` tool surface, `overrides` replacing any of its methods. */
function makeHandlers(overrides = {}, options = {}) {
  const stdout = new PassThrough();
  const frames = captureWrites(stdout);
  const handlers = Object.assign(
    new McpConnection(stdout, { serverInfo: { name: 'maestro-test', version: '0.0.0' }, ...options }),
    {
      getToolSchemas: () => [{ name: 'echo', description: 'echoes' }],
      callTool: async () => ({ ok: true, result: { ok: true } }),
      getProjectRoot: async () => '/tmp/ws',
    },
    overrides
  );
  return { handlers, frames };
}

describe('McpConnection.respond', () => {
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
    await handlers.respond({ id: 1, method: 123 });
    assert.equal(frames.length, 0);
  });

  it('writes each frame as one newline-terminated JSON line', async () => {
    const stdout = new PassThrough();
    const chunks = [];
    stdout.on('data', (chunk) => chunks.push(chunk.toString('utf8')));
    await new McpConnection(stdout).respond({ jsonrpc: '2.0', id: 1, method: 'ping' });
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

  it('invokes onInitialize with params', async () => {
    const seen = [];
    const { handlers } = makeHandlers({ onInitialize: (p) => seen.push(p) });
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
    const { handlers, frames } = makeHandlers(createServer({ toolPacks: [] }));
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

  for (const root of ['/ws/alpha', null]) {
    it(`passes the project root ${root} from getProjectRoot to callTool`, async () => {
      let sawRoot = 'sentinel';
      const { handlers } = makeHandlers({
        callTool: async (_n, _a, projectRoot) => {
          sawRoot = projectRoot;
          return { ok: true, result: {} };
        },
        getProjectRoot: async () => root,
      });
      await handlers.respond({ id: 8, method: 'tools/call', params: { name: 'echo' } });
      assert.equal(sawRoot, root);
    });
  }

  it('silently consumes notifications/initialized, cancelled, and $/cancelRequest', async () => {
    const { handlers, frames } = makeHandlers();
    await handlers.respond({ method: 'notifications/initialized' });
    await handlers.respond({ method: 'notifications/cancelled' });
    await handlers.respond({ method: '$/cancelRequest' });
    assert.equal(frames.length, 0);
  });

  it('invokes onRootsListChanged for notifications/roots/list_changed', async () => {
    let called = 0;
    const { handlers } = makeHandlers({ onRootsListChanged: () => { called++; } });
    await handlers.respond({ method: 'notifications/roots/list_changed' });
    assert.equal(called, 1);
  });

  it('lets onRootsListChanged re-request roots while the notification is still being handled', async () => {
    let roots;
    const { handlers, frames } = makeHandlers({
      async onRootsListChanged() {
        roots = (await this.requestFromClient('roots/list')).roots;
      },
    });

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

describe('McpConnection.requestFromClient', () => {
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
    const { handlers } = makeHandlers({}, { clientRequestTimeoutMs: 100 });
    await assert.rejects(
      handlers.requestFromClient('roots/list'),
      /Timed out waiting for client response to roots\/list/
    );
  });

  for (const late of [{ result: { roots: [] } }, { error: { message: 'too late' } }]) {
    it(`ignores a late ${Object.keys(late)[0]} response after the request times out`, async () => {
      const { handlers, frames } = makeHandlers({}, { clientRequestTimeoutMs: 10 });
      const pending = handlers.requestFromClient('roots/list');
      const id = frames[0].id;

      await assert.rejects(pending, /Timed out waiting for client response to roots\/list/);
      const frameCountAfterTimeout = frames.length;

      await handlers.respond({ jsonrpc: '2.0', id, ...late });

      assert.equal(frames.length, frameCountAfterTimeout);
    });
  }
});

describe('McpConnection.listen', () => {
  // A connection listening on a fresh input, recording the messages it responds to.
  function listening() {
    const input = new PassThrough();
    const received = [];
    const connection = Object.assign(new McpConnection(new PassThrough()), {
      respond: async (message) => received.push(message),
    });
    return { input, received, reader: connection.listen(input) };
  }

  // Writes each chunk to a fresh connection's input, ends it, and returns the
  // messages it responded to once the reader closes.
  async function dispatch(...chunks) {
    const { input, received, reader } = listening();
    for (const chunk of chunks) input.write(chunk);
    input.end();
    await once(reader, 'close');
    return received;
  }

  it('parses newline-delimited JSON messages in order', async () => {
    assert.deepEqual(await dispatch('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"id":2}\n{"id":3}\n'), [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it('skips blank lines and drops malformed JSON, then keeps dispatching', async () => {
    assert.deepEqual(await dispatch('\n   \n{not json}\n{"id":7}\n\n'), [{ id: 7 }]);
  });

  it('handles CRLF line endings', async () => {
    assert.deepEqual(await dispatch('{"id":1}\r\n{"id":2}\r\n'), [{ id: 1 }, { id: 2 }]);
  });

  it('buffers a partial line until the newline arrives', async () => {
    const { input, received, reader } = listening();
    input.write('{"id":');
    input.write('99}');
    assert.equal(received.length, 0, 'must not fire before newline');
    input.end('\n');
    await once(reader, 'close');
    assert.deepEqual(received, [{ id: 99 }]);
  });

  it('returns the underlying readline interface', () => {
    const { reader } = listening();
    assert.equal(typeof reader.on, 'function');
    assert.equal(typeof reader.close, 'function');
    reader.close();
  });
});
