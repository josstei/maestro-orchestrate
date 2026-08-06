import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatformMetadataOutputs } from '../../dist/src/platforms/metadata.js';
import { buildSettings } from '../../dist/src/platforms/metadata-shared.js';
import { listRuntimeDefinitions } from '../../dist/src/platforms/runtime-declarations.js';
import { SETTINGS_SCHEMA, SETTING_NAMES } from '../../dist/src/config/settings-schema.js';
import { readFileSync } from 'node:fs';

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
  it('projects exactly the seven extension-visible setting descriptors', () => {
    const expected = SETTING_NAMES
      .filter((envVar) => SETTINGS_SCHEMA[envVar].presentation.extensionVisible)
      .map((envVar) => ({
        name: SETTINGS_SCHEMA[envVar].presentation.label,
        description: SETTINGS_SCHEMA[envVar].presentation.description,
        envVar,
      }));

    assert.equal(expected.length, 7);
    assert.deepEqual(buildSettings(), expected);
    for (const hidden of [
      'MAESTRO_ARCHIVE_RETENTION',
      'MAESTRO_KNOWLEDGE_DIR',
      'MAESTRO_MEMORY_INJECTION',
    ]) {
      assert.equal(buildSettings().some((setting) => setting.envVar === hidden), false);
    }
  });

  it('generates all runtime metadata from package identity', async () => {
    const outputs = outputsByPath(await buildPlatformMetadataOutputs(
      listRuntimeDefinitions(),
      PACKAGE_FIXTURE
    ));

    const expectedPaths = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'agy-extension.json',
      'claude/.mcp.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'qwen-extension.json',
    ];

    assert.deepEqual([...outputs.keys()].sort(), expectedPaths);
    assert.equal(outputs.get('gemini-extension.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('qwen-extension.json').version, PACKAGE_FIXTURE.version);
    assert.deepEqual(outputs.get('gemini-extension.json').settings, buildSettings());
    assert.deepEqual(outputs.get('qwen-extension.json').settings, buildSettings());
    assert.equal(
      outputs.get('gemini-extension.json').mcpServers.maestro.env.MAESTRO_RUNTIME,
      'gemini'
    );
    assert.equal(
      outputs.get('qwen-extension.json').mcpServers.maestro.env.MAESTRO_RUNTIME,
      'qwen'
    );
    assert.equal(
      outputs.get('claude/.mcp.json').mcpServers.maestro.env.MAESTRO_RUNTIME,
      'claude'
    );
    assert.equal(outputs.get('.claude-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(
      outputs.get('plugins/maestro/.mcp.json').mcpServers.maestro.args[2],
      `${PACKAGE_FIXTURE.name}@${PACKAGE_FIXTURE.version}`
    );
    assert.deepEqual(
      outputs.get('.claude-plugin/marketplace.json').plugins[0].source,
      {
        source: 'github',
        repo: 'josstei/maestro-orchestrate',
        ref: 'dist',
      }
    );
    assert.deepEqual(
      outputs.get('.agents/plugins/marketplace.json').plugins[0].source,
      {
        source: 'git-subdir',
        url: 'https://github.com/example/maestro.git',
        path: './plugins/maestro',
        ref: 'dist',
      }
    );
  });

  it('generates only metadata for enabled runtimes', async () => {
    const outputs = await buildPlatformMetadataOutputs(
      listRuntimeDefinitions().filter((definition) => definition.name === 'codex'),
      PACKAGE_FIXTURE
    );

    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      [
        '.agents/plugins/marketplace.json',
        'plugins/maestro/.codex-plugin/plugin.json',
        'plugins/maestro/.mcp.json',
      ]
    );
  });

  it('keeps generated extension manifests byte-identical', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const outputs = new Map((await buildPlatformMetadataOutputs(
      listRuntimeDefinitions(),
      pkg
    )).map((output) => [output.outputPath, output.content]));

    for (const outputPath of ['gemini-extension.json', 'qwen-extension.json']) {
      assert.equal(
        outputs.get(outputPath),
        readFileSync(new URL(`../../${outputPath}`, import.meta.url), 'utf8')
      );
    }
  });

  it('uses a static renderer dispatcher with no dynamic metadata imports', () => {
    const source = readFileSync(new URL('../../src/platforms/metadata.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /import\(pathToFileURL/);
    for (const runtime of ['claude', 'codex']) {
      assert.match(source, new RegExp(`./${runtime}/metadata\\.js`));
    }
    for (const runtime of ['gemini', 'qwen']) {
      assert.doesNotMatch(source, new RegExp(`./${runtime}/metadata\\.js`));
    }
  });
});
