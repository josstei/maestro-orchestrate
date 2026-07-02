const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');
const { expandManifest, assertNoMirroredSharedOutputs } = require('../../scripts/generate');
const manifestRules = require('../../src/manifest');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');

describe('src-first architecture invariants', () => {
  it('does not ship a detached src payload for Claude installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'claude/src')),
      false,
      'Expected retired Claude src payload to be absent'
    );
  });

  it('does not ship a detached src payload for Codex installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/src')),
      false,
      'Expected retired Codex src payload to be absent'
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

  it('does not carry retired content-policy config on runtime configs', () => {
    for (const runtimeName of ['gemini', 'claude', 'codex', 'qwen']) {
      const runtimeConfig = getRuntimeConfig(runtimeName);
      assert.equal(runtimeConfig.content, undefined);
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
