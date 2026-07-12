import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as runtimeConfigMap from '../../dist/src/mcp/runtime/runtime-config-map.js';

describe('runtime-config-map', () => {
  it('resolves every supported runtime from the static catalog', () => {
    const { getRuntimeConfig } = runtimeConfigMap;

    const expected = ['claude', 'codex', 'gemini', 'qwen'];
    for (const name of expected) {
      const config = getRuntimeConfig(name);
      assert.equal(config.name, name, `Expected config.name to be '${name}'`);
    }
  });

  it('getDefaultRuntimeConfig respects MAESTRO_RUNTIME env var', () => {
    const original = process.env.MAESTRO_RUNTIME;
    try {
      process.env.MAESTRO_RUNTIME = 'codex';
      const config = runtimeConfigMap.getDefaultRuntimeConfig();
      assert.equal(config.name, 'codex');
    } finally {
      if (original !== undefined) {
        process.env.MAESTRO_RUNTIME = original;
      } else {
        delete process.env.MAESTRO_RUNTIME;
      }
    }
  });

  it('getDefaultRuntimeConfig explicitly falls back to Claude without an env var', () => {
    const original = process.env.MAESTRO_RUNTIME;
    try {
      delete process.env.MAESTRO_RUNTIME;
      const config = runtimeConfigMap.getDefaultRuntimeConfig();
      assert.equal(config.name, 'claude', 'Expected explicit Claude fallback');
    } finally {
      if (original !== undefined) {
        process.env.MAESTRO_RUNTIME = original;
      } else {
        delete process.env.MAESTRO_RUNTIME;
      }
    }
  });

  it('does not export listRuntimeConfigs', () => {
    assert.equal(
      runtimeConfigMap.listRuntimeConfigs,
      undefined,
      'listRuntimeConfigs should not be exported'
    );
  });

  it('throws for unknown runtime names', () => {
    const { getRuntimeConfig } = runtimeConfigMap;
    assert.throws(
      () => getRuntimeConfig('nonexistent'),
      /Unknown runtime config/
    );
  });

  it('normalizeRuntimeConfig handles string, object, and falsy inputs', () => {
    const { normalizeRuntimeConfig } = runtimeConfigMap;

    const fromString = normalizeRuntimeConfig('claude');
    assert.equal(fromString.name, 'claude');

    const fromObject = normalizeRuntimeConfig({ name: 'test-runtime', tools: {} });
    assert.equal(fromObject.name, 'test-runtime');

    const fromKnownObject = normalizeRuntimeConfig({
      name: 'gemini',
      env: { extensionPath: 'TEST_EXTENSION_PATH' },
    });
    assert.equal(fromKnownObject.name, 'gemini');
    assert.equal(fromKnownObject.env.extensionPath, 'TEST_EXTENSION_PATH');
    assert.equal(fromKnownObject.features.mcpStateContract, true);
    assert.equal(fromKnownObject.tools.read_file, 'read_file');

    const fromFalsy = normalizeRuntimeConfig(null);
    assert.ok(fromFalsy.name, 'Expected fallback to default runtime');
  });
});
