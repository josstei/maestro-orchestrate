const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/lib/mcp/core/create-server');
const { createToolRegistry } = require('../../src/lib/mcp/core/tool-registry');
const { defineToolPack } = require('../../src/lib/mcp/tool-packs/contracts');

describe('mcp kernel', () => {
  it('assembles tool schemas and handlers in pack order', () => {
    const initHandler = () => ({ ok: 'workspace' });
    const sessionHandler = () => ({ ok: 'session' });

    const registry = createToolRegistry({
      runtimeConfig: { name: 'codex' },
      services: { logger: {} },
      toolPacks: [
        defineToolPack({
          name: 'workspace',
          tools: [{ name: 'initialize_workspace' }],
          handlers: { initialize_workspace: initHandler },
        }),
        (context) =>
          defineToolPack({
            name: `session-${context.runtimeConfig.name}`,
            tools: [{ name: 'get_session_status' }],
            handlers: { get_session_status: sessionHandler },
          }),
      ],
    });

    assert.deepEqual(
      registry.schemas.map((schema) => schema.name),
      ['initialize_workspace', 'get_session_status']
    );
    assert.equal(registry.handlers.initialize_workspace, initHandler);
    assert.equal(registry.handlers.get_session_status, sessionHandler);
    assert.equal(registry.toolPacks[1].name, 'session-codex');
  });

  it('rejects duplicate tool names across packs', () => {
    assert.throws(
      () =>
        createToolRegistry({
          runtimeConfig: { name: 'codex' },
          services: {},
          toolPacks: [
            defineToolPack({
              name: 'first-pack',
              tools: [{ name: 'validate_plan' }],
              handlers: { validate_plan: () => ({ ok: true }) },
            }),
            defineToolPack({
              name: 'second-pack',
              tools: [{ name: 'validate_plan' }],
              handlers: { validate_plan: () => ({ ok: true }) },
            }),
          ],
        }),
      /Duplicate tool name "validate_plan" found in packs "first-pack" and "second-pack"\./
    );
  });

  it('dispatches tool calls through the assembled registry', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        defineToolPack({
          name: 'workspace',
          tools: [{ name: 'resolve_settings' }],
          handlers: {
            resolve_settings: (args, projectRoot) => ({
              projectRoot,
              requested: args.settings,
            }),
          },
        }),
      ],
    });

    const result = await server.callTool(
      'resolve_settings',
      { settings: ['MAESTRO_EXECUTION_MODE'] },
      '/tmp/workspace'
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.result, {
      projectRoot: '/tmp/workspace',
      requested: ['MAESTRO_EXECUTION_MODE'],
    });
  });

  it('returns recovery hints for known tool failures', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [
        defineToolPack({
          name: 'session',
          tools: [{ name: 'create_session' }],
          handlers: {
            create_session: () => {
              throw new Error('Active session already exists.');
            },
          },
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
});
