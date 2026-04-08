const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentProvider } = require('../../src/lib/mcp/content/provider');
const {
  RESOURCE_ALLOWLIST,
} = require('../../src/lib/mcp/content/runtime-content');
const { getRuntimeConfig } = require('../../src/lib/mcp/runtime/runtime-config-map');

function withExtensionRoot(root, fn) {
  const previous = process.env.MAESTRO_EXTENSION_PATH;
  process.env.MAESTRO_EXTENSION_PATH = root;
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.MAESTRO_EXTENSION_PATH;
    } else {
      process.env.MAESTRO_EXTENSION_PATH = previous;
    }
  }
}

function writeModule(filePath, exportName, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `'use strict';\n\nconst ${exportName} = ${JSON.stringify(value, null, 2)};\n\nmodule.exports = { ${exportName} };\n`,
    'utf8'
  );
}

function writeResourceRegistry(root, resources) {
  writeModule(
    path.join(root, 'lib', 'mcp', 'generated', 'resource-registry.js'),
    'RESOURCE_REGISTRY',
    resources
  );
}

function writeAgentRegistry(root, agents) {
  writeModule(
    path.join(root, 'lib', 'mcp', 'generated', 'agent-registry.js'),
    'AGENT_REGISTRY',
    agents
  );
}

function writeFilesystemResource(root, id, content) {
  const relativePath = RESOURCE_ALLOWLIST[id];
  fs.mkdirSync(path.join(root, 'src', path.dirname(relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', relativePath), content, 'utf8');
}

function writeFilesystemAgent(root, agentName, content) {
  const agentPath = path.join(root, 'src', 'agents', `${agentName}.md`);
  fs.mkdirSync(path.dirname(agentPath), { recursive: true });
  fs.writeFileSync(agentPath, content, 'utf8');
}

describe('content provider runtime policy', () => {
  it('keeps filesystem-only runtimes on canonical source even when registries exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-claude-'));

    writeFilesystemResource(
      root,
      'delegation',
      '---\nname: delegation\ndescription: Filesystem copy\n---\nFilesystem content.\n'
    );
    writeResourceRegistry(root, {
      delegation: 'Registry content.\n',
    });

    const result = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('claude'), 'src');
      return provider.readResource('delegation');
    });

    assert.ok(result.content.includes('Filesystem content.'));
    assert.ok(result.content.includes('user-invocable: false'));
    assert.ok(!result.content.includes('Registry content.'));
  });

  it('uses bundled registries first for codex when both sources are available', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-codex-registry-'));

    writeFilesystemResource(root, 'delegation', 'Filesystem content.\n');
    writeFilesystemAgent(
      root,
      'coder',
      '---\nname: coder\ntools: [read_file]\n---\nFilesystem agent body.\n'
    );
    writeResourceRegistry(root, {
      delegation: 'Registry content.\n',
    });
    writeAgentRegistry(root, {
      coder: {
        body: 'Registry agent body.\n',
        tools: ['direct file reads'],
      },
    });

    const { resourceResult, agentResult } = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('codex'), 'src');
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.content, 'Registry content.\n');
    assert.equal(agentResult.agent.body, 'Registry agent body.\n');
    assert.deepEqual(agentResult.agent.tools, ['direct file reads']);
  });

  it('falls back to filesystem for codex when bundled registries are unavailable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-codex-filesystem-'));

    writeFilesystemResource(root, 'delegation', 'Filesystem content.\n');
    writeFilesystemAgent(
      root,
      'coder',
      '---\nname: coder\ntools: [read_file, write_file]\n---\nFilesystem agent body.\n'
    );

    const { resourceResult, agentResult } = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('codex'), 'src');
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.content, 'Filesystem content.\n');
    assert.equal(agentResult.agent.body, 'Filesystem agent body.\n');
    assert.deepEqual(agentResult.agent.tools, ['direct file reads', 'apply_patch']);
  });

  it('returns filesystem read errors when codex exhausts its configured content sources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-empty-'));
    const { resourceResult, agentResult } = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('codex'), 'src');
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.error, 'Failed to read resource "delegation": ENOENT');
    assert.equal(agentResult.error, 'Failed to read agent "coder": ENOENT');
  });
});
