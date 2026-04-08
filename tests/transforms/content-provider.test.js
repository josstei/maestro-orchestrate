const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentProvider } = require('../../src/mcp/content/provider');
const { RESOURCE_ALLOWLIST } = require('../../src/mcp/content/runtime-content');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');

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
  it('reads filesystem-backed canonical content for claude', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-claude-'));

    writeFilesystemResource(
      root,
      'delegation',
      '---\nname: delegation\ndescription: Filesystem copy\n---\nFilesystem content.\n'
    );
    const result = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('claude'), path.join(root, 'src'));
      return provider.readResource('delegation');
    });

    assert.ok(result.content.includes('Filesystem content.'));
    assert.ok(result.content.includes('user-invocable: false'));
  });

  it('reads filesystem-backed canonical agent and resource content for codex', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-codex-'));

    writeFilesystemResource(root, 'delegation', 'Filesystem content.\n');
    writeFilesystemAgent(
      root,
      'coder',
      '---\nname: coder\ntools: [read_file]\n---\nFilesystem agent body.\n'
    );
    const { resourceResult, agentResult } = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('codex'), path.join(root, 'src'));
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.content, 'Filesystem content.\n');
    assert.equal(agentResult.agent.body, 'Filesystem agent body.\n');
    assert.deepEqual(agentResult.agent.tools, ['direct file reads']);
  });

  it('returns filesystem read errors when codex exhausts its configured content sources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-empty-'));
    const { resourceResult, agentResult } = withExtensionRoot(root, () => {
      const provider = createContentProvider(getRuntimeConfig('codex'), path.join(root, 'src'));
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.error, 'Failed to read resource "delegation": ENOENT');
    assert.equal(agentResult.error, 'Failed to read agent "coder": ENOENT');
  });
});
