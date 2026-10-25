'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { makeTempDir } = require('../support/fs');
const { HOST_CLIENTS } = require('../support/host-clients');
const { expectExit, runNode } = require('../support/process');
const { ROOT, withIsolatedAntigravityPlugin } = require('./helpers');
const { withMcpClient } = require('./mcp-stdio-client');

/**
 * Each host's MCP server launcher at its repo path, which starts the repo's
 * src/ server with no external SDK installed.
 * `expectSkill` is text that host's delegation skill content must contain.
 * detached-payload.test.js covers the installed payloads' bundled src/.
 */
const REPO_LAUNCHERS = [
  { runtime: 'qwen', relativePath: 'mcp/maestro-server.js', expectSkill: '# Delegation Skill' },
  { runtime: 'claude', relativePath: 'claude/mcp/maestro-server.js', expectSkill: 'user-invocable: false' },
  { runtime: 'codex', relativePath: 'bin/maestro-mcp-server.js', expectSkill: '# Delegation Skill' },
  { runtime: 'antigravity', relativePath: 'antigravity/mcp/maestro-server.js', expectSkill: '# Delegation Skill' },
];

describe('mcp server bundle behavior', () => {
  it('serializes typed tool failures through the MCP protocol without losing error details', async () => {
    await withMcpClient({ cwd: ROOT, relativePath: 'mcp/maestro-server.js', clientInfo: HOST_CLIENTS.qwen }, async (client) => {
      const result = await client.callTool('get_agent', { agents: [] });

      assert.equal(result.raw.isError, true);
      assert.equal(
        result.parsed.error,
        'agents must be a non-empty array of agent identifiers'
      );
      assert.equal(result.parsed.code, 'VALIDATION_ERROR');
      assert.equal(result.parsed.recovery_hint, null);
    });
  });

  it('assumes no runtime for a client it does not recognize and fails every tool call', async () => {
    await withMcpClient({ cwd: ROOT, relativePath: 'mcp/maestro-server.js' }, async (client) => {
      assert.ok((await client.listTools()).length > 0);

      for (const name of ['get_runtime_context', 'get_skill_content']) {
        const result = await client.callTool(name, { resources: ['delegation'] });

        assert.equal(result.raw.isError, true, name);
        assert.equal(result.parsed.code, 'RUNTIME_UNIDENTIFIED', name);
        assert.match(result.parsed.error, /MCP client "maestro-test" is not one Maestro recognizes/);
        assert.equal(
          result.parsed.recovery_hint,
          'Set MAESTRO_RUNTIME to one of: antigravity, claude, codex, qwen.'
        );
      }
      assert.match(client.stderr, /\[error\] maestro: Maestro could not identify its host runtime/);
    });
  });

  it('says the client has not sent initialize when a tool is called before it', async () => {
    await withMcpClient({ cwd: ROOT, relativePath: 'mcp/maestro-server.js' }, async (client) => {
      const result = await client.callTool('get_runtime_context');

      assert.equal(result.parsed.code, 'RUNTIME_UNIDENTIFIED');
      assert.equal(
        result.parsed.error,
        'Maestro could not identify its host runtime: MAESTRO_RUNTIME is not set and the MCP client has not sent initialize yet.'
      );
    }, { initialize: false });
  });

  it('serves the runtime MAESTRO_RUNTIME names over the one the client identifies', async () => {
    await withMcpClient(
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_RUNTIME: 'codex' },
        clientInfo: HOST_CLIENTS.claude,
      },
      async (client) => {
        assert.equal((await client.callTool('get_runtime_context')).parsed.runtime, 'codex');
        assert.match(client.stderr, /Runtime codex, identified from MAESTRO_RUNTIME/);
      }
    );
  });

  it('serves the runtime of whichever host connects, whatever bundle it launches', async () => {
    for (const [runtime, clientInfo] of Object.entries(HOST_CLIENTS)) {
      await withMcpClient({ cwd: ROOT, relativePath: 'mcp/maestro-server.js', clientInfo }, async (client) => {
        assert.equal((await client.callTool('get_runtime_context')).parsed.runtime, runtime);
        assert.match(client.stderr, new RegExp(`Runtime ${runtime}, identified from MCP client "${clientInfo.name}"`));
      });
    }
  });

  for (const { runtime, relativePath, expectSkill } of REPO_LAUNCHERS) {
    it(`serves the ${runtime} runtime, tool metadata and canonical src content from ${relativePath}`, async () => {
      await withMcpClient({ cwd: ROOT, relativePath, clientInfo: HOST_CLIENTS[runtime] }, async (client) => {
        // withMcpClient has already waited for 'MCP server connected'.
        assert.match(client.stderr, /\[info\] maestro: MCP server starting/);
        assert.equal((await client.callTool('get_runtime_context')).parsed.runtime, runtime);

        const tools = await client.listTools();
        assert.ok(tools.length > 0);
        const meta = runtime === 'antigravity' ? { 'antigravity/alwaysLoad': true } : undefined;
        for (const tool of tools) assert.deepEqual(tool._meta, meta, tool.name);
        assert.match(tools.find((tool) => tool.name === 'get_skill_content').description,
          /runtime-configured Maestro content source/);

        const skills = (await client.callTool('get_skill_content', { resources: ['delegation', 'architecture'] })).parsed;
        assert.ok(skills.contents.delegation.includes(expectSkill));
        assert.ok(skills.contents.architecture.includes('## State Contract'));
        assert.deepEqual(skills.errors, {});
        const agents = (await client.callTool('get_agent', { agents: ['coder'] })).parsed;
        assert.ok(agents.agents.coder.body.includes('Senior Software Engineer'));
        assert.ok(agents.agents.coder.body.includes('## Output Contract'));
        assert.deepEqual(agents.errors, {});
      });
    });
  }

  it('refuses to start for the removed gemini runtime', () => {
    const result = runNode('mcp/maestro-server.js', [], {
      env: { ...process.env, MAESTRO_RUNTIME: 'gemini' },
      input: '',
    });

    expectExit(result, { status: 1, stdout: '' });
    assert.match(result.stderr, /Error: Unknown runtime config: gemini/);
  });

  it('serves content from its own src/ tree when MAESTRO_EXTENSION_PATH names an unrelated directory', async () => {
    // MAESTRO_EXTENSION_PATH only locates the extension .env; content must not
    // be looked up there.
    const extensionPath = makeTempDir('maestro-extension-path-');

    await withMcpClient(
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_RUNTIME: 'qwen', MAESTRO_EXTENSION_PATH: extensionPath },
      },
      async (client) => {
        const result = await client.callTool('get_skill_content', { resources: ['delegation'] });

        assert.ok(result.parsed.contents.delegation.includes('# Delegation Skill'));
        assert.deepEqual(result.parsed.errors, {});
      }
    );
  });

  it('suggests the workspace Qwen Code exports in MAESTRO_WORKSPACE_PATH over client roots and cwd', async () => {
    // qwen-extension.json substitutes ${workspacePath} into MAESTRO_WORKSPACE_PATH.
    // The client roots and the server cwd both name the repo root, Qwen's
    // extension dir.
    const workspace = makeTempDir('maestro-qwen-workspace-');

    await withMcpClient(
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_RUNTIME: 'qwen', MAESTRO_WORKSPACE_PATH: workspace },
      },
      async (client) => {
        const context = (await client.callTool('get_runtime_context')).parsed;

        assert.equal(context.runtime, 'qwen');
        assert.equal(context.workspace_suggestion, workspace);
      }
    );
  });

  it('keeps Codex session state in the explicit workspace_path when launched from a cwd outside it', async () => {
    const workspaceRoot = makeTempDir('maestro-codex-workspace-');
    const spawnCwd = makeTempDir('maestro-codex-spawn-');

    await withMcpClient(
      {
        cwd: spawnCwd,
        // Absolute, because the server is spawned from a cwd outside the repo.
        relativePath: path.join(ROOT, 'bin', 'maestro-mcp-server.js'),
        clientInfo: HOST_CLIENTS.codex,
        roots: [{ uri: pathToFileURL(workspaceRoot).href, name: 'workspace' }],
      },
      async (client) => {
        const stateRoot = path.join(workspaceRoot, 'docs', 'maestro');
        const plansRoot = path.join(stateRoot, 'plans');
        const designDocument = path.join(plansRoot, 'codex-design.md');
        const implementationPlan = path.join(plansRoot, 'codex-impl.md');

        const initResult = await client.callTool('initialize_workspace', {
          workspace_path: workspaceRoot,
          state_dir: 'docs/maestro',
        });
        assert.equal(initResult.parsed.success, true);
        assert.equal(fs.existsSync(path.join(stateRoot, 'state')), true);
        assert.equal(fs.existsSync(path.join(stateRoot, 'plans')), true);

        fs.writeFileSync(designDocument, '# Design\n');
        fs.writeFileSync(implementationPlan, '# Plan\n');

        const sessionResult = await client.callTool('create_session', {
          session_id: 'codex-roots-workspace',
          task: 'Validate Codex root resolution',
          design_document: path.relative(workspaceRoot, designDocument),
          implementation_plan: path.relative(workspaceRoot, implementationPlan),
          phases: [
            {
              id: 1,
              name: 'Implement',
              agent: 'coder',
              parallel: false,
              blocked_by: [],
            },
          ],
        });

        const expectedSessionPath = path.join(stateRoot, 'state', 'active-session.md');
        assert.equal(sessionResult.parsed.success, true);
        assert.equal(sessionResult.parsed.path, expectedSessionPath);
        assert.equal(fs.existsSync(expectedSessionPath), true);

        const archiveResult = await client.callTool('archive_session', {
          session_id: 'codex-roots-workspace',
        });

        const archivedSession = path.join(
          stateRoot,
          'state',
          'archive',
          'codex-roots-workspace.md'
        );
        const archivedDesign = path.join(stateRoot, 'plans', 'archive', 'codex-design.md');
        const archivedImplementation = path.join(
          stateRoot,
          'plans',
          'archive',
          'codex-impl.md'
        );

        assert.equal(archiveResult.parsed.success, true);
        assert.deepEqual(
          archiveResult.parsed.archived_files.sort(),
          [archivedDesign, archivedImplementation, archivedSession].sort()
        );
        assert.equal(fs.existsSync(archivedSession), true);
        assert.equal(fs.existsSync(archivedDesign), true);
        assert.equal(fs.existsSync(archivedImplementation), true);
        assert.equal(fs.existsSync(designDocument), false);
        assert.equal(fs.existsSync(implementationPlan), false);
        assert.equal(fs.existsSync(path.join(spawnCwd, 'docs', 'maestro')), false);
      }
    );
  });

  it('keeps following the client roots when Antigravity sends roots/list_changed after initialization', async () => {
    const firstWorkspace = makeTempDir('maestro-antigravity-first-');
    const secondWorkspace = makeTempDir('maestro-antigravity-second-');

    // The installed plugin directory is the server cwd and is never
    // suggested, so without client roots there is no suggestion at all.
    await withIsolatedAntigravityPlugin(async (pluginRoot) => {
      // Drive the server the way the Antigravity CLI (agy 1.4.2) does:
      // requests numbered from 0, `server/discover` before `initialize`, the
      // roots capability, and `notifications/roots/list_changed` even after
      // roots/list was answered. MAESTRO_WORKSPACE_PATH is cleared so an
      // inherited value cannot supply the suggestion.
      await withMcpClient({
        cwd: pluginRoot,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_WORKSPACE_PATH: '' },
        roots: [{ uri: pathToFileURL(firstWorkspace).href, name: 'first' }],
        firstRequestId: 0,
        requestTimeoutMs: 5000,
      }, async (client) => {
        await assert.rejects(client.request('server/discover'), (error) => {
          assert.equal(JSON.parse(error.message).code, -32601);
          return true;
        });

        await client.request('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: { roots: { listChanged: true } },
          clientInfo: HOST_CLIENTS.antigravity,
        });
        assert.equal((await client.callTool('get_runtime_context')).parsed.workspace_suggestion, null);

        client.notify('notifications/initialized');
        await client.rootsAnswered(1);
        assert.equal((await client.callTool('get_runtime_context')).parsed.workspace_suggestion, firstWorkspace);

        // Antigravity repeats list_changed after its roots/list reply.
        client.notify('notifications/roots/list_changed');
        await client.rootsAnswered(2);
        assert.equal((await client.callTool('get_runtime_context')).parsed.workspace_suggestion, firstWorkspace);

        client.roots = [{ uri: pathToFileURL(secondWorkspace).href, name: 'second' }];
        client.notify('notifications/roots/list_changed');
        await client.rootsAnswered(3);
        const context = (await client.callTool('get_runtime_context')).parsed;
        assert.equal(context.runtime, 'antigravity');
        assert.equal(context.workspace_suggestion, secondWorkspace);
      }, { initialize: false });
    });
  });
});
