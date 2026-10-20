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
  it('discovers the runtimes from platforms/ and lists them alphabetically', () => {
    assert.deepEqual(RUNTIME_NAMES, ['antigravity', 'claude', 'codex', 'qwen']);
    for (const name of RUNTIME_NAMES) {
      assert.equal(getRuntimeConfig(name).name, name, `Expected config.name to be '${name}'`);
    }
  });

  it('no longer discovers a gemini runtime', () => {
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
        assert.equal(findRuntimeConfigForClient(clientName).name, runtimeName, clientName);
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
      assert.equal(findRuntimeConfigForClient(clientInfo.name).name, runtime, clientInfo.name);
    }
    // Qwen Code suffixes the server's key in mcpServers, so another key still identifies it.
    const name = 'qwen-cli-mcp-client-orchestrator';
    assert.equal(findRuntimeConfigForClient(name).name, 'qwen', name);
  });

  it('identifies no runtime for an unknown, empty or missing client name', () => {
    for (const clientName of [
      'maestro-test',
      'Claude-Code',
      'claude-code-extra',
      'qwen-cli-mcp-client',
      'gemini-cli-mcp-client-maestro',
      '',
      null,
    ]) {
      assert.equal(findRuntimeConfigForClient(clientName), null, JSON.stringify(clientName));
    }
  });
});
