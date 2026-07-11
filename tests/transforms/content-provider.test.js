import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib, { gzipSync } from 'node:zlib';
import { createContentProvider } from '../../dist/src/mcp/content/provider.js';
import * as contentProviderModule from '../../dist/src/mcp/content/provider.js';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';

import {
  makeTempSrcRoot,
  cleanupTempRoots,
  writeFileUnder,
  writeAgent as writeFilesystemAgentAt,
  writeResource as writeFilesystemResourceAt,
  withExtensionRoot,
} from '../support/content.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO_SRC = path.resolve(moduleDirname, '../../src');

after(cleanupTempRoots);

function writeFilesystemResource(root, id, content) {
  return writeFilesystemResourceAt(path.join(root, 'src'), id, content);
}

function writeFilesystemAgent(root, agentName, content) {
  return writeFilesystemAgentAt(path.join(root, 'src'), agentName, content);
}

function writeRuntimeContentRegistry(root, registry) {
  return writeFileUnder(
    path.join(root, 'src'),
    'generated/runtime-content-registry.json',
    `${JSON.stringify({ schemaVersion: 1, resources: {}, agents: {}, blueprints: {}, ...registry }, null, 2)}\n`
  );
}

function writePackedRuntimeContentRegistry(root, registry, payload) {
  const registryPath = writeRuntimeContentRegistry(root, {
    payload: 'runtime-content-registry.txt.gz',
    payloadEncoding: 'gzip',
    ...registry,
  });
  const payloadPath = path.join(
    root,
    'src',
    'generated',
    'runtime-content-registry.txt.gz'
  );
  fs.writeFileSync(payloadPath, gzipSync(payload));
  return { registryPath, payloadPath };
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

  it('createContentProvider returns the filesystem provider when no registry exists', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-filesystem-only-');
    const provider = createContentProvider({ name: 'gemini' }, srcRoot);
    assert.equal(provider.name, 'filesystem');
    assert.equal(provider.srcRoot, path.resolve(srcRoot));
    assert.match(provider.readResource('constructor').error, /^Unknown resource identifier/);
  });

  it('filesystem provider reads composed canonical agents when no registry exists', () => {
    const provider = createContentProvider(getRuntimeConfig('codex'), REPO_SRC);
    const result = provider.readAgent('accessibility-specialist');

    assert.equal(provider.name, 'filesystem');
    assert.equal(result.error, undefined);
    assert.ok(result.agent.body.includes('You are an **Accessibility Specialist**'));
    assert.ok(result.agent.tools.includes('direct file reads'));
  });

  it('createContentProvider returns the registry provider when a registry exists', () => {
    const root = makeTempSrcRoot('maestro-provider-registry-');
    const srcRoot = path.join(root, 'src');
    writeRuntimeContentRegistry(root, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'Registry content.\n',
        },
      },
      agents: {
        coder: {
          relativePath: 'agents/coder.md',
          content: '---\nname: coder\ntools: [read_file]\n---\nRegistry agent body.\n',
        },
      },
    });

    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    const resourceResult = provider.readResource('delegation');
    const agentResult = provider.readAgent('coder');

    assert.equal(provider.name, 'registry');
    assert.equal(provider.srcRoot, path.resolve(srcRoot));
    assert.equal(resourceResult.content, 'Registry content.\n');
    assert.equal(agentResult.agent.body, 'Registry agent body.\n');
    assert.deepEqual(agentResult.agent.tools, ['direct file reads']);
  });

  it('reads and decompresses packed content once per registry provider', (t) => {
    const root = makeTempSrcRoot('maestro-provider-packed-cache-');
    const srcRoot = path.join(root, 'src');
    const delegation = 'Packed delegation content.\n';
    const architecture = 'Packed architecture content.\n';
    const prefix = '😀';
    const payload = `${prefix}${delegation}${architecture}`;
    const { registryPath, payloadPath } = writePackedRuntimeContentRegistry(
      root,
      {
        resources: {
          delegation: [
            'skills/shared/delegation/SKILL.md',
            prefix.length,
            delegation.length,
          ],
          architecture: [
            'references/architecture.md',
            prefix.length + delegation.length,
            architecture.length,
          ],
        },
      },
      payload
    );
    const originalReadFileSync = fs.readFileSync;
    const originalGunzipSync = zlib.gunzipSync;
    let registryReads = 0;
    let payloadReads = 0;
    let decompressions = 0;

    t.mock.method(fs, 'readFileSync', function (...args) {
      const filePath = String(args[0]);
      if (filePath === registryPath) registryReads += 1;
      if (filePath === payloadPath) payloadReads += 1;
      return originalReadFileSync.apply(this, args);
    });
    t.mock.method(zlib, 'gunzipSync', function (...args) {
      decompressions += 1;
      return originalGunzipSync.apply(this, args);
    });

    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    const first = provider.readResource('delegation');
    const second = provider.readResource('architecture');
    const repeated = provider.readResource('delegation');

    assert.equal(first.content, delegation);
    assert.equal(second.content, architecture);
    assert.equal(repeated.content, delegation);
    assert.equal(registryReads, 1);
    assert.equal(payloadReads, 1);
    assert.equal(decompressions, 1);
  });

  it('caches content for one provider but observes mutations through a new provider', () => {
    const root = makeTempSrcRoot('maestro-provider-lifetime-');
    const srcRoot = path.join(root, 'src');
    writeRuntimeContentRegistry(root, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'First provider value.\n',
        },
      },
    });

    const firstProvider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    assert.equal(firstProvider.readResource('delegation').content, 'First provider value.\n');

    writeRuntimeContentRegistry(root, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'Second provider value.\n',
        },
      },
    });

    assert.equal(firstProvider.readResource('delegation').content, 'First provider value.\n');
    const secondProvider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    assert.equal(secondProvider.readResource('delegation').content, 'Second provider value.\n');
  });

  it('does not normalize post-read transform failures as registry read errors', () => {
    const root = makeTempSrcRoot('maestro-provider-transform-error-');
    const srcRoot = path.join(root, 'src');
    writeRuntimeContentRegistry(root, {
      resources: {
        architecture: {
          relativePath: 'references/architecture.md',
          content: '<!-- @feature unknown -->\ncontent\n<!-- @end-feature -->\n',
        },
      },
    });

    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    assert.throws(
      () => provider.readResource('architecture'),
      /Unknown feature flag: "unknown"/
    );
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
