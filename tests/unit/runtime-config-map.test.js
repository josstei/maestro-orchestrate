'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { HOST_CLIENTS } = require('../support/host-clients');
const {
  RUNTIME_NAMES,
  getRuntimeConfig,
  findRuntimeConfigForClient,
} = require('../../src/platforms/runtime-config-map');

describe('runtime-config-map', () => {
  it('discovers runtimes from platforms/ directory', () => {
    const expected = ['antigravity', 'claude', 'codex', 'qwen'];
    for (const name of expected) {
      const config = getRuntimeConfig(name);
      assert.equal(config.name, name, `Expected config.name to be '${name}'`);
    }
  });

  it('lists runtime names alphabetically', () => {
    assert.deepEqual(RUNTIME_NAMES, ['antigravity', 'claude', 'codex', 'qwen']);
  });

  it('no longer discovers a gemini runtime', () => {
    assert.equal(RUNTIME_NAMES.includes('gemini'), false);
    assert.throws(
      () => getRuntimeConfig('gemini'),
      /Unknown runtime config: gemini/
    );
  });

  it('getRuntimeConfig returns the platform runtime-config module', () => {
    assert.equal(
      getRuntimeConfig('codex'),
      require('../../src/platforms/codex/runtime-config')
    );
  });

  it('throws for unknown runtime names', () => {
    assert.throws(
      () => getRuntimeConfig('nonexistent'),
      /Unknown runtime config/
    );
  });

  it('throws for a missing runtime name', () => {
    assert.throws(
      () => getRuntimeConfig(undefined),
      /Unknown runtime config: undefined/
    );
  });
});

describe('findRuntimeConfigForClient', () => {
  it('maps every MCP client name a runtime declares back to that runtime and no other', () => {
    for (const runtimeName of RUNTIME_NAMES) {
      const { mcpClientNames } = getRuntimeConfig(runtimeName);
      assert.ok(Array.isArray(mcpClientNames) && mcpClientNames.length > 0, `${runtimeName} declares no mcpClientNames`);
      for (const pattern of mcpClientNames) {
        const clientName = pattern.replace(/\*$/, 'maestro');
        assert.equal(findRuntimeConfigForClient({ name: clientName, version: '1.0.0' }).name, runtimeName, clientName);
        for (const other of RUNTIME_NAMES.filter((name) => name !== runtimeName)) {
          for (const otherPattern of getRuntimeConfig(other).mcpClientNames) {
            const prefix = otherPattern.replace(/\*$/, '');
            assert.ok(
              !clientName.startsWith(prefix) && !prefix.startsWith(pattern.replace(/\*$/, '')),
              `${runtimeName} ${pattern} overlaps ${other} ${otherPattern}`
            );
          }
        }
      }
    }
  });

  it('identifies the hosts by the clientInfo.name they send in initialize', () => {
    assert.deepEqual(Object.keys(HOST_CLIENTS).sort(), RUNTIME_NAMES);
    for (const [runtime, clientInfo] of Object.entries(HOST_CLIENTS)) {
      assert.equal(findRuntimeConfigForClient(clientInfo).name, runtime, clientInfo.name);
    }
    // Qwen Code suffixes the server's key in mcpServers, so another key still identifies it.
    const name = 'qwen-cli-mcp-client-orchestrator';
    assert.equal(findRuntimeConfigForClient({ name, version: '0.0.1' }).name, 'qwen', name);
  });

  it('identifies no runtime for an unknown, empty or missing client name', () => {
    for (const clientInfo of [
      { name: 'maestro-test' },
      { name: 'Claude-Code' },
      { name: 'claude-code-extra' },
      { name: 'qwen-cli-mcp-client' },
      { name: 'gemini-cli-mcp-client-maestro' },
      { name: '' },
      { name: 7 },
      {},
      null,
      undefined,
    ]) {
      assert.equal(findRuntimeConfigForClient(clientInfo), null, JSON.stringify(clientInfo));
    }
  });
});
