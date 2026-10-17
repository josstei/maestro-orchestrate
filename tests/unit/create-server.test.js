'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/mcp/core/create-server');
const { ValidationError } = require('../../src/lib/errors');

const makePack = (name, toolName, handler = () => ({ ok: true })) => ({
  name,
  tools: [{ name: toolName, handler }],
});

describe('createServer tool packs', () => {
  it('passes the frozen server context to factory packs', () => {
    const services = { marker: true };
    let seen;
    createServer({
      runtimeConfig: { name: 'claude' },
      services,
      toolPacks: [
        (ctx) => {
          seen = ctx;
          return { name: 'p', tools: [] };
        },
      ],
    });

    assert.equal(seen.runtimeConfig.name, 'claude');
    assert.equal(seen.services, services);
    assert.equal(Object.isFrozen(seen), true);
  });

  it('throws when the pack resolves to null', () => {
    assert.throws(
      () => createServer({ toolPacks: [null] }),
      /Tool pack at index 0 must resolve to an object/
    );
  });

  it('throws when the pack resolves to an array', () => {
    assert.throws(
      () => createServer({ toolPacks: [makePack('a', 'a1'), () => ['nope']] }),
      /Tool pack at index 1 must resolve to an object/
    );
  });

  it('throws when a primitive is returned from a factory', () => {
    assert.throws(
      () =>
        createServer({
          toolPacks: [makePack('a', 'a1'), makePack('b', 'b1'), () => 'string-pack'],
        }),
      /Tool pack at index 2 must resolve to an object/
    );
  });
});

describe('createServer tool composition', () => {
  it('builds an empty registry when no toolPacks are supplied', async () => {
    const server = createServer({ runtimeConfig: { name: 'codex' }, services: {} });
    assert.deepEqual(server.getToolSchemas(), []);
    assert.equal((await server.callTool('anything')).code, 'UNKNOWN_TOOL');
  });

  it('throws when a schema entry is null', () => {
    assert.throws(
      () => createServer({ toolPacks: [{ name: 'p', tools: [null] }] }),
      /Tool schema in pack "p" must be an object/
    );
  });

  it('throws when a schema entry is an array', () => {
    assert.throws(
      () => createServer({ toolPacks: [{ name: 'p', tools: [['bad']] }] }),
      /Tool schema in pack "p" must be an object/
    );
  });

  it('throws when a schema is missing a name', () => {
    assert.throws(
      () => createServer({ toolPacks: [{ name: 'p', tools: [{ description: 'x' }] }] }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a schema name is not a string', () => {
    assert.throws(
      () => createServer({ toolPacks: [{ name: 'p', tools: [{ name: 42 }] }] }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a schema name is an empty string', () => {
    assert.throws(
      () => createServer({ toolPacks: [{ name: 'p', tools: [{ name: '' }] }] }),
      /Tool schema in pack "p" is missing a valid name/
    );
  });

  it('throws when a tool has no handler function', () => {
    assert.throws(
      () => createServer({ toolPacks: [{ name: 'p', tools: [{ name: 'lonely' }] }] }),
      /^Error: Tool "lonely" in pack "p" is missing a handler\.$/
    );
    assert.throws(
      () =>
        createServer({ toolPacks: [{ name: 'p', tools: [{ name: 'lonely', handler: 'nope' }] }] }),
      /^Error: Tool "lonely" in pack "p" is missing a handler\.$/
    );
  });

  it('rejects duplicate tool names across packs', () => {
    assert.throws(
      () =>
        createServer({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [
            (ctx) => makePack(`first-${ctx.runtimeConfig.name}`, 'validate_plan'),
            makePack('second-pack', 'validate_plan'),
          ],
        }),
      /Duplicate tool name "validate_plan" found in packs "first-codex" and "second-pack"\./
    );
  });

  it('lists each tool schema without its handler, keeping key order', () => {
    const server = createServer({
      toolPacks: [
        {
          name: 'p',
          tools: [
            {
              name: 't1',
              description: 'd',
              requiresWorkspace: true,
              inputSchema: { type: 'object' },
              handler: () => ({}),
            },
          ],
        },
      ],
    });

    const [schema] = server.getToolSchemas();
    assert.deepEqual(Object.keys(schema), ['name', 'description', 'requiresWorkspace', 'inputSchema']);
    assert.equal(
      JSON.stringify(server.getToolSchemas()),
      '[{"name":"t1","description":"d","requiresWorkspace":true,"inputSchema":{"type":"object"}}]'
    );
  });

  it('enforces an initialized workspace when the schema sets requiresWorkspace=true', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        {
          name: 'p',
          tools: [{ name: 't1', requiresWorkspace: true, handler: () => ({}) }],
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
          tools: [
            { name: 'a1', handler: () => ({}) },
            { name: 'a2', handler: () => ({}) },
          ],
        },
        makePack('b', 'b1'),
      ],
    });
    assert.deepEqual(
      server.getToolSchemas().map((s) => s.name),
      ['a1', 'a2', 'b1']
    );
  });
});

describe('createServer tool calls', () => {
  it('dispatches tool calls with args and project root, wrapping the result', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        makePack('workspace', 'resolve_settings', (args, projectRoot) => ({
          projectRoot,
          requested: args.settings,
        })),
      ],
    });

    const result = await server.callTool(
      'resolve_settings',
      { settings: ['MAESTRO_EXECUTION_MODE'] },
      '/tmp/workspace'
    );

    assert.deepEqual(result, {
      ok: true,
      result: {
        projectRoot: '/tmp/workspace',
        requested: ['MAESTRO_EXECUTION_MODE'],
      },
    });
  });

  it('returns recovery hints for known tool failures', async () => {
    const server = createServer({
      toolPacks: [
        makePack('session', 'create_session', () => {
          throw new Error('Active session already exists.');
        }),
      ],
    });

    const result = await server.callTool('create_session');

    assert.equal(result.ok, false);
    assert.equal(
      result.recovery_hint,
      'Call get_session_status to check the current session, then archive_session if you want to start fresh.'
    );
  });

  it('normalizes MaestroError failures into the internal tool outcome contract', async () => {
    const server = createServer({
      toolPacks: [
        makePack('content', 'get_agent', () => {
          throw new ValidationError('agents must be a non-empty array of agent identifiers');
        }),
      ],
    });

    const result = await server.callTool('get_agent', { agents: [] });

    assert.deepEqual(result, {
      ok: false,
      error: 'agents must be a non-empty array of agent identifiers',
      code: 'VALIDATION_ERROR',
      recovery_hint: null,
    });
  });

  it('appends MaestroError details after the code', async () => {
    const server = createServer({
      toolPacks: [
        makePack('p', 't1', () => {
          throw new ValidationError('bad input', { details: { field: 'name' } });
        }),
      ],
    });

    const result = await server.callTool('t1');

    assert.deepEqual(Object.keys(result), ['ok', 'error', 'recovery_hint', 'code', 'details']);
    assert.deepEqual(result.details, { field: 'name' });
  });

  it('sanitizes paths out of non-Maestro errors and reports INTERNAL_TOOL_ERROR', async () => {
    const fail = () => {
      throw new Error("EACCES: open '/home/u/x'");
    };
    const server = createServer({
      toolPacks: [
        { name: 'p', tools: [{ name: 't1', handler: fail }, { name: 'initialize_workspace', handler: fail }] },
      ],
    });

    assert.deepEqual(await server.callTool('t1'), {
      ok: false,
      error: "EACCES: open '[path]'",
      recovery_hint: null,
      code: 'INTERNAL_TOOL_ERROR',
    });
    assert.deepEqual(await server.callTool('initialize_workspace'), {
      ok: false,
      error: "EACCES: open '[path]'",
      recovery_hint: 'Check that the target directory is writable.',
      code: 'INTERNAL_TOOL_ERROR',
    });
  });

  it('reports unknown tools without a recovery hint', async () => {
    const result = await createServer().callTool('missing');

    assert.deepEqual(Object.keys(result), ['ok', 'error', 'recovery_hint', 'code']);
    assert.deepEqual(result, {
      ok: false,
      error: 'Unknown tool: missing',
      recovery_hint: null,
      code: 'UNKNOWN_TOOL',
    });
  });
});
