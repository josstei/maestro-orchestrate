import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateRegistry, REGISTRY_SCHEMAS, CAPABILITY_TIERS } from '../../src/generator/registry-schemas.js';
import { buildRegistries } from '../../src/generator/registry-scanner.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO_SRC = path.resolve(moduleDirname, '..', '..', 'src');

describe('validateRegistry — agent-registry.json', () => {
  const good = [
    { name: 'coder', capabilities: 'full', tools: ['read_file'], focus: 'x' },
  ];

  it('accepts a well-formed agent registry', () => {
    assert.doesNotThrow(() => validateRegistry('agent-registry.json', good));
  });

  it('rejects an unknown capability tier', () => {
    const bad = [{ name: 'coder', capabilities: 'reed_only', tools: [], focus: '' }];
    assert.throws(() => validateRegistry('agent-registry.json', bad), /capabilities/);
  });

  it('rejects a non-array tools field', () => {
    const bad = [{ name: 'coder', capabilities: 'full', tools: 'read_file', focus: '' }];
    assert.throws(() => validateRegistry('agent-registry.json', bad), /tools/);
  });

  it('exposes the four capability tiers', () => {
    assert.deepEqual(CAPABILITY_TIERS, ['read_only', 'read_shell', 'read_write', 'full']);
  });
});

describe('validateRegistry — resource + hook registries', () => {
  it('rejects a non-string resource value', () => {
    assert.throws(() => validateRegistry('resource-registry.json', { a: 5 }), /a/);
  });

  it('rejects a hook entry missing fn', () => {
    assert.throws(
      () => validateRegistry('hook-registry.json', { 'session-start': { module: 'm.js' } }),
      /fn/
    );
  });

  it('accepts well-formed resource and hook registries', () => {
    assert.doesNotThrow(() => validateRegistry('resource-registry.json', { a: 'path/a.md' }));
    assert.doesNotThrow(() =>
      validateRegistry('hook-registry.json', { 'session-start': { module: 'm.js', fn: 'handleSessionStart' } })
    );
  });

  it('throws for an unregistered filename', () => {
    assert.throws(() => validateRegistry('unknown.json', {}), /No schema registered/);
  });
});

describe('buildRegistries on the live tree', () => {
  it('validates the real src/ registries without throwing', () => {
    assert.doesNotThrow(() => buildRegistries(REPO_SRC));
    const names = buildRegistries(REPO_SRC).map((r) => r.fileName);
    assert.deepEqual(names, [
      'agent-registry.json',
      'resource-registry.json',
      'hook-registry.json',
    ]);
  });
});
