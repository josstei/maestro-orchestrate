'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const { ROOT } = require('../support/paths');

const STDIN_READER = path.join(ROOT, 'src', 'core', 'stdin-reader.js');

function runWithStdin(stdin) {
  const script = `
    const reader = require(${JSON.stringify(STDIN_READER)});
    (async () => {
      try {
        const result = await reader.readText();
        process.stdout.write(JSON.stringify({ ok: true, result }));
      } catch (e) {
        process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
      }
    })();
  `;
  const out = spawnSync(process.execPath, ['-e', script], {
    input: Buffer.from(stdin, 'utf8'),
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
    const { parsed } = runWithStdin('hello world');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result, 'hello world');
  });

  it('returns an empty string for empty stdin', () => {
    const { parsed } = runWithStdin('');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result, '');
  });

  it('rejects when payload exceeds the 1 MiB cap', () => {
    const oversize = 'a'.repeat(1024 * 1024 + 10);
    const { parsed } = runWithStdin(oversize);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Stdin payload too large/);
  });

  it('counts the cap in raw UTF-8 bytes and decodes multi-byte input intact', () => {
    // 'é' is 2 bytes: 512 KiB of them is exactly the cap, one more exceeds it.
    const atCap = runWithStdin('é'.repeat(512 * 1024));
    assert.equal(atCap.parsed.ok, true);
    assert.equal(atCap.parsed.result, 'é'.repeat(512 * 1024));

    const overCap = runWithStdin('é'.repeat(512 * 1024 + 1));
    assert.equal(overCap.parsed.ok, false);
    assert.match(overCap.parsed.error, /Stdin payload too large/);
  });
});
