'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/mcp/core/create-server');
const { ValidationError } = require('../../src/lib/errors');

const tool = (name, handler = () => ({ ok: true })) => ({ name, handler });

function createTestServer(tools, runtimeConfig = { name: 'codex' }) {
  return createServer({ runtimeConfig, workspace: null, tools });
}

describe('createServer tool listing', () => {
  it('lists nothing and knows no tool when given no tools', async () => {
    const server = createTestServer([]);
    assert.deepEqual(server.getToolSchemas(), []);
    assert.equal((await server.callTool('anything')).code, 'UNKNOWN_TOOL');
  });

  it('lists each tool schema without its handler, keeping key order', () => {
    const server = createTestServer([
      {
        name: 't1',
        description: 'd',
        requiresWorkspace: true,
        inputSchema: { type: 'object' },
        handler: () => ({}),
      },
    ]);

    const [schema] = server.getToolSchemas();
    assert.deepEqual(Object.keys(schema), ['name', 'description', 'requiresWorkspace', 'inputSchema']);
    assert.equal(
      JSON.stringify(server.getToolSchemas()),
      '[{"name":"t1","description":"d","requiresWorkspace":true,"inputSchema":{"type":"object"}}]'
    );
  });

  it('lists the tools in the given order', () => {
    const server = createTestServer([tool('a1'), tool('a2'), tool('b1')]);
    assert.deepEqual(server.getToolSchemas().map((s) => s.name), ['a1', 'a2', 'b1']);
  });

  it("lists the runtime config's mcpToolMeta as every tool schema's _meta", () => {
    const listed = { name: 'a1', description: 'd', handler: () => ({}) };
    const server = createTestServer([listed, tool('b1')], {
      name: 'antigravity',
      mcpToolMeta: { 'antigravity/alwaysLoad': true },
    });

    assert.equal(
      JSON.stringify(server.getToolSchemas()),
      '[{"name":"a1","description":"d","_meta":{"antigravity/alwaysLoad":true}},' +
        '{"name":"b1","_meta":{"antigravity/alwaysLoad":true}}]'
    );
    assert.equal('_meta' in listed, false, 'the tool definition itself is not modified');
  });

  it('lists no _meta when the runtime config declares no mcpToolMeta', () => {
    for (const runtimeConfig of [{ name: 'claude' }, { name: 'claude', mcpToolMeta: null }, {}]) {
      assert.deepEqual(createTestServer([tool('t1')], runtimeConfig).getToolSchemas(), [{ name: 't1' }]);
    }
  });

  it('resolves only listed tool names, never Object.prototype keys', async () => {
    const server = createTestServer([tool('t1')]);
    for (const name of ['constructor', '__proto__', 'toString', undefined]) {
      assert.deepEqual(await server.callTool(name), {
        ok: false,
        error: `Unknown tool: ${name}`,
        recovery_hint: null,
        code: 'UNKNOWN_TOOL',
      });
    }
  });
});

describe('createServer tool calls', () => {
  it('passes args, the project root and the { runtimeConfig, workspace } context to the handler', async () => {
    const runtimeConfig = { name: 'codex' };
    const workspace = { workspaceSuggestion: () => null };
    let seen;
    const server = createServer({
      runtimeConfig,
      workspace,
      tools: [
        tool('resolve_settings', (args, projectRoot, context) => {
          seen = context;
          return { projectRoot, requested: args.settings };
        }),
      ],
    });

    const result = await server.callTool(
      'resolve_settings',
      { settings: ['MAESTRO_EXECUTION_MODE'] },
      '/tmp/workspace'
    );

    assert.deepEqual(result, {
      ok: true,
      result: { projectRoot: '/tmp/workspace', requested: ['MAESTRO_EXECUTION_MODE'] },
    });
    assert.deepEqual(Object.keys(seen), ['runtimeConfig', 'workspace']);
    assert.equal(seen.runtimeConfig, runtimeConfig);
    assert.equal(seen.workspace, workspace);
  });

  it('passes empty args when the call has none', async () => {
    let seen;
    await createTestServer([tool('t1', (args) => { seen = args; })]).callTool('t1');
    assert.deepEqual(seen, {});
  });

  it('enforces an initialized workspace when the tool sets requiresWorkspace=true', async () => {
    const server = createTestServer([{ name: 't1', requiresWorkspace: true, handler: () => ({}) }]);

    assert.deepEqual(await server.callTool('t1', {}, null), {
      ok: false,
      error: 't1 requires an initialized workspace. Call initialize_workspace(workspace_path=...) first.',
      recovery_hint: null,
      code: 'WORKSPACE_NOT_INITIALIZED',
      details: { tool_name: 't1' },
    });
    assert.equal((await server.callTool('t1', {}, '/ws')).ok, true);
  });

  it('does not require a workspace by default', async () => {
    const result = await createTestServer([tool('t1')]).callTool('t1', {}, null);
    assert.equal(result.ok, true);
  });

  it('returns recovery hints for known tool failures', async () => {
    const server = createTestServer([
      tool('create_session', () => {
        throw new Error('Active session already exists.');
      }),
    ]);

    const result = await server.callTool('create_session');

    assert.equal(result.ok, false);
    assert.equal(
      result.recovery_hint,
      'Call get_session_status to check the current session, then archive_session if you want to start fresh.'
    );
  });

  it('normalizes MaestroError failures into the internal tool outcome contract', async () => {
    const server = createTestServer([
      tool('get_agent', () => {
        throw new ValidationError('agents must be a non-empty array of agent identifiers');
      }),
    ]);

    const result = await server.callTool('get_agent', { agents: [] });

    assert.deepEqual(result, {
      ok: false,
      error: 'agents must be a non-empty array of agent identifiers',
      code: 'VALIDATION_ERROR',
      recovery_hint: null,
    });
  });

  it('appends MaestroError details after the code', async () => {
    const server = createTestServer([
      tool('t1', () => {
        throw new ValidationError('bad input', { details: { field: 'name' } });
      }),
    ]);

    const result = await server.callTool('t1');

    assert.deepEqual(Object.keys(result), ['ok', 'error', 'recovery_hint', 'code', 'details']);
    assert.deepEqual(result.details, { field: 'name' });
  });

  it('sanitizes paths out of non-Maestro errors and reports INTERNAL_TOOL_ERROR', async () => {
    const fail = () => {
      throw new Error("EACCES: open '/home/u/x'");
    };
    const server = createTestServer([tool('t1', fail), tool('initialize_workspace', fail)]);

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

  it('attaches the recovery hint matching the failing tool and message, if any', async () => {
    const checkSession =
      'Call get_session_status to check the current session, then archive_session if you want to start fresh.';
    const writable = 'Check that the target directory is writable.';
    const cases = [
      ['create_session', 'Active session already exists.', checkSession],
      ['create_session', 'Session Already Exists', checkSession],
      ['create_session', 'unexpected internal error', null],
      ['transition_phase', 'Phase 9 not found', 'Call get_session_status to verify the current session and phase IDs.'],
      ['update_session', 'ENOENT: no such file or directory', 'Call get_session_status to verify a session exists before updating.'],
      [
        'update_session',
        'must provide at least one updatable field',
        'Provide at least one of: execution_mode, execution_backend, current_batch.',
      ],
      ['initialize_workspace', 'EACCES: permission denied', writable],
      ['initialize_workspace', 'EPERM: operation not permitted', writable],
      ['archive_session', 'ENOENT: no such file or directory', null],
      ['get_agent', 'already exists', null],
    ];

    for (const [name, message, hint] of cases) {
      const server = createTestServer([tool(name, () => {
        throw new Error(message);
      })]);
      assert.equal((await server.callTool(name)).recovery_hint, hint, `${name}: ${message}`);
    }

    // A MaestroError message is matched the same way.
    const server = createTestServer([tool('create_session', () => {
      throw new ValidationError('session already exists');
    })]);
    assert.equal((await server.callTool('create_session')).recovery_hint, checkSession);
  });

  it('reports unknown tools without a recovery hint', async () => {
    const result = await createTestServer([]).callTool('missing');

    assert.deepEqual(Object.keys(result), ['ok', 'error', 'recovery_hint', 'code']);
    assert.deepEqual(result, {
      ok: false,
      error: 'Unknown tool: missing',
      recovery_hint: null,
      code: 'UNKNOWN_TOOL',
    });
  });
});
