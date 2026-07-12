import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClaudeLocalMcpConfig,
  buildClaudeLocalPluginManifest,
  buildMetadataOutputs,
} from '../../dist/src/platforms/claude/metadata.js';

import { buildMetadataContext } from '../../dist/src/platforms/metadata-shared.js';

const PACKAGE_FIXTURE = {
  name: '@example/maestro',
  version: '9.8.7-preview.abc1234',
  author: { name: 'Example Author', email: 'hello@example.com', url: 'https://example.com' },
  homepage: 'https://example.com/maestro',
  repository: { type: 'git', url: 'https://github.com/example/maestro.git' },
  license: 'Apache-2.0',
};

describe('claude promoted (local) plugin metadata', () => {
  it('emits an mcp config rooted at the plugin dir, not a nested claude/ path', () => {
    const config = buildClaudeLocalMcpConfig();
    assert.equal(config.mcpServers.maestro.command, 'node');
    assert.deepEqual(config.mcpServers.maestro.args, ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js']);
    assert.equal(config.mcpServers.maestro.cwd, '${CLAUDE_PLUGIN_ROOT}');
    assert.ok(
      !JSON.stringify(config).includes('/claude/mcp/'),
      'promoted mcp path must not contain a nested claude/ segment'
    );
  });

  it('emits a plugin manifest whose hooks and mcpServers are plugin-root-relative', () => {
    const context = buildMetadataContext(PACKAGE_FIXTURE);
    const manifest = buildClaudeLocalPluginManifest(context);
    assert.equal(manifest.name, 'maestro');
    assert.equal(manifest.version, PACKAGE_FIXTURE.version);
    assert.equal(manifest.hooks, './hooks/claude-hooks.json');
    assert.equal(manifest.mcpServers, './.mcp.json');
    assert.equal(manifest.license, 'Apache-2.0');
    assert.deepEqual(manifest.author, {
      name: 'Example Author',
      email: 'hello@example.com',
      url: 'https://example.com',
    });
    assert.ok(
      !JSON.stringify(manifest).includes('/claude/'),
      'promoted manifest must not reference a nested claude/ path'
    );
  });

  it('keeps promoted builders out of the generated metadata output set (no generator drift)', () => {
    const outputs = buildMetadataOutputs(buildMetadataContext(PACKAGE_FIXTURE));
    const paths = outputs.map((output) => output.outputPath);
    assert.ok(paths.includes('.claude-plugin/plugin.json'));
    assert.ok(paths.includes('claude/.mcp.json'));
    assert.ok(
      !paths.some((path) => path.startsWith('claude/.claude-plugin/')),
      'promoted plugin files must never be written into the repo tree by generate'
    );
  });
});
