import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAUDE_LOCAL_PLUGIN_DIR,
  CLAUDE_LOCAL_BUNDLE_DIR,
  PROMOTED_CONTENT_COPY_MAP,
  buildPromotedPluginManifestFiles,
} from '../../src/platforms/claude/local-plugin-layout.js';

import { buildMetadataContext } from '../../src/platforms/metadata-shared.js';

const PACKAGE_FIXTURE = {
  name: '@example/maestro',
  version: '1.2.3',
  author: { name: 'A', email: 'a@example.com', url: 'https://example.com' },
  homepage: 'https://example.com',
  repository: { url: 'https://github.com/example/maestro.git' },
  license: 'Apache-2.0',
};

describe('claude local plugin layout contract', () => {
  it('defines the plugin dir and bundle dir names', () => {
    assert.equal(CLAUDE_LOCAL_PLUGIN_DIR, 'claude-plugin');
    assert.equal(CLAUDE_LOCAL_BUNDLE_DIR, 'src');
  });

  it('promotes claude/ content subdirs to plugin-root-level dirs', () => {
    assert.deepEqual(
      PROMOTED_CONTENT_COPY_MAP.map((entry) => [entry.from, entry.to]),
      [
        ['claude/agents', 'agents'],
        ['claude/skills', 'skills'],
        ['claude/scripts', 'scripts'],
        ['claude/mcp', 'mcp'],
      ]
    );
  });

  it('builds the three plugin-root-relative manifest files', () => {
    const files = buildPromotedPluginManifestFiles(buildMetadataContext(PACKAGE_FIXTURE));
    const byPath = new Map(files.map((file) => [file.relPath, file.content]));
    assert.deepEqual(
      [...byPath.keys()].sort(),
      ['.claude-plugin/plugin.json', '.mcp.json', 'hooks/claude-hooks.json']
    );

    const manifest = JSON.parse(byPath.get('.claude-plugin/plugin.json'));
    assert.equal(manifest.mcpServers, './.mcp.json');
    assert.equal(manifest.hooks, './hooks/claude-hooks.json');

    const mcp = JSON.parse(byPath.get('.mcp.json'));
    assert.deepEqual(mcp.mcpServers.maestro.args, ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js']);

    const hooks = byPath.get('hooks/claude-hooks.json');
    assert.ok(hooks.includes('${CLAUDE_PLUGIN_ROOT}/scripts/hook-runner.js'));
    assert.ok(!hooks.includes('/claude/scripts/'));
  });
});
