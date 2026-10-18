'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const configMapPath = path.resolve(__dirname, '../../src/mcp/runtime/runtime-config-map.js');

describe('runtime-config-map', () => {
  it('discovers runtimes from platforms/ directory', () => {
    const { getRuntimeConfig } = require(configMapPath);

    const expected = ['antigravity', 'claude', 'codex', 'qwen'];
    for (const name of expected) {
      const config = getRuntimeConfig(name);
      assert.equal(config.name, name, `Expected config.name to be '${name}'`);
    }
  });

  it('lists runtime names alphabetically, so antigravity is the first discovered runtime', () => {
    const { RUNTIME_NAMES } = require(configMapPath);
    assert.deepEqual(RUNTIME_NAMES, ['antigravity', 'claude', 'codex', 'qwen']);
  });

  it('no longer discovers a gemini runtime', () => {
    const { RUNTIME_NAMES, getRuntimeConfig } = require(configMapPath);
    assert.equal(RUNTIME_NAMES.includes('gemini'), false);
    assert.throws(
      () => getRuntimeConfig('gemini'),
      /Unknown runtime config: gemini/
    );
  });

  it('getRuntimeConfig returns the platform runtime-config module', () => {
    const { getRuntimeConfig } = require(configMapPath);
    assert.equal(
      getRuntimeConfig('codex'),
      require('../../src/platforms/codex/runtime-config')
    );
  });

  it('throws for unknown runtime names', () => {
    const { getRuntimeConfig } = require(configMapPath);
    assert.throws(
      () => getRuntimeConfig('nonexistent'),
      /Unknown runtime config/
    );
  });

  it('throws for a missing runtime name', () => {
    const { getRuntimeConfig } = require(configMapPath);
    assert.throws(
      () => getRuntimeConfig(undefined),
      /Unknown runtime config: undefined/
    );
  });
});
