import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PACKAGE_MCP_SERVER,
  RUNTIME_CONTENT_ROOT,
  RUNTIME_DEFINITIONS,
  getRuntimeConfig,
  getRuntimeDefinition,
  listRuntimeDefinitions,
  metadataOutputPaths,
  requireRuntimeDefinition,
} from '../../dist/src/platforms/runtime-declarations.js';
import { EXPECTED_RUNTIME_NAMES } from '../support/contracts.js';

describe('runtime definitions', () => {
  it('covers the literal supported runtime matrix exactly once', () => {
    assert.deepEqual(
      listRuntimeDefinitions().map((runtime) => runtime.name).sort(),
      EXPECTED_RUNTIME_NAMES
    );
    assert.deepEqual(Object.keys(RUNTIME_DEFINITIONS).sort(), EXPECTED_RUNTIME_NAMES);
    assert.ok(Object.isFrozen(listRuntimeDefinitions()));
  });

  it('joins each runtime name, typed config, metadata, and positive payload facts', () => {
    for (const definition of listRuntimeDefinitions()) {
      assert.equal(definition.config.name, definition.name);
      assert.equal(getRuntimeDefinition(definition.name), definition);
      assert.equal(requireRuntimeDefinition(definition.name), definition);
      assert.equal(getRuntimeConfig(definition.name), definition.config);
    }
  });

  it('returns null or exact lookup errors for unknown runtimes', () => {
    assert.equal(getRuntimeDefinition('unknown'), null);
    assert.throws(() => getRuntimeConfig('unknown'), /Unknown runtime config: unknown/);
  });

  it('centralizes package MCP startup and content root constants', () => {
    assert.deepEqual(PACKAGE_MCP_SERVER.args, ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server']);
    assert.equal(PACKAGE_MCP_SERVER.entrypoint, 'dist/src/bin/maestro-mcp-server.js');
    assert.deepEqual(RUNTIME_CONTENT_ROOT, { provider: 'registry', srcRoot: 'dist/src' });
  });

  it('drives metadata output paths', () => {
    assert.deepEqual(metadataOutputPaths(), [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'qwen-extension.json',
    ]);
  });

  it('has no runtime dependency on tooling policy', () => {
    const source = fs.readFileSync(new URL('../../src/platforms/runtime-declarations.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /tooling\//);
    assert.doesNotMatch(source, /artifact-policy/);
  });

  it('removes filesystem and dynamic runtime discovery', () => {
    for (const relativePath of [
      'mcp/runtime/runtime-config-map.ts',
      'platforms/metadata.ts',
      'platforms/runtime-descriptor.ts',
      'tooling/generate.ts',
    ]) {
      const source = fs.readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /readdirSync\([^)]*platforms/);
      assert.doesNotMatch(source, /import\(pathToFileURL\([^)]*runtime-config/);
    }
  });
});
