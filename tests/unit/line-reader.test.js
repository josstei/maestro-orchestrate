'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { createLineDispatcher } = require('../../src/mcp/core/line-reader');

function waitForClose(reader) {
  return new Promise((resolve) => reader.once('close', resolve));
}

describe('createLineDispatcher', () => {
  it('parses a single JSON line and forwards the object to onMessage', async () => {
    const stdin = new PassThrough();
    const received = [];
    const reader = createLineDispatcher(stdin, (msg) => received.push(msg));

    stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    stdin.end();
    await waitForClose(reader);

    assert.deepEqual(received, [{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
  });

  it('parses multiple newline-delimited JSON messages in order', async () => {
    const stdin = new PassThrough();
    const received = [];
    const reader = createLineDispatcher(stdin, (msg) => received.push(msg));

    stdin.write('{"id":1}\n{"id":2}\n{"id":3}\n');
    stdin.end();
    await waitForClose(reader);

    assert.deepEqual(
      received.map((m) => m.id),
      [1, 2, 3]
    );
  });

  it('skips blank lines without invoking onMessage', async () => {
    const stdin = new PassThrough();
    const received = [];
    const reader = createLineDispatcher(stdin, (msg) => received.push(msg));

    stdin.write('\n   \n{"id":7}\n\n');
    stdin.end();
    await waitForClose(reader);

    assert.equal(received.length, 1);
    assert.equal(received[0].id, 7);
  });

  it('drops malformed JSON and keeps dispatching subsequent valid lines', async () => {
    const stdin = new PassThrough();
    const received = [];
    const reader = createLineDispatcher(stdin, (msg) => received.push(msg));

    stdin.write('{not json}\n{"id":42}\n');
    stdin.end();
    await waitForClose(reader);

    assert.deepEqual(received, [{ id: 42 }]);
  });

  it('handles CRLF line endings', async () => {
    const stdin = new PassThrough();
    const received = [];
    const reader = createLineDispatcher(stdin, (msg) => received.push(msg));

    stdin.write('{"id":1}\r\n{"id":2}\r\n');
    stdin.end();
    await waitForClose(reader);

    assert.deepEqual(
      received.map((m) => m.id),
      [1, 2]
    );
  });

  it('buffers a partial line until the newline arrives', async () => {
    const stdin = new PassThrough();
    const received = [];
    const reader = createLineDispatcher(stdin, (msg) => received.push(msg));

    stdin.write('{"id":');
    stdin.write('99}');
    assert.equal(received.length, 0, 'must not fire before newline');
    stdin.write('\n');
    stdin.end();
    await waitForClose(reader);

    assert.deepEqual(received, [{ id: 99 }]);
  });

  it('returns the underlying readline interface', () => {
    const stdin = new PassThrough();
    const reader = createLineDispatcher(stdin, () => {});

    assert.equal(typeof reader.on, 'function');
    assert.equal(typeof reader.close, 'function');
    reader.close();
  });
});
