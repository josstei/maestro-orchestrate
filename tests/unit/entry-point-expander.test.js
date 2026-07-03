'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { expandEntryPoints, expandCoreCommands } = require('../../src/generator/entry-point-expander');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

function assertByteIdentical(outputs) {
  for (const { outputPath, content } of outputs) {
    const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
    assert.equal(content, committed, outputPath);
  }
}

describe('entry-point-expander reproduces committed command surfaces byte-for-byte', () => {
  for (const runtime of ['gemini', 'claude', 'codex']) {
    it(`${runtime} entry points`, () => {
      const outputs = expandEntryPoints(runtime, SRC);
      assert.ok(outputs.length > 0, `${runtime} should emit entry points`);
      assertByteIdentical(outputs);
    });
    it(`${runtime} core commands`, () => {
      const outputs = expandCoreCommands(runtime, SRC);
      assert.ok(outputs.length > 0, `${runtime} should emit core commands`);
      assertByteIdentical(outputs);
    });
  }

  it('qwen emits no command surface', () => {
    assert.deepEqual(expandEntryPoints('qwen', SRC), []);
    assert.deepEqual(expandCoreCommands('qwen', SRC), []);
  });

  it('an unknown runtime raises the registry error', () => {
    assert.throws(() => expandEntryPoints('definitely-not-a-runtime', SRC), /Unknown runtime "definitely-not-a-runtime"/);
    assert.throws(() => expandCoreCommands('definitely-not-a-runtime', SRC), /Unknown runtime "definitely-not-a-runtime"/);
  });
});
