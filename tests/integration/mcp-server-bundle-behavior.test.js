'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const { makeTempDir } = require('../support/fs');
const { ROOT, withIsolatedAntigravityPlugin, withIsolatedClaudePlugin } = require('./helpers');
const { spawnMcpServer } = require('./mcp-stdio-client');

const ROOTS_TIMEOUT_MS = 5000;

// The clientInfo each host sends in `initialize`, from which the server
// identifies its runtime.
const HOST_CLIENTS = Object.freeze({
  antigravity: { name: 'antigravity-client', version: 'v1.0.0' },
  claude: { name: 'claude-code', version: '2.1.303' },
  codex: { name: 'codex-mcp-client', title: 'Codex', version: '0.163.0' },
  // Qwen Code suffixes the server's key in mcpServers.
  qwen: { name: 'qwen-cli-mcp-client-maestro', version: '0.0.1' },
});

async function withServer(options, fn) {
  const client = spawnMcpServer(options);
  try {
    await client.ready;
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

/**
 * Spawns the MCP server of the Antigravity plugin at `cwd` and lets a test
 * drive it the way the Antigravity CLI (agy 1.4.2) does: `server/discover`
 * before `initialize`, the roots capability, and
 * `notifications/roots/list_changed` even after roots/list was answered.
 * Every roots/list request is answered with `client.roots`;
 * `rootsAnswered(n)` resolves once n requests have been answered.
 */
function spawnAntigravityClient({ cwd, roots }) {
  const child = spawn(process.execPath, ['mcp/maestro-server.js'], {
    cwd,
    env: { ...process.env, MAESTRO_RUNTIME: '', MAESTRO_WORKSPACE_PATH: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  const rootsWaiters = new Set();
  let rootsRequests = 0;
  let nextId = 0;
  let stderr = '';

  const send = (message) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('exit', (code) => {
    for (const { reject } of pending.values()) {
      reject(new Error(`Server exited (code=${code}).\nSTDERR:\n${stderr}`));
    }
    pending.clear();
  });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    if (message.method === 'roots/list') {
      send({ id: message.id, result: { roots: client.roots } });
      rootsRequests += 1;
      for (const waiter of rootsWaiters) waiter();
      return;
    }
    const entry = pending.get(message.id);
    if (entry) {
      pending.delete(message.id);
      entry.resolve(message);
    }
  });

  const client = {
    roots,
    request(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`No reply to ${method} within ${ROOTS_TIMEOUT_MS}ms.\nSTDERR:\n${stderr}`));
        }, ROOTS_TIMEOUT_MS);
        pending.set(id, {
          resolve: (message) => { clearTimeout(timer); resolve(message); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
        send({ id, method, params });
      });
    },
    notify(method, params = {}) {
      send({ method, params });
    },
    rootsAnswered(count) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          rootsWaiters.delete(check);
          reject(new Error(`Expected roots/list request #${count}, got ${rootsRequests}`));
        }, ROOTS_TIMEOUT_MS);
        function check() {
          if (rootsRequests < count) return;
          clearTimeout(timer);
          rootsWaiters.delete(check);
          resolve();
        }
        rootsWaiters.add(check);
        check();
      });
    },
    async callTool(name, args = {}) {
      const { result } = await client.request('tools/call', { name, arguments: args });
      return JSON.parse(result.content[0].text);
    },
    close() {
      child.kill('SIGTERM');
    },
  };
  return client;
}

/**
 * Runs `fn` against a server booted from every runtime bundle: the Qwen
 * (repo-root), Claude, Codex and Antigravity entrypoints in the repo plus
 * isolated copies of the installed Claude and Antigravity plugins. Each
 * bundle is driven by the host that launches it, named by `runtime` and
 * identified from that host's clientInfo, and names the `expectSkill` text
 * its delegation skill content must contain.
 */
async function forEachRuntimeBundle(fn) {
  await withIsolatedClaudePlugin((pluginRoot) =>
    withIsolatedAntigravityPlugin(async (antigravityPluginRoot) => {
      const bundles = [
        {
          cwd: ROOT,
          relativePath: 'mcp/maestro-server.js',
          runtime: 'qwen',
          expectSkill: '# Delegation Skill',
        },
        {
          cwd: ROOT,
          relativePath: 'claude/mcp/maestro-server.js',
          runtime: 'claude',
          expectSkill: 'user-invocable: false',
        },
        {
          cwd: ROOT,
          relativePath: 'bin/maestro-mcp-server.js',
          runtime: 'codex',
          expectSkill: '# Delegation Skill',
        },
        {
          cwd: pluginRoot,
          relativePath: 'mcp/maestro-server.js',
          runtime: 'claude',
          expectSkill: 'user-invocable: false',
        },
        {
          cwd: ROOT,
          relativePath: 'antigravity/mcp/maestro-server.js',
          runtime: 'antigravity',
          expectSkill: '# Delegation Skill',
        },
        {
          cwd: antigravityPluginRoot,
          relativePath: 'mcp/maestro-server.js',
          runtime: 'antigravity',
          expectSkill: '# Delegation Skill',
        },
      ];

      for (const bundle of bundles) {
        await withServer({ ...bundle, clientInfo: HOST_CLIENTS[bundle.runtime] }, (client) => fn(client, bundle));
      }
    })
  );
}

describe('mcp server bundle behavior', () => {
  it('serializes typed tool failures through the MCP protocol without losing error details', async () => {
    await withServer({ cwd: ROOT, relativePath: 'mcp/maestro-server.js', clientInfo: HOST_CLIENTS.qwen }, async (client) => {
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
    await withServer({ cwd: ROOT, relativePath: 'mcp/maestro-server.js' }, async (client) => {
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
    const client = spawnMcpServer({ cwd: ROOT, relativePath: 'mcp/maestro-server.js' });
    try {
      await client.ready;
      const result = await client.callTool('get_runtime_context');

      assert.equal(result.parsed.code, 'RUNTIME_UNIDENTIFIED');
      assert.equal(
        result.parsed.error,
        'Maestro could not identify its host runtime: MAESTRO_RUNTIME is not set and the MCP client has not sent initialize yet.'
      );
    } finally {
      await client.close();
    }
  });

  it('serves the runtime MAESTRO_RUNTIME names over the one the client identifies', async () => {
    await withServer(
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
      await withServer({ cwd: ROOT, relativePath: 'mcp/maestro-server.js', clientInfo }, async (client) => {
        assert.equal((await client.callTool('get_runtime_context')).parsed.runtime, runtime);
        assert.match(client.stderr, new RegExp(`Runtime ${runtime}, identified from MCP client "${clientInfo.name}"`));
      });
    }
  });

  it('serves the runtime of the host that launches each bundle', async () => {
    await forEachRuntimeBundle(async (client, bundle) => {
      const result = await client.callTool('get_runtime_context');

      assert.equal(
        result.parsed.runtime,
        bundle.runtime,
        `Expected ${path.join(bundle.cwd, bundle.relativePath)} to serve the ${bundle.runtime} runtime`
      );
    });
  });

  it('serves updated get_skill_content metadata from every runtime bundle', async () => {
    await forEachRuntimeBundle(async (client, bundle) => {
      const tools = await client.listTools();
      const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

      assert.ok(
        skillTool,
        `Expected get_skill_content for ${path.join(bundle.cwd, bundle.relativePath)}`
      );
      assert.match(
        skillTool.description,
        /runtime-configured Maestro content source/
      );
    });
  });

  it('marks every listed tool always-loaded on the antigravity bundles only', async () => {
    await forEachRuntimeBundle(async (client, bundle) => {
      const tools = await client.listTools();
      const label = path.join(bundle.cwd, bundle.relativePath);

      assert.ok(tools.length > 0, label);
      for (const tool of tools) {
        if (bundle.runtime === 'antigravity') {
          assert.deepEqual(tool._meta, { 'antigravity/alwaysLoad': true }, `${label}: ${tool.name}`);
        } else {
          assert.equal('_meta' in tool, false, `${label}: ${tool.name}`);
        }
      }
    });
  });

  it('serves canonical src content from every runtime bundle', async () => {
    await forEachRuntimeBundle(async (client, bundle) => {
      const skillResult = await client.callTool('get_skill_content', {
        resources: ['delegation', 'architecture'],
      });
      const agentResult = await client.callTool('get_agent', {
        agents: ['coder'],
      });

      assert.ok(skillResult.parsed.contents.delegation.includes(bundle.expectSkill));
      assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
      assert.deepEqual(skillResult.parsed.errors, {});
      assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
      assert.ok(agentResult.parsed.agents.coder.body.includes('## Output Contract'));
      assert.deepEqual(agentResult.parsed.errors, {});
    });
  });

  it('keeps Codex session state in the explicit workspace_path when launched from a cwd outside it', async () => {
    const workspaceRoot = makeTempDir('maestro-codex-workspace-');
    const spawnCwd = makeTempDir('maestro-codex-spawn-');

    await withServer(
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
      const client = spawnAntigravityClient({
        cwd: pluginRoot,
        roots: [{ uri: pathToFileURL(firstWorkspace).href, name: 'first' }],
      });
      try {
        const discover = await client.request('server/discover');
        assert.equal(discover.error.code, -32601);

        await client.request('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: { roots: { listChanged: true } },
          clientInfo: HOST_CLIENTS.antigravity,
        });
        assert.equal((await client.callTool('get_runtime_context')).workspace_suggestion, null);

        client.notify('notifications/initialized');
        await client.rootsAnswered(1);
        assert.equal((await client.callTool('get_runtime_context')).workspace_suggestion, firstWorkspace);

        // Antigravity repeats list_changed after its roots/list reply.
        client.notify('notifications/roots/list_changed');
        await client.rootsAnswered(2);
        assert.equal((await client.callTool('get_runtime_context')).workspace_suggestion, firstWorkspace);

        client.roots = [{ uri: pathToFileURL(secondWorkspace).href, name: 'second' }];
        client.notify('notifications/roots/list_changed');
        await client.rootsAnswered(3);
        const context = await client.callTool('get_runtime_context');
        assert.equal(context.runtime, 'antigravity');
        assert.equal(context.workspace_suggestion, secondWorkspace);
      } finally {
        client.close();
      }
    });
  });
});
