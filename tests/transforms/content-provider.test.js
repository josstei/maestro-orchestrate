import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createContentProvider } from '../../dist/src/mcp/content/provider.js';
import * as contentProviderModule from '../../dist/src/mcp/content/provider.js';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';

import {
  makeTempSrcRoot,
  cleanupTempRoots,
  writeAgent as writeFilesystemAgentAt,
  writeResource as writeFilesystemResourceAt,
  withExtensionRoot,
} from '../support/content.js';

after(cleanupTempRoots);

function writeFilesystemResource(root, id, content) {
  return writeFilesystemResourceAt(path.join(root, 'src'), id, content);
}

function writeFilesystemAgent(root, agentName, content) {
  return writeFilesystemAgentAt(path.join(root, 'src'), agentName, content);
}

describe('content provider runtime policy', () => {
  it('reads filesystem-backed canonical content for claude', () => {
    const root = makeTempSrcRoot('maestro-provider-claude-');

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
    const root = makeTempSrcRoot('maestro-provider-claude-no-fallback-');
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
    const srcRoot = makeTempSrcRoot('maestro-provider-filesystem-only-');
    const provider = createContentProvider({ name: 'gemini' }, srcRoot);
    assert.equal(provider.name, 'filesystem');
    assert.equal(provider.srcRoot, path.resolve(srcRoot));
  });

  it('provider module no longer exports content-policy plumbing', () => {
    assert.equal(contentProviderModule.normalizeContentPolicy, undefined);
    assert.equal(contentProviderModule.createContentSourceSpecs, undefined);
  });

  it('does not fall back when Claude package-root content is unreadable', () => {
    const root = makeTempSrcRoot('maestro-provider-claude-corrupt-');
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
    const root = makeTempSrcRoot('maestro-provider-codex-');

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
    const root = makeTempSrcRoot('maestro-provider-empty-');
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
