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
  writeRuntimeContentManifest,
  writeAgent,
  writeResource,
} from '../support/content.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO_SRC = path.resolve(moduleDirname, '../../src');

after(cleanupTempRoots);

function inline(relativePath, content) {
  return { kind: 'inline', relativePath, content };
}

function writeInlineManifest(srcRoot, registry) {
  return writeRuntimeContentManifest(srcRoot, {
    storage: 'inline',
    resources: {},
    agents: {},
    agentProfiles: {},
    blueprints: {},
    ...registry,
  });
}

function writePackedManifest(srcRoot, registry, payload) {
  const payloadName = 'runtime-content-registry.txt.gz';
  const manifestPath = writeRuntimeContentManifest(srcRoot, {
    storage: 'packed',
    payload: payloadName,
    payloadEncoding: 'gzip',
    resources: {},
    agents: {},
    agentProfiles: {},
    blueprints: {},
    ...registry,
  });
  const payloadPath = writeFileUnder(
    srcRoot,
    path.posix.join('generated', payloadName),
    gzipSync(payload)
  );
  return { manifestPath, payloadPath };
}

describe('content provider runtime policy', () => {
  it('uses one registry-named provider for live file-backed Claude content', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-file-');
    const filePath = writeResource(
      srcRoot,
      'delegation',
      '---\nname: delegation\ndescription: File copy\n---\nFirst value.\n'
    );
    const provider = createContentProvider(getRuntimeConfig('claude'), srcRoot);

    assert.equal(provider.name, 'registry');
    assert.ok(provider.readResource('delegation').content.includes('First value.'));
    assert.ok(provider.readResource('delegation').content.includes('user-invocable: false'));

    fs.writeFileSync(
      filePath,
      '---\nname: delegation\ndescription: File copy\n---\nSecond value.\n'
    );
    assert.ok(provider.readResource('delegation').content.includes('Second value.'));
  });

  it('reads composed source agents through the generated file manifest', () => {
    const provider = createContentProvider(getRuntimeConfig('codex'), REPO_SRC);
    const result = provider.readAgent('accessibility-specialist');

    assert.equal(provider.name, 'registry');
    assert.equal(result.error, undefined);
    assert.ok(result.agent.body.includes('You are an **Accessibility Specialist**'));
    assert.ok(result.agent.tools.includes('direct file reads'));
  });

  it('serves explicit inline fixtures and applies runtime materialization', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-inline-');
    writeInlineManifest(srcRoot, {
      resources: {
        delegation: inline('skills/shared/delegation/SKILL.md', 'Inline content.\n'),
      },
      agents: {
        coder: inline(
          'agents/coder.md',
          '---\nname: coder\ntools: [read_file]\n---\nInline agent.\n'
        ),
      },
    });

    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    assert.equal(provider.readResource('delegation').content, 'Inline content.\n');
    assert.deepEqual(provider.readAgent('coder'), {
      agent: { body: 'Inline agent.\n', tools: ['direct file reads'] },
    });
  });

  it('reads and decompresses packed content once per provider', (t) => {
    const srcRoot = makeTempSrcRoot('maestro-provider-packed-cache-');
    const delegation = 'Packed delegation content.\n';
    const architecture = 'Packed architecture content.\n';
    const prefix = '😀';
    const payload = `${prefix}${delegation}${architecture}`;
    const { manifestPath, payloadPath } = writePackedManifest(
      srcRoot,
      {
        resources: {
          delegation: ['skills/shared/delegation/SKILL.md', prefix.length, delegation.length],
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
    const realPayloadPath = fs.realpathSync(payloadPath);
    let manifestReads = 0;
    let payloadReads = 0;
    let decompressions = 0;

    t.mock.method(fs, 'readFileSync', function (...args) {
      if (String(args[0]) === manifestPath) manifestReads += 1;
      if (String(args[0]) === realPayloadPath) payloadReads += 1;
      return originalReadFileSync.apply(this, args);
    });
    t.mock.method(zlib, 'gunzipSync', function (...args) {
      decompressions += 1;
      return originalGunzipSync.apply(this, args);
    });

    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);
    assert.equal(provider.readResource('delegation').content, delegation);
    assert.equal(provider.readResource('architecture').content, architecture);
    assert.equal(provider.readResource('delegation').content, delegation);
    assert.equal(manifestReads, 1);
    assert.equal(payloadReads, 1);
    assert.equal(decompressions, 1);
  });

  it('keeps explicit inline packed entries readable after payload corruption', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-packed-isolation-');
    const { payloadPath } = writePackedManifest(
      srcRoot,
      {
        resources: {
          delegation: ['skills/shared/delegation/SKILL.md', 0, 4],
          architecture: inline(
            'references/architecture.md',
            'Inline architecture.\n'
          ),
        },
      },
      'data'
    );
    fs.writeFileSync(payloadPath, Buffer.from('not-gzip'));
    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);

    assert.equal(
      provider.readResource('delegation').error,
      'Failed to read resource "delegation": Z_DATA_ERROR'
    );
    assert.equal(provider.readResource('architecture').content, 'Inline architecture.\n');
  });

  it('does not normalize post-read transform failures as content read errors', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-transform-error-');
    writeInlineManifest(srcRoot, {
      resources: {
        architecture: inline(
          'references/architecture.md',
          '<!-- @feature unknown -->\ncontent\n<!-- @end-feature -->\n'
        ),
      },
    });
    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);

    assert.throws(
      () => provider.readResource('architecture'),
      /Unknown feature flag: "unknown"/
    );
  });

  it('fails explicitly when the required manifest is missing', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-missing-manifest-');
    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);

    assert.equal(
      provider.readResource('delegation').error,
      'Failed to read resource "delegation": ENOENT'
    );
    assert.equal(
      provider.readAgent('coder').error,
      'Failed to read agent "coder": ENOENT'
    );
  });

  it('retires representation-specific provider exports', () => {
    assert.equal(contentProviderModule.createFilesystemProvider, undefined);
    assert.equal(contentProviderModule.createRegistryProvider, undefined);
    assert.equal(contentProviderModule.normalizeContentPolicy, undefined);
    assert.equal(contentProviderModule.createContentSourceSpecs, undefined);
  });

  it('returns unknown errors before reading a manifest', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-unknown-');
    const provider = createContentProvider(getRuntimeConfig('codex'), srcRoot);

    assert.match(provider.readResource('constructor').error, /^Unknown resource identifier/);
    assert.match(provider.readAgent('unknown-agent').error, /^Unknown agent identifier/);
  });

  it('reads physical agents from file storage', () => {
    const srcRoot = makeTempSrcRoot('maestro-provider-physical-agent-');
    writeAgent(
      srcRoot,
      'coder',
      '---\nname: coder\ntools: [read_file]\n---\nPhysical body.\n'
    );
    const result = createContentProvider(getRuntimeConfig('codex'), srcRoot).readAgent('coder');

    assert.equal(result.agent.body, 'Physical body.\n');
    assert.deepEqual(result.agent.tools, ['direct file reads']);
  });
});
