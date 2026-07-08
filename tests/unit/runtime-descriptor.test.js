import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  assertValidRuntimeGeneration,
  getRuntimeGeneration,
  getAgentToolDialect,
  getRuntimeConfig,
} from '../../dist/src/platforms/runtime-descriptor.js';

import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const SRC = path.resolve(moduleDirname, '../../src');

function validGeneration() {
  return {
    entryPoint: {
      templateFile: 'x.tmpl',
      outputPath: (entry) => `out/${entry.name}`,
      preamblePlaceholder: 'block',
    },
    coreCommand: {
      templateFile: 'y.tmpl',
      outputPath: (entry) => `core/${entry.name}`,
    },
    hooks: { family: 'gemini-family', configOutputPath: 'hooks/hooks.json' },
  };
}

describe('assertValidRuntimeGeneration', () => {
  it('accepts a fully-populated descriptor', () => {
    assert.doesNotThrow(() => assertValidRuntimeGeneration('demo', validGeneration()));
  });

  it('accepts null sub-descriptors (a runtime that emits no commands or hooks)', () => {
    assert.doesNotThrow(() =>
      assertValidRuntimeGeneration('demo', { entryPoint: null, coreCommand: null, hooks: null })
    );
  });

  it('throws when the descriptor is missing entirely', () => {
    assert.throws(() => assertValidRuntimeGeneration('demo', undefined), /missing its generation descriptor/);
  });

  it('throws when entryPoint lacks a preamblePlaceholder', () => {
    const g = validGeneration();
    delete g.entryPoint.preamblePlaceholder;
    assert.throws(() => assertValidRuntimeGeneration('demo', g), /malformed entryPoint/);
  });

  it('throws when outputPath is not a function', () => {
    const g = validGeneration();
    g.coreCommand.outputPath = 'not-a-fn';
    assert.throws(() => assertValidRuntimeGeneration('demo', g), /malformed coreCommand/);
  });

  it('throws on an unknown hook family', () => {
    const g = validGeneration();
    g.hooks.family = 'mystery';
    assert.throws(() => assertValidRuntimeGeneration('demo', g), /unknown hook family/);
  });
});

describe('getRuntimeGeneration', () => {
  it('returns the descriptor for a valid config', () => {
    const config = { name: 'demo', generation: validGeneration() };
    assert.equal(getRuntimeGeneration(config), config.generation);
  });

  it('throws for a config missing its descriptor', () => {
    assert.throws(() => getRuntimeGeneration({ name: 'demo' }), /missing its generation descriptor/);
  });
});

describe('getAgentToolDialect', () => {
  it('returns the declared dialect, including an empty identity map', () => {
    assert.deepEqual(getAgentToolDialect({ agentToolDialect: {} }), {});
    assert.deepEqual(getAgentToolDialect({ agentToolDialect: { a: 'b' } }), { a: 'b' });
  });

  it('returns null when no dialect is declared', () => {
    assert.equal(getAgentToolDialect({ name: 'demo' }), null);
  });
});

describe('getRuntimeConfig', () => {
  it('loads a real runtime config by name', async () => {
    assert.equal((await getRuntimeConfig('gemini', SRC)).name, 'gemini');
  });

  it('throws for an unknown runtime', async () => {
    await assert.rejects(() => getRuntimeConfig('definitely-not-a-runtime', SRC), /Unknown runtime "definitely-not-a-runtime"/);
  });
});
