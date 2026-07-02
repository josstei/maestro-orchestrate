const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ROOT, createTempRepoCopy, withPackagedClaudeRuntime } = require('./helpers');
const { makeTempSrcRoot, cleanupTempRoots } = require('../support/content');

const CODEX_BIN = path.join(ROOT, 'bin', 'maestro-mcp-server.js');
const { spawnMcpServer } = require('./mcp-stdio-client');

after(cleanupTempRoots);

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

  it('serves updated get_skill_content metadata from every runtime bundle', async () => {
    const staticRuntimes = [
      { cwd: ROOT, relativePath: 'mcp/maestro-server.js', env: { MAESTRO_EXTENSION_PATH: '' } },
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_EXTENSION_PATH: '', MAESTRO_RUNTIME: 'qwen' },
      },
      { cwd: ROOT, relativePath: 'claude/mcp/maestro-server.js', env: { MAESTRO_EXTENSION_PATH: '' } },
      { cwd: ROOT, relativePath: CODEX_BIN, env: { MAESTRO_EXTENSION_PATH: '' } },
    ];

    for (const runtime of staticRuntimes) {
      await withServer(runtime, async (client) => {
        const tools = await client.listTools();
        const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

        assert.ok(skillTool, `Expected get_skill_content for ${runtime.relativePath}`);
        assert.match(
          skillTool.description,
          /runtime-configured Maestro content source/
        );
      });
    }

    await withPackagedClaudeRuntime(async (packageRoot) => {
      await withServer(
        {
          cwd: packageRoot,
          relativePath: 'claude/mcp/maestro-server.js',
          env: { MAESTRO_EXTENSION_PATH: '' },
        },
        async (client) => {
          const tools = await client.listTools();
          const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

          assert.ok(skillTool, 'Expected get_skill_content for packaged claude runtime');
          assert.match(
            skillTool.description,
            /runtime-configured Maestro content source/
          );
        }
      );
    });
  });

  it('serves canonical src content from every runtime bundle', async () => {
    const staticRuntimes = [
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_EXTENSION_PATH: '' },
        expectSkill: '# Delegation Skill',
      },
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        env: { MAESTRO_EXTENSION_PATH: '', MAESTRO_RUNTIME: 'qwen' },
        expectSkill: '# Delegation Skill',
        verifyAgent(agentResult) {
          const qwenAgent = agentResult.parsed.agents.ux_designer;
          assert.ok(qwenAgent.body.includes('UX Designer'));
          assert.equal(qwenAgent.tool_name, 'ux_designer');
          assert.ok(qwenAgent.tools.includes('web_search'));
          assert.ok(qwenAgent.tools.includes('edit'));
          assert.ok(qwenAgent.tools.includes('ask_user_question'));
        },
      },
      {
        cwd: ROOT,
        relativePath: 'claude/mcp/maestro-server.js',
        env: { MAESTRO_EXTENSION_PATH: '' },
        expectSkill: 'user-invocable: false',
      },
      {
        cwd: ROOT,
        relativePath: CODEX_BIN,
        env: { MAESTRO_EXTENSION_PATH: '' },
        expectSkill: '# Delegation Skill',
      },
    ];

    for (const runtime of staticRuntimes) {
      await withServer(runtime, async (client) => {
        const skillResult = await client.callTool('get_skill_content', {
          resources: ['delegation', 'architecture'],
        });
        const agentResult = await client.callTool('get_agent', {
          agents: runtime.verifyAgent ? ['ux_designer'] : ['coder'],
        });

        assert.ok(skillResult.parsed.contents.delegation.includes(runtime.expectSkill));
        assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
        assert.deepEqual(skillResult.parsed.errors, {});
        if (runtime.verifyAgent) {
          runtime.verifyAgent(agentResult);
        } else {
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
        }
        assert.deepEqual(agentResult.parsed.errors, {});
      });
    }

    await withPackagedClaudeRuntime(async (packageRoot) => {
      const packageSourceRoot = path.resolve(packageRoot, 'src');
      const skillSentinel = 'packaged claude source skill sentinel';
      const agentSentinel = 'Packaged Claude source agent sentinel.';

      assert.equal(fs.existsSync(packageSourceRoot), true);
      fs.appendFileSync(
        path.join(packageSourceRoot, 'skills', 'shared', 'delegation', 'SKILL.md'),
        `\n${skillSentinel}\n`,
        'utf8'
      );
      fs.appendFileSync(
        path.join(packageSourceRoot, 'agents', 'coder.md'),
        `\n${agentSentinel}\n`,
        'utf8'
      );

      await withServer(
        {
          cwd: packageRoot,
          relativePath: 'claude/mcp/maestro-server.js',
          env: { MAESTRO_EXTENSION_PATH: '' },
        },
        async (client) => {
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation', 'architecture'],
          });
          const agentResult = await client.callTool('get_agent', {
            agents: ['coder'],
          });

          assert.ok(skillResult.parsed.contents.delegation.includes('user-invocable: false'));
          assert.ok(skillResult.parsed.contents.delegation.includes(skillSentinel));
          assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes(agentSentinel));
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
          assert.deepEqual(agentResult.parsed.errors, {});
        }
      );
    });
  });

  it('serves Claude startup and content without a detached src payload', async () => {
    const packageRoot = createTempRepoCopy('maestro-claude-no-payload-');

    try {
      const detachedPayload = path.join(packageRoot, 'claude', 'src');
      const skillSentinel = 'package-root skill sentinel for Claude no-payload fixture';
      const agentSentinel = 'Package-root agent sentinel for Claude no-payload fixture.';

      fs.rmSync(detachedPayload, { recursive: true, force: true });
      fs.appendFileSync(
        path.join(packageRoot, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
        `\n${skillSentinel}\n`,
        'utf8'
      );
      fs.appendFileSync(
        path.join(packageRoot, 'src', 'agents', 'coder.md'),
        `\n${agentSentinel}\n`,
        'utf8'
      );
      assert.equal(fs.existsSync(detachedPayload), false);

      await withServer({
        cwd: packageRoot,
        relativePath: 'claude/mcp/maestro-server.js',
        env: { MAESTRO_EXTENSION_PATH: '' },
      }, async (client) => {
        const skillResult = await client.callTool('get_skill_content', {
          resources: ['delegation'],
        });
        const agentResult = await client.callTool('get_agent', {
          agents: ['coder'],
        });

        assert.ok(skillResult.parsed.contents.delegation.includes(skillSentinel));
        assert.ok(skillResult.parsed.contents.delegation.includes('user-invocable: false'));
        assert.deepEqual(skillResult.parsed.errors, {});
        assert.ok(agentResult.parsed.agents.coder.body.includes(agentSentinel));
        assert.deepEqual(agentResult.parsed.errors, {});
      });
    } finally {
      fs.rmSync(path.dirname(packageRoot), { recursive: true, force: true });
    }
  });

  it('normalizes package roots over ambient extension path values', async () => {
    const bogusRoot = createTempRepoCopy('maestro-bogus-extension-root-');

    try {
      const bogusSentinel = 'bogus extension root sentinel';
      fs.appendFileSync(
        path.join(bogusRoot, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
        `\n${bogusSentinel}\n`,
        'utf8'
      );

      await withPackagedClaudeRuntime(async (packageRoot) => {
        const packageSentinel = 'claude package root wins over ambient extension path';
        fs.appendFileSync(
          path.join(packageRoot, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
          `\n${packageSentinel}\n`,
          'utf8'
        );

        await withServer({
          cwd: packageRoot,
          relativePath: 'claude/mcp/maestro-server.js',
          env: { MAESTRO_EXTENSION_PATH: bogusRoot },
        }, async (client) => {
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation'],
          });

          assert.ok(skillResult.parsed.contents.delegation.includes(packageSentinel));
          assert.ok(!skillResult.parsed.contents.delegation.includes(bogusSentinel));
        });
      });

      const codexPackageRoot = createTempRepoCopy('maestro-codex-ambient-root-');
      try {
        const packageSentinel = 'codex package root wins over ambient extension path';
        fs.appendFileSync(
          path.join(codexPackageRoot, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
          `\n${packageSentinel}\n`,
          'utf8'
        );

        await withServer({
          cwd: codexPackageRoot,
          relativePath: 'bin/maestro-mcp-server.js',
          env: { MAESTRO_EXTENSION_PATH: bogusRoot },
        }, async (client) => {
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation'],
          });

          assert.ok(skillResult.parsed.contents.delegation.includes(packageSentinel));
          assert.ok(!skillResult.parsed.contents.delegation.includes(bogusSentinel));
        });
      } finally {
        fs.rmSync(path.dirname(codexPackageRoot), { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(path.dirname(bogusRoot), { recursive: true, force: true });
    }
  });

  it('serves Codex startup and content without a plugin-local src payload', async () => {
    const packageRoot = createTempRepoCopy('maestro-codex-no-payload-');

    try {
      const retiredPayload = path.join(packageRoot, 'plugins', 'maestro', 'src');
      const skillSentinel = 'package-root skill sentinel for Codex no-payload fixture';
      const agentSentinel = 'Package-root agent sentinel for Codex no-payload fixture.';
      fs.rmSync(retiredPayload, { recursive: true, force: true });
      fs.appendFileSync(
        path.join(packageRoot, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
        `\n${skillSentinel}\n`,
        'utf8'
      );
      fs.appendFileSync(
        path.join(packageRoot, 'src', 'agents', 'coder.md'),
        `\n${agentSentinel}\n`,
        'utf8'
      );
      assert.equal(fs.existsSync(retiredPayload), false);

      await withServer({
        cwd: packageRoot,
        relativePath: 'bin/maestro-mcp-server.js',
        env: { MAESTRO_EXTENSION_PATH: '' },
      }, async (client) => {
        const tools = await client.listTools();
        const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

        assert.ok(skillTool, 'Expected get_skill_content for Codex without plugin src payload');

        const skillResult = await client.callTool('get_skill_content', {
          resources: ['delegation', 'architecture'],
        });
        const agentResult = await client.callTool('get_agent', {
          agents: ['coder'],
        });

        assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
        assert.ok(skillResult.parsed.contents.delegation.includes(skillSentinel));
        assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
        assert.deepEqual(skillResult.parsed.errors, {});
        assert.ok(agentResult.parsed.agents.coder.body.includes(agentSentinel));
        assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
        assert.deepEqual(agentResult.parsed.errors, {});
      });
    } finally {
      fs.rmSync(path.dirname(packageRoot), { recursive: true, force: true });
    }
  });

  it('uses MCP client roots for Codex session state when launched from a cwd outside the workspace', async () => {
    const workspaceRoot = makeTempSrcRoot('maestro-codex-workspace-');
    const spawnCwd = makeTempSrcRoot('maestro-codex-spawn-');

    try {
      {
        await withServer(
          {
            cwd: spawnCwd,
            relativePath: CODEX_BIN,
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
      }
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(spawnCwd, { recursive: true, force: true });
    }
  });
});
