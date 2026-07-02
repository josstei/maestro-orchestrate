'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildHookConfigOutputs } = require('../../src/generator/hook-config-emitter');
const gemini = require('../../src/platforms/gemini/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');

const ROOT = path.resolve(__dirname, '../..');

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [output.outputPath, output.content]));
}

describe('hook-config-emitter', () => {
  it('reproduces the committed hook configs byte-for-byte', () => {
    const outputs = outputsByPath(buildHookConfigOutputs({ gemini, qwen }));

    assert.deepEqual([...outputs.keys()].sort(), [
      'claude/hooks/claude-hooks.json',
      'hooks/hooks.json',
      'qwen/hooks.json',
    ]);

    for (const outputPath of outputs.keys()) {
      const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
      assert.equal(outputs.get(outputPath), committed, outputPath);
    }
  });

  it('always emits the claude hook config even when no gemini-family runtime is enabled', () => {
    const outputs = buildHookConfigOutputs({});
    assert.deepEqual(outputs.map((output) => output.outputPath), ['claude/hooks/claude-hooks.json']);
  });

  it('emits only the enabled gemini-family runtime alongside claude', () => {
    const outputs = buildHookConfigOutputs({ qwen });
    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      ['claude/hooks/claude-hooks.json', 'qwen/hooks.json']
    );
  });
});
