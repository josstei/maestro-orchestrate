'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createServer,
  normalizeToolPack,
} = require('../../src/mcp/core/create-server');

describe('normalizeToolPack', () => {
  it('accepts a plain pack object', () => {
    const pack = normalizeToolPack({ name: 'p', tools: [], handlers: {} }, {}, 0);
    assert.equal(pack.name, 'p');
    assert.deepEqual(pack.tools, []);
    assert.deepEqual(pack.handlers, {});
  });

  it('accepts a raw function pack', () => {
    const factory = (ctx) =>
      ({ name: `fn-${ctx.runtimeConfig.name}`, tools: [], handlers: {} });
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

describe('createServer tool composition', () => {
  const makePack = (name, toolName, handler = () => ({ ok: true })) => ({
    name,
    tools: [{ name: toolName }],
    handlers: { [toolName]: handler },
  });

  it('builds an empty registry when no toolPacks are supplied', async () => {
    const server = createServer({ runtimeConfig: { name: 'codex' }, services: {} });
    assert.deepEqual(server.getToolSchemas(), []);
    assert.equal((await server.callTool('anything')).code, 'UNKNOWN_TOOL');
  });

  it('coerces a non-array toolPacks option to an empty list', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: 'not-an-array',
    });
    assert.deepEqual(server.getToolSchemas(), []);
  });

  it('throws when a schema entry is null', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [{ name: 'p', tools: [null], handlers: {} }],
        }),
      /Tool schema in pack "p" must be an object/
    );
  });

  it('throws when a schema entry is an array', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [{ name: 'p', tools: [['bad']], handlers: {} }],
        }),
      /Tool schema in pack "p" must be an object/
    );
  });

  it('throws when a schema is missing a name', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [{ name: 'p', tools: [{ description: 'x' }], handlers: {} }],
        }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a schema name is not a string', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [{ name: 'p', tools: [{ name: 42 }], handlers: {} }],
        }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a schema name is an empty string', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [{ name: 'p', tools: [{ name: '' }], handlers: {} }],
        }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a tool has no matching handler in its pack', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [
            { name: 'p', tools: [{ name: 'lonely' }], handlers: {} },
          ],
        }),
      /Tool "lonely" in pack "p" is missing a handler/
    );
  });

  it('enforces an initialized workspace when the schema sets requiresWorkspace=true', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        {
          name: 'p',
          tools: [{ name: 't1', requiresWorkspace: true }],
          handlers: { t1: () => ({}) },
        },
      ],
    });
    const result = await server.callTool('t1', {}, null);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'WORKSPACE_NOT_INITIALIZED');
  });

  it('does not require a workspace by default', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [makePack('p', 't1')],
    });
    const result = await server.callTool('t1', {}, null);
    assert.equal(result.ok, true);
  });

  it('preserves schemas in pack/tool declaration order across multiple packs', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        {
          name: 'a',
          tools: [{ name: 'a1' }, { name: 'a2' }],
          handlers: { a1: () => ({}), a2: () => ({}) },
        },
        {
          name: 'b',
          tools: [{ name: 'b1' }],
          handlers: { b1: () => ({}) },
        },
      ],
    });
    assert.deepEqual(
      server.getToolSchemas().map((s) => s.name),
      ['a1', 'a2', 'b1']
    );
  });
});
