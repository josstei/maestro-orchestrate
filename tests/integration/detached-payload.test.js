'use strict';

const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempRepoCopy, runGenerator } = require('./helpers');
const { makeTempDir } = require('../support/fs');
const { hermeticEnv } = require('../support/env');
const { HOST_CLIENTS } = require('../support/catalog');
const { expectExit, runNode } = require('../support/process');
const { assertStateCliRoundTrip } = require('../support/state');
const { withMcpClient } = require('./mcp-stdio-client');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { createHandler: createGetAgent } = require('../../src/mcp/handlers/get-agent');
const { createHandler: createGetContent } = require('../../src/mcp/handlers/get-skill-content');
const AGENTS = require('../../src/generated/agent-registry.json').map((agent) => agent.name);
const RESOURCES = Object.keys(require('../../src/generated/resource-registry.json'));
const HOOKS = Object.keys(require('../../src/generated/hook-registry.json'));

const installed = {};
let sourceRoot;
before(() => {
  const repo = createTempRepoCopy('maestro-payload-build-');
  sourceRoot = path.join(repo, 'src');
  runGenerator([], { cwd: repo });
  for (const [runtime, directory] of Object.entries({ antigravity: 'antigravity', claude: 'claude', codex: 'plugins/maestro' })) {
    const plugin = path.join(makeTempDir(`maestro-payload-${runtime}-`), 'installed');
    fs.cpSync(path.join(repo, directory), plugin, { recursive: true });
    installed[runtime] = plugin;
  }
});

for (const runtime of ['antigravity', 'claude', 'codex']) {
  describe(`${runtime} detached dependency closure`, () => {
    it('invokes all 17 tools and every agent/resource without build dependencies', async () => {
      const plugin = installed[runtime];
      const workspace = makeTempDir('maestro-payload-workspace-');
      fs.writeFileSync(path.join(workspace, '.env'), 'MAESTRO_EXECUTION_MODE=parallel\n');
      assert.equal(fs.existsSync(path.join(plugin, 'node_modules')), false);
      assert.equal(fs.existsSync(path.join(plugin, 'src/generator')), false);
      await withMcpClient({
        cwd: workspace,
        relativePath: path.join(plugin, runtime === 'codex' ? 'src/mcp/maestro-server.js' : 'mcp/maestro-server.js'),
        // Only Claude's host exports the plugin root, and the installed server
        // must not need MAESTRO_EXTENSION_PATH to find its content.
        env: hermeticEnv(workspace, runtime === 'claude' ? { CLAUDE_PLUGIN_ROOT: plugin } : {}),
        clientInfo: HOST_CLIENTS[runtime],
        requestTimeoutMs: 5000,
      }, async (client) => {
        assert.match(client.stderr, /\[info\] maestro: MCP server starting/);
        const tools = await client.listTools();
        const advertised = tools.map((tool) => tool.name).sort();
        assert.equal(advertised.length, 17);
        const meta = runtime === 'antigravity' ? { 'antigravity/alwaysLoad': true } : undefined;
        for (const tool of tools) assert.deepEqual(tool._meta, meta, tool.name);
        assert.match(tools.find((tool) => tool.name === 'get_skill_content').description,
          /runtime-configured Maestro content source/);
        const invoked = new Set();
        async function call(name, args = {}) {
          const result = await client.callTool(name, args);
          assert.notEqual(result.raw.isError, true, `${name}: ${JSON.stringify(result.parsed)}`);
          invoked.add(name);
          return result.parsed;
        }
        assert.deepEqual(await call('get_agent', { agents: AGENTS }),
          createGetAgent(getRuntimeConfig(runtime), sourceRoot)({ agents: AGENTS }));
        assert.deepEqual(await call('get_skill_content', { resources: RESOURCES }),
          createGetContent(getRuntimeConfig(runtime), sourceRoot)({ resources: RESOURCES }));
        const local = path.join(plugin, 'src/templates/session-state.md');
        const previous = fs.readFileSync(local, 'utf8');
        try {
          fs.writeFileSync(local, `${previous}\nFresh installed content\n`);
          const result = await call('get_skill_content', { resources: ['session-state'] });
          assert.match(result.contents['session-state'], /Fresh installed content/);
        } finally {
          fs.writeFileSync(local, previous);
        }

        assert.equal((await call('get_runtime_context')).runtime, runtime);
        assert.equal((await call('initialize_workspace', { workspace_path: workspace })).workspace_path, workspace);
        assert.equal((await call('assess_task_complexity', { task_description: 'Detached install acceptance' })).has_package_json, false);
        assert.equal((await call('resolve_settings', { settings: ['MAESTRO_EXECUTION_MODE'] })).settings.MAESTRO_EXECUTION_MODE, 'parallel');
        const phases = [{ id: 1, name: 'Build', agent: 'coder', parallel: false, blocked_by: [], files: ['result.txt'] }];
        assert.equal((await call('validate_plan', { plan: { phases }, task_complexity: 'simple' })).valid, true);

        const session_id = 'detached-acceptance';
        assert.equal((await call('enter_design_gate', { session_id })).success, true);
        assert.equal((await call('record_design_approval', {
          session_id,
          design_document_content: '# Detached design\n',
          design_document_filename: 'design.md',
        })).success, true);
        assert.ok((await call('get_design_gate_status', { session_id })).approved_at);
        assert.equal((await call('create_session', {
          session_id,
          task: 'Detached install acceptance',
          task_complexity: 'simple',
          phases,
          implementation_plan_content: '# Detached plan\n',
          implementation_plan_filename: 'plan.md',
        })).success, true);
        assert.equal((await call('get_session_status', { session_id })).exists, true);
        assert.equal((await call('update_session', { session_id, execution_mode: 'parallel' })).success, true);
        fs.writeFileSync(path.join(workspace, 'result.txt'), 'Created in the workspace\n');
        assert.equal((await call('transition_phase', { session_id, completed_phase_id: 1 })).success, true);
        const scan = await call('scan_phase_changes', { session_id, phase_id: 1 });
        assert.ok([...scan.candidates.created, ...scan.candidates.modified].includes('result.txt'));
        assert.equal((await call('reconcile_phase', {
          session_id,
          phase_id: 1,
          files_created: ['result.txt'],
          downstream_context: { integration_points: ['result.txt'] },
        })).success, true);
        const archive = await call('archive_session', { session_id });
        assert.equal(archive.success, true);
        const stateRoot = path.join(workspace, 'docs/maestro');
        assert.deepEqual(archive.archived_files.sort(), [
          path.join(stateRoot, 'state/archive', `${session_id}.md`),
          path.join(stateRoot, 'plans/archive/design.md'),
          path.join(stateRoot, 'plans/archive/plan.md'),
        ].sort());
        assert.equal(fs.readFileSync(path.join(stateRoot, 'plans/archive/design.md'), 'utf8'), '# Detached design\n');
        assert.equal(fs.readFileSync(path.join(stateRoot, 'plans/archive/plan.md'), 'utf8'), '# Detached plan\n');
        assert.equal((await call('get_session_status', { session_id })).exists, false);
        assert.equal(fs.existsSync(path.join(plugin, 'docs/maestro')), false);
        assert.deepEqual([...invoked].sort(), advertised, 'Every advertised tool must execute successfully');
      });
    });

    it('runs all five documented state CLIs from absolute installed paths in a separate workspace', () => {
      const plugin = installed[runtime];
      const workspace = makeTempDir('maestro-installed-cli-workspace-');
      fs.writeFileSync(path.join(workspace, '.env'), 'MAESTRO_EXECUTION_MODE=parallel\nMAESTRO_STATE_DIR=custom-maestro\n');
      assertStateCliRoundTrip(path.join(plugin, 'src/scripts'), 'custom-maestro', {
        cwd: workspace,
        env: hermeticEnv(workspace, { MAESTRO_EXTENSION_PATH: plugin }),
      });
      assert.equal(fs.existsSync(path.join(plugin, 'docs/maestro')), false);
    });

    if (runtime !== 'codex') {
      it('runs every registered hook and each policy decision from the installed entrypoints', () => {
        const plugin = installed[runtime];
        const workspace = makeTempDir('maestro-payload-hook-workspace-');
        const hooksDir = makeTempDir('maestro-payload-hook-state-');
        const env = hermeticEnv(workspace, { MAESTRO_EXTENSION_PATH: plugin, MAESTRO_HOOKS_DIR: hooksDir });
        const wrapperDir = runtime === 'claude' ? 'scripts' : 'hooks';
        const input = runtime === 'claude'
          ? { cwd: workspace, session_id: 'hook-session', tool_input: { subagent_type: 'coder' }, tool_result: '## Task Report\nDone.\n## Downstream Context\nresult.txt' }
          : { conversationId: 'hook-session', workspacePaths: [workspace] };
        const order = ['session-start', 'before-agent', 'after-agent', 'session-end'];
        assert.deepEqual([...order].sort(), [...HOOKS].sort());
        function runEntrypoint(entrypoint, args, stdin) {
          return runNode(path.join(plugin, wrapperDir, entrypoint), args, { cwd: workspace, env, input: stdin });
        }
        function run(entrypoint, args, payload) {
          const result = runEntrypoint(entrypoint, args, JSON.stringify(payload));
          assert.equal(result.status, 0, `${entrypoint}: ${result.stderr}`);
          assert.doesNotMatch(result.stderr, /Hook error:|Policy enforcer error:/);
          return JSON.parse(result.stdout);
        }
        assert.deepEqual(run('hook-runner.js', [runtime, 'before-agent'], input),
          runtime === 'claude' ? { continue: true, decision: 'approve' } : {}, 'before-agent without an active session');

        const stateDir = path.join(workspace, 'docs/maestro/state');
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, 'active-session.md'),
          '---\n{"session_id":"hook-session","status":"in_progress","current_phase":1}\n---\n# Session\n');
        for (const hook of order) {
          const result = run('hook-runner.js', [runtime, hook], input);
          const summary = 'Active session: current_phase=1, status=in_progress';
          const expected = runtime === 'claude'
            ? { continue: true, decision: 'approve', ...(hook === 'before-agent' ? { systemMessage: summary } : {}) }
            : hook === 'before-agent' ? { injectSteps: [{ systemMessage: { systemMessage: summary } }] } : {};
          assert.deepEqual(result, expected, hook);
        }
        assert.equal(fs.existsSync(path.join(hooksDir, 'hook-session')), false);

        // Bad stdin gets the adapter's error fallback, and the bundled src/
        // carries no other runtime's hook adapter.
        const invalid = runEntrypoint('hook-runner.js', [runtime, 'session-start'], 'not-json');
        assert.equal(invalid.status, 0, invalid.stderr);
        assert.match(invalid.stderr, /^Hook error: /);
        assert.deepEqual(JSON.parse(invalid.stdout), runtime === 'claude' ? { continue: false, decision: 'block' } : {});
        const other = runtime === 'claude' ? 'qwen' : 'claude';
        expectExit(runEntrypoint('hook-runner.js', [other, 'session-start'], '{}'),
          { status: 1, stderr: `Unknown runtime: ${other}\n`, stdout: '' });

        const decisions = runtime === 'claude' ? ['block', 'ask', 'approve'] : ['deny', 'force_ask', 'ask'];
        const cases = [
          ['git reset --hard', { decision: decisions[0], reason: 'Discards uncommitted changes' }],
          ['echo hi | tee out.txt', { decision: decisions[1], reason: 'Writes to file and stdout' }],
          ['git status', { decision: decisions[2] }],
        ];
        for (const [command, expected] of cases) {
          const payload = runtime === 'claude'
            ? { tool_input: { command } }
            : { toolCall: { name: 'run_command', args: { CommandLine: command } } };
          assert.deepEqual(run('policy-enforcer.js', [], payload), expected);
        }
        const oversized = runEntrypoint('policy-enforcer.js', [], 'x'.repeat(2 * 1024 * 1024));
        expectExit(oversized, { status: 1, stderr: 'Policy enforcer: stdin payload too large\n' });
        assert.deepEqual(JSON.parse(oversized.stdout), { decision: decisions[0], reason: 'Payload too large' });
      });
    }
  });
}
