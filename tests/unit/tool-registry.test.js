'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createToolRegistry,
  normalizeToolPack,
} = require('../../src/mcp/core/tool-registry');
const { defineToolPack } = require('../../src/mcp/tool-packs/contracts');

describe('normalizeToolPack', () => {
  it('accepts a plain pack object', () => {
    const pack = normalizeToolPack(
      defineToolPack({ name: 'p', tools: [], handlers: {} }),
      {},
      0
    );
    assert.equal(pack.name, 'p');
    assert.deepEqual(pack.tools, []);
    assert.deepEqual(pack.handlers, {});
  });

  it('accepts a pack factory exposing createToolPack()', () => {
    const factory = {
      createToolPack: (ctx) =>
        defineToolPack({ name: ctx.runtimeConfig.name, tools: [], handlers: {} }),
    };
    const pack = normalizeToolPack(factory, { runtimeConfig: { name: 'gemini' } }, 0);
    assert.equal(pack.name, 'gemini');
  });

  it('accepts a raw function pack', () => {
    const factory = (ctx) =>
      defineToolPack({ name: `fn-${ctx.runtimeConfig.name}`, tools: [], handlers: {} });
    const pack = normalizeToolPack(factory, { runtimeConfig: { name: 'claude' } }, 2);
    assert.equal(pack.name, 'fn-claude');
  });

  it('assigns a fallback name when pack is missing one', () => {
    const pack = normalizeToolPack({ tools: [], handlers: {} }, {}, 3);
    assert.equal(pack.name, 'tool-pack-4');
  });

  it('coerces non-array tools and non-object handlers to safe defaults', () => {
    const pack = normalizeToolPack({ name: 'p', tools: 'nope', handlers: 'nope' }, {}, 0);
    assert.deepEqual(pack.tools, []);
    assert.deepEqual(pack.handlers, {});
  });

  it('throws when the pack resolves to null', () => {
    assert.throws(
      () => normalizeToolPack(null, {}, 0),
      /Tool pack at index 0 must resolve to an object/
    );
  });

  it('throws when the pack resolves to an array', () => {
    assert.throws(
      () => normalizeToolPack(() => ['nope'], {}, 5),
      /Tool pack at index 5 must resolve to an object/
    );
  });

  it('throws when a primitive is returned from a factory', () => {
    assert.throws(
      () => normalizeToolPack(() => 'string-pack', {}, 1),
      /Tool pack at index 1 must resolve to an object/
    );
  });
});

describe('createToolRegistry', () => {
  const makePack = (name, toolName, handler = () => ({ ok: true })) =>
    defineToolPack({
      name,
      tools: [{ name: toolName }],
      handlers: { [toolName]: handler },
    });

  it('builds an empty registry when no toolPacks are supplied', () => {
    const registry = createToolRegistry({ runtimeConfig: { name: 'codex' }, services: {} });
    assert.deepEqual(registry.schemas, []);
    assert.deepEqual(Object.keys(registry.handlers), []);
  });

  it('coerces a non-array toolPacks option to an empty list', () => {
    const registry = createToolRegistry({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: 'not-an-array',
    });
    assert.deepEqual(registry.schemas, []);
  });

  it('throws when a schema entry is null', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [defineToolPack({ name: 'p', tools: [null], handlers: {} })],
        }),
      /Tool schema in pack "p" must be an object/
    );
  });

  it('throws when a schema entry is an array', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [defineToolPack({ name: 'p', tools: [['bad']], handlers: {} })],
        }),
      /Tool schema in pack "p" must be an object/
    );
  });

  it('throws when a schema is missing a name', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [defineToolPack({ name: 'p', tools: [{ description: 'x' }], handlers: {} })],
        }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a schema name is not a string', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [defineToolPack({ name: 'p', tools: [{ name: 42 }], handlers: {} })],
        }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a schema name is an empty string', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [defineToolPack({ name: 'p', tools: [{ name: '' }], handlers: {} })],
        }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a tool has no matching handler in its pack', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [
            defineToolPack({ name: 'p', tools: [{ name: 'lonely' }], handlers: {} }),
          ],
        }),
      /Tool "lonely" in pack "p" is missing a handler/
    );
  });

  it('records requiresWorkspace=true metadata when the schema flags it', () => {
    const registry = createToolRegistry({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        defineToolPack({
          name: 'p',
          tools: [{ name: 't1', requiresWorkspace: true }],
          handlers: { t1: () => ({}) },
        }),
      ],
    });
    assert.equal(registry.metadata.t1.requiresWorkspace, true);
  });

  it('records requiresWorkspace=false by default', () => {
    const registry = createToolRegistry({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [makePack('p', 't1')],
    });
    assert.equal(registry.metadata.t1.requiresWorkspace, false);
  });

  it('preserves schemas in pack/tool declaration order across multiple packs', () => {
    const registry = createToolRegistry({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        defineToolPack({
          name: 'a',
          tools: [{ name: 'a1' }, { name: 'a2' }],
          handlers: { a1: () => ({}), a2: () => ({}) },
        }),
        defineToolPack({
          name: 'b',
          tools: [{ name: 'b1' }],
          handlers: { b1: () => ({}) },
        }),
      ],
    });
    assert.deepEqual(
      registry.schemas.map((s) => s.name),
      ['a1', 'a2', 'b1']
    );
  });
});
