const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ROOT, withIsolatedClaudePlugin, withIsolatedCodexPlugin } = require('./helpers');
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

describe('mcp server bundle behavior', () => {
  it('serves updated get_skill_content metadata from every runtime bundle', async () => {
    const staticRuntimes = [
      { cwd: ROOT, relativePath: 'mcp/maestro-server.js' },
      { cwd: ROOT, relativePath: 'claude/mcp/maestro-server.js' },
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

    await withIsolatedCodexPlugin(async (pluginRoot) => {
      await withServer({ cwd: pluginRoot, relativePath: 'mcp/maestro-server.js' }, async (client) => {
        const tools = await client.listTools();
        const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

        assert.ok(skillTool, 'Expected get_skill_content for isolated codex bundle');
        assert.match(
          skillTool.description,
          /runtime-configured Maestro content source/
        );
      });
    });

    await withIsolatedClaudePlugin(async (pluginRoot) => {
      await withServer({ cwd: pluginRoot, relativePath: 'mcp/maestro-server.js' }, async (client) => {
        const tools = await client.listTools();
        const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

        assert.ok(skillTool, 'Expected get_skill_content for isolated claude bundle');
        assert.match(
          skillTool.description,
          /runtime-configured Maestro content source/
        );
      });
    });
  });

  it('serves canonical src content from every runtime bundle', async () => {
    const staticRuntimes = [
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        expectSkill: '# Delegation Skill',
      },
      {
        cwd: ROOT,
        relativePath: 'claude/mcp/maestro-server.js',
        expectSkill: 'user-invocable: false',
      },
    ];

    for (const runtime of staticRuntimes) {
      await withServer(runtime, async (client) => {
        const skillResult = await client.callTool('get_skill_content', {
          resources: ['delegation', 'architecture'],
        });
        const agentResult = await client.callTool('get_agent', {
          agents: ['coder'],
        });

        assert.ok(skillResult.parsed.contents.delegation.includes(runtime.expectSkill));
        assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
        assert.deepEqual(skillResult.parsed.errors, {});
        assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
        assert.deepEqual(agentResult.parsed.errors, {});
      });
    }

    await withIsolatedCodexPlugin(async (pluginRoot) => {
      await withServer(
        {
          cwd: pluginRoot,
          relativePath: 'mcp/maestro-server.js',
        },
        async (client) => {
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation', 'architecture'],
          });
          const agentResult = await client.callTool('get_agent', {
            agents: ['coder'],
          });

          assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
          assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
          assert.deepEqual(agentResult.parsed.errors, {});
        }
      );
    });

    await withIsolatedClaudePlugin(async (pluginRoot) => {
      await withServer(
        {
          cwd: pluginRoot,
          relativePath: 'mcp/maestro-server.js',
        },
        async (client) => {
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation', 'architecture'],
          });
          const agentResult = await client.callTool('get_agent', {
            agents: ['coder'],
          });

          assert.ok(skillResult.parsed.contents.delegation.includes('user-invocable: false'));
          assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
          assert.deepEqual(agentResult.parsed.errors, {});
        }
      );
    });
  });

  it('uses MCP client roots for Codex session state when launched from an isolated plugin bundle', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-codex-workspace-'));

    try {
      await withIsolatedCodexPlugin(async (pluginRoot) => {
        await withServer(
          {
            cwd: pluginRoot,
            relativePath: 'mcp/maestro-server.js',
            roots: [{ uri: pathToFileURL(workspaceRoot).href, name: 'workspace' }],
          },
          async (client) => {
            const stateRoot = path.join(workspaceRoot, 'docs', 'maestro');
            const plansRoot = path.join(stateRoot, 'plans');
            const designDocument = path.join(plansRoot, 'codex-design.md');
            const implementationPlan = path.join(plansRoot, 'codex-impl.md');

            const initResult = await client.callTool('initialize_workspace', {
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
            assert.equal(fs.existsSync(path.join(pluginRoot, 'docs', 'maestro')), false);
          }
        );
      });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
