'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STDIN_READER = path.join(REPO_ROOT, 'src', 'core', 'stdin-reader.js');

function runWithStdin(fnName, stdin, { buffer = false } = {}) {
  const script = `
    const reader = require(${JSON.stringify(STDIN_READER)});
    (async () => {
      try {
        const result = await reader.${fnName}();
        process.stdout.write(JSON.stringify({ ok: true, result }));
      } catch (e) {
        process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
      }
    })();
  `;
  const input = buffer ? stdin : Buffer.from(stdin, 'utf8');
  const out = spawnSync(process.execPath, ['-e', script], {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: out.status,
    stdout: out.stdout.toString('utf8'),
    stderr: out.stderr.toString('utf8'),
    parsed: out.stdout.length > 0 ? JSON.parse(out.stdout.toString('utf8')) : null,
  };
}

describe('stdin-reader.readText', () => {
  it('returns the full piped payload', () => {
    const { parsed } = runWithStdin('readText', 'hello world');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result, 'hello world');
  });

  it('returns an empty string for empty stdin', () => {
    const { parsed } = runWithStdin('readText', '');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result, '');
  });

  it('rejects when payload exceeds the 1 MiB cap', () => {
    const oversize = 'a'.repeat(1024 * 1024 + 10);
    const { parsed } = runWithStdin('readText', oversize);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Stdin payload too large/);
  });
});

describe('stdin-reader.readJson', () => {
  it('parses valid JSON', () => {
    const { parsed } = runWithStdin('readJson', '{"a":1,"b":[2,3]}');
    assert.deepEqual(parsed.result, { a: 1, b: [2, 3] });
  });

  it('returns {} for empty stdin', () => {
    const { parsed } = runWithStdin('readJson', '');
    assert.deepEqual(parsed.result, {});
  });

  it('returns {} for whitespace-only stdin', () => {
    const { parsed } = runWithStdin('readJson', '   \n\t  ');
    assert.deepEqual(parsed.result, {});
  });

  it('returns {} and logs a warning for malformed JSON', () => {
    const { parsed, stderr } = runWithStdin('readJson', '{not json');
    assert.deepEqual(parsed.result, {});
    assert.match(stderr, /Failed to parse JSON from stdin/);
  });
});

describe('stdin-reader.readBoundedJson', () => {
  it('parses JSON from piped stdin without a TTY guard', () => {
    const { parsed } = runWithStdin('readBoundedJson', '{"name":"maestro"}');
    assert.deepEqual(parsed.result, { name: 'maestro' });
  });

  it('rejects when payload exceeds the 1 MiB cap', () => {
    const oversize = JSON.stringify({ data: 'a'.repeat(1024 * 1024 + 10) });
    const { parsed } = runWithStdin('readBoundedJson', oversize);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Stdin payload too large/);
  });

  it('crashes the process on malformed JSON (JSON.parse throws inside stream end handler)', () => {
    const { status, stderr, parsed } = runWithStdin('readBoundedJson', '{broken');
    assert.notEqual(status, 0, 'process should exit non-zero');
    assert.match(stderr, /SyntaxError/);
    assert.equal(parsed, null, 'no structured output — promise never settled');
  });
});
