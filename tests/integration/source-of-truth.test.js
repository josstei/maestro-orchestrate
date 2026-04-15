const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');
const { expandManifest, assertNoMirroredSharedOutputs } = require('../../scripts/generate');
const manifestRules = require('../../src/manifest');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');

describe('src-first architecture invariants', () => {
  it('ships a detached src payload for Claude isolated installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'claude/src/mcp/maestro-server.js')),
      true,
      'Expected detached Claude src payload to exist'
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, 'claude/src/version.json')),
      true,
      'Expected detached Claude src payload version metadata to exist'
    );
  });

  it('ships a detached src payload for Codex isolated installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/src/mcp/maestro-server.js')),
      true,
      'Expected detached Codex src payload to exist'
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/src/version.json')),
      true,
      'Expected detached Codex src payload version metadata to exist'
    );
  });

  it('does not ship Codex agent stubs (Codex uses skills, not agent files)', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/agents')),
      false,
      'Expected plugins/maestro/agents/ to not exist'
    );
  });

  it('removes mirrored runtime lib trees and generated MCP core artifacts', () => {
    const forbiddenPaths = [
      'lib',
      'claude/lib',
      'plugins/maestro/lib',
      'mcp/maestro-server-core.js',
      'claude/mcp/maestro-server-core.js',
      'plugins/maestro/mcp/maestro-server-core.js',
      'src/mcp/maestro-server-core.js',
      'src/mcp/server-core-entry.js',
    ];

    for (const relativePath of forbiddenPaths) {
      assert.equal(
        fs.existsSync(path.join(ROOT, relativePath)),
        false,
        `Did not expect ${relativePath} to exist in src-first mode`
      );
    }
  });

  it('keeps all runtime content policies filesystem-first with no registry fallback', () => {
    for (const runtimeName of ['gemini', 'claude', 'codex', 'qwen']) {
      const runtimeConfig = getRuntimeConfig(runtimeName);
      assert.equal(runtimeConfig.content.primary, 'filesystem');
      assert.equal(runtimeConfig.content.fallback, 'none');
    }
  });

  it('rejects manifest outputs that reintroduce mirrored shared code', () => {
    const runtimes = {
      gemini: getRuntimeConfig('gemini'),
      claude: getRuntimeConfig('claude'),
      codex: getRuntimeConfig('codex'),
      qwen: getRuntimeConfig('qwen'),
    };

    const manifest = expandManifest(manifestRules, runtimes, path.join(ROOT, 'src'));
    assert.doesNotThrow(() => assertNoMirroredSharedOutputs(manifest));
  });
});
