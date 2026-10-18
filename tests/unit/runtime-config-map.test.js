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

  it('lists runtime names alphabetically', () => {
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

describe('findRuntimeConfigForClient', () => {
  it('maps every MCP client name a runtime declares back to that runtime and no other', () => {
    const { RUNTIME_NAMES, getRuntimeConfig, findRuntimeConfigForClient } = require(configMapPath);

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
    const { findRuntimeConfigForClient } = require(configMapPath);

    // Observed from Claude Code 2.1.303, Codex 0.163.0, Qwen Code 0.25.2 and
    // the Antigravity CLI 1.4.2.
    assert.equal(findRuntimeConfigForClient({ name: 'claude-code', version: '2.1.303' }).name, 'claude');
    assert.equal(findRuntimeConfigForClient({ name: 'antigravity-client', version: 'v1.0.0' }).name, 'antigravity');
    assert.equal(findRuntimeConfigForClient({ name: 'codex-mcp-client', title: 'Codex', version: '0.163.0' }).name, 'codex');
    // Qwen Code suffixes the server's key in mcpServers.
    for (const name of ['qwen-cli-mcp-client-maestro', 'qwen-cli-mcp-client-orchestrator']) {
      assert.equal(findRuntimeConfigForClient({ name, version: '0.0.1' }).name, 'qwen', name);
    }
  });

  it('identifies no runtime for an unknown, empty or missing client name', () => {
    const { findRuntimeConfigForClient } = require(configMapPath);

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
