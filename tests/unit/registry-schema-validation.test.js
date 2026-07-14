import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateRegistry, REGISTRY_SCHEMAS, CAPABILITY_TIERS } from '../../dist/src/generator/registry-schemas.js';
import { buildRegistries } from '../../dist/src/generator/registry-scanner.js';
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

  it('preserves the custom DSL extra-key tolerance', () => {
    assert.doesNotThrow(() => validateRegistry('agent-registry.json', [
      { ...good[0], futureField: { nested: true } },
    ]));
    assert.doesNotThrow(() => validateRegistry('hook-registry.json', {
      'session-start': { module: 'm.js', fn: 'handleSessionStart', futureField: true },
    }));
  });

  it('rejects an unknown capability tier', () => {
    const bad = [{ name: 'coder', capabilities: 'reed_only', tools: [], focus: '' }];
    assert.throws(() => validateRegistry('agent-registry.json', bad), /capabilities/);
  });

  it('rejects a non-array tools field', () => {
    const bad = [{ name: 'coder', capabilities: 'full', tools: 'read_file', focus: '' }];
    assert.throws(() => validateRegistry('agent-registry.json', bad), /tools/);
  });

  it('reports multiple issues in schema-field order through the existing envelope', () => {
    const bad = [{ name: 1, capabilities: 'reed_only', tools: 'read_file', focus: false }];
    assert.throws(
      () => validateRegistry('agent-registry.json', bad),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        assert.deepEqual(err.details, {
          label: 'agent-registry.json',
          errors: [
            'agent-registry.json[0].name: expected string, got 1',
            'agent-registry.json[0].capabilities: expected one of [read_only, read_shell, read_write, full], got "reed_only"',
            'agent-registry.json[0].tools: expected array, got "read_file"',
            'agent-registry.json[0].focus: expected string, got false',
          ],
        });
        return true;
      },
    );
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
      (err) => {
        assert.deepEqual(err.details.errors, [
          'hook-registry.json.session-start.fn: missing required field',
        ]);
        return true;
      },
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

describe('validateRegistry — runtime content storage', () => {
  const sections = {
    resources: {},
    agents: {},
    agentProfiles: {},
    blueprints: {},
  };

  it('accepts explicit file, packed, and inline encodings', () => {
    assert.doesNotThrow(() => validateRegistry('runtime-content-registry.json', {
      schemaVersion: 2,
      storage: 'file',
      ...sections,
    }));
    assert.doesNotThrow(() => validateRegistry('runtime-content-registry.json', {
      schemaVersion: 2,
      storage: 'packed',
      payload: 'runtime-content-registry.txt.gz',
      payloadEncoding: 'gzip',
      ...sections,
      resources: { delegation: ['skills/shared/delegation/SKILL.md', 0, 4] },
    }));
    assert.doesNotThrow(() => validateRegistry('runtime-content-registry.json', {
      schemaVersion: 2,
      storage: 'inline',
      ...sections,
      resources: {
        delegation: { kind: 'inline', relativePath: 'skill.md', content: 'body' },
      },
    }));
  });

  it('rejects implicit storage and unsafe packed ranges', () => {
    assert.throws(
      () => validateRegistry('runtime-content-registry.json', { schemaVersion: 2, ...sections }),
      /storage/
    );
    assert.throws(() => validateRegistry('runtime-content-registry.json', {
      schemaVersion: 2,
      storage: 'packed',
      payload: 'content.gz',
      payloadEncoding: 'gzip',
      ...sections,
      resources: { delegation: ['skill.md', -1, 4] },
    }), /resources/);
  });
});
