'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const processHelper = require('../../src/lib/process');

describe('runWithTimeout()', () => {
  it('runs a simple command and returns exit code 0', async () => {
    const result = await processHelper.runWithTimeout('node', ['-e', 'process.exit(0)'], {}, 5000);
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
  });

  it('captures non-zero exit code', async () => {
    const result = await processHelper.runWithTimeout('node', ['-e', 'process.exit(42)'], {}, 5000);
    assert.equal(result.exitCode, 42);
    assert.equal(result.timedOut, false);
  });

  it('times out long-running process', async () => {
    const result = await processHelper.runWithTimeout(
      'node', ['-e', 'setTimeout(() => {}, 30000)'], {}, 500
    );
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
  });
});
