'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withTempDir } = require('../../scripts/lib/temp-dir');

describe('script scratch directories', () => {
  it('returns the operation result and removes its scratch files', () => {
    let directory;
    const result = withTempDir('maestro-script-test-', (scratch) => {
      directory = scratch;
      fs.mkdirSync(path.join(scratch, 'nested'));
      fs.writeFileSync(path.join(scratch, 'nested', 'artifact'), 'content');
      return { verified: true };
    });

    assert.deepEqual(result, { verified: true });
    assert.equal(fs.existsSync(directory), false);
  });

  it('cleans up a failed operation and propagates its original error', () => {
    let directory;
    const failure = new Error('artifact invalid');
    assert.throws(() => withTempDir('maestro-script-test-', (scratch) => {
      directory = scratch;
      fs.writeFileSync(path.join(scratch, 'partial'), 'incomplete');
      throw failure;
    }), (error) => error === failure);

    assert.equal(fs.existsSync(directory), false);
  });
});
