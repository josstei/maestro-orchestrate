import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.js';
import { expandManifest, assertNoMirroredSharedOutputs } from '../../dist/src/tooling/generate.js';
import manifestRules from '../../dist/src/manifest.js';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';

describe('src-first architecture invariants', () => {
  it('does not ship a detached src payload for Claude installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'claude/src')),
      false,
      'Expected duplicate Claude src payload to be absent'
    );
  });

  it('does not ship a detached src payload for Codex installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/src')),
      false,
      'Expected duplicate Codex src payload to be absent'
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

  it('keeps content policy out of runtime configs', () => {
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
