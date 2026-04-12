'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const configMapPath = path.resolve(__dirname, '../../src/mcp/runtime/runtime-config-map.js');

describe('runtime-config-map', () => {
  it('discovers runtimes from platforms/ directory', () => {
    const { getRuntimeConfig } = require(configMapPath);

    const expected = ['claude', 'codex', 'gemini'];
    for (const name of expected) {
      const config = getRuntimeConfig(name);
      assert.equal(config.name, name, `Expected config.name to be '${name}'`);
    }
  });

  it('getDefaultRuntimeConfig respects MAESTRO_RUNTIME env var', () => {
    const original = process.env.MAESTRO_RUNTIME;
    try {
      process.env.MAESTRO_RUNTIME = 'codex';
      delete require.cache[configMapPath];
      const { getDefaultRuntimeConfig } = require(configMapPath);
      const config = getDefaultRuntimeConfig();
      assert.equal(config.name, 'codex');
    } finally {
      if (original !== undefined) {
        process.env.MAESTRO_RUNTIME = original;
      } else {
        delete process.env.MAESTRO_RUNTIME;
      }
      delete require.cache[configMapPath];
      require(configMapPath);
    }
  });

  it('getDefaultRuntimeConfig falls back to first discovered runtime without env var', () => {
    const original = process.env.MAESTRO_RUNTIME;
    try {
      delete process.env.MAESTRO_RUNTIME;
      delete require.cache[configMapPath];
      const { getDefaultRuntimeConfig } = require(configMapPath);
      const config = getDefaultRuntimeConfig();
      assert.equal(config.name, 'claude', 'Expected fallback to first alphabetical runtime');
    } finally {
      if (original !== undefined) {
        process.env.MAESTRO_RUNTIME = original;
      } else {
        delete process.env.MAESTRO_RUNTIME;
      }
      delete require.cache[configMapPath];
      require(configMapPath);
    }
  });

  it('does not export listRuntimeConfigs', () => {
    const exports = require(configMapPath);
    assert.equal(
      exports.listRuntimeConfigs,
      undefined,
      'listRuntimeConfigs should not be exported'
    );
  });

  it('throws for unknown runtime names', () => {
    const { getRuntimeConfig } = require(configMapPath);
    assert.throws(
      () => getRuntimeConfig('nonexistent'),
      /Unknown runtime config/
    );
  });

  it('normalizeRuntimeConfig handles string, object, and falsy inputs', () => {
    const { normalizeRuntimeConfig } = require(configMapPath);

    const fromString = normalizeRuntimeConfig('claude');
    assert.equal(fromString.name, 'claude');

    const fromObject = normalizeRuntimeConfig({ name: 'test-runtime', tools: {} });
    assert.equal(fromObject.name, 'test-runtime');

    const fromFalsy = normalizeRuntimeConfig(null);
    assert.ok(fromFalsy.name, 'Expected fallback to default runtime');
  });
});
