'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer, defineTool } = require('../../src/mcp/core/create-server');
const { ValidationError } = require('../../src/lib/errors');

const makePack = (name, ...toolNames) => ({
  name,
  tools: toolNames.map((toolName) => ({ name: toolName, handler: () => ({}) })),
});
// One pack of `tools`, each given a no-op handler unless it sets its own.
const serverWith = (...tools) =>
  createServer({ toolPacks: [{ name: 'p', tools: tools.map((tool) => ({ handler: () => ({}), ...tool })) }] });
// The outcome of calling a `name` tool whose handler throws `error`.
const failure = (name, error, args) =>
  serverWith({ name, handler: () => { throw error; } }).callTool(name, args);

describe('defineTool', () => {
  it('builds an object input schema with no required list or requiresWorkspace by default', () => {
    const handler = () => ({});
    const tool = defineTool('t1', 'd', {}, handler, { required: [] });

    assert.deepEqual(Object.keys(tool), ['name', 'description', 'inputSchema', 'handler']);
    assert.equal(tool.handler, handler);
    assert.equal(
      JSON.stringify(tool),
      '{"name":"t1","description":"d","inputSchema":{"type":"object","properties":{}}}'
    );
  });

  it('lists requiresWorkspace before the input schema and required after its properties', () => {
    const tool = defineTool('t1', 'd', { a: { type: 'string' } }, () => ({}), {
      required: ['a'],
      requiresWorkspace: true,
    });

    assert.deepEqual(Object.keys(tool), ['name', 'description', 'requiresWorkspace', 'inputSchema', 'handler']);
    assert.equal(
      JSON.stringify(tool),
      '{"name":"t1","description":"d","requiresWorkspace":true,"inputSchema":{"type":"object","properties":{"a":{"type":"string"}},"required":["a"]}}'
    );
  });
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
});

describe('createServer tool composition', () => {
  it('builds an empty registry when no toolPacks are supplied', async () => {
    const server = createServer({ runtimeConfig: { name: 'codex' }, services: {} });
    assert.deepEqual(server.getToolSchemas(), []);
    assert.equal((await server.callTool('anything')).code, 'UNKNOWN_TOOL');
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
    const server = serverWith({
      name: 't1',
      description: 'd',
      requiresWorkspace: true,
      inputSchema: { type: 'object' },
    });

    const [schema] = server.getToolSchemas();
    assert.deepEqual(Object.keys(schema), ['name', 'description', 'requiresWorkspace', 'inputSchema']);
    assert.equal(
      JSON.stringify(server.getToolSchemas()),
      '[{"name":"t1","description":"d","requiresWorkspace":true,"inputSchema":{"type":"object"}}]'
    );
  });

  it("lists the runtime config's mcpToolMeta as every tool schema's _meta", () => {
    const mcpToolMeta = { 'antigravity/alwaysLoad': true };
    const tool = { name: 'a1', description: 'd', handler: () => ({}) };
    const server = createServer({
      runtimeConfig: { name: 'antigravity', mcpToolMeta },
      toolPacks: [{ name: 'a', tools: [tool] }, makePack('b', 'b1')],
    });

    const schemas = server.getToolSchemas();
    assert.deepEqual(schemas, [
      { name: 'a1', description: 'd', _meta: { 'antigravity/alwaysLoad': true } },
      { name: 'b1', _meta: { 'antigravity/alwaysLoad': true } },
    ]);
    assert.equal('_meta' in tool, false, 'the pack schema itself is not modified');

    // Each schema gets its own copy, so no listing can change the config or
    // another schema.
    assert.notEqual(schemas[0]._meta, mcpToolMeta);
    assert.notEqual(schemas[0]._meta, schemas[1]._meta);
    schemas[0]._meta.extra = true;
    assert.deepEqual(mcpToolMeta, { 'antigravity/alwaysLoad': true });
    assert.deepEqual(schemas[1]._meta, { 'antigravity/alwaysLoad': true });
  });

  it('lists no _meta when the runtime config declares no mcpToolMeta', () => {
    for (const runtimeConfig of [{ name: 'claude' }, { name: 'claude', mcpToolMeta: null }]) {
      const server = createServer({ runtimeConfig, toolPacks: [makePack('p', 't1')] });
      assert.deepEqual(server.getToolSchemas(), [{ name: 't1' }]);
    }
  });

  it('enforces an initialized workspace only when the schema sets requiresWorkspace=true', async () => {
    const server = serverWith({ name: 'gated', requiresWorkspace: true }, { name: 'open' });
    const result = await server.callTool('gated', {}, null);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'WORKSPACE_NOT_INITIALIZED');
    assert.equal((await server.callTool('open', {}, null)).ok, true, 'no workspace is required by default');
  });

  it('preserves schemas in pack/tool declaration order across multiple packs', () => {
    const server = createServer({ toolPacks: [makePack('a', 'a1', 'a2'), makePack('b', 'b1')] });
    assert.deepEqual(
      server.getToolSchemas().map((s) => s.name),
      ['a1', 'a2', 'b1']
    );
  });
});

describe('createServer tool calls', () => {
  it('dispatches tool calls with args and project root, wrapping the result', async () => {
    const server = serverWith({
      name: 'resolve_settings',
      handler: (args, projectRoot) => ({ projectRoot, requested: args.settings }),
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
    const result = await failure('create_session', new Error('Active session already exists.'));

    assert.equal(result.ok, false);
    assert.equal(
      result.recovery_hint,
      'Call get_session_status to check the current session, then archive_session if you want to start fresh.'
    );
  });

  it('normalizes MaestroError failures into the internal tool outcome contract', async () => {
    const error = new ValidationError('agents must be a non-empty array of agent identifiers');
    const result = await failure('get_agent', error, { agents: [] });

    assert.deepEqual(result, {
      ok: false,
      error: 'agents must be a non-empty array of agent identifiers',
      code: 'VALIDATION_ERROR',
      recovery_hint: null,
    });
  });

  it('appends MaestroError details after the code', async () => {
    const result = await failure('t1', new ValidationError('bad input', { details: { field: 'name' } }));

    assert.deepEqual(Object.keys(result), ['ok', 'error', 'recovery_hint', 'code', 'details']);
    assert.deepEqual(result.details, { field: 'name' });
  });

  it('sanitizes paths out of non-Maestro errors and reports INTERNAL_TOOL_ERROR', async () => {
    for (const [name, recovery_hint] of [
      ['t1', null],
      ['initialize_workspace', 'Check that the target directory is writable.'],
    ]) {
      assert.deepEqual(await failure(name, new Error("EACCES: open '/home/u/x'")), {
        ok: false,
        error: "EACCES: open '[path]'",
        recovery_hint,
        code: 'INTERNAL_TOOL_ERROR',
      });
    }
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
