'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildPlatformMetadataOutputs } = require('../../src/platforms/metadata');

const PACKAGE_FIXTURE = {
  name: '@example/maestro',
  version: '9.8.7-preview.abc1234',
  author: {
    name: 'Example Author',
    email: 'hello@example.com',
    url: 'https://example.com',
  },
  homepage: 'https://example.com/maestro',
  repository: {
    type: 'git',
    url: 'https://github.com/example/maestro.git',
  },
  license: 'Apache-2.0',
};

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [output.outputPath, JSON.parse(output.content)]));
}

describe('platform metadata generation', () => {
  it('generates all runtime metadata from package identity', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs({
      claude: {},
      codex: {},
      gemini: {},
      qwen: {},
    }, PACKAGE_FIXTURE));

    const expectedPaths = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'claude/.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'qwen-extension.json',
    ];

    assert.deepEqual([...outputs.keys()].sort(), expectedPaths);
    assert.equal(outputs.get('gemini-extension.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('qwen-extension.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('claude/.claude-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(
      outputs.get('plugins/maestro/.mcp.json').mcpServers.maestro.args[2],
      `${PACKAGE_FIXTURE.name}@${PACKAGE_FIXTURE.version}`
    );
  });

  it('generates only metadata for enabled runtimes', () => {
    const outputs = buildPlatformMetadataOutputs({ codex: {} }, PACKAGE_FIXTURE);

    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      [
        '.agents/plugins/marketplace.json',
        'plugins/maestro/.codex-plugin/plugin.json',
        'plugins/maestro/.mcp.json',
      ]
    );
  });
});
