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
  writeFilesystemResourceAt(path.join(root, 'src'), id, content);
}

function writeFilesystemResourceAt(srcRoot, id, content) {
  const relativePath = RESOURCE_ALLOWLIST[id];
  fs.mkdirSync(path.join(srcRoot, path.dirname(relativePath)), { recursive: true });
  fs.writeFileSync(path.join(srcRoot, relativePath), content, 'utf8');
}

function writeFilesystemAgent(root, agentName, content) {
  writeFilesystemAgentAt(path.join(root, 'src'), agentName, content);
}

function writeFilesystemAgentAt(srcRoot, agentName, content) {
  const agentPath = path.join(srcRoot, 'agents', `${agentName}.md`);
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

  it('does not fall back from a missing Claude content root to sibling source content', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-claude-no-fallback-'));
    const retiredClaudeSrc = path.join(root, 'claude', 'src');

    writeFilesystemResource(root, 'delegation', 'Package-root source content.\n');
    writeFilesystemAgent(
      root,
      'coder',
      '---\nname: coder\ntools: [read_file]\n---\nPackage-root source agent body.\n'
    );

    const { resourceResult, agentResult } = withExtensionRoot(path.join(root, 'claude'), () => {
      const provider = createContentProvider(getRuntimeConfig('claude'), retiredClaudeSrc);
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.error, 'Failed to read resource "delegation": ENOENT');
    assert.equal(agentResult.error, 'Failed to read agent "coder": ENOENT');
  });

  it('createContentProvider always returns the filesystem provider', () => {
    const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-filesystem-only-'));
    const provider = createContentProvider({ name: 'gemini' }, srcRoot);
    assert.equal(provider.name, 'filesystem');
    assert.equal(provider.srcRoot, path.resolve(srcRoot));
  });

  it('provider module no longer exports content-policy plumbing', () => {
    const mod = require('../../src/mcp/content/provider');
    assert.equal(mod.normalizeContentPolicy, undefined);
    assert.equal(mod.createContentSourceSpecs, undefined);
  });

  it('does not fall back when Claude package-root content is unreadable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-provider-claude-corrupt-'));
    const sourceRoot = path.join(root, 'src');
    const detachedSkillPath = path.join(
      sourceRoot,
      'skills',
      'shared',
      'delegation',
      'SKILL.md'
    );
    const detachedAgentPath = path.join(sourceRoot, 'agents', 'coder.md');

    fs.mkdirSync(detachedSkillPath, { recursive: true });
    fs.mkdirSync(detachedAgentPath, { recursive: true });

    const { resourceResult, agentResult } = withExtensionRoot(path.join(root, 'claude'), () => {
      const provider = createContentProvider(getRuntimeConfig('claude'), sourceRoot);
      return {
        resourceResult: provider.readResource('delegation'),
        agentResult: provider.readAgent('coder'),
      };
    });

    assert.equal(resourceResult.error, 'Failed to read resource "delegation": EISDIR');
    assert.equal(agentResult.error, 'Failed to read agent "coder": EISDIR');
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
