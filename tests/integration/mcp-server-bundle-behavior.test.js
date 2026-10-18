'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { makeTempDir } = require('../support/fs');
const { ROOT, withIsolatedClaudePlugin } = require('./helpers');
const { spawnMcpServer } = require('./mcp-stdio-client');

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
 * Runs `fn` against a server booted from every runtime bundle: the Qwen
 * (repo-root), Claude and Codex entrypoints in the repo plus an isolated copy
 * of the installed Claude plugin. Each bundle names the `runtime` its
 * entrypoint defaults MAESTRO_RUNTIME to and the `expectSkill` text its
 * delegation skill content must contain. MAESTRO_RUNTIME is cleared so each
 * entrypoint applies its own default.
 */
async function forEachRuntimeBundle(fn) {
  await withIsolatedClaudePlugin(async (pluginRoot) => {
    const env = { MAESTRO_RUNTIME: '' };
    const bundles = [
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env,
        runtime: 'qwen',
        expectSkill: '# Delegation Skill',
      },
      {
        cwd: ROOT,
        relativePath: 'claude/mcp/maestro-server.js',
        env,
        runtime: 'claude',
        expectSkill: 'user-invocable: false',
      },
      {
        cwd: ROOT,
        relativePath: 'bin/maestro-mcp-server.js',
        env,
        runtime: 'codex',
        expectSkill: '# Delegation Skill',
      },
      {
        cwd: pluginRoot,
        relativePath: 'mcp/maestro-server.js',
        env,
        runtime: 'claude',
        expectSkill: 'user-invocable: false',
      },
    ];

    for (const bundle of bundles) {
      await withServer(bundle, (client) => fn(client, bundle));
    }
  });
}

describe('mcp server bundle behavior', () => {
  it('serializes typed tool failures through the MCP protocol without losing error details', async () => {
    await withServer({ cwd: ROOT, relativePath: 'mcp/maestro-server.js' }, async (client) => {
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

  it('falls back to the first discovered runtime when MAESTRO_RUNTIME is empty', async () => {
    await withServer(
      { cwd: ROOT, relativePath: 'src/mcp/maestro-server.js', env: { MAESTRO_RUNTIME: '' } },
      async (client) => {
        const result = await client.callTool('get_runtime_context');

        assert.equal(result.parsed.runtime, 'claude');
      }
    );
  });

  it('serves the runtime context each bundle entrypoint defaults to', async () => {
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
});
